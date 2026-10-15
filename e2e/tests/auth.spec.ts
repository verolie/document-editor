import { test as base } from '@playwright/test'
import { expect, PASSWORD, signUp, test, uniqueEmail } from '../fixtures'

base.describe('signed out', () => {
  base('any page redirects to the sign-in page', async ({ page }) => {
    await page.goto('/doc/some-id')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in to Docs' })).toBeVisible()
  })

  base('creates an account and lands on the documents page', async ({ page }) => {
    const email = uniqueEmail('signup')
    await page.goto('/login')
    await page.getByRole('button', { name: 'Create an account' }).click()
    await page.getByLabel('Name').fill('Ada Lovelace')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('status').filter({ hasText: 'Welcome, Ada Lovelace!' })).toBeVisible()
    await expect(page.getByText('No documents yet.')).toBeVisible()
  })

  base('signs in with an existing account', async ({ page, browser, baseURL }) => {
    const other = await browser.newContext({ baseURL })
    const user = await signUp(other.request, 'Returning')
    await other.close()

    await page.goto('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible()
    await expect(page.getByText('Returning', { exact: true })).toBeVisible()
  })

  base('shows an error for a wrong password', async ({ page, browser, baseURL }) => {
    const other = await browser.newContext({ baseURL })
    const user = await signUp(other.request, 'Wrong')
    await other.close()

    await page.goto('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password')
    await expect(page).toHaveURL(/\/login$/)
  })

  base('rejects signing up twice with the same email', async ({ page, browser, baseURL }) => {
    const other = await browser.newContext({ baseURL })
    const user = await signUp(other.request, 'Taken')
    await other.close()

    await page.goto('/login')
    await page.getByRole('button', { name: 'Create an account' }).click()
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText('already exists')
  })
})

test('signs out and returns to the sign-in page', async ({ page, user, documents }) => {
  await documents.goto()
  await expect(page.getByText(user.name, { exact: true })).toBeVisible()
  await documents.signOut.click()
  await expect(page).toHaveURL(/\/login$/)

  // The session cookie is gone, so protected pages redirect again.
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})
