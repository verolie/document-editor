import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type DocSummary, type ImportedFile } from '../api'
import { useAuth } from '../auth'
import ConfirmDialog from '../components/ConfirmDialog'
import ImportModal from '../components/ImportModal'
import { ROLE_LABEL } from '../components/ShareModal'
import { useToast } from '../toast'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function DocumentsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [docs, setDocs] = useState<DocSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  // Deleting an owned document, or leaving one shared with you.
  const [pending, setPending] = useState<{ doc: DocSummary; action: 'delete' | 'leave' } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .listDocuments()
      .then(setDocs)
      .catch((err: Error) => {
        setLoadError(err.message)
        toast.error(err.message, 'Could not load documents')
      })
  }, [toast])

  async function createBlank() {
    try {
      const doc = await api.createDocument()
      toast.success('A blank document is ready to edit.', 'Document created')
      navigate(`/doc/${doc.id}`)
    } catch (err) {
      toast.error((err as Error).message, 'Could not create document')
    }
  }

  // Errors propagate to the import form, which shows them and lets the user retry.
  async function createFromFile(file: ImportedFile) {
    const doc = await api.createDocument({ title: file.title, content: file.html })
    toast.success(`“${doc.title}” is now an editable document.`, 'File uploaded')
    navigate(`/doc/${doc.id}`)
  }

  async function confirmPending() {
    if (!pending || !user) return
    const { doc, action } = pending
    setBusy(true)
    try {
      if (action === 'delete') await api.deleteDocument(doc.id)
      else await api.leaveDocument(doc.id, user.id)
      setDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null)
      setPending(null)
      toast.success(
        action === 'delete' ? `“${doc.title}” was deleted.` : `You no longer have access to “${doc.title}”.`,
        action === 'delete' ? 'Document deleted' : 'Left document',
      )
    } catch (err) {
      toast.error((err as Error).message, action === 'delete' ? 'Could not delete document' : 'Could not leave document')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    try {
      await logout()
      toast.info('You have been signed out.', 'Signed out')
    } catch (err) {
      toast.error((err as Error).message, 'Could not sign out')
    }
  }

  const owned = docs?.filter((d) => d.role === 'owner') ?? []
  const shared = docs?.filter((d) => d.role !== 'owner') ?? []

  return (
    <div className="page">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">D</span> Docs
        </div>
        <div className="header-user">
          <span className="muted">{user?.name}</span>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="container">
        <div className="page-title">
          <h1>Documents</h1>
          <div className="actions">
            <button type="button" onClick={() => setImportOpen(true)}>
              Upload file
            </button>
            <button type="button" className="primary" onClick={createBlank}>
              + New document
            </button>
          </div>
        </div>

        {docs === null ? (
          <p className="muted">{loadError ? 'Documents could not be loaded. Refresh to try again.' : 'Loading…'}</p>
        ) : (
          <>
            <DocList
              title="My documents"
              docs={owned}
              empty="No documents yet. Create one or upload a .txt, .md or .docx file."
              onRemove={(doc) => setPending({ doc, action: 'delete' })}
            />
            <DocList
              title="Shared with me"
              docs={shared}
              empty="Nothing has been shared with you yet."
              onRemove={(doc) => setPending({ doc, action: 'leave' })}
            />
          </>
        )}
      </main>

      <ImportModal
        open={importOpen}
        title="Upload a file"
        description="Turn a .txt, .md or .docx file into a new editable document."
        confirmLabel="Create document"
        onClose={() => setImportOpen(false)}
        onImported={createFromFile}
      />

      <ConfirmDialog
        open={pending !== null}
        title={pending?.action === 'leave' ? 'Leave document?' : 'Delete document?'}
        confirmLabel={pending?.action === 'leave' ? 'Leave' : 'Delete'}
        busyLabel={pending?.action === 'leave' ? 'Leaving…' : 'Deleting…'}
        danger
        busy={busy}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      >
        {pending?.action === 'leave' ? (
          <>
            <p>
              You'll lose access to <strong>“{pending.doc.title}”</strong>.
            </p>
            <p className="muted">{pending.doc.owner?.name ?? 'The owner'} can share it with you again.</p>
          </>
        ) : (
          <>
            <p>
              <strong>“{pending?.doc.title}”</strong> will be permanently deleted, including for anyone
              it's shared with.
            </p>
            <p className="muted">This can't be undone.</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}

interface DocListProps {
  title: string
  docs: DocSummary[]
  empty: string
  /** Delete (owned documents) or leave (shared documents). */
  onRemove: (doc: DocSummary) => void
}

function DocList({ title, docs, empty, onRemove }: DocListProps) {
  return (
    <section className="doc-section">
      <h2 className="section-label">{title}</h2>
      {docs.length === 0 ? (
        <p className="muted empty">{empty}</p>
      ) : (
        <ul className="doc-list">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Link to={`/doc/${doc.id}`} className="doc-link">
                <span className="doc-icon" aria-hidden="true">
                  ▤
                </span>
                <span className="doc-info">
                  <strong>{doc.title}</strong>
                  <span className="muted">
                    {doc.role !== 'owner' && `${doc.owner?.name} · `}
                    Edited {dateFormat.format(new Date(doc.updatedAt))}
                  </span>
                </span>
                {doc.role !== 'owner' && (
                  <span className="badge">{ROLE_LABEL[doc.role]}</span>
                )}
              </Link>
              <button
                type="button"
                className="icon-button"
                title={doc.role === 'owner' ? 'Delete' : 'Leave (remove from my list)'}
                aria-label={`${doc.role === 'owner' ? 'Delete' : 'Leave'} ${doc.title}`}
                onClick={() => onRemove(doc)}
              >
                {doc.role === 'owner' ? '🗑' : '⎋'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
