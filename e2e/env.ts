import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

const root = path.join(import.meta.dirname, '..')

function readEnvFile(file: string): Record<string, string | undefined> {
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
}

const host = (url: string | undefined) => {
  try {
    return url ? new URL(url).hostname.replace('-pooler', '') : ''
  } catch {
    return ''
  }
}

/**
 * Database URLs for the test run, from e2e/.env or the environment (CI).
 * Refuses to run against the database the app normally uses (backend/.env),
 * because the tests create users and documents.
 */
export function testDatabase() {
  const local = readEnvFile(path.join(root, 'e2e', '.env'))
  const url = process.env.E2E_DATABASE_URL ?? local.E2E_DATABASE_URL
  const unpooled = process.env.E2E_DATABASE_URL_UNPOOLED ?? local.E2E_DATABASE_URL_UNPOOLED ?? url

  if (!url) {
    throw new Error('E2E_DATABASE_URL is not set. Copy e2e/.env.example to e2e/.env and fill it in.')
  }

  const app = readEnvFile(path.join(root, 'backend', '.env'))
  const appHosts = [app.DATABASE_URL, app.DATABASE_URL_UNPOOLED].map(host).filter(Boolean)
  if (appHosts.includes(host(url)) || appHosts.includes(host(unpooled))) {
    throw new Error(
      'E2E_DATABASE_URL points at the same database as backend/.env. Use the Neon "e2e" branch instead.',
    )
  }

  return { url, unpooled: unpooled! }
}
