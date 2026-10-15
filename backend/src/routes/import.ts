import path from 'node:path'
import { Router } from 'express'
import mammoth from 'mammoth'
import { marked } from 'marked'
import multer from 'multer'
import { requireAuth } from '../auth.js'
import { saveImage } from './images.js'

// Vercel rejects request bodies over 4.5 MB.
const MAX_FILE_BYTES = 4 * 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
})

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Decodes UTF-8 and drops the byte-order mark many Windows editors add,
// which would otherwise stop a leading "# Heading" from being recognised.
const decodeText = (buffer: Buffer) => buffer.toString('utf8').replace(/^﻿/, '')

function textToHtml(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export const importRouter = Router()

importRouter.post('/', requireAuth, upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No file uploaded' })
    return
  }

  // Browsers send multipart filenames as latin1; decode so non-ASCII names survive.
  const filename = Buffer.from(file.originalname, 'latin1').toString('utf8')
  const ext = path.extname(filename).toLowerCase()
  const title = path.basename(filename, ext) || 'Imported document'

  let html: string
  switch (ext) {
    case '.txt':
      html = textToHtml(decodeText(file.buffer))
      break
    case '.md':
    case '.markdown':
      html = await marked.parse(decodeText(file.buffer))
      break
    case '.docx':
      try {
        html = (
          await mammoth.convertToHtml(
            { buffer: file.buffer },
            {
              // mammoth drops underline unless it is mapped explicitly.
              styleMap: ['u => u'],
              // Store embedded pictures like uploaded ones instead of inlining them as base64.
              convertImage: mammoth.images.imgElement(async (image) => {
                const saved = await saveImage(await image.readAsBuffer(), req.user!.id)
                return { src: saved?.url ?? '' }
              }),
            },
          )
        ).value
        // Formats browsers can't show (e.g. Windows metafiles) were skipped above.
        html = html.replace(/<img [^>]*src=""[^>]*>/g, '')
      } catch {
        res.status(400).json({ error: 'Could not read this .docx file' })
        return
      }
      break
    case '.doc':
      res.status(400).json({
        error: 'Old .doc files are not supported. Save it as .docx in Word and try again.',
      })
      return
    default:
      res.status(400).json({ error: 'Unsupported file type. Use .txt, .md or .docx' })
      return
  }

  res.json({ title, html })
})
