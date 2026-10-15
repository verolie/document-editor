import { test as base } from '@playwright/test'
import { createDoc, expect, newUserSession, shareDoc, test } from '../fixtures'

base.describe('API without a session', () => {
  base('health check responds', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
  })

  base('protected endpoints return 401', async ({ request }) => {
    for (const path of ['/api/auth/me', '/api/documents']) {
      expect((await request.get(path)).status(), path).toBe(401)
    }
  })

  base('signup validates input', async ({ request }) => {
    const badEmail = await request.post('/api/auth/signup', { data: { email: 'nope', password: 'longenough' } })
    expect(badEmail.status()).toBe(400)
    const shortPassword = await request.post('/api/auth/signup', { data: { email: 'a@b.co', password: 'short' } })
    expect(shortPassword.status()).toBe(400)
  })
})

test.describe('document permissions', () => {
  test('owner can read, update and delete', async ({ page }) => {
    const doc = await createDoc(page.request, { title: 'API doc' })
    const updated = await page.request.patch(`/api/documents/${doc.id}`, {
      data: { content: '<p>new</p>', baseVersion: doc.version },
    })
    expect(updated.ok()).toBeTruthy()
    expect((await updated.json()).version).toBe(doc.version + 1)

    expect((await page.request.delete(`/api/documents/${doc.id}`)).status()).toBe(204)
    expect((await page.request.get(`/api/documents/${doc.id}`)).status()).toBe(404)
  })

  test('saving with a stale baseVersion returns 409', async ({ page }) => {
    const doc = await createDoc(page.request)
    const first = await page.request.patch(`/api/documents/${doc.id}`, { data: { content: '<p>a</p>', baseVersion: doc.version } })
    expect(first.ok()).toBeTruthy()
    const stale = await page.request.patch(`/api/documents/${doc.id}`, { data: { content: '<p>b</p>', baseVersion: doc.version } })
    expect(stale.status()).toBe(409)
  })

  test('outsiders get 404, viewers get 403 on writes', async ({ page, browser, baseURL }) => {
    const doc = await createDoc(page.request)
    const other = await newUserSession(browser, baseURL!, 'Outsider')

    expect((await other.page.request.get(`/api/documents/${doc.id}`)).status()).toBe(404)

    await shareDoc(page.request, doc.id, other.user.email, 'viewer')
    const read = await other.page.request.get(`/api/documents/${doc.id}`)
    expect(read.ok()).toBeTruthy()
    expect((await read.json()).permissions).toMatchObject({ edit: false, comment: false, share: false })

    const write = await other.page.request.patch(`/api/documents/${doc.id}`, { data: { content: '<p>x</p>', baseVersion: doc.version } })
    expect(write.status()).toBe(403)
    expect((await other.page.request.delete(`/api/documents/${doc.id}`)).status()).toBe(403)
    await other.context.close()
  })

  test('only the owner can delete, even an editor cannot', async ({ page, browser, baseURL }) => {
    const doc = await createDoc(page.request)
    const editor = await newUserSession(browser, baseURL!, 'Editor')
    await shareDoc(page.request, doc.id, editor.user.email, 'editor')
    expect((await editor.page.request.delete(`/api/documents/${doc.id}`)).status()).toBe(403)
    await editor.context.close()
  })
})
