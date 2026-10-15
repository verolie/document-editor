import { useEffect, useRef, useState } from 'react'

interface ExportMenuProps {
  onPdf: () => void
  onMarkdown: () => void
}

export default function ExportMenu({ onPdf, onMarkdown }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function choose(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div className="menu-root" ref={root}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Export ▾
      </button>
      {open && (
        <div className="menu menu-right" role="menu">
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onPdf)}>
            <span className="menu-check" aria-hidden="true">⎙</span>
            <span>
              PDF
              <small className="menu-item-hint">Opens print; choose “Save as PDF”</small>
            </span>
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onMarkdown)}>
            <span className="menu-check" aria-hidden="true">⤓</span>
            <span>
              Markdown (.md)
              <small className="menu-item-hint">Downloads a file</small>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
