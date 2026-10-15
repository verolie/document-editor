import { existsSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import app, { handleErrors } from './app.js'

const PORT = Number(process.env.PORT) || 5000

// Outside Vercel, serve the built frontend too so the whole site can run as one server.
const frontendDist = path.join(import.meta.dirname, '..', '..', 'frontend', 'dist')
if (existsSync(frontendDist)) {
  const site = express.Router()
  site.use(express.static(frontendDist))
  site.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
  app.use(site)
  // Keep the error handler last.
  app.use(handleErrors)
}

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
