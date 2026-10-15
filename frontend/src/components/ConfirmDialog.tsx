import type { ReactNode } from 'react'
import Modal from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  busyLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busyLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={() => !busy && onCancel()}>
      <div className="confirm-message">{children}</div>
      <div className="modal-actions">
        {/* Cancel gets focus first so pressing Enter never confirms by accident. */}
        <button type="button" onClick={onCancel} disabled={busy} data-autofocus>
          Cancel
        </button>
        <button
          type="button"
          className={danger ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
