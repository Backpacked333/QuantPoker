// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { fromId, lcg } from '../lib/sim'
import { reference } from '../test/reference'
import {
  act,
  assertInvariants,
  isOver,
  legalActions,
  potTotal,
  replayHand,
  startHand,
} from './hand'
import { blindSeats, positionNames, seatAfter } from './positions'
import { buildPots, referencePots } from './pots'
import { config, deckWith, randomAction, randomTable } from './testing'
import { EngineError } from './types'
import type { HandState, PlayerAction, SeatId } from './types'

const SOAK = !!process.env.ENGINE_SOAK
const HANDS_PER_N = SOAK ? 100_000 : 10_000
const WALK_TIMEOUT = SOAK ? 3_600_000 : 180_000

const seatOf = (state: HandState, seat: SeatId) =>
  state.players.find((p) => p.seat === seat)!
const stacks = (state: HandState) => state.players.map((p) => p.stack)

/** An action that must be rejected in this state, or null if none applies. */
function illegalAction(
  state: HandState,
  random: () => number,
): { seat: SeatId; action: PlayerAction } | null {
  const legal = legalActions(state)
  const seat = state.toAct!
  const others = state.players.filter((p) => p.seat !== seat)
  const candidates: { seat: SeatId; action: PlayerAction }[] = [
    { seat: others[0].seat, action: { type: 'check' } },
    { seat, action: { type: 'raise', to: legal.maxRaiseTo + 1 } },
    { seat, action: { type: 'raise', to: legal.minRaiseTo + 0.5 } },
  ]
  if (!legal.canCheck) candidates.push({ seat, action: { type: 'check' } })
  if (legal.canCheck) candidates.push({ seat, action: { type: 'call' } })
  if (
    legal.canRaise &&
    legal.minRaiseTo - 1 > Math.max(...state.players.map((p) => p.bet))
  )
    candidates.push({
      seat,
      action: { type: 'raise', to: legal.minRaiseTo - 1 },
    })
  if (!legal.canRaise)
    candidates.push({ seat, action: { type: 'raise', to: legal.minRaiseTo } })
  return candidates[Math.floor(random() * candidates.length)] ?? null
}

function checkShowdown(state: HandState) {
  const result = state.result!
  const live = state.players.filter((p) => !p.folded)
  state.pots.forEach((pot, i) => {
    const winners = result.awards.filter((a) => a.pot === i)
    expect(winners.reduce((s, a) => s + a.amount, 0)).toBe(pot.amount)
    for (const a of winners) expect(pot.eligible).toContain(a.seat)
    if (!result.showdown) return
    const scored = pot.eligible.map((seat) => ({
      seat,
      score: reference(
        [...seatOf(state, seat).cards!, ...state.board].map(fromId),
      ),
    }))
    const best = Math.max(...scored.map((s) => s.score))
    expect(winners.map((a) => a.seat).sort()).toEqual(
      scored
        .filter((s) => s.score === best)
        .map((s) => s.seat)
        .sort(),
    )
    // Odd chips: fewer than the winners, on the earliest winners clockwise
    // from the first seat after the button (the award order).
    const amounts = winners.map((a) => a.amount)
    expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1)
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts)
  })
  expect(live.length).toBeGreaterThan(0)
}

describe('engine invariants over random hands', () => {
  for (const n of [2, 3, 4, 5, 6])
    it(
      `holds for ${HANDS_PER_N.toLocaleString()} hands at ${n} players`,
      () => {
        const random = lcg(1000 + n)
        let showdowns = 0
        let sidePots = 0
        for (let h = 0; h < HANDS_PER_N; h++) {
          const { config: cfg, deck } = randomTable(n, random, h + 1)
          const chips = cfg.seats.reduce((s, p) => s + p.stack, 0)
          let state = startHand(cfg, deck)
          assertInvariants(state, chips)
          const taken: { seat: SeatId; action: PlayerAction }[] = []
          while (!isOver(state)) {
            if (random() < 0.1) {
              const bad = illegalAction(state, random)
              if (bad) {
                const before = JSON.stringify(state)
                expect(() => act(state, bad.seat, bad.action)).toThrow(
                  EngineError,
                )
                expect(JSON.stringify(state)).toBe(before)
              }
            }
            const seat = state.toAct!
            const action = randomAction(state, random)
            state = act(state, seat, action)
            taken.push({ seat, action })
            assertInvariants(state, chips)
            // The chip-by-chip oracle is slow; sample it.
            if (h % 10 === 0 && state.players.every((p) => p.bet === 0))
              expect(state.pots).toEqual(referencePots(state.players))
            if (taken.length >= 200) throw new Error('Hand did not terminate')
          }
          checkShowdown(state)
          if (state.result!.showdown) showdowns++
          if (state.pots.length > 1) sidePots++
          const replayed = replayHand(cfg, deck, taken)
          expect(JSON.stringify(replayed[replayed.length - 1])).toBe(
            JSON.stringify(state),
          )
        }
        // The walk must actually exercise showdowns and side pots.
        expect(showdowns).toBeGreaterThan(HANDS_PER_N / 20)
        if (n > 2) expect(sidePots).toBeGreaterThan(HANDS_PER_N / 100)
      },
      WALK_TIMEOUT,
    )
})

describe('positions', () => {
  it('heads-up: the button posts the small blind and opens pre-flop', () => {
    const state = startHand(
      config([2000, 2000], 1),
      deckWith(config([2000, 2000], 1), {}, ''),
    )
    expect(blindSeats([0, 1], 1)).toEqual({ sb: 1, bb: 0 })
    expect(state.toAct).toBe(1)
    let next = act(state, 1, { type: 'call' })
    expect(next.toAct).toBe(0)
    next = act(next, 0, { type: 'check' })
    expect(next.street).toBe('flop')
    expect(next.toAct).toBe(0)
  })
  it('three or more: blinds follow the button and UTG opens', () => {
    const cfg = {
      ...config([2000, 2000, 2000, 2000]),
      seats: [1, 2, 4, 5].map((seat) => ({ seat, stack: 2000 })),
      button: 5,
    }
    const state = startHand(cfg, deckWith(cfg, {}, ''))
    expect(blindSeats([1, 2, 4, 5], 5)).toEqual({ sb: 1, bb: 2 })
    expect(seatOf(state, 1).bet).toBe(10)
    expect(seatOf(state, 2).bet).toBe(20)
    expect(state.toAct).toBe(4)
    expect(positionNames([1, 2, 4, 5], 5)).toEqual({
      5: 'BTN',
      1: 'SB',
      2: 'BB',
      4: 'UTG',
    })
    expect(seatAfter([1, 2, 4, 5], 5)).toBe(1)
  })
  it('after the flop the first live seat clockwise from the button acts', () => {
    const cfg = config([2000, 2000, 2000], 0)
    let state = startHand(cfg, deckWith(cfg, {}, ''))
    state = act(state, 0, { type: 'call' })
    state = act(state, 1, { type: 'fold' })
    state = act(state, 2, { type: 'check' })
    expect(state.street).toBe('flop')
    expect(state.toAct).toBe(2)
  })
})

describe('crafted cases', () => {
  it('splits a three-way all-in into a main pot and a side pot', () => {
    const cfg = config([100, 300, 1000], 0)
    const deck = deckWith(
      cfg,
      { 0: 'As Ah', 1: 'Ks Kh', 2: 'Qs Qh' },
      '2c 7d 9h Tc 3s',
    )
    let state = startHand(cfg, deck)
    state = act(state, 0, { type: 'raise', to: 100 })
    state = act(state, 1, { type: 'raise', to: 300 })
    state = act(state, 2, { type: 'call' })
    expect(isOver(state)).toBe(true)
    expect(state.pots).toEqual([
      { amount: 300, eligible: [0, 1, 2] },
      { amount: 400, eligible: [1, 2] },
    ])
    expect(state.result!.awards.map((a) => [a.pot, a.seat, a.amount])).toEqual([
      [1, 1, 400],
      [0, 0, 300],
    ])
    expect(stacks(state)).toEqual([300, 400, 700])
    expect(state.result!.netBySeat).toEqual({ 0: 200, 1: 100, 2: -300 })
  })
  it('a short all-in does not reopen the betting for those who acted', () => {
    const cfg = config([2000, 70, 2000], 0)
    let state = startHand(cfg, deckWith(cfg, {}, ''))
    state = act(state, 0, { type: 'raise', to: 60 })
    state = act(state, 1, { type: 'raise', to: 70 })
    expect(legalActions(state).canRaise).toBe(true) // the big blind has not acted
    state = act(state, 2, { type: 'call' })
    const legal = legalActions(state)
    expect(state.toAct).toBe(0)
    expect(legal.toCall).toBe(10)
    expect(legal.canRaise).toBe(false)
    expect(() => act(state, 0, { type: 'raise', to: 200 })).toThrow(EngineError)
  })
  it('a full raise after a short all-in reopens the betting', () => {
    const cfg = config([2000, 70, 2000], 0)
    let state = startHand(cfg, deckWith(cfg, {}, ''))
    state = act(state, 0, { type: 'raise', to: 60 })
    state = act(state, 1, { type: 'raise', to: 70 })
    state = act(state, 2, { type: 'raise', to: 200 })
    expect(state.toAct).toBe(0)
    expect(legalActions(state).canRaise).toBe(true)
    expect(legalActions(state).minRaiseTo).toBe(330)
  })
  it('refunds the uncalled part of a bet when the only caller is short', () => {
    const cfg = config([2000, 300, 2000], 0)
    const deck = deckWith(
      cfg,
      { 0: 'As Ah', 1: 'Ks Kh', 2: '7c 2d' },
      '2c 7d 9h Tc 3s',
    )
    let state = startHand(cfg, deck)
    state = act(state, 0, { type: 'raise', to: 2000 })
    state = act(state, 1, { type: 'call' })
    state = act(state, 2, { type: 'fold' })
    expect(seatOf(state, 0).invested).toBe(300)
    expect(state.pots).toEqual([{ amount: 620, eligible: [0, 1] }])
    expect(stacks(state)).toEqual([2320, 0, 1980])
  })
  it('gives odd chips to the first tied winner clockwise from the button', () => {
    const cfg = config([2000, 2000, 2000], 0, { sb: 5, bb: 10 })
    const deck = deckWith(
      cfg,
      { 0: '2h 3h', 1: '6c 7c', 2: '4d 5d' },
      'As Ks Qs Js Ts',
    )
    let state = startHand(cfg, deck)
    state = act(state, 0, { type: 'call' })
    state = act(state, 1, { type: 'fold' })
    state = act(state, 2, { type: 'check' })
    while (!isOver(state)) state = act(state, state.toAct!, { type: 'check' })
    expect(state.result!.awards.map((a) => [a.seat, a.amount])).toEqual([
      [2, 13],
      [0, 12],
    ])
    expect(stacks(state)).toEqual([2002, 1995, 2003])
  })
  it('posts a blind larger than the stack as an all-in', () => {
    const cfg = config([2000, 15], 0)
    let state = startHand(cfg, deckWith(cfg, {}, ''))
    expect(seatOf(state, 1).allIn).toBe(true)
    const legal = legalActions(state)
    expect(legal.toCall).toBe(5)
    expect(legal.canRaise).toBe(false)
    state = act(state, 0, { type: 'call' })
    expect(isOver(state)).toBe(true)
    expect(state.board).toHaveLength(5)
    expect(stacks(state).reduce((a, b) => a + b)).toBe(2015)
  })
  it('runs out at once when the small blind cannot cover', () => {
    const cfg = config([5, 2000], 0)
    const state = startHand(cfg, deckWith(cfg, {}, ''))
    expect(isOver(state)).toBe(true)
    expect(state.players.map((p) => p.invested)).toEqual([5, 5])
    expect(stacks(state).reduce((a, b) => a + b)).toBe(2005)
  })
  it('splits a six-way pot evenly when everyone plays the board', () => {
    const cfg = config([2000, 2000, 2000, 2000, 2000, 2000], 3)
    const holes = {
      0: '2h 3h',
      1: '2d 3d',
      2: '2c 3c',
      3: '4h 5h',
      4: '4d 5d',
      5: '4c 5c',
    }
    let state = startHand(cfg, deckWith(cfg, holes, 'As Ks Qs Js Ts'))
    while (!isOver(state)) {
      const legal = legalActions(state)
      state = act(
        state,
        state.toAct!,
        legal.canCheck ? { type: 'check' } : { type: 'call' },
      )
    }
    expect(state.result!.showdown).toBe(true)
    expect(Object.values(state.result!.netBySeat)).toEqual([0, 0, 0, 0, 0, 0])
  })
  it('builds three pots from all-ins on a later street', () => {
    // Button 0, blinds 1 and 2, UTG 3. Everyone limps, then the flop gets
    // two all-ins of different sizes, a call, and a fold.
    const cfg = config([1000, 200, 500, 1000], 0)
    const deck = deckWith(
      cfg,
      { 0: 'Js Jh', 1: 'As Ah', 2: 'Ks Kh', 3: '7c 2d' },
      '2c 8d 9h 4c 3s',
    )
    let state = startHand(cfg, deck)
    state = act(state, 3, { type: 'call' })
    state = act(state, 0, { type: 'call' })
    state = act(state, 1, { type: 'call' })
    state = act(state, 2, { type: 'check' })
    expect(state.street).toBe('flop')
    expect(state.toAct).toBe(1)
    state = act(state, 1, { type: 'raise', to: 180 })
    expect(seatOf(state, 1).allIn).toBe(true)
    state = act(state, 2, { type: 'raise', to: 480 })
    state = act(state, 3, { type: 'call' })
    state = act(state, 0, { type: 'fold' })
    // Only seat 3 has chips behind: the board runs out with no more action.
    expect(isOver(state)).toBe(true)
    expect(state.board).toHaveLength(5)
    expect(state.pots).toEqual([
      { amount: 620, eligible: [1, 2, 3] },
      { amount: 600, eligible: [2, 3] },
    ])
    expect(stacks(state)).toEqual([980, 620, 600, 500])
    expect(state.result!.netBySeat).toEqual({ 0: -20, 1: 420, 2: 100, 3: -500 })
    assertInvariants(state, 2700)
  })
  it('three-handed: the button folds first and the blinds play on', () => {
    const cfg = config([2000, 2000, 2000], 0)
    let state = startHand(cfg, deckWith(cfg, {}, ''))
    expect(state.toAct).toBe(0) // the button is first to act three-handed
    state = act(state, 0, { type: 'fold' })
    expect(state.toAct).toBe(1)
    state = act(state, 1, { type: 'call' })
    state = act(state, 2, { type: 'check' })
    expect(state.street).toBe('flop')
    // After the flop the small blind leads; the folded button is skipped.
    expect(state.toAct).toBe(1)
    state = act(state, 1, { type: 'check' })
    expect(state.toAct).toBe(2)
  })
  it('three-handed: the big blind wins the blinds when both others fold', () => {
    const cfg = config([2000, 2000, 2000], 0)
    let state = startHand(cfg, deckWith(cfg, {}, ''))
    state = act(state, 0, { type: 'fold' })
    state = act(state, 1, { type: 'fold' })
    expect(isOver(state)).toBe(true)
    expect(state.result!.showdown).toBe(false)
    expect(state.board).toEqual([])
    expect(state.result!.netBySeat).toEqual({ 0: 0, 1: -10, 2: 10 })
  })
  it('three short stacks all in from the blinds', () => {
    // Both blinds are all in posting; the button can only call or fold.
    const cfg = config([5, 8, 15], 0)
    const deck = deckWith(
      cfg,
      { 0: 'As Ah', 1: 'Ks Kh', 2: 'Qs Qh' },
      '2c 7d 9h Tc 3s',
    )
    let state = startHand(cfg, deck)
    expect(seatOf(state, 1).allIn && seatOf(state, 2).allIn).toBe(true)
    expect(state.toAct).toBe(0)
    expect(legalActions(state).canRaise).toBe(false)
    state = act(state, 0, { type: 'call' })
    expect(isOver(state)).toBe(true)
    // The big blind's 7 nobody could match comes back.
    expect(state.players.map((p) => p.invested)).toEqual([5, 8, 8])
    expect(state.pots).toEqual([
      { amount: 15, eligible: [0, 1, 2] },
      { amount: 6, eligible: [1, 2] },
    ])
    expect(stacks(state)).toEqual([15, 6, 7])
    expect(state.result!.netBySeat).toEqual({ 0: 10, 1: -2, 2: -8 })
  })
  it('gives the big blind the option after limps', () => {
    const cfg = config([2000, 2000, 2000], 0)
    let state = startHand(cfg, deckWith(cfg, {}, ''))
    state = act(state, 0, { type: 'call' })
    state = act(state, 1, { type: 'call' })
    expect(state.toAct).toBe(2)
    expect(legalActions(state)).toMatchObject({
      canCheck: true,
      canRaise: true,
      minRaiseTo: 40,
    })
    state = act(state, 2, { type: 'raise', to: 80 })
    expect(state.toAct).toBe(0)
    expect(legalActions(state).canRaise).toBe(true)
  })
  it('rejects bad configs, decks and out-of-turn actions without mutating', () => {
    expect(() =>
      startHand(config([2000]), deckWith(config([2000, 2000]), {}, '')),
    ).toThrow(EngineError)
    expect(() =>
      startHand(config([0, 2000]), deckWith(config([2000, 2000]), {}, '')),
    ).toThrow(EngineError)
    expect(() =>
      startHand(
        config([2000, 2000], 4),
        deckWith(config([2000, 2000]), {}, ''),
      ),
    ).toThrow(EngineError)
    expect(() => startHand(config([2000, 2000]), [1, 2, 3])).toThrow(
      EngineError,
    )
    const cfg = config([2000, 2000])
    const state = startHand(cfg, deckWith(cfg, {}, ''))
    const before = JSON.stringify(state)
    expect(() => act(state, 1, { type: 'check' })).toThrow(EngineError)
    expect(() => act(state, 0, { type: 'raise', to: 39 })).toThrow(EngineError)
    expect(JSON.stringify(state)).toBe(before)
  })
  it('builds pots that match the chip-by-chip reference', () => {
    const players = [
      { invested: 50, folded: false },
      { invested: 200, folded: true },
      { invested: 300, folded: false },
      { invested: 300, folded: false },
      { invested: 120, folded: false },
    ].map((p, seat) => ({
      ...p,
      seat,
      stack: 0,
      bet: 0,
      allIn: false,
      actedSeq: -1,
      cards: null,
      shown: false,
    }))
    expect(buildPots(players)).toEqual(referencePots(players))
    expect(buildPots(players).map((p) => p.amount)).toEqual([250, 280, 440])
    expect(potTotal({ players } as unknown as HandState)).toBe(970)
  })
})
