import { createDoc, expect, newUserSession, shareDoc, test } from '../fixtures'
import { DocumentsPage } from '../pages/DocumentsPage'
import { EditorPage } from '../pages/EditorPage'

test.describe('sharing', () => {
  test('owner shares by email from the Share dialog', async ({ page, browser, baseURL, editor }) => {
    const guest = await newUserSession(browser, baseURL!, 'Guest')
    const doc = await createDoc(page.request, { title: 'Shared plan' })

    await editor.goto(doc.id)
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /Share/ })
    await dialog.getByPlaceholder('Email of someone who has signed in').fill(guest.user.email)
    await dialog.getByLabel('Role', { exact: true }).selectOption('viewer')
    await dialog.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(dialog.getByText(guest.user.email)).toBeVisible()

    const guestDocs = new DocumentsPage(guest.page)
    await guestDocs.goto()
    const link = guestDocs.docLink(guestDocs.shared, 'Shared plan')
    await expect(link).toBeVisible()
    await expect(link.locator('.badge')).toHaveText('Viewer')
    await guest.context.close()
  })

  test('viewer gets a read-only page', async ({ page, browser, baseURL }) => {
    const doc = await createDoc(page.request, { title: 'Read only', content: '<p>Owner text</p>' })
    const viewer = await newUserSession(browser, baseURL!, 'Viewer')
    await shareDoc(page.request, doc.id, viewer.user.email, 'viewer')

    const editor = new EditorPage(viewer.page)
    await editor.goto(doc.id)
    await expect(editor.content).toContainText('Owner text')
    await expect(editor.readonlyBanner).toContainText('View only')
    await expect(editor.toolbar).toHaveCount(0)
    await expect(editor.saveButton).toHaveCount(0)
    await expect(editor.content).toHaveAttribute('contenteditable', 'false')
    await expect(editor.title).toBeDisabled()
    await viewer.context.close()
  })

  test('editor can change and save a shared document', async ({ page, browser, baseURL }) => {
    const doc = await createDoc(page.request, { title: 'Team notes' })
    const collaborator = await newUserSession(browser, baseURL!, 'Collaborator')
    await shareDoc(page.request, doc.id, collaborator.user.email, 'editor')

    const theirEditor = new EditorPage(collaborator.page)
    await theirEditor.goto(doc.id)
    await theirEditor.type('Added by the collaborator')
    await theirEditor.save()
    await collaborator.context.close()

    const ownerEditor = new EditorPage(page)
    await ownerEditor.goto(doc.id)
    await expect(ownerEditor.content).toContainText('Added by the collaborator')
  })

  test('a user without access sees "Document not found"', async ({ page, browser, baseURL }) => {
    const doc = await createDoc(page.request, { title: 'Private' })
    const stranger = await newUserSession(browser, baseURL!, 'Stranger')
    await stranger.page.goto(`/doc/${doc.id}`)
    await expect(stranger.page.getByText('Document not found')).toBeVisible()
    await stranger.context.close()
  })

  test('removing access takes the document away', async ({ page, browser, baseURL, editor }) => {
    const doc = await createDoc(page.request, { title: 'Revoked' })
    const guest = await newUserSession(browser, baseURL!, 'Former')
    await shareDoc(page.request, doc.id, guest.user.email, 'editor')

    await editor.goto(doc.id)
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /Share/ })
    await dialog.locator('li', { hasText: guest.user.email }).getByRole('button', { name: 'Remove' }).click()
    await expect(dialog.getByText(guest.user.email)).toHaveCount(0)

    await guest.page.goto(`/doc/${doc.id}`)
    await expect(guest.page.getByText('Document not found')).toBeVisible()
    await guest.context.close()
  })
})
