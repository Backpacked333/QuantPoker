import { describe, expect, it } from 'vitest'
import { accuracyFor } from '../lib/grading'
import { act } from '../lib/poker'
import type { Game } from '../lib/poker'
import { actionOf } from './build'
import { CHALLENGE_HANDS, startGame } from './hands'
import { MAX_PATH, modelHistogram, percentileOf, scorePath } from './score'
import type { ActionCode, ChallengeOption, ChallengeTree } from './score'
import { TREES, treeFor } from './trees'

/** Every complete line through a tree. */
function lines(tree: ChallengeTree) {
  const out: ActionCode[][] = []
  const walk = (at: number, line: ActionCode[]) => {
    for (const o of tree.nodes[at].options) {
      const next = [...line, o.code]
      if (o.next === null) out.push(next)
      else walk(o.next, next)
    }
  }
  walk(0, [])
  return out
}

describe('scorePath', () => {
  it.each(TREES.hands.map((t) => [t.id, t] as const))(
    '%s: scores every complete line as the mean accuracy',
    (_, tree) => {
      const all = lines(tree)
      expect(all.length).toBeGreaterThan(1)
      for (const line of all) {
        expect(line.length).toBeLessThanOrEqual(MAX_PATH)
        const score = scorePath(tree, line)!
        expect(score.decisions).toHaveLength(line.length)
        const mean =
          score.decisions.reduce((s, d) => s + d.chosen.accuracy, 0) /
          line.length
        expect(score.accuracy).toBe(Math.round(mean))
        expect(score.accuracy).toBeGreaterThanOrEqual(0)
        expect(score.accuracy).toBeLessThanOrEqual(100)
      }
    },
  )

  it('rejects unknown, empty, partial and over-long lines', () => {
    const tree = treeFor('overpair')!
    const full = lines(tree).find((l) => l.length > 1)!
    expect(scorePath(tree, [])).toBeNull()
    expect(scorePath(tree, ['x'])).toBeNull()
    expect(scorePath(tree, full.slice(0, -1))).toBeNull()
    expect(scorePath(tree, [...full, 'c'])).toBeNull()
    expect(scorePath(tree, Array(MAX_PATH + 1).fill('c'))).toBeNull()
  })

  it('marks exactly one best option at every decision, graded 100', () => {
    for (const tree of TREES.hands)
      for (const node of tree.nodes) {
        const best = node.options.filter((o) => o.best)
        expect(best).toHaveLength(1)
        expect(best[0].accuracy).toBe(100)
      }
  })

  it('replays: every line is legal in the engine and ends the hand', () => {
    for (const spec of CHALLENGE_HANDS) {
      const tree = treeFor(spec.id, spec.ver)!
      for (const line of lines(tree)) {
        let game: Game = startGame(spec)
        let at: number | null = 0
        for (const code of line) {
          const option: ChallengeOption = tree.nodes[at!].options.find(
            (o) => o.code === code,
          )!
          expect(game.pot).toBe(tree.nodes[at!].pot)
          game = act(game, actionOf(game, code))
          for (const step of option.atlas)
            game = act(game, actionOf(game, step.code), step.note)
          at = option.next
        }
        expect(game.result).toBeDefined()
      }
    }
  })

  it('uses the trainer accuracy scale', () => {
    expect(accuracyFor(0, 100)).toBe(100)
    expect(accuracyFor(50, 100)).toBe(0)
  })
})

describe('model percentile', () => {
  it.each(TREES.hands.map((t) => [t.id, t] as const))(
    '%s: the model histogram is a distribution',
    (_, tree) => {
      const h = modelHistogram(tree)
      expect(h).toHaveLength(101)
      expect(h.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
      // A perfect line beats most model players; a zero beats almost none.
      expect(percentileOf(h, 100)!).toBeGreaterThan(80)
      expect(percentileOf(h, 0)!).toBeLessThan(10)
    },
  )

  it('counts ties as half', () => {
    const h = new Array(101).fill(0)
    h[50] = 2
    h[70] = 2
    expect(percentileOf(h, 50)).toBe(25)
    expect(percentileOf(h, 60)).toBe(50)
    expect(percentileOf(h, 70)).toBe(75)
    expect(percentileOf(new Array(101).fill(0), 50)).toBeNull()
  })
})
