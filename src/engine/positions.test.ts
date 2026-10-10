// @vitest-environment node
// Seat order, blinds and labels for casual 6-max, pinned before the dead
// button lands (P2-02a) so that change shows exactly which baseline it moves.
// Expected values are worked out by hand from the rules in positions.ts:
// seats ascend clockwise and wrap from the highest seat to the lowest.
import { describe, expect, it } from 'vitest'
import { dealSlots } from './deck'
import { act, isOver, startHand } from './hand'
import { blindSeats, nextButton, positionNames } from './positions'
import { config, deckWith } from './testing'
import { EngineError } from './types'
import type { HandConfig, HandState, SeatId } from './types'

/** A six-casual config: 2000 chips in each of `seats`, explicit blinds. */
const explicit = (
  seats: SeatId[],
  button: SeatId,
  sb: SeatId | null,
  bb: SeatId,
  blinds = { sb: 10, bb: 20 },
): HandConfig => ({
  handNo: 1,
  seats: seats.map((seat) => ({ seat, stack: 2000 })),
  button,
  blinds,
  sb,
  bb,
})
const invested = (state: HandState) =>
  Object.fromEntries(state.players.map((p) => [p.seat, p.invested]))

describe('table size', () => {
  it('validateConfig rejects 7 seats', () => {
    // SeatId is 0..5 and positionNames has labels for at most six.
    const seven = config([2000, 2000, 2000, 2000, 2000, 2000, 2000])
    expect(() => startHand(seven, deckWith(seven, {}, ''))).toThrow(
      new EngineError('A hand needs 2 to 6 players'),
    )
    const six = config([2000, 2000, 2000, 2000, 2000, 2000])
    expect(startHand(six, deckWith(six, {}, '')).players).toHaveLength(6)
  })
  it('refuses a seat id above 5', () => {
    const base = config([2000, 2000])
    const wide = {
      ...base,
      seats: [base.seats[0], { ...base.seats[1], seat: 8 }],
    }
    expect(() => startHand(wide, deckWith(base, {}, ''))).toThrow(
      new EngineError('Seats must be integers from 0 to 5'),
    )
  })
})

describe('positionNames', () => {
  it('heads-up: the button and the big blind', () => {
    // The button posts the small blind heads-up but is still labelled BTN.
    expect(positionNames([1, 4], 4)).toEqual({ 4: 'BTN', 1: 'BB' })
  })
  it('3 seats: wraps past the highest seat to the big blind', () => {
    expect(positionNames([0, 3, 5], 3)).toEqual({
      3: 'BTN',
      5: 'SB',
      0: 'BB',
    })
  })
  it('5 seats: the empty seat 3 is skipped', () => {
    expect(positionNames([0, 1, 2, 4, 5], 2)).toEqual({
      2: 'BTN',
      4: 'SB',
      5: 'BB',
      0: 'UTG',
      1: 'CO',
    })
  })
  it('6 seats: every label once, starting from the button', () => {
    expect(positionNames([0, 1, 2, 3, 4, 5], 4)).toEqual({
      4: 'BTN',
      5: 'SB',
      0: 'BB',
      1: 'UTG',
      2: 'HJ',
      3: 'CO',
    })
  })
})

describe('blindSeats', () => {
  it('heads-up: the button posts the small blind', () => {
    expect(blindSeats([0, 1], 0)).toEqual({ sb: 0, bb: 1 })
    expect(blindSeats([2, 5], 5)).toEqual({ sb: 5, bb: 2 })
  })
  it('3 or more: the two seats after the button, wrapping and skipping gaps', () => {
    expect(blindSeats([0, 1, 2], 0)).toEqual({ sb: 1, bb: 2 })
    expect(blindSeats([0, 1, 2], 2)).toEqual({ sb: 0, bb: 1 })
    expect(blindSeats([0, 2, 5], 2)).toEqual({ sb: 5, bb: 0 })
    expect(blindSeats([0, 1, 2, 3, 4, 5], 5)).toEqual({ sb: 0, bb: 1 })
  })
})

describe('nextButton', () => {
  it('wraps around a gap (seats 0, 2, 5)', () => {
    const seats = [0, 2, 5]
    expect(nextButton(seats, 0)).toBe(2)
    expect(nextButton(seats, 2)).toBe(5)
    expect(nextButton(seats, 5)).toBe(0)
  })
  it('moves on from a button seat that has emptied', () => {
    // The P2-02 dead-button rule is the change most likely to move this.
    expect(nextButton([0, 2, 5], 3)).toBe(5)
    expect(nextButton([0, 2, 5], 4)).toBe(5)
    expect(nextButton([0, 2], 5)).toBe(0)
  })
})

// Six-casual hands name their blind seats (ADR amendment 2026-10-10, Phase 2,
// "Blinds and button"). Each config below is one the standard dead button
// produces; the comment says which departure led to it.
describe('explicit blind seats', () => {
  it('dead button: empty button seat, no small blind, bb posts, first seat after bb opens', () => {
    // Last hand: button 0, small blind 1, big blind 2. Seats 1 and 2 left, so
    // the big blind moves on to 3, the small blind (seat 2) is dead and the
    // button stays on seat 1, which is empty.
    const cfg = explicit([0, 3, 4, 5], 1, null, 3)
    let state = startHand(cfg, deckWith(cfg, {}, ''))
    expect(invested(state)).toEqual({ 0: 0, 3: 20, 4: 0, 5: 0 })
    // The deal starts at the first player clockwise after the empty button.
    expect(dealSlots(cfg).holes).toEqual({
      3: [0, 4],
      4: [1, 5],
      5: [2, 6],
      0: [3, 7],
    })
    expect(state.toAct).toBe(4)
    state = act(state, 4, { type: 'call' })
    expect(state.toAct).toBe(5)
    state = act(state, 5, { type: 'call' })
    expect(state.toAct).toBe(0)
    state = act(state, 0, { type: 'call' })
    expect(state.toAct).toBe(3) // the big blind's option
    state = act(state, 3, { type: 'check' })
    expect(state.street).toBe('flop')
    expect(state.pots).toEqual([{ amount: 80, eligible: [0, 3, 4, 5] }])
    // After the flop the first player clockwise from seat 1 leads.
    expect(state.toAct).toBe(3)
    expect(positionNames([0, 3, 4, 5], 1, { sb: null, bb: 3 })).toEqual({
      3: 'BB',
      4: 'UTG',
      5: 'HJ',
      0: 'CO',
    })
  })

  it('dead small blind', () => {
    // Last hand: button 0, small blind 1, big blind 2. Seat 2 left: the big
    // blind moves on to 3, and the small blind falls on the empty seat 2.
    // Seat 1 keeps the button and posts nothing.
    const cfg = explicit([0, 1, 3, 4], 1, null, 3)
    let state = startHand(cfg, deckWith(cfg, {}, ''))
    expect(invested(state)).toEqual({ 0: 0, 1: 0, 3: 20, 4: 0 })
    expect(state.toAct).toBe(4)
    state = act(state, 4, { type: 'call' })
    state = act(state, 0, { type: 'call' })
    expect(state.toAct).toBe(1)
    state = act(state, 1, { type: 'call' })
    state = act(state, 3, { type: 'check' })
    expect(state.street).toBe('flop')
    expect(state.toAct).toBe(3)
    expect(positionNames([0, 1, 3, 4], 1, { sb: null, bb: 3 })).toEqual({
      1: 'BTN',
      3: 'BB',
      4: 'UTG',
      0: 'CO',
    })
  })

  it('dead small blind: a player who just sat in its seat is dealt in and posts nothing', () => {
    // As above, but someone sat in seat 2 between the hands (R-20).
    const cfg = explicit([0, 1, 2, 3, 4], 1, null, 3)
    let state = startHand(cfg, deckWith(cfg, {}, ''))
    expect(invested(state)).toEqual({ 0: 0, 1: 0, 2: 0, 3: 20, 4: 0 })
    const order: SeatId[] = []
    while (state.street === 'preflop') {
      order.push(state.toAct!)
      state = act(state, state.toAct!, {
        type: state.toAct === 3 ? 'check' : 'call',
      })
    }
    expect(order).toEqual([4, 0, 1, 2, 3])
    expect(state.toAct).toBe(2) // first clockwise from the button after the flop
    // Seat 2 holds no position: it sits between the button and the big
    // blind and posts nothing.
    expect(positionNames([0, 1, 2, 3, 4], 1, { sb: null, bb: 3 })).toEqual({
      1: 'BTN',
      3: 'BB',
      4: 'UTG',
      0: 'CO',
    })
  })

  it('dead button with a live small blind', () => {
    // Last hand: button 0, small blind 1, big blind 2. Seat 1 left.
    const cfg = explicit([0, 2, 3, 4], 1, 2, 3)
    const state = startHand(cfg, deckWith(cfg, {}, ''))
    expect(invested(state)).toEqual({ 0: 0, 2: 10, 3: 20, 4: 0 })
    expect(state.toAct).toBe(4)
    expect(positionNames([0, 2, 3, 4], 1, { sb: 2, bb: 3 })).toEqual({
      2: 'SB',
      3: 'BB',
      4: 'UTG',
      0: 'CO',
    })
  })

  it('odd chip from the seat after an empty button', () => {
    // Button on the empty seat 1, blinds 2 and 4 at 5/10. Seats 0 and 2 tie
    // on a royal-flush board for a 95-chip pot. Odd chips go clockwise from
    // the seat after the button: 2, 4, 0. So seat 2 gets 48 and seat 0 gets
    // 47. Counting from the small blind or the big blind would pay seat 0.
    const cfg = explicit([0, 2, 4], 1, 2, 4, { sb: 5, bb: 10 })
    const deck = deckWith(
      cfg,
      { 0: '2h 3h', 2: '2d 3d', 4: '4c 5c' },
      'As Ks Qs Js Ts',
    )
    let state = startHand(cfg, deck)
    expect(state.toAct).toBe(0)
    state = act(state, 0, { type: 'call' })
    state = act(state, 2, { type: 'call' })
    state = act(state, 4, { type: 'check' })
    expect(state.toAct).toBe(2) // flop: 30 in the pot
    state = act(state, 2, { type: 'check' })
    state = act(state, 4, { type: 'raise', to: 15 })
    state = act(state, 0, { type: 'call' })
    state = act(state, 2, { type: 'call' })
    expect(state.toAct).toBe(2) // turn: 75
    state = act(state, 2, { type: 'raise', to: 10 })
    state = act(state, 4, { type: 'fold' })
    state = act(state, 0, { type: 'call' })
    state = act(state, 2, { type: 'check' }) // river: 95
    state = act(state, 0, { type: 'check' })
    expect(isOver(state)).toBe(true)
    expect(state.result!.awards.map((a) => [a.pot, a.seat, a.amount])).toEqual([
      [0, 2, 48],
      [0, 0, 47],
    ])
    expect(state.players.map((p) => p.stack)).toEqual([2012, 2013, 1975])
    expect(state.result!.netBySeat).toEqual({ 0: 12, 2: 13, 4: -25 })
  })

  it('two-handed: the button posts the small blind, as heads-up', () => {
    const cfg = explicit([1, 4], 4, 4, 1)
    const state = startHand(cfg, deckWith(cfg, {}, ''))
    expect(invested(state)).toEqual({ 1: 20, 4: 10 })
    expect(state.toAct).toBe(4)
    expect(positionNames([1, 4], 4, { sb: 4, bb: 1 })).toEqual({
      4: 'BTN',
      1: 'BB',
    })
  })

  it('refuses every illegal explicit blind placement', () => {
    const refuses = (cfg: HandConfig, message: string) =>
      expect(() => startHand(cfg, deckWith(cfg, {}, ''))).toThrow(
        new EngineError(message),
      )
    // Players in seats 0, 2, 3 and 5; one legal placement is button 1 (empty),
    // small blind 2, big blind 3.
    const seats = [0, 2, 3, 5]
    const legal = explicit(seats, 1, 2, 3)
    expect(startHand(legal, deckWith(legal, {}, '')).toAct).toBe(5)
    // The big blind must be a player dealt in.
    refuses(explicit(seats, 1, null, 4), 'The big blind must be dealt in')
    refuses(explicit(seats, 2, null, 1), 'The big blind must be dealt in')
    // A live small blind must be a player dealt in, on another seat.
    refuses(explicit(seats, 0, 1, 2), 'A live small blind must be dealt in')
    refuses(
      explicit(seats, 1, 3, 3),
      'The small blind and the big blind must be different seats',
    )
    // Two players: the button posts the small blind, which is never dead.
    refuses(
      explicit([0, 3], 0, null, 3),
      'Heads-up the button posts the small blind',
    )
    refuses(
      explicit([0, 3], 1, 0, 3),
      'Heads-up the button posts the small blind',
    )
    refuses(
      explicit([0, 3], 3, 0, 3),
      'Heads-up the button posts the small blind',
    )
    // Three or more: the button is on neither blind.
    const noBlind = 'With three or more players the button posts no blind'
    refuses(explicit(seats, 2, 2, 3), noBlind)
    refuses(explicit(seats, 3, 2, 3), noBlind)
    refuses(explicit(seats, 3, null, 3), noBlind)
    // A live small blind's next player is the big blind.
    const next = 'The big blind must be the next player after the small blind'
    refuses(explicit(seats, 1, 2, 5), next)
    refuses(explicit(seats, 3, 5, 2), next)
    // Seats and the button are 0..5.
    const button = 'The button must be a seat from 0 to 5'
    refuses(explicit(seats, 6, 2, 3), button)
    refuses(explicit(seats, -1, 2, 3), button)
    refuses(explicit(seats, 1.5, 2, 3), button)
    refuses(
      explicit([0, 2, 3, 6], 1, 2, 3),
      'Seats must be integers from 0 to 5',
    )
    // Both blind seats or neither.
    const noSb = { ...legal }
    const noBb = { ...legal }
    delete noSb.sb
    delete noBb.bb
    refuses(noSb, 'Explicit blinds need both sb and bb')
    refuses(noBb, 'Explicit blinds need both sb and bb')
    // Without them the button must still be a seated player, as before.
    refuses(
      { ...config([2000, 2000]), button: 3 },
      'The button must be a seated player',
    )
  })
})

describe('positionNames with explicit blinds', () => {
  it('matches the implicit labels whenever the blinds are where blindSeats puts them', () => {
    // Every seating of 2 to 6 players at six seats, every seated button.
    for (let mask = 0; mask < 64; mask++) {
      const seats = [0, 1, 2, 3, 4, 5].filter((s) => mask & (1 << s))
      if (seats.length < 2) continue
      for (const button of seats)
        expect(positionNames(seats, button, blindSeats(seats, button))).toEqual(
          positionNames(seats, button),
        )
    }
  })
  it('names nobody BTN on an empty seat and nobody SB when it is dead', () => {
    // Button on empty seat 4, live small blind 5, big blind 0, then 1, 2, 3.
    expect(positionNames([0, 1, 2, 3, 5], 4, { sb: 5, bb: 0 })).toEqual({
      5: 'SB',
      0: 'BB',
      1: 'UTG',
      2: 'HJ',
      3: 'CO',
    })
    // A six-handed table where seat 2 just sat in the small blind's seat.
    expect(positionNames([0, 1, 2, 3, 4, 5], 1, { sb: null, bb: 3 })).toEqual({
      1: 'BTN',
      3: 'BB',
      4: 'UTG',
      5: 'HJ',
      0: 'CO',
    })
  })
})
