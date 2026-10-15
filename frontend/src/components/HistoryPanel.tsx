import { useEffect, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { api, type Doc, type Version, type VersionSummary } from '../api'
import { formatDateTime, timeAgo } from '../collab/time'
import { documentExtensions } from '../editorExtensions'
import { useToast } from '../toast'
import Modal from './Modal'
import { initials, userColor } from './PresenceAvatars'

interface HistoryPanelProps {
  doc: Doc
  /** Changes whenever a save lands, so the list refreshes. */
  refreshKey: number
  hasUnsavedChanges: boolean
  onRestored: (doc: Doc) => void
  onClose: () => void
}

export default function HistoryPanel({ doc, refreshKey, hasUnsavedChanges, onRestored, onClose }: HistoryPanelProps) {
  const toast = useToast()
  const [versions, setVersions] = useState<VersionSummary[] | null>(null)
  const [preview, setPreview] = useState<Version | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    api
      .listVersions(doc.id)
      .then(setVersions)
      .catch((err: Error) => toast.error(err.message, 'Could not load history'))
  }, [doc.id, refreshKey, toast])

  async function open(summary: VersionSummary) {
    try {
      setPreview(await api.getVersion(doc.id, summary.id))
    } catch (err) {
      toast.error((err as Error).message, 'Could not open version')
    }
  }

  async function restore() {
    if (!preview) return
    setRestoring(true)
    try {
      const restored = await api.restoreVersion(doc.id, preview.id)
      onRestored(restored)
      setPreview(null)
      toast.success(`Restored the version from ${formatDateTime(preview.updatedAt)}.`, 'Version restored')
    } catch (err) {
      toast.error((err as Error).message, 'Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  const isCurrent = (v: VersionSummary) => v.number === doc.version

  return (
    <aside className="side-panel" aria-label="Version history">
      <header className="side-panel-header">
        <h2>Version history</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close history">
          ✕
        </button>
      </header>
      <p className="muted side-panel-note">Saves within a few minutes by the same person are grouped. The last 50 versions are kept.</p>

      {versions === null ? (
        <p className="muted side-panel-empty">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="muted side-panel-empty">No saved versions yet.</p>
      ) : (
        <ul className="version-list">
          {versions.map((v) => (
            <li key={v.id}>
              <button type="button" className="version-item" onClick={() => open(v)}>
                <span className="version-time" title={formatDateTime(v.updatedAt)}>
                  {formatDateTime(v.updatedAt)}
                  {isCurrent(v) && <span className="badge">Current</span>}
                </span>
                <span className="version-meta">
                  {v.author && (
                    <span className="avatar small" style={{ background: userColor(v.author.id) }} aria-hidden="true">
                      {initials(v.author.name)}
                    </span>
                  )}
                  <span className="muted">
                    {v.author?.name ?? 'Unknown'} · {timeAgo(v.updatedAt)}
                    {v.restoredFrom && ` · restored from ${formatDateTime(v.restoredFrom)}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={preview !== null} title={preview ? `Version from ${formatDateTime(preview.updatedAt)}` : ''} onClose={() => setPreview(null)}>
        {preview && (
          <>
            <p className="muted">
              “{preview.title}” · saved by {preview.author?.name ?? 'Unknown'}
            </p>
            <VersionContent content={preview.content} />
            <div className="modal-actions">
              <button type="button" onClick={() => setPreview(null)}>
                Close
              </button>
              {doc.permissions.edit && preview.number !== doc.version && (
                <button type="button" className="primary" onClick={restore} disabled={restoring}>
                  {restoring ? 'Restoring…' : 'Restore this version'}
                </button>
              )}
            </div>
            {doc.permissions.edit && preview.number !== doc.version && (
              <p className="muted modal-footnote">
                Restoring saves this version as the newest one; the current version stays in the history.
                {hasUnsavedChanges && <strong> Your unsaved changes will be lost.</strong>}
              </p>
            )}
          </>
        )}
      </Modal>
    </aside>
  )
}

/** Read-only render of a saved version, using the same document format as the editor. */
function VersionContent({ content }: { content: string }) {
  const editor = useEditor({ extensions: documentExtensions(), content, editable: false })
  return (
    <div className="version-preview">
      <EditorContent editor={editor} />
    </div>
  )
}
