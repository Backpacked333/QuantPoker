// @vitest-environment node
// Grading must be repeatable (P1-08/P1-09): the queue consumer can grade a
// hand in any isolate, after any other hand, and a redelivery must write the
// same numbers. So a spot's analysis may depend only on the spot, never on
// what the module's caches happened to compute before it.
import { describe, expect, it, vi } from 'vitest'
import type { Card } from './poker'
import type { FullSpot, SpotRequest } from './range'

const card = (text: string): Card => ({
  rank: '23456789TJQKA'.indexOf(text[0]) + 2,
  suit: text[1] as Card['suit'],
})
const cards = (text: string) => text.split(' ').map(card)

const spot = (hole: string, board: string): SpotRequest => ({
  key: `${hole}|${board}`,
  hole: cards(hole),
  board: board ? cards(board) : [],
  history: [],
  style: 'balanced',
})

/** A fresh copy of the analysis module, with empty caches. */
async function freshRange() {
  vi.resetModules()
  return import('./range')
}

const tables = (s: FullSpot) => ({
  weights: Array.from(s.weights),
  atlasEquity: Array.from(s.atlasEquity),
  heroWin: Array.from(s.heroWin),
  heroTie: Array.from(s.heroTie),
})

describe('spot analysis', () => {
  it('is bit-identical whatever the module analysed before it', async () => {
    const { lcg } = await import('./sim')
    const target = spot('Ah Kd', '7c 8c 2d')
    const cold = await freshRange()
    const first = tables(cold.analyzeSpot(target, lcg(1)))

    // Another isolate: the same board and the same pre-flop table were
    // built first, from other spots and other random streams.
    const warm = await freshRange()
    warm.analyzeSpot(spot('Qs Qh', ''), lcg(77))
    warm.analyzeSpot(spot('9h 9s', '7c 8c 2d'), lcg(999))
    warm.analyzeSpot(spot('Ah Kd', '7c 8c 2d Ts'), lcg(5))
    const second = tables(warm.analyzeSpot(target, lcg(1)))

    expect(second.atlasEquity).toEqual(first.atlasEquity)
    expect(second.heroWin).toEqual(first.heroWin)
    expect(second.heroTie).toEqual(first.heroTie)
    expect(second.weights).toEqual(first.weights)
  })

  it('pre-flop: the same spot reads the same whatever ran first', async () => {
    const { lcg } = await import('./sim')
    const target = spot('Jc Tc', '')
    const cold = await freshRange()
    const first = tables(cold.analyzeSpot(target, lcg(3)))
    const warm = await freshRange()
    warm.preflopRangeAfter('raise', 'balanced')
    warm.analyzeSpot(spot('Jc Tc', ''), lcg(42))
    const second = tables(warm.analyzeSpot(target, lcg(3)))
    expect(second).toEqual(first)
  })
})
