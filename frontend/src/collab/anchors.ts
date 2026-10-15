import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Comments are anchored by the quoted text plus a little context before and after it
 * (like the W3C TextQuoteSelector). Nothing is stored inside the document, so people
 * who may only comment never have to change it, and anchors survive unrelated edits.
 */

const CONTEXT = 32

export interface Anchor {
  quote: string
  prefix: string
  suffix: string
}

interface TextIndex {
  text: string
  /** positions[i] is the document position of text[i]. */
  positions: number[]
}

/** Flattens the document's text; blocks are separated by "\n". */
function indexText(doc: PMNode): TextIndex {
  let text = ''
  const positions: number[] = []
  doc.descendants((node, pos) => {
    if (node.isText) {
      for (let i = 0; i < node.text!.length; i++) positions.push(pos + i)
      text += node.text
    } else if (node.isTextblock && text.length > 0 && !text.endsWith('\n')) {
      positions.push(pos)
      text += '\n'
    }
    return true
  })
  return { text, positions }
}

/** Index of the first character at or after document position `pos`. */
function offsetAt(index: TextIndex, pos: number) {
  let lo = 0
  let hi = index.positions.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (index.positions[mid] < pos) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Describes the text between two document positions so it can be found again later. */
export function captureAnchor(doc: PMNode, from: number, to: number): Anchor | null {
  const index = indexText(doc)
  const start = offsetAt(index, from)
  const end = offsetAt(index, to)
  const quote = index.text.slice(start, end)
  if (!quote.trim()) return null
  return {
    quote,
    prefix: index.text.slice(Math.max(0, start - CONTEXT), start),
    suffix: index.text.slice(end, end + CONTEXT),
  }
}

function sharedSuffix(a: string, b: string) {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

function sharedPrefix(a: string, b: string) {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/** Finds where an anchor's quote is now; picks the occurrence whose surroundings match best. */
export function findAnchor(doc: PMNode, anchor: Pick<Anchor, 'quote'> & Partial<Anchor>) {
  const { quote } = anchor
  if (!quote) return null
  const index = indexText(doc)
  let best = -1
  let bestScore = -1
  for (let i = index.text.indexOf(quote); i !== -1; i = index.text.indexOf(quote, i + 1)) {
    const score =
      sharedSuffix(index.text.slice(Math.max(0, i - CONTEXT), i), anchor.prefix ?? '') +
      sharedPrefix(index.text.slice(i + quote.length, i + quote.length + CONTEXT), anchor.suffix ?? '')
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  }
  if (best === -1) return null
  return { from: index.positions[best], to: index.positions[best + quote.length - 1] + 1 }
}
