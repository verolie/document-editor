// Fails early with a clear message when a required GitHub secret or variable is missing.
// Usage: node check-config.mjs NAME [NAME...]  (values are passed in as environment variables)
const missing = process.argv.slice(2).filter((name) => !process.env[name])

if (missing.length > 0) {
  for (const name of missing) {
    console.log(`::error title=Missing configuration::${name} is not set. Add it under Settings → Secrets and variables → Actions (see README → Deployment).`)
  }
  process.exit(1)
}
console.log('All required secrets and variables are set.')
