import 'dotenv/config'
import express, { type NextFunction, type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'
import multer from 'multer'
import { authRouter } from './routes/auth.js'
import { documentsRouter } from './routes/documents.js'
import { imagesRouter } from './routes/images.js'
import { importRouter } from './routes/import.js'

/** The API. Used directly by Vercel, and by index.ts for local development. */
const app = express()

app.set('trust proxy', 1)
// Vercel rejects request bodies over 4.5 MB, so keep the limit just under it everywhere.
app.use(express.json({ limit: '4mb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRouter)
app.use('/api/documents', documentsRouter)
app.use('/api/images', imagesRouter)
app.use('/api/import', importRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

export function handleErrors(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File is too large (max 4 MB)' })
    return
  }
  if ('type' in err && err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Document is too large to save (max 4 MB)' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}

app.use(handleErrors)

export default app
