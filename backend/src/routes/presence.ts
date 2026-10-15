import { Router } from 'express'
import { publicUser } from '../auth.js'
import { prisma } from '../db.js'
import { documentId, loadDocument, userSelect } from '../documentAccess.js'

/** A user counts as present if their last heartbeat is newer than this. */
const ACTIVE_MS = 20_000
/** Rows older than this are cleaned up. */
const STALE_MS = 5 * 60_000

export const presenceRouter = Router({ mergeParams: true })

/**
 * Heartbeat sent every few seconds while a document is open. Returns who else is here
 * and enough state for the client to notice new saves and new comments.
 */
presenceRouter.post('/', async (req, res) => {
  const found = await loadDocument(documentId(req), req.user!, res, 'view')
  if (!found) return
  const docId = found.doc.id
  const userId = req.user!.id
  const editing = req.body?.editing === true && found.permissions.edit
  const now = new Date()

  await prisma.presence.upsert({
    where: { documentId_userId: { documentId: docId, userId } },
    create: { documentId: docId, userId, editing, lastSeen: now },
    update: { editing, lastSeen: now },
  })

  const [, active, commentStats] = await Promise.all([
    prisma.presence.deleteMany({
      where: { documentId: docId, lastSeen: { lt: new Date(now.getTime() - STALE_MS) } },
    }),
    prisma.presence.findMany({
      where: { documentId: docId, userId: { not: userId }, lastSeen: { gte: new Date(now.getTime() - ACTIVE_MS) } },
      include: { user: { select: userSelect } },
      orderBy: { lastSeen: 'asc' },
    }),
    prisma.comment.aggregate({ where: { documentId: docId }, _count: true, _max: { updatedAt: true } }),
  ])

  res.json({
    users: active.map((p) => ({ ...publicUser(p.user), editing: p.editing })),
    version: found.doc.version,
    updatedAt: found.doc.updatedAt,
    lastEditedBy: found.doc.lastEditedBy && publicUser(found.doc.lastEditedBy),
    // Changes whenever a comment is added, edited, resolved or deleted.
    commentsKey: `${commentStats._count}:${commentStats._max.updatedAt?.toISOString() ?? ''}`,
  })
})

presenceRouter.delete('/', async (req, res) => {
  await prisma.presence.deleteMany({
    where: { documentId: documentId(req), userId: req.user!.id },
  })
  res.status(204).end()
})
