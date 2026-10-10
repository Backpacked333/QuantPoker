// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { evaluate } from '../lib/poker'
import { fromId, lcg } from '../lib/sim'
import { act, isOver, startHand } from './hand'
import { allInPoint, equity, luckAdjusted } from './luck'
import { config, deckWith, ids, randomAction, seededDeck } from './testing'
import type { HandState } from './types'

/** Seat 0 is the button (small blind) and acts first preflop. */
function play(
  holes: [string, string],
  board: string,
  moves: [number, object][],
) {
  const cfg = config([2000, 2000], 0)
  let state = startHand(cfg, deckWith(cfg, { 0: holes[0], 1: holes[1] }, board))
  for (const [seat, action] of moves)
    state = act(state, seat, action as Parameters<typeof act>[2])
  expect(isOver(state)).toBe(true)
  return state
}

const won = (s: HandState, seat: number) =>
  s
    .result!.awards.filter((a) => a.seat === seat)
    .reduce((t, a) => t + a.amount, 0)

/** Equity by brute force with the other evaluator (poker.ts), as a check. */
function slowEquity(a: number[], b: number[], board: number[]) {
  const dead = new Set([...a, ...b, ...board])
  const live = Array.from({ length: 52 }, (_, i) => i).filter(
    (c) => !dead.has(c),
  )
  let share = 0
  let n = 0
  const need = 5 - board.length
  const walk = (start: number, picked: number[]) => {
    if (picked.length === need) {
      const full = [...board, ...picked]
      const sa = evaluate([...a, ...full].map(fromId)).score
      const sb = evaluate([...b, ...full].map(fromId)).score
      share += sa > sb ? 1 : sa === sb ? 0.5 : 0
      n++
      return
    }
    for (let i = start; i < live.length; i++) walk(i + 1, [...picked, live[i]])
  }
  walk(0, [])
  return share / n
}

describe('luck adjustment (rated heads-up, Q1 = B)', () => {
  it('a preflop all-in where the loser was 82% ahead credits 0.82 of the pot', () => {
    // Aces against kings all in before the flop; a king on the flop.
    const s = play(['Ah Ad', 'Ks Kc'], 'Kd 7c 2h 9s 4d', [
      [0, { type: 'raise', to: 2000 }],
      [1, { type: 'call' }],
    ])
    expect(s.result!.netBySeat).toEqual({ 0: -2000, 1: 2000 })
    const adj = luckAdjusted(s)
    expect(adj.allInAt).toBe(0)
    const eqAces = adj.equity![0]
    expect(eqAces).toBeGreaterThan(0.81)
    expect(eqAces).toBeLessThan(0.83)
    expect(adj.netBySeat[0]).toBeCloseTo(eqAces * 4000 - 2000, 9)
    expect(adj.netBySeat[1]).toBeCloseTo((1 - eqAces) * 4000 - 2000, 9)
  })

  it('exact preflop equity matches the published AKs vs QQ figure', () => {
    // 46.2% for the suited ace-king, as every equity calculator prints.
    expect(equity(ids('As Ks'), ids('Qh Qd'), [])).toBeCloseTo(0.4621, 4)
  })

  it('a flop all-in matches an independent count over all 990 run-outs', () => {
    const s = play(['Jh Td', '8c 8d'], 'Qh 9s 2c 3d 4h', [
      [0, { type: 'call' }],
      [1, { type: 'check' }],
      [1, { type: 'raise', to: 1980 }],
      [0, { type: 'call' }],
    ])
    const adj = luckAdjusted(s)
    expect(adj.allInAt).toBe(3)
    const expected = slowEquity(ids('Jh Td'), ids('8c 8d'), ids('Qh 9s 2c'))
    expect(adj.equity![0]).toBeCloseTo(expected, 12)
    const pot = won(s, 0) + won(s, 1)
    expect(adj.netBySeat[0]).toBeCloseTo(
      s.result!.netBySeat[0] - won(s, 0) + expected * pot,
      9,
    )
  })

  it('hands that reach showdown without an all-in are unchanged', () => {
    const s = play(['Ah Kd', '7c 7d'], 'Qh 9s 2c 3d 4h', [
      [0, { type: 'call' }],
      [1, { type: 'check' }],
      [1, { type: 'check' }],
      [0, { type: 'check' }],
      [1, { type: 'check' }],
      [0, { type: 'check' }],
      [1, { type: 'check' }],
      [0, { type: 'check' }],
    ])
    expect(s.result!.showdown).toBe(true)
    expect(luckAdjusted(s)).toEqual({
      netBySeat: s.result!.netBySeat,
      allInAt: null,
      equity: null,
    })
  })

  it('a river all-in and a fold are unchanged: no cards were left to come', () => {
    const river = play(['Ah Kd', '7c 7d'], 'Qh 9s 2c 3d 4h', [
      [0, { type: 'call' }],
      [1, { type: 'check' }],
      [1, { type: 'check' }],
      [0, { type: 'check' }],
      [1, { type: 'check' }],
      [0, { type: 'check' }],
      [1, { type: 'raise', to: 1980 }],
      [0, { type: 'call' }],
    ])
    expect(allInPoint(river)).toBeNull()
    expect(luckAdjusted(river).netBySeat).toEqual(river.result!.netBySeat)
    const fold = play(['Ah Kd', '7c 7d'], 'Qh 9s 2c 3d 4h', [
      [0, { type: 'fold' }],
    ])
    expect(luckAdjusted(fold).netBySeat).toEqual(fold.result!.netBySeat)
  })

  it('the adjustment is zero-sum between the two seats', () => {
    const random = lcg(42)
    let checked = 0
    for (let i = 0; checked < 60 && i < 5000; i++) {
      const cfg = config(
        [1 + Math.floor(random() * 3000), 1 + Math.floor(random() * 3000)],
        i % 2,
      )
      let s = startHand(cfg, seededDeck(i + 1))
      while (!isOver(s)) s = act(s, s.toAct!, randomAction(s, random))
      // Preflop all-ins enumerate 1.7M boards; the walk takes the cheap ones.
      if (allInPoint(s) === 0) continue
      const adj = luckAdjusted(s)
      expect(adj.netBySeat[0] + adj.netBySeat[1]).toBeCloseTo(0, 9)
      if (adj.allInAt !== null) checked++
    }
    expect(checked).toBe(60)
  })

  it('a preflop all-in fits in the gap between hands', () => {
    // Measured ≈ 0.48 s of CPU in Node; the table waits 3 s before the next
    // hand (NEXT_HAND_MS), so the budget leaves 4× headroom.
    const before = process.cpuUsage()
    equity(ids('As Ks'), ids('Qh Qd'), [])
    const used = process.cpuUsage(before)
    expect((used.user + used.system) / 1000).toBeLessThan(2000)
  })
})
