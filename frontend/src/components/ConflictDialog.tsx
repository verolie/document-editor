import type { SaveConflict } from '../api'
import { formatDateTime } from '../collab/time'
import Modal from './Modal'

interface ConflictDialogProps {
  conflict: SaveConflict | null
  busy: boolean
  onOverwrite: () => void
  onDiscard: () => void
  onCancel: () => void
}

/** Shown when saving fails because someone else saved a newer version first. */
export default function ConflictDialog({ conflict, busy, onOverwrite, onDiscard, onCancel }: ConflictDialogProps) {
  return (
    <Modal open={conflict !== null} title="Someone else saved this document" onClose={() => !busy && onCancel()}>
      {conflict && (
        <>
          <p>
            <strong>{conflict.lastEditedBy?.name ?? 'Another person'}</strong> saved changes at{' '}
            {formatDateTime(conflict.updatedAt)}, while you were editing.
          </p>
          <ul className="conflict-options">
            <li>
              <strong>Keep my version</strong> replaces their changes with yours.
            </li>
            <li>
              <strong>Load their version</strong> discards your unsaved changes.
            </li>
          </ul>
          <p className="muted">Either way, both versions stay available in Version history.</p>
          <div className="modal-actions">
            <button type="button" onClick={onCancel} disabled={busy} data-autofocus>
              Cancel
            </button>
            <button type="button" onClick={onDiscard} disabled={busy}>
              Load their version
            </button>
            <button type="button" className="primary" onClick={onOverwrite} disabled={busy}>
              Keep my version
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
