// @vitest-environment node
// Seat order, blinds and labels for casual 6-max, pinned before the dead
// button lands (P2-02a) so that change shows exactly which baseline it moves.
// Expected values are worked out by hand from the rules in positions.ts:
// seats ascend clockwise and wrap from the highest seat to the lowest.
import { describe, expect, it } from 'vitest'
import { startHand } from './hand'
import { blindSeats, nextButton, positionNames } from './positions'
import { config, deckWith } from './testing'
import { EngineError } from './types'

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
