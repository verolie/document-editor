import { useState, type FormEvent } from 'react'
import { api, type Doc, type ShareRole } from '../api'
import { useToast } from '../toast'
import Modal from './Modal'

const ROLE_TEXT: Record<ShareRole, string> = { editor: 'can edit', viewer: 'can view' }

interface ShareModalProps {
  open: boolean
  doc: Doc
  onClose: () => void
  onChange: (doc: Doc) => void
}

export default function ShareModal({ open, doc, onClose, onChange }: ShareModalProps) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ShareRole>('editor')
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<Doc>, success: { title: string; message: string }) {
    setBusy(true)
    try {
      onChange(await action())
      toast.success(success.message, success.title)
      return true
    } catch (err) {
      toast.error((err as Error).message, 'Sharing failed')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const target = email.trim()
    const ok = await run(() => api.shareDocument(doc.id, target, role), {
      title: 'Document shared',
      message: `${target} ${ROLE_TEXT[role]} “${doc.title}”.`,
    })
    if (ok) setEmail('')
  }

  const shares = doc.shares ?? []

  return (
    <Modal open={open} title={`Share “${doc.title}”`} onClose={onClose}>
      <form className="share-form" onSubmit={handleSubmit}>
        <input
          type="email"
          required
          placeholder="Email of a registered user"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as ShareRole)}>
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
        <button type="submit" className="primary" disabled={busy}>
          Share
        </button>
      </form>

      <h3 className="section-label">People with access</h3>
      <ul className="share-list">
        <li>
          <div>
            <strong>{doc.owner?.name}</strong>
            <span className="muted">{doc.owner?.email}</span>
          </div>
          <span className="badge">Owner</span>
        </li>
        {shares.map((share) => (
          <li key={share.user.id}>
            <div>
              <strong>{share.user.name}</strong>
              <span className="muted">{share.user.email}</span>
            </div>
            <div className="share-actions">
              <select
                value={share.role}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value as ShareRole
                  run(() => api.shareDocument(doc.id, share.user.email, next), {
                    title: 'Access updated',
                    message: `${share.user.name} now ${ROLE_TEXT[next]}.`,
                  })
                }}
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button
                type="button"
                className="danger-text"
                disabled={busy}
                onClick={() =>
                  run(() => api.unshareDocument(doc.id, share.user.id), {
                    title: 'Access removed',
                    message: `${share.user.name} can no longer open this document.`,
                  })
                }
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
