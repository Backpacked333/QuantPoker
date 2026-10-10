// @vitest-environment node
// The grading CPU budget (ADR §Post-hand grading placement, verified
// assumption 5). Phase 1 grades every decision of a finished hand in the
// queue consumer, one hand per invocation, so one decision's analysis must
// stay well inside a Worker's CPU limit. This measures CPU time
// (process.cpuUsage: user + system), not wall time: wall time on a shared CI
// runner is noise, and deployed Workers freeze performance.now() between
// I/O, so the budget can only be pinned here, in Node, on the same code.
//
// "Cold" means a board the analysis caches have never seen: each spot below
// has its own board, as each decision of a new hand would.
import { describe, expect, it } from 'vitest'
import { gradeVsPopulation } from '../lib/grader'
import { act, legalActions, newHand } from '../lib/poker'
import type { Action, Game, Player } from '../lib/poker'
import { analyzeSpot, preflopRangeAfter } from '../lib/range'
import { lcg } from '../lib/sim'
import type { SpotRequest } from '../lib/range'
import { spotKey } from '../state/spots'

/** CPU for one decision's full analysis. */
const DECISION_BUDGET_MS = 500
/** CPU for the pre-flop table every isolate builds once. */
const PREFLOP_TABLE_BUDGET_MS = 1000
const SPOTS_PER_STREET = 12

function cpuMs(work: () => void) {
  const start = process.cpuUsage()
  work()
  const used = process.cpuUsage(start)
  return (used.user + used.system) / 1000
}

/** Mostly checks and calls, so hands reach the river; some raises. */
function walk(game: Game, random: () => number): Action {
  const legal = legalActions(game)
  if (random() < 0.15 && legal.canRaise)
    return { type: 'raise', to: legal.minRaiseTo }
  return legal.canCheck ? { type: 'check' } : { type: 'call' }
}

/** The hero's first decision on `street`, from distinct random hands. */
function decisions(street: Game['street'], seed: number): Game[] {
  const random = lcg(seed)
  const found: Game[] = []
  const boards = new Set<string>()
  for (let h = 1; found.length < SPOTS_PER_STREET && h < 2000; h++) {
    let game = newHand(h, [2000, 2000], (h % 2) as Player, random)
    while (!game.result) {
      if (game.street === street && game.turn === 0) {
        // Pre-flop every board is empty: distinct hole cards instead.
        const seen = JSON.stringify(
          street === 'preflop' ? game.cards[0] : game.board,
        )
        if (!boards.has(seen)) {
          boards.add(seen)
          found.push(game)
        }
        break
      }
      game = act(game, walk(game, random))
    }
  }
  return found
}

const spots = (street: Game['street'], seed: number): SpotRequest[] =>
  decisions(street, seed).map((game) => ({
    key: spotKey(game, 'balanced'),
    hole: game.cards[0],
    board: game.board,
    history: game.history,
    style: 'balanced',
  }))

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]

describe('grading CPU budget', () => {
  // First, while the module is cold: every isolate pays this once.
  it(`builds the one-time pre-flop table in under ${PREFLOP_TABLE_BUDGET_MS} ms CPU`, () => {
    const ms = cpuMs(() => preflopRangeAfter('any', 'balanced'))
    console.log(`bench preflop table: ${ms.toFixed(0)} ms CPU`)
    expect(ms).toBeLessThan(PREFLOP_TABLE_BUDGET_MS)
  })

  for (const [street, seed] of [
    ['flop', 101],
    ['turn', 202],
    ['river', 303],
  ] as const)
    it(`analyses each cold ${street} decision in under ${DECISION_BUDGET_MS} ms CPU`, () => {
      const requests = spots(street, seed)
      expect(requests).toHaveLength(SPOTS_PER_STREET)
      const costs = requests.map((request, i) =>
        cpuMs(() => analyzeSpot(request, lcg(seed + i))),
      )
      console.log(
        `bench ${street}: median ${median(costs).toFixed(0)} ms, max ${Math.max(...costs).toFixed(0)} ms CPU over ${costs.length} cold boards`,
      )
      for (const ms of costs) expect(ms).toBeLessThan(DECISION_BUDGET_MS)
    })

  // What the grading consumer does per decision (P1-09): the population
  // model's analysis plus the grade over every raise size, on boards these
  // caches have not seen.
  for (const [street, seed] of [
    ['preflop', 404],
    ['flop', 505],
    ['turn', 606],
    ['river', 707],
  ] as const)
    it(`grades each cold ${street} decision against the population model in under ${DECISION_BUDGET_MS} ms CPU`, () => {
      const games = decisions(street, seed)
      expect(games.length).toBeGreaterThan(0)
      const costs = games.map((game) =>
        cpuMs(() => {
          const legal = legalActions(game)
          gradeVsPopulation(
            game,
            legal.canRaise
              ? { type: 'raise', to: legal.maxRaiseTo }
              : { type: legal.canCheck ? 'check' : 'call' },
          )
        }),
      )
      console.log(
        `bench grade ${street}: median ${median(costs).toFixed(0)} ms, max ${Math.max(...costs).toFixed(0)} ms CPU over ${costs.length} cold decisions`,
      )
      for (const ms of costs) expect(ms).toBeLessThan(DECISION_BUDGET_MS)
    })
})
