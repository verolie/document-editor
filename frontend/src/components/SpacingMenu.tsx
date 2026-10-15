import { useEffect, useRef, useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'

const LINE_HEIGHTS: { label: string; value: string | null }[] = [
  { label: 'Single', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: 'Default', value: null },
  { label: 'Double', value: '2' },
]

const PARAGRAPH_SPACING: { label: string; value: string | null }[] = [
  { label: 'None', value: '0' },
  { label: 'Small', value: '0.35em' },
  { label: 'Default', value: null },
  { label: 'Large', value: '1.5em' },
]

export default function SpacingMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const current = useEditorState({
    editor,
    selector: ({ editor }) => {
      const attrs = editor.getAttributes(editor.isActive('heading') ? 'heading' : 'paragraph')
      return {
        lineHeight: (attrs.lineHeight as string | null) ?? null,
        spaceAfter: (attrs.spaceAfter as string | null) ?? null,
      }
    },
  })

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        editor.commands.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, editor])

  return (
    <div className="menu-root" ref={root}>
      <button
        type="button"
        className={`tool-button${open ? ' active' : ''}`}
        title="Line & paragraph spacing"
        aria-label="Line and paragraph spacing"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
          <rect x="8" y="3" width="9" height="1.8" rx="0.9" />
          <rect x="8" y="8.1" width="9" height="1.8" rx="0.9" />
          <rect x="8" y="13.2" width="9" height="1.8" rx="0.9" />
          <path d="M3.5 1.5L1 4.5h5zM3.5 16.5L1 13.5h5z" />
          <rect x="2.8" y="4" width="1.4" height="10" />
        </svg>
        <span className="caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="menu" role="menu">
          <MenuGroup
            title="Line spacing"
            options={LINE_HEIGHTS}
            current={current.lineHeight}
            onSelect={(value) => editor.chain().focus().setLineHeight(value).run()}
          />
          <MenuGroup
            title="Space between paragraphs"
            options={PARAGRAPH_SPACING}
            current={current.spaceAfter}
            onSelect={(value) => editor.chain().focus().setSpaceAfter(value).run()}
          />
          <p className="menu-hint">
            Tip: press <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line without paragraph space.
          </p>
        </div>
      )}
    </div>
  )
}

interface MenuGroupProps {
  title: string
  options: { label: string; value: string | null }[]
  current: string | null
  onSelect: (value: string | null) => void
}

function MenuGroup({ title, options, current, onSelect }: MenuGroupProps) {
  return (
    <div className="menu-group" role="group" aria-label={title}>
      <div className="menu-title">{title}</div>
      {options.map((option) => {
        const checked = option.value === current
        return (
          <button
            key={option.label}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            className="menu-item"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(option.value)}
          >
            <span className="menu-check" aria-hidden="true">
              {checked ? '✓' : ''}
            </span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
