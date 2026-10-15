import { useRef, useState, type DragEvent } from 'react'
import { api, type ImportedFile } from '../api'
import { useToast } from '../toast'
import Modal from './Modal'

const ACCEPTED = ['.txt', '.md', '.markdown', '.docx']
const MAX_BYTES = 5 * 1024 * 1024

interface ImportModalProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onClose: () => void
  onImported: (file: ImportedFile) => Promise<void> | void
}

export default function ImportModal({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onImported,
}: ImportModalProps) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <ImportForm
        description={description}
        confirmLabel={confirmLabel}
        onCancel={onClose}
        onImported={onImported}
      />
    </Modal>
  )
}

interface ImportFormProps {
  description: string
  confirmLabel: string
  onCancel: () => void
  onImported: (file: ImportedFile) => Promise<void> | void
}

function ImportForm({ description, confirmLabel, onCancel, onImported }: ImportFormProps) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  function choose(selected: File | undefined) {
    if (!selected) return
    const ext = selected.name.slice(selected.name.lastIndexOf('.')).toLowerCase()
    if (ext === '.doc') {
      toast.warning('Old .doc files are not supported. Save it as .docx in Word and try again.', 'Unsupported file')
      return
    }
    if (!ACCEPTED.includes(ext)) {
      toast.warning(`“${selected.name}” can't be imported. Choose a .txt, .md or .docx file.`, 'Unsupported file')
      return
    }
    if (selected.size > MAX_BYTES) {
      toast.warning(`“${selected.name}” is larger than 5 MB.`, 'File too large')
      return
    }
    setFile(selected)
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    choose(e.dataTransfer.files[0])
  }

  async function handleImport() {
    if (!file) return
    setBusy(true)
    try {
      await onImported(await api.importFile(file))
    } catch (err) {
      toast.error((err as Error).message, 'Upload failed')
      setBusy(false)
    }
  }

  return (
    <>
      <p className="muted">{description}</p>

      <div
        className={`drop-zone${dragging ? ' dragging' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') input.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {file ? (
          <>
            <strong>{file.name}</strong>
            <span className="muted">{(file.size / 1024).toFixed(1)} KB · click to change</span>
          </>
        ) : (
          <>
            <strong>Drop a file here or click to browse</strong>
            <span className="muted">.txt, .md or .docx · up to 5 MB</span>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPTED.join(',')}
          hidden
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </div>

      <div className="modal-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={!file || busy} onClick={handleImport}>
          {busy ? 'Importing…' : confirmLabel}
        </button>
      </div>
    </>
  )
}
