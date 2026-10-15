import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import FileHandler from '@tiptap/extension-file-handler'
import { TextSelection } from '@tiptap/pm/state'
import { api, ApiError, type CommentThread, type Doc, type SaveConflict } from '../api'
import { useAuth } from '../auth'
import { captureAnchor, findAnchor, type Anchor } from '../collab/anchors'
import { CommentHighlights } from '../collab/commentHighlights'
import { usePresence } from '../collab/usePresence'
import CommentsPanel from '../components/CommentsPanel'
import ConflictDialog from '../components/ConflictDialog'
import ExportMenu from '../components/ExportMenu'
import HistoryPanel from '../components/HistoryPanel'
import ImportModal from '../components/ImportModal'
import PresenceAvatars from '../components/PresenceAvatars'
import ShareModal from '../components/ShareModal'
import Toolbar from '../components/Toolbar'
import { documentExtensions } from '../editorExtensions'
import { exportMarkdown, exportPdf } from '../export'
import { IMAGE_TYPES, insertImages } from '../images'
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

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'
type Panel = 'comments' | 'history' | null

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Save failed',
}

const ROLE_BANNER = {
  viewer: 'View only. Ask the owner for comment or edit access to contribute.',
  commenter: 'You can comment. Select text and click Comment (Ctrl+Alt+M).',
}

function DocumentEditor({ initial }: { initial: Doc }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [doc, setDoc] = useState(initial)
  const [title, setTitle] = useState(initial.title)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [importOpen, setImportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [threads, setThreads] = useState<CommentThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Anchor | null>(null)
  const [conflict, setConflict] = useState<SaveConflict | null>(null)
  const [conflictBusy, setConflictBusy] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  // Counts edits so a save only clears "dirty" if nothing changed while it was in flight.
  const revision = useRef(0)
  // Set by Escape so the blur that follows discards the typed title instead of saving it.
  const cancelRename = useRef(false)
  const statusRef = useRef(status)
  statusRef.current = status

  /**
   * Applies a response that only changed metadata (title, sharing, settings). Keeps the local
   * content version, so a newer save by someone else is still detected on the next save.
   */
  const updateMeta = useCallback(
    (next: Doc) => setDoc((prev) => ({ ...next, version: prev.version, content: prev.content })),
    [],
  )

  const { permissions } = doc
  const canEdit = permissions.edit

  const editor = useEditor({
    extensions: [
      ...documentExtensions({ resizableImages: true }),
      CommentHighlights,
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

  // Permissions can change while the page is open (e.g. after transferring ownership).
  useEffect(() => {
    editor.setEditable(canEdit, false)
  }, [editor, canEdit])

  /** Replaces the editor content with a version from the server without marking it unsaved. */
  const applyServerDoc = useCallback(
    (next: Doc) => {
      const { from, to } = editor.state.selection
      editor.chain().setMeta('addToHistory', false).setContent(next.content, { emitUpdate: false }).run()
      // Keep the cursor roughly where it was.
      const size = editor.state.doc.content.size
      editor.view.dispatch(
        editor.state.tr
          .setSelection(TextSelection.create(editor.state.doc, Math.min(from, size), Math.min(to, size)))
          .setMeta('addToHistory', false),
      )
      setDoc(next)
      setTitle(next.title)
      setStatus('saved')
      setHistoryKey((k) => k + 1)
    },
    [editor],
  )

  // ---------- Presence and live updates ----------

  const presence = usePresence(doc.id, () => canEdit && (statusRef.current === 'dirty' || editor.isFocused))
  const remoteVersion = presence?.version ?? doc.version
  const remoteIsNewer = remoteVersion > doc.version
  const handledRemote = useRef(doc.version)

  useEffect(() => {
    if (!presence || !remoteIsNewer || handledRemote.current >= remoteVersion) return
    // With unsaved work, don't touch the editor; the banner and save conflict dialog take over.
    if (statusRef.current !== 'saved') return
    handledRemote.current = remoteVersion
    api
      .getDocument(doc.id)
      .then((next) => {
        applyServerDoc(next)
        toast.info(`Updated with changes from ${next.lastEditedBy?.name ?? 'someone else'}.`, 'Document updated')
      })
      .catch(() => {
        handledRemote.current = doc.version
      })
  }, [presence, remoteIsNewer, remoteVersion, doc.id, doc.version, applyServerDoc, toast])

  // ---------- Comments ----------

  const loadComments = useCallback(() => {
    api
      .listComments(doc.id)
      .then(setThreads)
      .catch(() => {})
  }, [doc.id])

  useEffect(loadComments, [loadComments])
  const commentsKey = presence?.commentsKey
  const lastCommentsKey = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!commentsKey) return
    if (lastCommentsKey.current !== undefined && lastCommentsKey.current !== commentsKey) loadComments()
    lastCommentsKey.current = commentsKey
  }, [commentsKey, loadComments])

  const openThreads = useMemo(() => threads.filter((t) => !t.resolved), [threads])

  useEffect(() => {
    editor.commands.setCommentHighlights(
      openThreads.map((t) => ({ id: t.id, quote: t.quote, prefix: t.prefix ?? '', suffix: t.suffix ?? '' })),
      activeThreadId,
    )
  }, [editor, openThreads, activeThreadId])

  const currentDoc = useEditorState({ editor, selector: ({ editor }) => editor.state.doc })
  const orphanIds = useMemo(
    () =>
      new Set(
        threads
          .filter((t) => !findAnchor(currentDoc, { quote: t.quote, prefix: t.prefix ?? '', suffix: t.suffix ?? '' }))
          .map((t) => t.id),
      ),
    [threads, currentDoc],
  )

  /** Reads the selection; uses the DOM selection too, since read-only views may not track it. */
  function selectedRange() {
    const { from, to, empty } = editor.state.selection
    if (!empty) return { from, to }
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return null
    if (!editor.view.dom.contains(sel.anchorNode) || !editor.view.dom.contains(sel.focusNode)) return null
    const a = editor.view.posAtDOM(sel.anchorNode, sel.anchorOffset)
    const b = editor.view.posAtDOM(sel.focusNode, sel.focusOffset)
    return { from: Math.min(a, b), to: Math.max(a, b) }
  }

  function startComment() {
    if (!permissions.comment) return
    const range = selectedRange()
    const anchor = range && captureAnchor(editor.state.doc, range.from, range.to)
    if (!anchor) {
      toast.warning('Select the text you want to comment on first.', 'Nothing selected')
      return
    }
    setDraft(anchor)
    setActiveThreadId(null)
    setPanel('comments')
  }

  function activateThread(threadId: string | null) {
    setActiveThreadId(threadId)
    if (!threadId) return
    const thread = threads.find((t) => t.id === threadId)
    const range = thread && findAnchor(editor.state.doc, { quote: thread.quote, prefix: thread.prefix ?? '', suffix: thread.suffix ?? '' })
    if (range) {
      const dom = editor.view.domAtPos(range.from).node
      const el = dom instanceof HTMLElement ? dom : dom.parentElement
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  // Clicking highlighted text opens its thread.
  function handlePaperClick(e: MouseEvent) {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-thread-id]')
    if (!target) return
    const threadId = target.dataset.threadId!
    setPanel('comments')
    setActiveThreadId(threadId)
    requestAnimationFrame(() =>
      document.getElementById(`thread-${threadId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    )
  }

  // ---------- Saving ----------

  const titleChanged = canEdit && title.trim() !== '' && title.trim() !== doc.title
  const shownStatus: SaveStatus = status === 'saved' && titleChanged ? 'dirty' : status

  async function save(baseVersion = doc.version) {
    if (!canEdit) {
      toast.warning("You don't have edit access, so changes can't be saved.", 'Read only')
      return
    }
    if (status === 'saving') return
    if (status === 'saved' && !titleChanged && baseVersion === doc.version) {
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
        baseVersion,
        ...(titleChanged && { title: nextTitle }),
      })
      handledRemote.current = updated.version
      setDoc(updated)
      setTitle(updated.title)
      setStatus(revision.current === savedRevision ? 'saved' : 'dirty')
      setHistoryKey((k) => k + 1)
      toast.success(`“${updated.title}” has been saved.`, 'Document saved')
      return true
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setStatus('dirty')
        setConflict((err.body?.conflict as SaveConflict) ?? null)
        return false
      }
      setStatus('error')
      toast.error((err as Error).message, 'Save failed')
      return false
    }
  }

  async function keepMine() {
    if (!conflict) return
    setConflictBusy(true)
    const ok = await save(conflict.version)
    setConflictBusy(false)
    if (ok) setConflict(null)
  }

  async function loadTheirs() {
    setConflictBusy(true)
    try {
      const latest = await api.getDocument(doc.id)
      handledRemote.current = latest.version
      applyServerDoc(latest)
      setConflict(null)
      toast.info('Loaded the latest saved version.', 'Your changes were discarded')
    } catch (err) {
      toast.error((err as Error).message, 'Could not load the latest version')
    } finally {
      setConflictBusy(false)
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
      updateMeta(await api.updateDocument(doc.id, { title: next }))
      toast.success(`Renamed to “${next}”.`, 'Document renamed')
    } catch (err) {
      setTitle(doc.title)
      toast.error((err as Error).message, 'Rename failed')
    }
  }

  // Keyboard shortcuts; always use the latest handlers without re-binding the listener.
  const shortcuts = useRef({ save, startComment })
  shortcuts.current = { save, startComment }
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        shortcuts.current.save()
      }
      if (mod && e.altKey && e.code === 'KeyM') {
        e.preventDefault()
        shortcuts.current.startComment()
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

  const togglePanel = (next: Exclude<Panel, null>) => setPanel((p) => (p === next ? null : next))

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
        <PresenceAvatars users={presence?.users ?? []} />
        {canEdit && <span className={`save-status ${shownStatus}`}>{STATUS_TEXT[shownStatus]}</span>}
        <div className="actions">
          <button
            type="button"
            className={panel === 'comments' ? 'active-toggle' : undefined}
            onClick={() => togglePanel('comments')}
            aria-pressed={panel === 'comments'}
          >
            Comments{openThreads.length > 0 && <span className="count">{openThreads.length}</span>}
          </button>
          {permissions.history && (
            <button
              type="button"
              className={panel === 'history' ? 'active-toggle' : undefined}
              onClick={() => togglePanel('history')}
              aria-pressed={panel === 'history'}
            >
              History
            </button>
          )}
          <ExportMenu
            onPdf={() => exportPdf(title.trim() || doc.title, editor.getHTML())}
            onMarkdown={() => {
              exportMarkdown(title.trim() || doc.title, editor.getHTML())
              toast.success('The Markdown file was downloaded.', 'Exported')
            }}
          />
          {canEdit && (
            <button type="button" onClick={() => setImportOpen(true)}>
              Import file
            </button>
          )}
          {permissions.share && (
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
              onClick={() => save()}
              disabled={status === 'saving' || (status === 'saved' && !titleChanged)}
              title="Save (Ctrl+S)"
            >
              Save
            </button>
          )}
        </div>
      </header>

      {canEdit ? (
        <Toolbar editor={editor} documentId={doc.id} onComment={startComment} />
      ) : (
        <div className="readonly-banner">
          <span>
            {ROLE_BANNER[doc.role as 'viewer' | 'commenter']} Shared by {doc.owner?.name}.
          </span>
          {permissions.comment && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={startComment}>
              💬 Comment
            </button>
          )}
        </div>
      )}

      {remoteIsNewer && hasUnsaved && (
        <div className="remote-banner" role="status">
          <span>
            <strong>{presence?.lastEditedBy?.name ?? 'Someone'}</strong> saved a newer version. When you save,
            you'll choose which version to keep.
          </span>
          <button type="button" onClick={loadTheirs} disabled={conflictBusy}>
            Load their version
          </button>
        </div>
      )}

      <div className="editor-body">
        <main className="paper-wrap" onClick={() => canEdit && editor.commands.focus()}>
          <div
            className="paper"
            onClick={(e) => {
              e.stopPropagation()
              handlePaperClick(e)
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </main>

        {panel === 'comments' && (
          <CommentsPanel
            documentId={doc.id}
            threads={threads}
            onThreadsChange={setThreads}
            canComment={permissions.comment}
            activeId={activeThreadId}
            onActivate={activateThread}
            orphanIds={orphanIds}
            draft={draft}
            onDraftDone={() => setDraft(null)}
            onClose={() => {
              setPanel(null)
              setDraft(null)
              setActiveThreadId(null)
            }}
          />
        )}
        {panel === 'history' && permissions.history && (
          <HistoryPanel
            doc={doc}
            refreshKey={historyKey}
            hasUnsavedChanges={hasUnsaved}
            onRestored={(restored) => {
              handledRemote.current = restored.version
              applyServerDoc(restored)
            }}
            onClose={() => setPanel(null)}
          />
        )}
      </div>

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
      {permissions.share && (
        <ShareModal
          open={shareOpen}
          doc={doc}
          currentUserId={user?.id ?? ''}
          onClose={() => setShareOpen(false)}
          onChange={(next) => {
            updateMeta(next)
            if (!next.permissions.share) setShareOpen(false)
          }}
        />
      )}
      <ConflictDialog
        conflict={conflict}
        busy={conflictBusy}
        onOverwrite={keepMine}
        onDiscard={loadTheirs}
        onCancel={() => setConflict(null)}
      />
    </div>
  )
}
