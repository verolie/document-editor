import type { Editor } from '@tiptap/core'
import { api } from './api'

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

const MAX_INPUT_BYTES = 20 * 1024 * 1024 // what we accept from the user
const MAX_STORED_BYTES = 2 * 1024 * 1024 // what we upload
const MAX_DIMENSION = 1600 // px; bigger photos are scaled down
const KEEP_ORIGINAL_BYTES = 500 * 1024 // small, already-sized images are kept untouched

export interface ImageNotifier {
  warning: (message: string, title?: string) => void
  error: (message: string, title?: string) => void
}

class ImageError extends Error {}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Shrinks an image before upload: large photos are scaled to 1600px and
 * re-encoded; small images are kept as-is.
 */
async function prepareImage(file: File): Promise<Blob> {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new ImageError(`“${file.name}” isn't a supported image. Use PNG, JPG, GIF or WebP.`)
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageError(`“${file.name}” is larger than 20 MB.`)
  }
  // Re-encoding would drop GIF animation, so GIFs are only accepted as-is.
  if (file.type === 'image/gif') {
    if (file.size > MAX_STORED_BYTES) throw new ImageError(`GIF “${file.name}” is larger than 2 MB.`)
    return file
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new ImageError(`“${file.name}” could not be opened as an image.`)
  })
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= KEEP_ORIGINAL_BYTES) {
    bitmap.close()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  // WebP keeps transparency and is small; browsers that can't encode it fall back to JPEG.
  let blob = await canvasToBlob(canvas, 'image/webp', 0.85)
  if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', 0.85)
  if (!blob) throw new ImageError(`“${file.name}” could not be processed.`)
  if (blob.size > MAX_STORED_BYTES) {
    throw new ImageError(`“${file.name}” is still larger than 2 MB after compressing.`)
  }
  return blob
}

/** Uploads image files and inserts them at `pos`, or at the cursor when no position is given. */
export async function insertImages(
  editor: Editor,
  files: File[],
  documentId: string,
  notify: ImageNotifier,
  pos?: number,
) {
  for (const file of files) {
    try {
      const { url } = await api.uploadImage(await prepareImage(file), file.name, documentId)
      const content = { type: 'image', attrs: { src: url, alt: file.name.replace(/\.[^.]+$/, '') } }
      if (pos === undefined) {
        editor.chain().focus().insertContent(content).run()
      } else {
        // The cursor ends up after the inserted image, so later files follow it.
        editor.chain().focus().insertContentAt(pos, content).run()
        pos = undefined
      }
    } catch (err) {
      if (err instanceof ImageError) notify.warning(err.message, 'Image not added')
      else notify.error((err as Error).message, 'Image upload failed')
    }
  }
}
