import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { FontSize, TextStyle } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import FileHandler from '@tiptap/extension-file-handler'
import { Spacing } from '../spacing'
import { IMAGE_TYPES, insertImages } from '../images'
import { api, type Doc } from '../api'
import ImportModal from '../components/ImportModal'
import ShareModal from '../components/ShareModal'
import Toolbar from '../components/Toolbar'
import { useToast } from '../toast'

export default function EditorPage() {
  const { id } = useParams()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setDoc(null)
    setError(null)
    api
      .getDocument(id)
      .then(setDoc)
      .catch((err: Error) => setError(err.message))
  }, [id])

  if (error) {
    return (
      <div className="center-screen">
        <p className="error">{error}</p>
        <Link to="/">← Back to documents</Link>
      </div>
    )
  }
  if (!doc) return <div className="center-screen muted">Loading…</div>

  return <DocumentEditor key={doc.id} initial={doc} />
}

// Ctrl+Shift+R is the browser's hard reload, so only left and center get shortcuts.
const TextAlignment = TextAlign.extend({
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-l': () => this.editor.commands.setTextAlign('left'),
      'Mod-Shift-e': () => this.editor.commands.setTextAlign('center'),
    }
  },
}).configure({
  types: ['heading', 'paragraph'],
  alignments: ['left', 'center', 'right'],
})

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Save failed',
}

function DocumentEditor({ initial }: { initial: Doc }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [doc, setDoc] = useState(initial)
  const [title, setTitle] = useState(initial.title)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [importOpen, setImportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // Counts edits so a save only clears "dirty" if nothing changed while it was in flight.
  const revision = useRef(0)
  // Set by Escape so the blur that follows discards the typed title instead of saving it.
  const cancelRename = useRef(false)

  const canEdit = doc.role !== 'viewer'

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      TextAlignment,
      TextStyle,
      FontSize,
      Spacing,
      // Images are uploaded and referenced by URL; base64 stays allowed for older documents.
      Image.configure({
        allowBase64: true,
        resize: { enabled: true, directions: ['bottom-right', 'bottom-left'], minWidth: 60, alwaysPreserveAspectRatio: true },
      }),
      FileHandler.configure({
        allowedMimeTypes: IMAGE_TYPES,
        consumePasteEvent: true,
        onPaste: (editor, files) => insertImages(editor, files, initial.id, toast),
        onDrop: (editor, files, pos) => insertImages(editor, files, initial.id, toast, pos),
      }),
    ],
    content: initial.content,
    editable: canEdit,
    onUpdate: () => {
      revision.current += 1
      setStatus('dirty')
    },
  })

  const titleChanged = title.trim() !== '' && title.trim() !== doc.title
  const shownStatus: SaveStatus = status === 'saved' && titleChanged ? 'dirty' : status

  async function save() {
    if (!canEdit) {
      toast.warning("You have view-only access, so changes can't be saved.", 'View only')
      return
    }
    if (status === 'saving') return
    if (status === 'saved' && !titleChanged) {
      toast.info('There are no unsaved changes.', 'Already saved')
      return
    }
    // A pending title edit is saved in the same request, so one save shows one message.
    const nextTitle = title.trim()
    if (!nextTitle) setTitle(doc.title)
    const savedRevision = revision.current
    setStatus('saving')
    try {
      const updated = await api.updateDocument(doc.id, {
        content: editor.getHTML(),
        ...(titleChanged && { title: nextTitle }),
      })
      setDoc(updated)
      setTitle(updated.title)
      setStatus(revision.current === savedRevision ? 'saved' : 'dirty')
      toast.success(`“${updated.title}” has been saved.`, 'Document saved')
    } catch (err) {
      setStatus('error')
      toast.error((err as Error).message, 'Save failed')
    }
  }

  async function rename() {
    if (cancelRename.current) {
      cancelRename.current = false
      setTitle(doc.title)
      return
    }
    // A save in progress already includes the title.
    if (status === 'saving') return
    const next = title.trim()
    if (!next) {
      setTitle(doc.title)
      toast.warning('A document needs a title, so the old name was kept.', 'Title is empty')
      return
    }
    if (next === doc.title) {
      setTitle(doc.title)
      return
    }
    try {
      setDoc(await api.updateDocument(doc.id, { title: next }))
      toast.success(`Renamed to “${next}”.`, 'Document renamed')
    } catch (err) {
      setTitle(doc.title)
      toast.error((err as Error).message, 'Rename failed')
    }
  }

  // Ctrl+S / Cmd+S saves; always use the latest save() without re-binding the listener.
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const hasUnsaved = status === 'dirty' || status === 'error'
  useEffect(() => {
    if (!hasUnsaved) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsaved])

  function goBack() {
    if (hasUnsaved && !confirm('You have unsaved changes. Leave without saving?')) return
    navigate('/')
  }

  return (
    <div className="editor-page">
      <header className="editor-header">
        <button type="button" className="icon-button" onClick={goBack} title="Back to documents">
          ←
        </button>
        <input
          className="title-input"
          value={title}
          disabled={!canEdit}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              cancelRename.current = true
              e.currentTarget.blur()
            }
          }}
          aria-label="Document title"
          title={canEdit ? 'Click to rename' : undefined}
        />
        {canEdit && (
          <span className={`save-status ${shownStatus}`}>{STATUS_TEXT[shownStatus]}</span>
        )}
        <div className="actions">
          {canEdit && (
            <button type="button" onClick={() => setImportOpen(true)}>
              Import file
            </button>
          )}
          {doc.role === 'owner' && (
            <button type="button" onClick={() => setShareOpen(true)}>
              Share
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className="primary"
              // Don't take focus from the title box: that would trigger a separate rename.
              onMouseDown={(e) => e.preventDefault()}
              onClick={save}
              disabled={status === 'saving' || (status === 'saved' && !titleChanged)}
              title="Save (Ctrl+S)"
            >
              Save
            </button>
          )}
        </div>
      </header>

      {canEdit ? (
        <Toolbar editor={editor} documentId={doc.id} />
      ) : (
        <div className="readonly-banner">
          View only. Shared by {doc.owner?.name}. Ask them for edit access to make changes.
        </div>
      )}


      <main className="paper-wrap" onClick={() => canEdit && editor.commands.focus()}>
        <div className="paper" onClick={(e) => e.stopPropagation()}>
          <EditorContent editor={editor} />
        </div>
      </main>

      {canEdit && (
        <ImportModal
          open={importOpen}
          title="Import from file"
          description="The file's content will be inserted into this document at your cursor."
          confirmLabel="Insert content"
          onClose={() => setImportOpen(false)}
          onImported={(file) => {
            editor.chain().focus().insertContent(file.html).run()
            setImportOpen(false)
            toast.success(`Content from “${file.title}” was added. Remember to save.`, 'File imported')
          }}
        />
      )}
      {doc.role === 'owner' && (
        <ShareModal open={shareOpen} doc={doc} onClose={() => setShareOpen(false)} onChange={setDoc} />
      )}
    </div>
  )
}
