// @vitest-environment node
// Live tables must never carry analysis: the online code may not import the
// trainer's model, range, grading or bot modules, nor the lab.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const FORBIDDEN = [
  /lib\/atlas/,
  /lib\/range/,
  /lib\/grading/,
  /lib\/model/,
  /lib\/scripted/,
  /state\/trainer/,
  /state\/spots/,
  /components\/lab\//,
  /LabSheet/,
  /equity\.worker/,
]

const dir = new URL('./', import.meta.url)

describe('src/net imports', () => {
  it('stay away from analysis modules', () => {
    const files = readdirSync(dir).filter(
      (f) =>
        /\.tsx?$/.test(f) &&
        !f.endsWith('.test.ts') &&
        !f.endsWith('.test.tsx'),
    )
    expect(files.length).toBeGreaterThan(3)
    for (const file of files) {
      const source = readFileSync(new URL(file, dir), 'utf8')
      const imports = [
        ...source.matchAll(/from '([^']+)'|import\('([^']+)'\)/g),
      ].map((m) => m[1] ?? m[2])
      for (const path of imports)
        for (const rule of FORBIDDEN)
          expect(rule.test(path), `${file} imports ${path}`).toBe(false)
    }
  })
})
