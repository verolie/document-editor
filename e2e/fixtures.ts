import { randomUUID } from 'node:crypto'
import { test as base, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { DocumentsPage } from './pages/DocumentsPage'
import { EditorPage } from './pages/EditorPage'

export const PASSWORD = 'e2e-password-123'

export interface TestUser {
  id: string
  name: string
  email: string
}

export interface TestDoc {
  id: string
  title: string
  version: number
}

/** A fresh address per call, so tests never share accounts and can run in parallel. */
export function uniqueEmail(prefix = 'user') {
  return `${prefix}-${randomUUID().slice(0, 8)}@e2e.test`
}

/** Signs up through the API. Using a page's request context also signs that page in. */
export async function signUp(request: APIRequestContext, name = 'Test User'): Promise<TestUser> {
  const email = uniqueEmail(name.toLowerCase().replace(/\W+/g, '-'))
  const res = await request.post('/api/auth/signup', { data: { name, email, password: PASSWORD } })
  expect(res.status(), await res.text()).toBe(201)
  return res.json()
}

export async function createDoc(
  request: APIRequestContext,
  data: { title?: string; content?: string } = {},
): Promise<TestDoc> {
  const res = await request.post('/api/documents', { data })
  expect(res.status(), await res.text()).toBe(201)
  return res.json()
}

export async function shareDoc(
  request: APIRequestContext,
  docId: string,
  email: string,
  role: 'viewer' | 'commenter' | 'editor',
) {
  const res = await request.post(`/api/documents/${docId}/shares`, { data: { email, role } })
  expect(res.ok(), await res.text()).toBeTruthy()
}

/** A second signed-in user in their own browser context (separate cookies). */
export async function newUserSession(browser: Browser, baseURL: string, name: string) {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  const user = await signUp(page.request, name)
  return { context, page, user }
}

interface Fixtures {
  /** The signed-in user for `page`. */
  user: TestUser
  documents: DocumentsPage
  editor: EditorPage
}

/** Every test using `test` starts signed in as a fresh user; use `@playwright/test` directly for signed-out tests. */
export const test = base.extend<Fixtures>({
  user: [
    async ({ page }, use) => {
      await use(await signUp(page.request, 'Owner'))
    },
    { auto: true },
  ],
  documents: async ({ page }, use) => {
    await use(new DocumentsPage(page))
  },
  editor: async ({ page }, use) => {
    await use(new EditorPage(page))
  },
})

export { expect, type Page }
