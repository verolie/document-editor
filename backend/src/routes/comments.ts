import { Router } from 'express'
import { publicUser } from '../auth.js'
import { prisma } from '../db.js'
import { documentId, loadDocument, userSelect } from '../documentAccess.js'

const MAX_BODY = 5000
const MAX_QUOTE = 2000
const MAX_CONTEXT = 64

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '')

const commentInclude = {
  author: { select: userSelect },
  replies: { include: { author: { select: userSelect } }, orderBy: { createdAt: 'asc' } },
} as const

type Thread = NonNullable<Awaited<ReturnType<typeof findThread>>>

function findThread(id: string, documentId: string) {
  return prisma.comment.findFirst({ where: { id, documentId, parentId: null }, include: commentInclude })
}

/** `canEdit`/`canDelete` tell the UI which actions to offer this user. */
function serializeThread(thread: Thread, userId: string, isOwner: boolean) {
  const item = (c: { id: string; body: string; authorId: string; editedAt: Date | null; createdAt: Date; updatedAt: Date; author: { id: string; email: string; name: string } }) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    editedAt: c.editedAt,
    author: publicUser(c.author),
    canEdit: c.authorId === userId,
    canDelete: c.authorId === userId || isOwner,
  })
  return {
    ...item(thread),
    quote: thread.quote,
    prefix: thread.prefix,
    suffix: thread.suffix,
    resolved: thread.resolved,
    replies: thread.replies.map(item),
  }
}

export const commentsRouter = Router({ mergeParams: true })

commentsRouter.get('/', async (req, res) => {
  const found = await loadDocument(documentId(req), req.user!, res, 'view')
  if (!found) return
  const threads = await prisma.comment.findMany({
    where: { documentId: found.doc.id, parentId: null },
    include: commentInclude,
    orderBy: { createdAt: 'asc' },
  })
  res.json(threads.map((t) => serializeThread(t, req.user!.id, found.role === 'owner')))
})

commentsRouter.post('/', async (req, res) => {
  const found = await loadDocument(documentId(req), req.user!, res, 'comment')
  if (!found) return
  const body = text(req.body?.body, MAX_BODY).trim()
  const quote = text(req.body?.quote, MAX_QUOTE)
  if (!body || !quote.trim()) {
    res.status(400).json({ error: 'A comment needs some text and a selected passage' })
    return
  }
  const created = await prisma.comment.create({
    data: {
      documentId: found.doc.id,
      authorId: req.user!.id,
      body,
      quote,
      prefix: text(req.body?.prefix, MAX_CONTEXT),
      suffix: text(req.body?.suffix, MAX_CONTEXT),
    },
  })
  const thread = (await findThread(created.id, found.doc.id))!
  res.status(201).json(serializeThread(thread, req.user!.id, found.role === 'owner'))
})

commentsRouter.post('/:commentId/replies', async (req, res) => {
  const found = await loadDocument(documentId(req), req.user!, res, 'comment')
  if (!found) return
  const thread = await findThread(req.params.commentId, found.doc.id)
  const body = text(req.body?.body, MAX_BODY).trim()
  if (!thread) {
    res.status(404).json({ error: 'Comment not found' })
    return
  }
  if (!body) {
    res.status(400).json({ error: 'A reply needs some text' })
    return
  }
  await prisma.comment.create({
    data: { documentId: found.doc.id, authorId: req.user!.id, parentId: thread.id, body },
  })
  // Replying to a resolved thread reopens it.
  await prisma.comment.update({ where: { id: thread.id }, data: { resolved: false } })
  const updated = (await findThread(thread.id, found.doc.id))!
  res.status(201).json(serializeThread(updated, req.user!.id, found.role === 'owner'))
})

commentsRouter.patch('/:commentId', async (req, res) => {
  const found = await loadDocument(documentId(req), req.user!, res, 'comment')
  if (!found) return
  const comment = await prisma.comment.findFirst({
    where: { id: req.params.commentId, documentId: found.doc.id },
  })
  if (!comment) {
    res.status(404).json({ error: 'Comment not found' })
    return
  }

  const data: { body?: string; editedAt?: Date; resolved?: boolean } = {}
  if (req.body?.body !== undefined) {
    if (comment.authorId !== req.user!.id) {
      res.status(403).json({ error: 'You can only edit your own comments' })
      return
    }
    data.body = text(req.body.body, MAX_BODY).trim()
    data.editedAt = new Date()
    if (!data.body) {
      res.status(400).json({ error: 'A comment needs some text' })
      return
    }
  }
  if (typeof req.body?.resolved === 'boolean') {
    if (comment.parentId) {
      res.status(400).json({ error: 'Only a whole thread can be resolved' })
      return
    }
    data.resolved = req.body.resolved
  }

  await prisma.comment.update({ where: { id: comment.id }, data })
  const thread = (await findThread(comment.parentId ?? comment.id, found.doc.id))!
  res.json(serializeThread(thread, req.user!.id, found.role === 'owner'))
})

// Deleting a thread also deletes its replies.
commentsRouter.delete('/:commentId', async (req, res) => {
  const found = await loadDocument(documentId(req), req.user!, res, 'view')
  if (!found) return
  const comment = await prisma.comment.findFirst({
    where: { id: req.params.commentId, documentId: found.doc.id },
  })
  if (!comment) {
    res.status(404).json({ error: 'Comment not found' })
    return
  }
  if (comment.authorId !== req.user!.id && found.role !== 'owner') {
    res.status(403).json({ error: 'You can only delete your own comments' })
    return
  }
  await prisma.comment.delete({ where: { id: comment.id } })
  res.status(204).end()
})
