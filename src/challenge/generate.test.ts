// @vitest-environment node
// Rebuilds the challenge trees and fails on any difference from the
// committed file, so a grader change can never leave the landing page's
// grades stale. To regenerate: CHALLENGE_WRITE=1 npx vitest run
// src/challenge/generate.test.ts
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildTrees } from './build'
import { CHALLENGE_HANDS } from './hands'
import { CHALLENGE_GRADER } from './trees'
import committed from './trees.generated.json'

const FILE = new URL('./trees.generated.json', import.meta.url)

describe('challenge trees', () => {
  it('match the trainer grader exactly', () => {
    const built = buildTrees(CHALLENGE_GRADER)
    if (process.env.CHALLENGE_WRITE)
      writeFileSync(FILE, `${JSON.stringify(built)}\n`)
    else expect(built).toEqual(committed)
  }, 600_000)

  it('cover every curated hand', () => {
    expect(committed.hands.map((h) => [h.id, h.ver])).toEqual(
      CHALLENGE_HANDS.map((h) => [h.id, h.ver]),
    )
  })
})
