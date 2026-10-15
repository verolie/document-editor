import path from 'node:path'
import { createDoc, expect, test } from '../fixtures'

test.describe('editor', () => {
  test.beforeEach(async ({ page, editor }) => {
    const doc = await createDoc(page.request, { title: 'Editor test' })
    await editor.goto(doc.id)
  })

  test('typing marks the document unsaved, Save persists it', async ({ page, editor }) => {
    await expect(editor.status).toHaveText('All changes saved')
    await expect(editor.saveButton).toBeDisabled()

    await editor.type('Hello from Playwright')
    await expect(editor.status).toHaveText('Unsaved changes')
    await editor.save()

    await page.reload()
    await expect(editor.content).toContainText('Hello from Playwright')
  })

  test('Ctrl+S saves', async ({ page, editor }) => {
    await editor.type('Saved with the keyboard')
    await page.keyboard.press('ControlOrMeta+S')
    await expect(editor.status).toHaveText('All changes saved')

    await page.reload()
    await expect(editor.content).toContainText('Saved with the keyboard')
  })

  test('bold, italic and underline from the toolbar', async ({ editor }) => {
    await editor.type('Styled')
    await editor.selectAll()
    await editor.tool('Bold').click()
    await editor.tool('Italic').click()
    await editor.tool('Underline').click()

    await expect(editor.content.locator('strong')).toHaveText('Styled')
    await expect(editor.content.locator('em')).toHaveText('Styled')
    await expect(editor.content.locator('u')).toHaveText('Styled')
    await expect(editor.tool('Bold')).toHaveClass(/active/)
  })

  test('keyboard shortcuts for bold and italic', async ({ page, editor }) => {
    await editor.content.click()
    await page.keyboard.press('ControlOrMeta+B')
    await page.keyboard.type('bold ')
    await page.keyboard.press('ControlOrMeta+B')
    await page.keyboard.press('ControlOrMeta+I')
    await page.keyboard.type('italic')

    await expect(editor.content.locator('strong')).toHaveText('bold')
    await expect(editor.content.locator('em')).toHaveText('italic')
  })

  test('text style dropdown makes a heading', async ({ editor }) => {
    await editor.type('Big title')
    await editor.toolbar.getByLabel('Text style').selectOption('h1')
    await expect(editor.content.locator('h1')).toHaveText('Big title')
  })

  test('font size dropdown applies a size', async ({ editor }) => {
    await editor.type('Large text')
    await editor.selectAll()
    await editor.toolbar.getByLabel('Font size').selectOption('24')
    await expect(editor.content.locator('[style*="font-size"]')).toHaveAttribute('style', /24px/)
  })

  test('typing "- " starts a bullet list', async ({ page, editor }) => {
    await editor.content.click()
    await page.keyboard.type('- first')
    await page.keyboard.press('Enter')
    await page.keyboard.type('second')
    await expect(editor.content.locator('ul > li')).toHaveText(['first', 'second'])
  })

  test('align center', async ({ editor }) => {
    await editor.type('Centered')
    await editor.tool('Align center').click()
    await expect(editor.content.locator('p', { hasText: 'Centered' })).toHaveCSS('text-align', 'center')
  })

  test('undo and redo', async ({ editor }) => {
    await editor.type('undo me')
    await editor.tool('Undo').click()
    await expect(editor.content).not.toContainText('undo me')
    await editor.tool('Redo').click()
    await expect(editor.content).toContainText('undo me')
  })

  test('import file inserts content at the cursor', async ({ page, editor }) => {
    await editor.type('Before import. ')
    await page.getByRole('button', { name: 'Import file' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles(path.join(import.meta.dirname, '..', '..', 'samples', 'sample.txt'))
    await dialog.getByRole('button', { name: 'Insert content' }).click()

    await expect(editor.content).toContainText('Before import.')
    await expect(editor.content).toContainText('Project Kickoff Notes')
    await expect(editor.status).toHaveText('Unsaved changes')
  })

  test('export to Markdown downloads a .md file', async ({ page, editor }) => {
    await editor.type('Exported line')
    await page.getByRole('button', { name: 'Export ▾' }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /Markdown/ }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/\.md$/)
    const text = await (await file.createReadStream()).toArray()
    expect(Buffer.concat(text).toString()).toContain('Exported line')
  })
})
