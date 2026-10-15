import type { Locator, Page } from '@playwright/test'

export class DocumentsPage {
  readonly heading: Locator
  readonly newDocument: Locator
  readonly uploadFile: Locator
  readonly signOut: Locator
  readonly mine: Locator
  readonly shared: Locator

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Documents', level: 1 })
    this.newDocument = page.getByRole('button', { name: '+ New document' })
    this.uploadFile = page.getByRole('button', { name: 'Upload file' })
    this.signOut = page.getByRole('button', { name: 'Sign out' })
    this.mine = page.locator('section.doc-section', { has: page.getByRole('heading', { name: 'My documents' }) })
    this.shared = page.locator('section.doc-section', { has: page.getByRole('heading', { name: 'Shared with me' }) })
  }

  async goto() {
    await this.page.goto('/')
    await this.heading.waitFor()
  }

  docLink(section: Locator, title: string) {
    return section.getByRole('link').filter({ has: this.page.locator('strong', { hasText: new RegExp(`^${escape(title)}$`) }) })
  }

  async deleteDoc(title: string) {
    await this.page.getByRole('button', { name: `Delete ${title}` }).click()
    await this.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  }

  /** Uploads a file through the "Upload file" dialog; the app opens the new document. */
  async upload(filePath: string) {
    await this.uploadFile.click()
    const dialog = this.page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles(filePath)
    await dialog.getByRole('button', { name: 'Create document' }).click()
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
