import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { FontSize, TextStyle } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import { Spacing } from './spacing'

export type Alignment = 'left' | 'center' | 'right'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    alignment: {
      /** Aligns the selected image, or the selected paragraphs/headings. */
      setAlignment: (align: Alignment) => ReturnType
    }
  }
}

// Shortcuts live in `AlignmentCommands` so they also work on images.
const TextAlignment = TextAlign.extend({
  addKeyboardShortcuts() {
    return {}
  },
}).configure({
  types: ['heading', 'paragraph'],
  alignments: ['left', 'center', 'right'],
})

/** Images get an `align` attribute, saved as data-align and laid out by CSS. */
const AlignedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'left',
        parseHTML: (el) => el.getAttribute('data-align') ?? 'left',
        renderHTML: (attrs) => (attrs.align && attrs.align !== 'left' ? { 'data-align': attrs.align } : {}),
      },
    }
  },
})

const AlignmentCommands = Extension.create({
  name: 'alignment',

  addCommands() {
    return {
      setAlignment:
        (align) =>
        ({ editor, commands }) =>
          editor.isActive('image') ? commands.updateAttributes('image', { align }) : commands.setTextAlign(align),
    }
  },

  // Ctrl+Shift+R is the browser's hard reload, so only left and center get shortcuts.
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-l': () => this.editor.commands.setAlignment('left'),
      'Mod-Shift-e': () => this.editor.commands.setAlignment('center'),
    }
  },
})

/** The document format: shared by the editor and read-only views (e.g. version previews). */
export function documentExtensions({ resizableImages = false } = {}) {
  return [
    StarterKit.configure({ link: false }),
    TextAlignment,
    AlignmentCommands,
    TextStyle,
    FontSize,
    Spacing,
    // Images are uploaded and referenced by URL; base64 stays allowed for older documents.
    AlignedImage.configure({
      allowBase64: true,
      resize: resizableImages
        ? { enabled: true, directions: ['bottom-right', 'bottom-left'], minWidth: 60, alwaysPreserveAspectRatio: true }
        : false,
    }),
  ]
}
