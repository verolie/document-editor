// Builds the direct and pooled Postgres URLs for a Neon branch and writes them as step outputs.
// Done here (rather than using the Neon action's db_url) so database names with spaces are encoded.
import { appendFileSync } from 'node:fs'

const { HOST, HOST_POOLED, PASSWORD, ROLE, DATABASE, GITHUB_OUTPUT } = process.env
const e = encodeURIComponent
const url = (host, sslmode) =>
  `postgresql://${e(ROLE)}:${e(PASSWORD)}@${host}/${e(DATABASE)}?sslmode=${sslmode}`

const urls = {
  // Prisma migrations
  direct: url(HOST, 'require'),
  // The running app (node-postgres)
  pooled: url(HOST_POOLED, 'verify-full'),
}

for (const [name, value] of Object.entries(urls)) {
  console.log(`::add-mask::${value}`)
  appendFileSync(GITHUB_OUTPUT, `${name}=${value}\n`)
}
