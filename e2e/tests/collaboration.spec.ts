import { createDoc, expect, newUserSession, shareDoc, test } from '../fixtures'
import { EditorPage } from '../pages/EditorPage'

test.describe('comments', () => {
  test('comment on selected text, then resolve it', async ({ page, editor }) => {
    const doc = await createDoc(page.request, { content: '<p>The launch date is Friday.</p>' })
    await editor.goto(doc.id)

    await editor.selectText('Friday')
    await editor.tool('Comment on selection').click()
    const panel = page.getByRole('complementary', { name: 'Comments' })
    await panel.getByPlaceholder(/Add a comment/).fill('Can we move this to Monday?')
    await panel.getByRole('button', { name: 'Comment', exact: true }).click()

    const thread = panel.locator('.thread-list > li', { hasText: 'Can we move this to Monday?' })
    await expect(thread).toBeVisible()
    await expect(thread.locator('.thread-quote')).toHaveText('Friday')
    await expect(panel.getByRole('tab', { name: 'Open (1)' })).toBeVisible()
    await expect(editor.content.locator('[data-thread-id]')).toHaveText('Friday')

    await thread.getByRole('button', { name: 'Resolve' }).click()
    await expect(panel.getByRole('tab', { name: 'Resolved (1)' })).toBeVisible()
    await expect(panel.getByRole('tab', { name: 'Open (0)' })).toBeVisible()
  })

  test('commenting with nothing selected shows a hint', async ({ page, editor }) => {
    const doc = await createDoc(page.request, { content: '<p>Some text</p>' })
    await editor.goto(doc.id)
    await editor.content.click()
    await editor.tool('Comment on selection').click()
    await expect(page.getByRole('status').filter({ hasText: 'Select the text you want to comment on first.' })).toBeVisible()
  })

  test('a commenter can comment but not edit', async ({ page, browser, baseURL }) => {
    const doc = await createDoc(page.request, { content: '<p>Review this sentence.</p>' })
    const reviewer = await newUserSession(browser, baseURL!, 'Reviewer')
    await shareDoc(page.request, doc.id, reviewer.user.email, 'commenter')

    const editor = new EditorPage(reviewer.page)
    await editor.goto(doc.id)
    await expect(editor.content).toHaveAttribute('contenteditable', 'false')
    await expect(editor.readonlyBanner).toContainText('You can comment')

    await editor.selectText('sentence')
    await editor.readonlyBanner.getByRole('button', { name: /Comment/ }).click()
    const panel = reviewer.page.getByRole('complementary', { name: 'Comments' })
    await panel.getByPlaceholder(/Add a comment/).fill('Looks good')
    await panel.getByRole('button', { name: 'Comment', exact: true }).click()
    await expect(panel.getByText('Looks good')).toBeVisible()
    await reviewer.context.close()

    // The owner sees the reviewer's comment.
    const ownerEditor = new EditorPage(page)
    await ownerEditor.goto(doc.id)
    await page.getByRole('button', { name: /^Comments/ }).click()
    await expect(page.getByRole('complementary', { name: 'Comments' }).getByText('Looks good')).toBeVisible()
  })
})

test.describe('version history', () => {
  test('restores an earlier version', async ({ page, browser, baseURL, editor }) => {
    const doc = await createDoc(page.request, { title: 'Versioned' })
    await editor.goto(doc.id)
    await editor.type('First draft')
    await editor.save()

    // Saves by the same person are grouped, so a second person makes the next version.
    const coauthor = await newUserSession(browser, baseURL!, 'Coauthor')
    await shareDoc(page.request, doc.id, coauthor.user.email, 'editor')
    const theirs = new EditorPage(coauthor.page)
    await theirs.goto(doc.id)
    await theirs.selectAll()
    await coauthor.page.keyboard.type('Second draft')
    await theirs.save()
    await coauthor.context.close()

    await editor.goto(doc.id)
    await expect(editor.content).toContainText('Second draft')
    await page.getByRole('button', { name: 'History' }).click()
    const panel = page.getByRole('complementary', { name: 'Version history' })
    const versions = panel.locator('.version-item')
    await expect(versions).toHaveCount(2)

    await versions.filter({ hasText: 'Owner' }).click()
    const preview = page.getByRole('dialog')
    await expect(preview).toContainText('First draft')
    await preview.getByRole('button', { name: 'Restore this version' }).click()

    await expect(editor.content).toContainText('First draft')
    await expect(editor.content).not.toContainText('Second draft')
    await page.reload()
    await expect(editor.content).toContainText('First draft')
  })
})

test.describe('save conflicts', () => {
  test('saving over someone else\'s newer save asks which version to keep', async ({ page, browser, baseURL, editor }) => {
    const doc = await createDoc(page.request, { content: '<p>Base</p>' })
    const other = await newUserSession(browser, baseURL!, 'Racer')
    await shareDoc(page.request, doc.id, other.user.email, 'editor')

    // Both open the same version, the other user saves first.
    await editor.goto(doc.id)
    const theirs = new EditorPage(other.page)
    await theirs.goto(doc.id)
    await theirs.type(' theirs')
    await theirs.save()
    await other.context.close()

    await editor.type(' mine')
    await editor.saveButton.click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})
