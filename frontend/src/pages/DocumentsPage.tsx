import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type DocSummary, type ImportedFile } from '../api'
import { useAuth } from '../auth'
import ConfirmDialog from '../components/ConfirmDialog'
import ImportModal from '../components/ImportModal'
import { useToast } from '../toast'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function DocumentsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [docs, setDocs] = useState<DocSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<DocSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  async function confirmDelete() {
    const doc = pendingDelete
    if (!doc) return
    setDeleting(true)
    try {
      await api.deleteDocument(doc.id)
      setDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null)
      setPendingDelete(null)
      toast.success(`“${doc.title}” was deleted.`, 'Document deleted')
    } catch (err) {
      toast.error((err as Error).message, 'Could not delete document')
    } finally {
      setDeleting(false)
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
              onDelete={setPendingDelete}
            />
            <DocList title="Shared with me" docs={shared} empty="Nothing has been shared with you yet." />
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
        open={pendingDelete !== null}
        title="Delete document?"
        confirmLabel="Delete"
        busyLabel="Deleting…"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        <p>
          <strong>“{pendingDelete?.title}”</strong> will be permanently deleted, including for anyone
          it's shared with.
        </p>
        <p className="muted">This can't be undone.</p>
      </ConfirmDialog>
    </div>
  )
}

interface DocListProps {
  title: string
  docs: DocSummary[]
  empty: string
  onDelete?: (doc: DocSummary) => void
}

function DocList({ title, docs, empty, onDelete }: DocListProps) {
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
                  <span className="badge">{doc.role === 'editor' ? 'Can edit' : 'View only'}</span>
                )}
              </Link>
              {onDelete && (
                <button
                  type="button"
                  className="icon-button"
                  title="Delete"
                  aria-label={`Delete ${doc.title}`}
                  onClick={() => onDelete(doc)}
                >
                  🗑
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
