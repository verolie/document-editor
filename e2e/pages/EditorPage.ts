import { expect, type Locator, type Page } from '@playwright/test'

export class EditorPage {
  readonly title: Locator
  readonly content: Locator
  readonly toolbar: Locator
  readonly saveButton: Locator
  readonly status: Locator
  readonly readonlyBanner: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('textbox', { name: 'Document title' })
    this.content = page.locator('.paper .ProseMirror')
    this.toolbar = page.getByRole('toolbar', { name: 'Formatting' })
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true })
    this.status = page.locator('.save-status')
    this.readonlyBanner = page.locator('.readonly-banner')
  }

  async goto(id: string) {
    await this.page.goto(`/doc/${id}`)
    await this.content.waitFor()
  }

  tool(label: string) {
    return this.toolbar.getByRole('button', { name: label, exact: true })
  }

  /** Puts the cursor at the end of the document and types. */
  async type(text: string) {
    await this.content.click()
    await this.page.keyboard.press('ControlOrMeta+End')
    await this.page.keyboard.type(text)
  }

  async selectAll() {
    await this.content.click()
    await this.page.keyboard.press('ControlOrMeta+A')
  }

  /** Selects the first occurrence of `text` inside the editor. */
  async selectText(text: string) {
    await this.content.evaluate((root, needle) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent!.indexOf(needle)
        if (at >= 0) {
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + needle.length)
          const sel = window.getSelection()!
          sel.removeAllRanges()
          sel.addRange(range)
          return
        }
      }
      throw new Error(`Text not found in editor: ${needle}`)
    }, text)
  }

  async save() {
    await this.saveButton.click()
    await expect(this.status).toHaveText('All changes saved')
  }

  async rename(title: string) {
    await this.title.fill(title)
    await this.title.press('Enter')
  }
}
