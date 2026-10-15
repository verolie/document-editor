import { useRef } from 'react'
import type { Editor } from '@tiptap/react'
import { IMAGE_TYPES, insertImages } from '../images'
import { useToast } from '../toast'

export default function ImageButton({ editor, documentId }: { editor: Editor; documentId: string }) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)

  return (
    <>
      <button
        type="button"
        className="tool-button"
        title="Insert image (or paste / drag one in)"
        aria-label="Insert image"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => input.current?.click()}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="1.8" y="3" width="14.4" height="12" rx="2" />
          <circle cx="6.2" cy="7.2" r="1.4" fill="currentColor" stroke="none" />
          <path d="M2.5 13.5l4.2-4 3 2.8 2.3-2 3.5 3.2" />
        </svg>
      </button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(',')}
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = '' // allow picking the same file again
          if (files.length) insertImages(editor, files, documentId, toast)
        }}
      />
    </>
  )
}
