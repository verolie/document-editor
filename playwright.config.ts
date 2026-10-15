import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { testDatabase } from './e2e/env'

// Separate ports from `npm run dev:*` so a dev server pointed at another database is never reused.
const API_PORT = 5100
const WEB_PORT = 5174
const db = testDatabase()

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: './e2e/playwright-report', open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run dev -w backend',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: db.url,
        DATABASE_URL_UNPOOLED: db.unpooled,
        PASSWORD_AUTH_ENABLED: 'true',
        JWT_SECRET: 'e2e-only-secret',
        // Google sign-in can't be automated; hide it so the password form is the only path.
        GOOGLE_CLIENT_ID: '',
        UPLOADS_DIR: path.join(import.meta.dirname, 'e2e', '.uploads'),
      },
    },
    {
      command: `npm run dev -w frontend -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
})
