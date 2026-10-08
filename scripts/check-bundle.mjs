// Fails the build when the entry chunk outgrows its gzip budget. Heavy
// features (3D, curriculum, motion features) must stay in lazy chunks.
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 150
const dir = new URL('../dist/assets/', import.meta.url)
const entry = readdirSync(dir).find((f) => /^index-.*\.js$/.test(f))
if (!entry) throw new Error('No entry chunk found; run vite build first.')
const source = readFileSync(new URL(entry, dir))
const kb = gzipSync(source).length / 1000
const line = `${entry}: ${kb.toFixed(1)} kB gzip (budget ${BUDGET_KB} kB)`
if (kb > BUDGET_KB) {
  console.error(`Bundle budget exceeded. ${line}`)
  process.exit(1)
}
// Online play (accounts, sockets) must load only with the #lobby chunk.
const leaked = source.toString('utf8').match(/supabase|gotrue|auth\/v1\//i)
if (leaked) {
  console.error(`Online code reached the entry chunk ("${leaked[0]}"). ${line}`)
  process.exit(1)
}
console.log(line)
