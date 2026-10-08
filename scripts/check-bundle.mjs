// Fails the build when the entry chunk outgrows its gzip budget. Heavy
// features (3D, curriculum, motion features) must stay in lazy chunks.
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 150
const dir = new URL('../dist/assets/', import.meta.url)
const entry = readdirSync(dir).find((f) => /^index-.*\.js$/.test(f))
if (!entry) throw new Error('No entry chunk found; run vite build first.')
const kb = gzipSync(readFileSync(new URL(entry, dir))).length / 1000
const line = `${entry}: ${kb.toFixed(1)} kB gzip (budget ${BUDGET_KB} kB)`
if (kb > BUDGET_KB) {
  console.error(`Bundle budget exceeded. ${line}`)
  process.exit(1)
}
console.log(line)
