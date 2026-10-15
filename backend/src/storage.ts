import { createReadStream } from 'node:fs'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { get, put } from '@vercel/blob'

/** Where uploaded files live: Vercel Blob in production, local disk in development. */
interface FileStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Readable | null>
}

// Files are private: they are only ever served through /api/images, which checks access.
const blobStorage: FileStorage = {
  async put(key, data, contentType) {
    await put(key, data, { access: 'private', contentType, addRandomSuffix: false })
  },
  async get(key) {
    const result = await get(key, { access: 'private' })
    if (!result || result.statusCode !== 200) return null
    return Readable.fromWeb(result.stream as WebReadableStream<Uint8Array>)
  },
}

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(import.meta.dirname, '..', 'uploads')

const diskStorage: FileStorage = {
  async put(key, data) {
    const file = path.join(UPLOADS_DIR, key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, data)
  },
  async get(key) {
    const file = path.join(UPLOADS_DIR, key)
    try {
      await access(file)
    } catch {
      return null
    }
    return createReadStream(file)
  },
}

// On Vercel the disk is read-only, so Blob is always used there.
export const storage: FileStorage =
  process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL ? blobStorage : diskStorage
