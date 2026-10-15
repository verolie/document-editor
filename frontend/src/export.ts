import TurndownService from 'turndown'

function safeFilename(title: string) {
  return title.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 100) || 'document'
}

/** Image paths like /api/images/… only work inside the app; make them absolute. */
function absoluteImages(html: string) {
  return html.replace(/(<img [^>]*src=")\/(?!\/)/g, `$1${location.origin}/`)
}

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportMarkdown(title: string, html: string) {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  })
  // Markdown has no underline; keep it as inline HTML, which most Markdown viewers render.
  turndown.keep(['u'])
  const markdown = `# ${title}\n\n${turndown.turndown(absoluteImages(html))}\n`
  download(markdown, `${safeFilename(title)}.md`, 'text/markdown;charset=utf-8')
}

const PRINT_STYLES = `
  @page { margin: 2cm; }
  body { font: 12pt/1.55 Georgia, 'Times New Roman', serif; color: #111; margin: 0; }
  h1.doc-title { font-size: 22pt; margin: 0 0 18pt; }
  h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
  h1, h2, h3 { font-family: system-ui, 'Segoe UI', Arial, sans-serif; break-after: avoid; }
  p { margin: 0 0 0.7em; }
  ul, ol { padding-left: 1.5em; }
  li p { margin: 0.15em 0; }
  img { display: block; max-width: 100%; height: auto; break-inside: avoid; }
  img[data-align='center'] { margin-left: auto; margin-right: auto; }
  img[data-align='right'] { margin-left: auto; }
  blockquote { margin: 0 0 0.7em; padding-left: 1em; border-left: 3px solid #ccc; color: #444; }
  pre { white-space: pre-wrap; background: #f4f4f4; padding: 8pt; border-radius: 4pt; }
`

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Opens the browser's print dialog with a clean, print-styled copy of the document.
 * Choosing "Save as PDF" there produces the PDF, with real selectable text.
 */
export function exportPdf(title: string, html: string) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(frame)

  const doc = frame.contentDocument!
  // `html` is the editor's own output (already limited to the document schema), not raw user input.
  doc.open()
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<base href="${location.origin}/"><style>${PRINT_STYLES}</style></head>` +
      `<body><h1 class="doc-title">${escapeHtml(title)}</h1>${html}</body></html>`,
  )
  doc.close()

  const images = Array.from(doc.images)
  const ready = Promise.all(
    images.map((img) =>
      img.complete
        ? undefined
        : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true })
            img.addEventListener('error', resolve, { once: true })
          }),
    ),
  )
  // Don't wait forever for a slow image.
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000))

  Promise.race([ready, timeout]).then(() => {
    const win = frame.contentWindow!
    win.addEventListener('afterprint', () => frame.remove(), { once: true })
    win.focus()
    win.print()
    // Fallback cleanup for browsers that don't fire afterprint.
    setTimeout(() => frame.remove(), 60_000)
  })
}
