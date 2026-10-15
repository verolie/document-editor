import { execSync } from 'node:child_process'
import { testDatabase } from './env'

/** Brings the test database up to the current schema before any test runs. */
export default function globalSetup() {
  const db = testDatabase()
  execSync('npm run db:deploy -w backend', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: db.url, DATABASE_URL_UNPOOLED: db.unpooled },
  })
}
