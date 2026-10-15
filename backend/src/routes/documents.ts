import { Router } from 'express'
import { accessibleBy, roleFor } from '../access.js'
import { publicUser, requireAuth } from '../auth.js'
import { prisma, type ShareRole } from '../db.js'
import { findDocument, fullDocument, loadDocument, serializeDocument, userSelect } from '../documentAccess.js'
import { commentsRouter } from './comments.js'
import { linkImages } from './images.js'
import { presenceRouter } from './presence.js'
import { recordVersion, versionsRouter } from './versions.js'

const MAX_TITLE = 200
const SHARE_ROLES: ShareRole[] = ['viewer', 'commenter', 'editor']

const cleanTitle = (value: unknown) =>
  typeof value === 'string' ? value.trim().slice(0, MAX_TITLE) : ''

export const documentsRouter = Router()
documentsRouter.use(requireAuth)
documentsRouter.use('/:id/comments', commentsRouter)
documentsRouter.use('/:id/versions', versionsRouter)
documentsRouter.use('/:id/presence', presenceRouter)

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
    docs.map(({ shares, ownerId, owner, ...doc }) => ({
      ...doc,
      owner: publicUser(owner),
      role: roleFor({ ownerId, shares }, userId),
    })),
  )
})

documentsRouter.post('/', async (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : ''
  const created = await prisma.document.create({
    data: {
      ownerId: req.user!.id,
      lastEditedById: req.user!.id,
      title: cleanTitle(req.body?.title) || 'Untitled document',
      content,
    },
    include: fullDocument,
  })
  await linkImages(created.id, content, req.user!.id)
  await recordVersion(created, req.user!.id)
  res.status(201).json(serializeDocument(created, 'owner'))
})

documentsRouter.get('/:id', async (req, res) => {
  const found = await loadDocument(req.params.id, req.user!, res, 'view')
  if (!found) return
  res.json(serializeDocument(found.doc, found.role))
})

/**
 * Saving content requires `baseVersion`: the version the editor started from.
 * If someone else saved in between, nothing is written and 409 is returned,
 * so the client can ask the user how to proceed instead of silently overwriting.
 */
documentsRouter.patch('/:id', async (req, res) => {
  const found = await loadDocument(req.params.id, req.user!, res, 'edit')
  if (!found) return
  const { doc } = found
  const userId = req.user!.id

  let title: string | undefined
  if (req.body?.title !== undefined) {
    title = cleanTitle(req.body.title)
    if (!title) {
      res.status(400).json({ error: 'Title cannot be empty' })
      return
    }
  }

  if (typeof req.body?.content === 'string') {
    const baseVersion = req.body.baseVersion
    if (!Number.isInteger(baseVersion)) {
      res.status(400).json({ error: 'baseVersion is required when saving content' })
      return
    }
    const content: string = req.body.content
    // Only succeeds if nobody has saved since `baseVersion`.
    const { count } = await prisma.document.updateMany({
      where: { id: doc.id, version: baseVersion },
      data: { content, version: { increment: 1 }, lastEditedById: userId, ...(title && { title }) },
    })
    if (count === 0) {
      const current = (await findDocument(doc.id, userId))!
      res.status(409).json({
        error: 'Someone else saved this document while you were editing',
        conflict: {
          version: current.version,
          updatedAt: current.updatedAt,
          lastEditedBy: current.lastEditedBy && publicUser(current.lastEditedBy),
        },
      })
      return
    }
    const updated = (await findDocument(doc.id, userId))!
    await linkImages(updated.id, content, userId)
    await recordVersion(updated, userId)
    res.json(serializeDocument(updated, found.role))
    return
  }

  // Renaming alone doesn't change the content version, so it never conflicts with a content save.
  if (title !== undefined) {
    await prisma.document.update({ where: { id: doc.id }, data: { title } })
  }
  res.json(serializeDocument((await findDocument(doc.id, userId))!, found.role))
})

documentsRouter.delete('/:id', async (req, res) => {
  const found = await loadDocument(req.params.id, req.user!, res, 'manage')
  if (!found) return
  await prisma.document.delete({ where: { id: found.doc.id } })
  res.status(204).end()
})

documentsRouter.patch('/:id/settings', async (req, res) => {
  const found = await loadDocument(req.params.id, req.user!, res, 'manage')
  if (!found) return
  if (typeof req.body?.editorsCanShare === 'boolean') {
    await prisma.document.update({
      where: { id: found.doc.id },
      data: { editorsCanShare: req.body.editorsCanShare },
    })
  }
  res.json(serializeDocument((await findDocument(found.doc.id, req.user!.id))!, found.role))
})

documentsRouter.post('/:id/shares', async (req, res) => {
  const found = await loadDocument(req.params.id, req.user!, res, 'share')
  if (!found) return
  const { doc } = found

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const role = req.body?.role as ShareRole
  if (!SHARE_ROLES.includes(role)) {
    res.status(400).json({ error: 'Role must be viewer, commenter or editor' })
    return
  }

  const target = email ? await prisma.user.findUnique({ where: { email } }) : null
  if (!target) {
    res.status(404).json({ error: 'No user with that email. They need to sign in once first.' })
    return
  }
  if (target.id === doc.ownerId) {
    res.status(400).json({ error: "The owner's access can't be changed" })
    return
  }

  await prisma.share.upsert({
    where: { documentId_userId: { documentId: doc.id, userId: target.id } },
    create: { documentId: doc.id, userId: target.id, role },
    update: { role },
  })
  res.json(serializeDocument((await findDocument(doc.id, req.user!.id))!, found.role))
})

// People who can share can remove anyone; anyone can remove themselves ("leave").
documentsRouter.delete('/:id/shares/:userId', async (req, res) => {
  const leaving = req.params.userId === req.user!.id
  const found = await loadDocument(req.params.id, req.user!, res, leaving ? 'view' : 'share')
  if (!found) return
  await prisma.share.deleteMany({ where: { documentId: found.doc.id, userId: req.params.userId } })
  if (leaving) {
    res.status(204).end()
    return
  }
  res.json(serializeDocument((await findDocument(found.doc.id, req.user!.id))!, found.role))
})

/** Makes another person with access the owner; the previous owner becomes an editor. */
documentsRouter.post('/:id/transfer', async (req, res) => {
  const found = await loadDocument(req.params.id, req.user!, res, 'manage')
  if (!found) return
  const { doc } = found
  const newOwnerId = typeof req.body?.userId === 'string' ? req.body.userId : ''
  if (!doc.shares.some((s) => s.userId === newOwnerId)) {
    res.status(400).json({ error: 'Share the document with this person before making them the owner' })
    return
  }

  await prisma.$transaction([
    prisma.document.update({ where: { id: doc.id }, data: { ownerId: newOwnerId } }),
    prisma.share.delete({ where: { documentId_userId: { documentId: doc.id, userId: newOwnerId } } }),
    prisma.share.create({ data: { documentId: doc.id, userId: doc.ownerId, role: 'editor' } }),
  ])
  res.json(serializeDocument((await findDocument(doc.id, req.user!.id))!, 'editor'))
})
