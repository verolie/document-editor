import { Router, type Response } from 'express'
import { accessibleBy, roleFor, type Role } from '../access.js'
import { publicUser, requireAuth } from '../auth.js'
import { prisma, type ShareRole, type User } from '../db.js'
import { linkImages } from './images.js'

const MAX_TITLE = 200

const userSelect = { id: true, email: true, name: true } as const

const fullDocument = {
  owner: { select: userSelect },
  shares: { include: { user: { select: userSelect } }, orderBy: { createdAt: 'asc' } },
} as const

function findDocument(id: string, userId: string) {
  return prisma.document.findFirst({ where: { id, ...accessibleBy(userId) }, include: fullDocument })
}

type FullDocument = NonNullable<Awaited<ReturnType<typeof findDocument>>>

function serialize(doc: FullDocument, role: Role) {
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    role,
    owner: publicUser(doc.owner),
    ...(role === 'owner' && {
      shares: doc.shares.map((s) => ({ user: publicUser(s.user), role: s.role })),
    }),
  }
}

// Finds the document and checks access; sends the error response and returns null on failure.
async function loadDocument(id: string, user: User, res: Response, allowed: Role[]) {
  const doc = await findDocument(id, user.id)
  const role = doc && roleFor(doc, user.id)
  if (!doc || !role) {
    res.status(404).json({ error: 'Document not found' })
    return null
  }
  if (!allowed.includes(role)) {
    res.status(403).json({ error: 'You do not have permission to do that' })
    return null
  }
  return { doc, role }
}

const cleanTitle = (value: unknown) =>
  typeof value === 'string' ? value.trim().slice(0, MAX_TITLE) : ''

export const documentsRouter = Router()
documentsRouter.use(requireAuth)

documentsRouter.get('/', async (req, res) => {
  const userId = req.user!.id
  const docs = await prisma.document.findMany({
    where: accessibleBy(userId),
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      ownerId: true,
      owner: { select: userSelect },
      shares: { where: { userId }, select: { userId: true, role: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  res.json(
    docs.map(({ shares, ownerId, ...doc }) => ({
      ...doc,
      role: roleFor({ ownerId, shares }, userId),
    })),
  )
})

documentsRouter.post('/', async (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : ''
  const created = await prisma.document.create({
    data: {
      ownerId: req.user!.id,
      title: cleanTitle(req.body?.title) || 'Untitled document',
      content,
    },
    include: fullDocument,
  })
  await linkImages(created.id, content, req.user!.id)
  res.status(201).json(serialize(created, 'owner'))
})

documentsRouter.get('/:id', async (req, res) => {
  const found = await loadDocument(req.params.id, req.user!, res, ['owner', 'editor', 'viewer'])
  if (!found) return
  res.json(serialize(found.doc, found.role))
})

documentsRouter.patch('/:id', async (req, res) => {
  const found = await loadDocument(req.params.id, req.user!, res, ['owner', 'editor'])
  if (!found) return

  const data: { title?: string; content?: string } = {}
  if (req.body?.title !== undefined) {
    const title = cleanTitle(req.body.title)
    if (!title) {
      res.status(400).json({ error: 'Title cannot be empty' })
      return
    }
    data.title = title
  }
  if (typeof req.body?.content === 'string') {
    data.content = req.body.content
  }

  const updated = await prisma.document.update({
    where: { id: found.doc.id },
    data,
    include: fullDocument,
  })
  if (data.content !== undefined) await linkImages(updated.id, data.content, req.user!.id)
  res.json(serialize(updated, found.role))
})

documentsRouter.delete('/:id', async (req, res) => {
  const found = await loadDocument(req.params.id, req.user!, res, ['owner'])
  if (!found) return
  await prisma.document.delete({ where: { id: found.doc.id } })
  res.status(204).end()
})

documentsRouter.post('/:id/shares', async (req, res) => {
  const found = await loadDocument(req.params.id, req.user!, res, ['owner'])
  if (!found) return
  const { doc } = found

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const role: ShareRole = req.body?.role === 'viewer' ? 'viewer' : 'editor'

  const target = email ? await prisma.user.findUnique({ where: { email } }) : null
  if (!target) {
    res.status(404).json({ error: 'No user with that email. They need to sign up first.' })
    return
  }
  if (target.id === doc.ownerId) {
    res.status(400).json({ error: 'You already own this document' })
    return
  }

  await prisma.share.upsert({
    where: { documentId_userId: { documentId: doc.id, userId: target.id } },
    create: { documentId: doc.id, userId: target.id, role },
    update: { role },
  })
  res.json(serialize((await findDocument(doc.id, req.user!.id))!, 'owner'))
})

documentsRouter.delete('/:id/shares/:userId', async (req, res) => {
  const found = await loadDocument(req.params.id, req.user!, res, ['owner'])
  if (!found) return
  await prisma.share.deleteMany({ where: { documentId: found.doc.id, userId: req.params.userId } })
  res.json(serialize((await findDocument(found.doc.id, req.user!.id))!, 'owner'))
})
