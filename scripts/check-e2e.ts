// CI step after `npm run e2e`: fails unless the live two-browser tests ran
// and passed. Usage: node scripts/check-e2e.ts playwright-report/results.json
import { readFileSync } from 'node:fs'
import { liveProblems, tally } from './e2e-report.ts'

const file = process.argv[2] ?? 'playwright-report/results.json'
const counts = tally(JSON.parse(readFileSync(file, 'utf8')))
for (const [project, c] of Object.entries(counts))
  console.log(
    `${project}: ${c.expected} passed, ${c.flaky} flaky, ${c.unexpected} failed, ${c.skipped} skipped`,
  )
const problems = liveProblems(counts)
for (const problem of problems) console.error(`::error::${problem}`)
process.exit(problems.length ? 1 : 0)
