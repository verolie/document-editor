import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import { accessibleBy, roleFor } from '../access.js'
import { requireAuth } from '../auth.js'
import { prisma } from '../db.js'
import { storage } from '../storage.js'

// Vercel rejects request bodies over 4.5 MB; the editor compresses images well below this.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } })

const IMAGE_URL_RE = /\/api\/images\/([0-9a-f-]{36})/g

/** Identifies the image type from its first bytes, so a file's claimed type can't be spoofed. */
export function detectImageType(data: Buffer): { contentType: string; ext: string } | null {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { contentType: 'image/png', ext: 'png' }
  }
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { contentType: 'image/jpeg', ext: 'jpg' }
  if (data.subarray(0, 4).toString('latin1') === 'GIF8') return { contentType: 'image/gif', ext: 'gif' }
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { contentType: 'image/webp', ext: 'webp' }
  }
  return null
}

/** Stores an image and records it; returns the URL documents should use. */
export async function saveImage(data: Buffer, uploaderId: string, documentId?: string) {
  const type = detectImageType(data)
  if (!type) return null
  const id = randomUUID()
  const storageKey = `images/${id}.${type.ext}`
  await storage.put(storageKey, data, type.contentType)
  await prisma.image.create({
    data: {
      id,
      storageKey,
      contentType: type.contentType,
      size: data.length,
      uploaderId,
      ...(documentId && { documents: { create: { documentId } } }),
    },
  })
  return { id, url: `/api/images/${id}` }
}

/**
 * Records which images a document uses, so everyone who can open the document can see them.
 * Only images the user may already see are linked, so an image ID can't be used to gain access.
 */
export async function linkImages(documentId: string, html: string, userId: string) {
  const ids = [...new Set([...html.matchAll(IMAGE_URL_RE)].map((m) => m[1]))]
  if (ids.length === 0) return
  const visible = await prisma.image.findMany({
    where: {
      id: { in: ids },
      OR: [{ uploaderId: userId }, { documents: { some: { document: accessibleBy(userId) } } }],
    },
    select: { id: true },
  })
  if (visible.length === 0) return
  await prisma.documentImage.createMany({
    data: visible.map((image) => ({ documentId, imageId: image.id })),
    skipDuplicates: true,
  })
}

export const imagesRouter = Router()
imagesRouter.use(requireAuth)

imagesRouter.post('/', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No image uploaded' })
    return
  }

  const documentId = typeof req.body?.documentId === 'string' ? req.body.documentId : undefined
  if (documentId) {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, ...accessibleBy(req.user!.id) },
      select: { ownerId: true, shares: { select: { userId: true, role: true } } },
    })
    const role = doc && roleFor(doc, req.user!.id)
    if (role !== 'owner' && role !== 'editor') {
      res.status(403).json({ error: 'You cannot add images to this document' })
      return
    }
  }

  const saved = await saveImage(file.buffer, req.user!.id, documentId)
  if (!saved) {
    res.status(400).json({ error: 'Unsupported image. Use PNG, JPG, GIF or WebP.' })
    return
  }
  res.status(201).json(saved)
})

imagesRouter.get('/:id', async (req, res) => {
  const userId = req.user!.id
  const image = await prisma.image.findFirst({
    where: {
      id: req.params.id,
      OR: [{ uploaderId: userId }, { documents: { some: { document: accessibleBy(userId) } } }],
    },
  })
  const stream = image && (await storage.get(image.storageKey))
  if (!image || !stream) {
    res.status(404).json({ error: 'Image not found' })
    return
  }

  res.setHeader('Content-Type', image.contentType)
  res.setHeader('Content-Length', String(image.size))
  // An image ID always refers to the same bytes, so browsers can cache it for good.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  stream.on('error', (err) => res.destroy(err))
  stream.pipe(res)
})
