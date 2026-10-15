// Reads `vercel deploy` stdout and prints the deployment URL.
// The CLI prints either the bare URL or, in some non-interactive modes, a JSON result.
let input = ''
for await (const chunk of process.stdin) input += chunk
input = input.trim()

let url = ''
const json = input.indexOf('{')
if (json !== -1) {
  try {
    url = JSON.parse(input.slice(json)).deployment?.url ?? ''
  } catch {
    // Not JSON after all; fall through to the plain-text form.
  }
}
url ||= input.match(/https:\/\/\S+/)?.[0] ?? ''

if (!url) {
  console.error(`Could not find the deployment URL in:\n${input}`)
  process.exit(1)
}
console.log(url)
