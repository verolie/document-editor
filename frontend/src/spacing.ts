import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spacing: {
      /** Line height for the selected paragraphs/headings; null resets to default. */
      setLineHeight: (value: string | null) => ReturnType
      /** Space below the selected paragraphs/headings; null resets to default. */
      setSpaceAfter: (value: string | null) => ReturnType
    }
  }
}

const TYPES = ['paragraph', 'heading']

// Block-level spacing stored as inline styles, so it survives saving as HTML.
export const Spacing = Extension.create({
  name: 'spacing',

  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => el.style.marginBottom || null,
            renderHTML: (attrs) => (attrs.spaceAfter ? { style: `margin-bottom: ${attrs.spaceAfter}` } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    const update =
      (attr: 'lineHeight' | 'spaceAfter') =>
      (value: string | null) =>
      ({ commands }: { commands: { updateAttributes: (type: string, attrs: Record<string, unknown>) => boolean } }) =>
        TYPES.map((type) => commands.updateAttributes(type, { [attr]: value })).some(Boolean)

    return {
      setLineHeight: update('lineHeight'),
      setSpaceAfter: update('spaceAfter'),
    }
  },
})
