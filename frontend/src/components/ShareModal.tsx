import { useState, type FormEvent } from 'react'
import { api, type Doc, type Share, type ShareRole } from '../api'
import { useToast } from '../toast'
import ConfirmDialog from './ConfirmDialog'
import Modal from './Modal'

export const ROLE_LABEL: Record<ShareRole, string> = {
  viewer: 'Viewer',
  commenter: 'Commenter',
  editor: 'Editor',
}

const ROLE_DESCRIPTION: Record<ShareRole, string> = {
  viewer: 'can read and see comments',
  commenter: 'can read and comment',
  editor: 'can edit, comment and restore versions',
}

const ROLES: ShareRole[] = ['viewer', 'commenter', 'editor']

interface ShareModalProps {
  open: boolean
  doc: Doc
  currentUserId: string
  onClose: () => void
  onChange: (doc: Doc) => void
}

export default function ShareModal({ open, doc, currentUserId, onClose, onChange }: ShareModalProps) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ShareRole>('editor')
  const [busy, setBusy] = useState(false)
  const [pendingTransfer, setPendingTransfer] = useState<Share | null>(null)

  const isOwner = doc.permissions.manage

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
      message: `${target} is now a ${ROLE_LABEL[role].toLowerCase()} on “${doc.title}”.`,
    })
    if (ok) setEmail('')
  }

  async function confirmTransfer() {
    if (!pendingTransfer) return
    const ok = await run(() => api.transferOwnership(doc.id, pendingTransfer.user.id), {
      title: 'Ownership transferred',
      message: `${pendingTransfer.user.name} now owns “${doc.title}”. You're an editor.`,
    })
    if (ok) setPendingTransfer(null)
  }

  const shares = doc.shares ?? []

  return (
    <Modal open={open} title={`Share “${doc.title}”`} onClose={onClose}>
      <form className="share-form" onSubmit={handleSubmit}>
        <input
          type="email"
          required
          placeholder="Email of someone who has signed in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as ShareRole)} aria-label="Role">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button type="submit" className="primary" disabled={busy}>
          Share
        </button>
      </form>
      <p className="muted role-hint">
        {ROLE_LABEL[role]} {ROLE_DESCRIPTION[role]}.
      </p>

      <h3 className="section-label">People with access</h3>
      <ul className="share-list">
        <li>
          <div>
            <strong>
              {doc.owner?.name}
              {doc.owner?.id === currentUserId && ' (you)'}
            </strong>
            <span className="muted">{doc.owner?.email}</span>
          </div>
          <span className="badge">Owner</span>
        </li>
        {shares.map((share) => (
          <li key={share.user.id}>
            <div>
              <strong>
                {share.user.name}
                {share.user.id === currentUserId && ' (you)'}
              </strong>
              <span className="muted">{share.user.email}</span>
            </div>
            <div className="share-actions">
              <select
                value={share.role}
                disabled={busy}
                aria-label={`Role for ${share.user.name}`}
                onChange={(e) => {
                  const next = e.target.value as ShareRole
                  run(() => api.shareDocument(doc.id, share.user.email, next), {
                    title: 'Access updated',
                    message: `${share.user.name} is now a ${ROLE_LABEL[next].toLowerCase()}.`,
                  })
                }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              {isOwner && (
                <button type="button" className="link" disabled={busy} onClick={() => setPendingTransfer(share)}>
                  Make owner
                </button>
              )}
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

      {isOwner && (
        <label className="setting">
          <input
            type="checkbox"
            checked={doc.editorsCanShare}
            disabled={busy}
            onChange={(e) => {
              const enabled = e.target.checked
              run(() => api.updateSettings(doc.id, { editorsCanShare: enabled }), {
                title: 'Sharing settings updated',
                message: enabled ? 'Editors can now share this document.' : 'Only you can share this document now.',
              })
            }}
          />
          <span>
            <strong>Editors can share</strong>
            <span className="muted">Let editors add people and change their access.</span>
          </span>
        </label>
      )}

      <ConfirmDialog
        open={pendingTransfer !== null}
        title="Transfer ownership?"
        confirmLabel="Make owner"
        busyLabel="Transferring…"
        busy={busy}
        onConfirm={confirmTransfer}
        onCancel={() => setPendingTransfer(null)}
      >
        <p>
          <strong>{pendingTransfer?.user.name}</strong> will own “{doc.title}”: they can delete it, manage
          sharing and transfer it again.
        </p>
        <p className="muted">You'll become an editor. Only the new owner can undo this.</p>
      </ConfirmDialog>
    </Modal>
  )
}
