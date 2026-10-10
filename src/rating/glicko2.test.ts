// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DEFAULT,
  explainPeriod,
  idle,
  idlePeriods,
  IDLE_PERIOD_MS,
  MAX_RD,
  rateMatch,
  ratePeriod,
  VERSION,
  type Rating,
  type Score,
} from './glicko2'

// Glickman, "Example of the Glicko-2 system" (2013): a 1500/200 player with
// volatility 0.06 beats a 1400/30 player and loses to 1550/100 and 1700/300
// in one rating period, with tau = 0.5.
const PLAYER: Rating = { rating: 1500, rd: 200, sigma: 0.06 }
const GAMES = [
  { opponent: { rating: 1400, rd: 30, sigma: 0.06 }, score: 1 as Score },
  { opponent: { rating: 1550, rd: 100, sigma: 0.06 }, score: 0 as Score },
  { opponent: { rating: 1700, rd: 300, sigma: 0.06 }, score: 0 as Score },
]

/** A small seeded generator, so the property runs are repeatable. */
function seeded(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

describe('Glicko-2', () => {
  it('reproduces Glickman’s worked example to the printed digits', () => {
    const d = explainPeriod(PLAYER, GAMES)
    // Unrounded arithmetic, as other implementations of the same algorithm
    // compute it.
    expect(d.rating).toBeCloseTo(1464.0506705, 6)
    expect(d.rd).toBeCloseTo(151.5165241, 6)
    expect(d.sigma).toBeCloseTo(0.0599959843, 9)
    // The values the paper prints. It rounds g and E to 4 decimals before
    // summing, so its v (1.7785) and Δ (−0.4834) sit about 5e-4 from the
    // unrounded ones, and its 1464.06 is 173.7178 × (−0.2069) + 1500 from
    // the rounded μ′.
    expect(d.mu).toBeCloseTo(-0.2069, 4)
    expect(d.phi).toBeCloseTo(0.8722, 4)
    expect(d.rd).toBeCloseTo(151.52, 2)
    expect(Math.abs(d.rating - 1464.06)).toBeLessThan(0.01)
    expect(Math.abs(d.sigma - 0.05999)).toBeLessThan(1e-5)
    expect(Math.abs(d.v - 1.7785)).toBeLessThan(1e-3)
    expect(Math.abs(d.delta - -0.4834)).toBeLessThan(1e-3)
    expect(ratePeriod(PLAYER, GAMES)).toEqual({
      rating: d.rating,
      rd: d.rd,
      sigma: d.sigma,
    })
    expect(VERSION).toBe('glicko2.v1')
  })

  it('a draw between equals leaves the rating and shrinks RD', () => {
    const [a, b] = rateMatch(DEFAULT, DEFAULT, 0.5)
    expect(a.rating).toBeCloseTo(1500, 9)
    expect(b.rating).toBeCloseTo(1500, 9)
    expect(a.rd).toBeLessThan(DEFAULT.rd)
    expect(a).toEqual(b)
  })

  it('has no floor: a weak, uncertain player who loses can go below zero', () => {
    // Glicko-2 is unbounded; storage must accept it (phase1.sql ratings).
    const weak: Rating = { rating: 100, rd: 350, sigma: 0.06 }
    const [loser] = rateMatch(weak, weak, 0)
    expect(loser.rating).toBeLessThan(0)
    expect(Number.isFinite(loser.rating)).toBe(true)
  })

  it('rates a match from both players’ ratings before it', () => {
    const a: Rating = { rating: 1600, rd: 80, sigma: 0.06 }
    const b: Rating = { rating: 1450, rd: 120, sigma: 0.06 }
    const [a2, b2] = rateMatch(a, b, 0)
    expect(a2).toEqual(ratePeriod(a, [{ opponent: b, score: 0 }]))
    expect(b2).toEqual(ratePeriod(b, [{ opponent: a, score: 1 }]))
  })

  it('grows RD by one period per 30 idle days, never past the default', () => {
    expect(idlePeriods(null, 0)).toBe(0)
    expect(idlePeriods(0, IDLE_PERIOD_MS - 1)).toBe(0)
    expect(idlePeriods(0, IDLE_PERIOD_MS)).toBe(1)
    expect(idlePeriods(0, 3 * IDLE_PERIOD_MS + 5)).toBe(3)
    const p: Rating = { rating: 1700, rd: 60, sigma: 0.06 }
    expect(idle(p, 0)).toEqual(p)
    const once = idle(p, 1)
    expect(once.rating).toBe(1700)
    expect(once.rd).toBeCloseTo(
      Math.sqrt((60 / 173.7178) ** 2 + 0.06 ** 2) * 173.7178,
      9,
    )
    expect(idle(p, 2).rd).toBeGreaterThan(once.rd)
    expect(idle(p, 10_000).rd).toBe(MAX_RD)
  })

  it('properties over 10k random sequences', () => {
    const rand = seeded(20261009)
    const pick = (): Rating => ({
      rating: 1000 + rand() * 1000,
      rd: 30 + rand() * 320,
      sigma: 0.04 + rand() * 0.04,
    })
    for (let run = 0; run < 10_000; run++) {
      let p = pick()
      for (let step = 0; step < 5; step++) {
        const opp = pick()
        const score = ([0, 0.5, 1] as Score[])[Math.floor(rand() * 3)]
        const next = ratePeriod(p, [{ opponent: opp, score }])
        // A win never lowers the rating; a loss never raises it.
        if (score === 1) expect(next.rating).toBeGreaterThanOrEqual(p.rating)
        if (score === 0) expect(next.rating).toBeLessThanOrEqual(p.rating)
        // Playing a period always ends with a lower RD than sitting it out.
        // (Against a much less certain opponent RD can still rise slightly
        // from its start: the period's volatility is added first.)
        expect(next.rd).toBeLessThan(idle(p, 1).rd)
        expect(next.rd).toBeLessThanOrEqual(MAX_RD)
        expect(Number.isFinite(next.rating) && next.sigma > 0).toBe(true)
        p = next
      }
      // An upset moves more than an expected result: beating a stronger
      // opponent gains more than beating a weaker one with the same RD.
      const rd = 30 + rand() * 300
      const gap = 50 + rand() * 400
      const strong = { rating: p.rating + gap, rd, sigma: 0.06 }
      const weak = { rating: p.rating - gap, rd, sigma: 0.06 }
      const up = ratePeriod(p, [{ opponent: strong, score: 1 }]).rating
      const expected = ratePeriod(p, [{ opponent: weak, score: 1 }]).rating
      expect(up - p.rating).toBeGreaterThan(expected - p.rating)
    }
    // RD shrinks with play: from the default, a run of matches against
    // settled opponents brings it well under the provisional line (100).
    let q = DEFAULT
    for (let i = 0; i < 20; i++)
      q = ratePeriod(q, [
        { opponent: { rating: 1500, rd: 60, sigma: 0.06 }, score: 0.5 },
      ])
    expect(q.rd).toBeLessThan(100)
  })
})
