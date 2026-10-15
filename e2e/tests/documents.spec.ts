import path from 'node:path'
import { createDoc, expect, test } from '../fixtures'

const samples = path.join(import.meta.dirname, '..', '..', 'samples')

test.describe('documents list', () => {
  test('creates a blank document and opens it', async ({ page, documents, editor }) => {
    await documents.goto()
    await documents.newDocument.click()
    await expect(page).toHaveURL(/\/doc\/[\w-]+$/)
    await expect(editor.title).toHaveValue('Untitled document')
    await expect(editor.content).toBeEditable()
  })

  test('renamed document shows under My documents', async ({ page, documents, editor }) => {
    const doc = await createDoc(page.request)
    await editor.goto(doc.id)
    await editor.rename('Quarterly plan')
    await expect(page.getByRole('status').filter({ hasText: /renamed|saved/i }).first()).toBeVisible()

    await documents.goto()
    await expect(documents.docLink(documents.mine, 'Quarterly plan')).toBeVisible()
  })

  test('deletes a document after confirming', async ({ page, documents }) => {
    await createDoc(page.request, { title: 'Throwaway' })
    await documents.goto()
    await expect(documents.docLink(documents.mine, 'Throwaway')).toBeVisible()

    await documents.deleteDoc('Throwaway')
    await expect(documents.docLink(documents.mine, 'Throwaway')).toHaveCount(0)

    await page.reload()
    await expect(documents.docLink(documents.mine, 'Throwaway')).toHaveCount(0)
  })

  test('cancelling delete keeps the document', async ({ page, documents }) => {
    await createDoc(page.request, { title: 'Keep me' })
    await documents.goto()
    await page.getByRole('button', { name: 'Delete Keep me' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(documents.docLink(documents.mine, 'Keep me')).toBeVisible()
  })

  for (const file of ['sample.txt', 'sample.md', 'sample.docx']) {
    test(`uploading ${file} creates an editable document`, async ({ page, documents, editor }) => {
      await documents.goto()
      await documents.upload(path.join(samples, file))
      await expect(page).toHaveURL(/\/doc\/[\w-]+$/)
      await expect(editor.content).toContainText('Project Kickoff Notes')
      await expect(editor.content).toBeEditable()
    })
  }

  test('markdown formatting survives the upload', async ({ documents, editor }) => {
    await documents.goto()
    await documents.upload(path.join(samples, 'sample.md'))
    await expect(editor.content.locator('h1')).toHaveText('Project Kickoff Notes')
    await expect(editor.content.locator('h2').first()).toHaveText('Supported formatting')
    await expect(editor.content.locator('ul li').first()).toBeVisible()
    await expect(editor.content.locator('strong').first()).toBeVisible()
  })
})
