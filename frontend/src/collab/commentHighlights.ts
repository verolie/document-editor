import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { findAnchor, type Anchor } from './anchors'

export interface HighlightThread extends Anchor {
  id: string
}

interface PluginState {
  threads: HighlightThread[]
  activeId: string | null
  decorations: DecorationSet
}

export const commentHighlightsKey = new PluginKey<PluginState>('commentHighlights')

function build(state: Pick<EditorState, 'doc'>, threads: HighlightThread[], activeId: string | null) {
  const decorations: Decoration[] = []
  for (const thread of threads) {
    const range = findAnchor(state.doc, thread)
    if (!range) continue
    decorations.push(
      Decoration.inline(range.from, range.to, {
        class: thread.id === activeId ? 'comment-highlight active' : 'comment-highlight',
        'data-thread-id': thread.id,
      }),
    )
  }
  return DecorationSet.create(state.doc, decorations)
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentHighlights: {
      /** Sets which comment threads are highlighted and which one is selected. */
      setCommentHighlights: (threads: HighlightThread[], activeId: string | null) => ReturnType
    }
  }
}

/**
 * Highlights the passages open comment threads refer to. Highlights are decorations,
 * not part of the document, so they never appear in saved content. Each highlight carries
 * data-thread-id so the page can open its thread when clicked (works in read-only mode too).
 */
export const CommentHighlights = Extension.create({
  name: 'commentHighlights',

  addCommands() {
    return {
      setCommentHighlights:
        (threads, activeId) =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(commentHighlightsKey, { threads, activeId }).setMeta('addToHistory', false))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<PluginState>({
        key: commentHighlightsKey,
        state: {
          init: (_, state) => ({ threads: [], activeId: null, decorations: build(state, [], null) }),
          apply(tr, value, _old, state) {
            const meta = tr.getMeta(commentHighlightsKey) as Pick<PluginState, 'threads' | 'activeId'> | undefined
            if (meta) return { ...meta, decorations: build(state, meta.threads, meta.activeId) }
            if (tr.docChanged) return { ...value, decorations: build(state, value.threads, value.activeId) }
            return value
          },
        },
        props: {
          decorations: (state) => commentHighlightsKey.getState(state)?.decorations,
        },
      }),
    ]
  },
})
