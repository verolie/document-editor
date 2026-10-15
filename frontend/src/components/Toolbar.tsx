import type { ReactNode } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import SpacingMenu from './SpacingMenu'
import ImageButton from './ImageButton'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3'
type Alignment = 'left' | 'center' | 'right'

const ALIGNMENTS: { value: Alignment; label: string; shortcut?: string; lines: number[] }[] = [
  { value: 'left', label: 'Align left', shortcut: `${mod}Shift+L`, lines: [16, 10, 14, 8] },
  { value: 'center', label: 'Align center', shortcut: `${mod}Shift+E`, lines: [16, 10, 14, 8] },
  { value: 'right', label: 'Align right', lines: [16, 10, 14, 8] },
]

const DEFAULT_FONT_SIZE = 16
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48]

// Four horizontal lines of different widths, anchored to the given side.
function AlignIcon({ align, lines }: { align: Alignment; lines: number[] }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {lines.map((width, i) => {
        const x = align === 'left' ? 1 : align === 'right' ? 17 - width : (18 - width) / 2
        return <rect key={i} x={x} y={2.5 + i * 4} width={width} height="1.8" rx="0.9" fill="currentColor" />
      })}
    </svg>
  )
}

interface ToolbarProps {
  editor: Editor
  documentId: string
  onComment: () => void
}

export default function Toolbar({ editor, documentId, onComment }: ToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      bulletList: editor.isActive('bulletList'),
      block: (editor.isActive('heading', { level: 1 })
        ? 'h1'
        : editor.isActive('heading', { level: 2 })
          ? 'h2'
          : editor.isActive('heading', { level: 3 })
            ? 'h3'
            : 'paragraph') as BlockType,
      // Empty when the text uses the default size for its block (normal text or a heading).
      fontSize: String(editor.getAttributes('textStyle').fontSize ?? '').replace('px', ''),
      imageSelected: editor.isActive('image'),
      // A selected image has its own alignment; otherwise the text's alignment is shown.
      align: editor.isActive('image')
        ? ((editor.getAttributes('image').align as Alignment | undefined) ?? 'left')
        : ((['center', 'right'] as const).find((a) => editor.isActive({ textAlign: a })) ?? 'left'),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  })

  function setBlock(value: BlockType) {
    const chain = editor.chain().focus()
    if (value === 'paragraph') chain.setParagraph().run()
    else chain.toggleHeading({ level: Number(value[1]) as 1 | 2 | 3 }).run()
  }

  function setFontSize(value: string) {
    const chain = editor.chain().focus()
    if (value === '') chain.unsetFontSize().run()
    else chain.setFontSize(`${value}px`).run()
  }

  // Keep a custom size from pasted or imported text selectable in the list.
  const sizes = FONT_SIZES.map(String)
  if (state.fontSize && !sizes.includes(state.fontSize)) sizes.push(state.fontSize)
  sizes.sort((a, b) => Number(a) - Number(b))

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <select
        className="block-select"
        value={state.block}
        onChange={(e) => setBlock(e.target.value as BlockType)}
        aria-label="Text style"
        title="Text style"
      >
        <option value="paragraph">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>

      <select
        className="size-select"
        value={state.fontSize}
        onChange={(e) => setFontSize(e.target.value)}
        aria-label="Font size"
        title="Font size"
      >
        <option value="">{state.block === 'paragraph' ? `${DEFAULT_FONT_SIZE} (default)` : 'Default'}</option>
        {sizes.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>

      <span className="toolbar-divider" />

      <ToolButton
        label="Bold"
        shortcut={`${mod}B`}
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <b>B</b>
      </ToolButton>
      <ToolButton
        label="Italic"
        shortcut={`${mod}I`}
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <i>I</i>
      </ToolButton>
      <ToolButton
        label="Underline"
        shortcut={`${mod}U`}
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </ToolButton>

      <span className="toolbar-divider" />

      <ToolButton
        label="Bullet list"
        shortcut={`${mod}Shift+8, or type - or * then space`}
        active={state.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </ToolButton>

      <span className="toolbar-divider" />

      {ALIGNMENTS.map(({ value, label, shortcut, lines }) => (
        <ToolButton
          key={value}
          label={state.imageSelected ? `${label} (image)` : label}
          shortcut={shortcut}
          active={state.align === value}
          onClick={() => editor.chain().focus().setAlignment(value).run()}
        >
          <AlignIcon align={value} lines={lines} />
        </ToolButton>
      ))}

      <SpacingMenu editor={editor} />
      <ImageButton editor={editor} documentId={documentId} />
      <ToolButton label="Comment on selection" shortcut={`${mod}Alt+M`} onClick={onComment}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M3 3.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-3.5 3v-3H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" />
          <path d="M5.5 7h7M5.5 9.5h4.5" strokeLinecap="round" />
        </svg>
      </ToolButton>

      <span className="toolbar-divider" />

      <ToolButton
        label="Undo"
        shortcut={`${mod}Z`}
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↶
      </ToolButton>
      <ToolButton
        label="Redo"
        shortcut={isMac ? '⌘Shift+Z' : 'Ctrl+Y'}
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↷
      </ToolButton>
    </div>
  )
}

interface ToolButtonProps {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function ToolButton({ label, shortcut, active, disabled, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`tool-button${active ? ' active' : ''}`}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor selection when clicking a toolbar button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
