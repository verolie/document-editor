import { Router } from 'express'
import { publicUser } from '../auth.js'
import { prisma } from '../db.js'
import { documentId, findDocument, loadDocument, serializeDocument, userSelect } from '../documentAccess.js'

/** Saves by the same person within this window are grouped into one version. */
const GROUP_WINDOW_MS = 10 * 60 * 1000
/** Older versions beyond this are deleted. */
const MAX_VERSIONS = 50

/** Records the document's state after a save, grouping rapid saves by the same person. */
export async function recordVersion(
  doc: { id: string; version: number; title: string; content: string },
  authorId: string,
  restoredFrom?: Date,
) {
  const latest = await prisma.documentVersion.findFirst({
    where: { documentId: doc.id },
    orderBy: { updatedAt: 'desc' },
  })
  const data = { number: doc.version, title: doc.title, content: doc.content }

  const canGroup =
    !restoredFrom &&
    latest &&
    !latest.restoredFrom &&
    latest.authorId === authorId &&
    Date.now() - latest.createdAt.getTime() < GROUP_WINDOW_MS

  if (canGroup) {
    await prisma.documentVersion.update({ where: { id: latest.id }, data })
  } else {
    await prisma.documentVersion.create({
      data: { ...data, documentId: doc.id, authorId, restoredFrom },
    })
  }

  const old = await prisma.documentVersion.findMany({
    where: { documentId: doc.id },
    orderBy: { updatedAt: 'desc' },
    skip: MAX_VERSIONS,
    select: { id: true },
  })
  if (old.length > 0) {
    await prisma.documentVersion.deleteMany({ where: { id: { in: old.map((v) => v.id) } } })
  }
}

export const versionsRouter = Router({ mergeParams: true })

versionsRouter.get('/', async (req, res) => {
  const found = await loadDocument(documentId(req), req.user!, res, 'history')
  if (!found) return
  const versions = await prisma.documentVersion.findMany({
    where: { documentId: found.doc.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      number: true,
      title: true,
      restoredFrom: true,
      createdAt: true,
      updatedAt: true,
      author: { select: userSelect },
    },
  })
  res.json(versions.map((v) => ({ ...v, author: v.author && publicUser(v.author) })))
})

versionsRouter.get('/:versionId', async (req, res) => {
  const found = await loadDocument(documentId(req), req.user!, res, 'history')
  if (!found) return
  const version = await prisma.documentVersion.findFirst({
    where: { id: req.params.versionId, documentId: found.doc.id },
    include: { author: { select: userSelect } },
  })
  if (!version) {
    res.status(404).json({ error: 'Version not found' })
    return
  }
  res.json({ ...version, author: version.author && publicUser(version.author) })
})

// Restoring is an explicit overwrite, so it doesn't check for concurrent edits;
// the state it replaces is already in the history.
versionsRouter.post('/:versionId/restore', async (req, res) => {
  const found = await loadDocument(documentId(req), req.user!, res, 'edit')
  if (!found) return
  const version = await prisma.documentVersion.findFirst({
    where: { id: req.params.versionId, documentId: found.doc.id },
  })
  if (!version) {
    res.status(404).json({ error: 'Version not found' })
    return
  }

  const updated = await prisma.document.update({
    where: { id: found.doc.id },
    data: {
      title: version.title,
      content: version.content,
      version: { increment: 1 },
      lastEditedById: req.user!.id,
    },
  })
  await recordVersion(updated, req.user!.id, version.updatedAt)
  res.json(serializeDocument((await findDocument(updated.id, req.user!.id))!, found.role))
})
