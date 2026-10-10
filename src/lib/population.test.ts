// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { opponentFacingRaise } from './grading'
import { raiseAnalysis } from './model'
import { act, newHand } from './poker'
import { populationPolicy, PREFLOP } from './population'
import {
  analyzeSpot,
  COMBOS,
  COMBO_A,
  COMBO_B,
  gridCell,
  preflopPercentiles,
} from './range'
import { lcg } from './sim'

const RANKS = 'AKQJT98765432'
/** The grid cell of a starting hand written like "AA", "AKs", "72o". */
const cell = (hand: string) => {
  const hi = RANKS.indexOf(hand[0])
  const lo = RANKS.indexOf(hand[1])
  if (hi === lo) return hi * 13 + hi
  return hand[2] === 's' ? hi * 13 + lo : lo * 13 + hi
}

const share = (mix: (p: number) => number) => {
  const ranks = preflopPercentiles()
  let total = 0
  for (let k = 0; k < COMBOS; k++)
    total += mix(ranks[gridCell(COMBO_A[k], COMBO_B[k])])
  return total / COMBOS
}

describe('the population model', () => {
  it('orders starting hands by strength, weighted by combos', () => {
    const ranks = preflopPercentiles()
    expect(ranks[cell('AA')]).toBeGreaterThan(0.99)
    expect(ranks[cell('72o')]).toBeLessThan(0.02)
    expect(ranks[cell('AKs')]).toBeGreaterThan(ranks[cell('AKo')])
    expect(ranks[cell('KQs')]).toBeGreaterThan(ranks[cell('T9s')])
    for (const r of ranks) {
      expect(r).toBeGreaterThan(0)
      expect(r).toBeLessThan(1)
    }
  })

  it('the SB opening range is wider than the BB 3-bet range and every range weight is in [0,1]', () => {
    const open = { toCall: 10, pot: 30, canRaise: true }
    const vsOpen = { toCall: 40, pot: 80, canRaise: true }
    const sb = { preflop: true, bigBlind: false, raises: 0 }
    const bb = { preflop: true, bigBlind: true, raises: 1 }
    const opens = share((p) => populationPolicy(0, p, open, sb).raise)
    const plays = share((p) => 1 - populationPolicy(0, p, open, sb).fold)
    const threeBets = share((p) => populationPolicy(0, p, vsOpen, bb).raise)
    const defends = share((p) => 1 - populationPolicy(0, p, vsOpen, bb).fold)
    // The shares the constants say, within the smoothing.
    expect(opens).toBeCloseTo(PREFLOP.openRaise, 1)
    expect(plays).toBeCloseTo(PREFLOP.openRaise + PREFLOP.openLimp, 1)
    expect(threeBets).toBeCloseTo(PREFLOP.threeBet, 1)
    expect(defends).toBeCloseTo(PREFLOP.threeBet + PREFLOP.defendCall, 1)
    expect(opens).toBeGreaterThan(threeBets)
    for (const context of [open, vsOpen])
      for (const seat of [sb, bb])
        for (let p = 0; p <= 1; p += 0.01) {
          const mix = populationPolicy(0.5, p, context, seat)
          for (const v of [mix.fold, mix.passive, mix.raise]) {
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThanOrEqual(1)
          }
          expect(mix.fold + mix.passive + mix.raise).toBeCloseTo(1, 9)
        }
  })

  it('never folds a free check, and cannot raise when raising is not allowed', () => {
    const limped = { preflop: true, bigBlind: true, raises: 0 }
    for (let p = 0; p <= 1; p += 0.05) {
      expect(
        populationPolicy(0.4, p, { toCall: 0, pot: 40, canRaise: true }, limped)
          .fold,
      ).toBe(0)
      expect(
        populationPolicy(
          0.4,
          p,
          { toCall: 0, pot: 40, canRaise: false },
          limped,
        ).raise,
      ).toBe(0)
    }
  })

  it("reads the opponent's range from its actions: a raise means stronger hands than a limp", () => {
    const random = lcg(9)
    // The hero is the big blind; the opponent (the button) acts first.
    const base = newHand(1, [2000, 2000], 1, random)
    const raised = act(base, { type: 'raise', to: 60 })
    const limped = act(base, { type: 'call' })
    const strength = (game: typeof base) => {
      const spot = analyzeSpot(
        {
          key: `p${game.history[0].action}`,
          hole: game.cards[0],
          board: [],
          history: game.history,
          style: 'balanced',
          opponent: 'population',
        },
        lcg(1),
      )
      const ranks = preflopPercentiles()
      let mean = 0
      for (let k = 0; k < COMBOS; k++)
        mean += spot.weights[k] * ranks[gridCell(COMBO_A[k], COMBO_B[k])]
      return mean
    }
    expect(strength(raised)).toBeGreaterThan(strength(limped) + 0.1)
  })

  it('prices a big blind defence: an open raise from the button is folded to about 45% of the time', () => {
    const random = lcg(4)
    // The hero has the button and acts first.
    const game = newHand(1, [2000, 2000], 0, random)
    const spot = analyzeSpot(
      {
        key: 'open',
        hole: game.cards[0],
        board: [],
        history: [],
        style: 'balanced',
        opponent: 'population',
      },
      lcg(1),
    )
    const seat = opponentFacingRaise(game)
    expect(seat).toEqual({ preflop: true, bigBlind: true, raises: 1 })
    const { foldProbability } = raiseAnalysis(
      spot,
      'population',
      { pot: 30, heroBet: 10, atlasBet: 20, raiseTo: 60, seat },
      'balanced',
    )
    expect(foldProbability).toBeCloseTo(
      1 - PREFLOP.threeBet - PREFLOP.defendCall,
      1,
    )
  })
})
