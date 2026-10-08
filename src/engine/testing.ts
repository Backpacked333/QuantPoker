// Test-only helpers for the engine suites: seeded decks, readable cards and
// a random legal-action walk shared by the invariant, redaction and
// differential tests. Not imported by application code.
import type { Suit } from '../lib/poker'
import { lcg, toId } from '../lib/sim'
import { dealSlots, orderedDeck, shuffleWith } from './deck'
import { legalActions } from './hand'
import type { HandConfig, HandState, PlayerAction, SeatId } from './types'

export const randomIntFrom = (random: () => number) => (n: number) =>
  Math.floor(random() * n)

export const seededDeck = (seed: number) =>
  shuffleWith(randomIntFrom(lcg(seed)))

/** 'As Kd' → card ids. */
export const ids = (text: string) =>
  text
    .split(' ')
    .filter(Boolean)
    .map((v) =>
      toId({ rank: '23456789TJQKA'.indexOf(v[0]) + 2, suit: v[1] as Suit }),
    )

/** A deck that deals the given hole cards and board; the rest in order. */
export function deckWith(
  config: HandConfig,
  holes: Record<SeatId, string>,
  board: string,
) {
  const slots = dealSlots(config)
  const deck = Array<number>(52).fill(-1)
  for (const [seat, text] of Object.entries(holes)) {
    const [a, b] = ids(text)
    deck[slots.holes[Number(seat)][0]] = a
    deck[slots.holes[Number(seat)][1]] = b
  }
  ids(board).forEach((card, i) => (deck[slots.board[i]] = card))
  const used = new Set(deck)
  const rest = orderedDeck().filter((c) => !used.has(c))
  return deck.map((c) => (c === -1 ? rest.shift()! : c))
}

export const config = (
  stacks: number[],
  button = 0,
  blinds = { sb: 10, bb: 20 },
  handNo = 1,
): HandConfig => ({
  handNo,
  seats: stacks.map((stack, seat) => ({ seat, stack })),
  button,
  blinds,
})

/** The walk from poker.test.ts: 12% fold, 38% random raise, else check/call. */
export function randomAction(
  state: HandState,
  random: () => number,
): PlayerAction {
  const legal = legalActions(state)
  const roll = random()
  if (roll < 0.12) return { type: 'fold' }
  if (roll < 0.5 && legal.canRaise)
    return {
      type: 'raise',
      to:
        legal.minRaiseTo +
        Math.floor(random() * (legal.maxRaiseTo - legal.minRaiseTo + 1)),
    }
  return legal.canCheck ? { type: 'check' } : { type: 'call' }
}

/** A random table of `n` players: seats, stacks 1..4000, button, deck. */
export function randomTable(n: number, random: () => number, handNo = 1) {
  const seats = orderedDeck()
    .slice(0, 6)
    .sort(() => random() - 0.5)
    .slice(0, n)
    .sort((a, b) => a - b)
  const cfg: HandConfig = {
    handNo,
    seats: seats.map((seat) => ({
      seat,
      stack: 1 + Math.floor(random() * 4000),
    })),
    button: seats[Math.floor(random() * n)],
    blinds: { sb: 10, bb: 20 },
  }
  return { config: cfg, deck: shuffleWith(randomIntFrom(random)) }
}
