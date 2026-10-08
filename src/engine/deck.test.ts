// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  commitDeck,
  dealSlots,
  deckFromRecord,
  fromBase64,
  fromHex,
  isValidDeck,
  orderedDeck,
  revealSlots,
  toBase64,
  toHex,
  verifyReveal,
} from './deck'
import { act, isOver, replayHand, startHand } from './hand'
import { config, seededDeck } from './testing'
import type { PlayerAction, SeatId } from './types'

const secret = (fill: number) => new Uint8Array(32).fill(fill)

describe('deck layout', () => {
  it('shuffles to a permutation of all 52 cards', () => {
    const deck = seededDeck(3)
    expect([...deck].sort((a, b) => a - b)).toEqual(orderedDeck())
    expect(deck).not.toEqual(orderedDeck())
    expect(seededDeck(3)).toEqual(deck)
  })
  it('deals one card per pass from the seat after the button', () => {
    expect(dealSlots(config([2000, 2000], 0))).toEqual({
      holes: { 1: [0, 2], 0: [1, 3] },
      board: [4, 5, 6, 7, 8],
    })
    const six = dealSlots(config([1, 1, 1, 1, 1, 1], 4))
    expect(six.holes).toEqual({
      5: [0, 6],
      0: [1, 7],
      1: [2, 8],
      2: [3, 9],
      3: [4, 10],
      4: [5, 11],
    })
    expect(six.board).toEqual([12, 13, 14, 15, 16])
  })
  it('validates decks', () => {
    expect(isValidDeck(orderedDeck())).toBe(true)
    expect(isValidDeck([...orderedDeck().slice(1), 1])).toBe(false)
    expect(isValidDeck([...orderedDeck().slice(1), 52])).toBe(false)
    expect(isValidDeck(orderedDeck().slice(1))).toBe(false)
    expect(isValidDeck(Array(52).fill(-1))).toBe(false)
    expect(isValidDeck(Array(52).fill(-1), true)).toBe(true)
  })
  it('encodes bytes as hex and base64 both ways', () => {
    const data = Uint8Array.from([0, 1, 127, 128, 255])
    expect(toHex(data)).toBe('00017f80ff')
    expect(fromHex('00017f80ff')).toEqual(data)
    expect(fromBase64(toBase64(data))).toEqual(data)
    expect(() => fromHex('xyz')).toThrow()
  })
})

describe('deck commitment', () => {
  const deck = seededDeck(11)

  it('opens revealed slots and rejects tampering', async () => {
    const { commitment, leaves } = await commitDeck(deck, secret(7))
    expect(commitment).toMatch(/^[0-9a-f]{64}$/)
    expect(leaves).toHaveLength(52 * 32)
    const slots = await revealSlots(deck, secret(7), [4, 5, 6, 0, 2])
    expect(slots.map((s) => s.slot)).toEqual([0, 2, 4, 5, 6])
    expect(await verifyReveal(commitment, leaves, slots)).toBe(true)

    const wrongCard = slots.map((s, i) =>
      i === 0 ? { ...s, card: (s.card + 1) % 52 } : s,
    )
    expect(await verifyReveal(commitment, leaves, wrongCard)).toBe(false)
    const wrongSalt = slots.map((s, i) =>
      i === 1 ? { ...s, salt: '00'.repeat(16) } : s,
    )
    expect(await verifyReveal(commitment, leaves, wrongSalt)).toBe(false)
    const badLeaves = leaves.slice()
    badLeaves[100] ^= 1
    expect(await verifyReveal(commitment, badLeaves, slots)).toBe(false)
    expect(await verifyReveal(commitment, leaves.slice(1), slots)).toBe(false)
  })

  it('differs per secret, so a replayed deck gets a fresh commitment', async () => {
    const a = await commitDeck(deck, secret(1))
    const b = await commitDeck(deck, secret(2))
    expect(a.commitment).not.toBe(b.commitment)
    expect((await commitDeck(deck, secret(1))).commitment).toBe(a.commitment)
  })

  it('reveals nothing about unrevealed slots', async () => {
    // Two decks that agree on the revealed slots but not elsewhere give the
    // same openings for those slots.
    const other = [...deck]
    ;[other[20], other[30]] = [other[30], other[20]]
    const open = [4, 5, 6, 7, 8]
    expect(await revealSlots(deck, secret(3), open)).toEqual(
      await revealSlots(other, secret(3), open),
    )
  })

  it('rejects a partial deck', async () => {
    await expect(commitDeck(Array(52).fill(-1), secret(1))).rejects.toThrow()
  })
})

describe('replay from a public record', () => {
  it('rebuilds a hand where a seat folded, without its cards', () => {
    const cfg = config([2000, 2000, 2000], 0)
    const deck = seededDeck(21)
    let state = startHand(cfg, deck)
    const taken: { seat: SeatId; action: PlayerAction }[] = []
    const play = (action: PlayerAction) => {
      taken.push({ seat: state.toAct!, action })
      state = act(state, state.toAct!, action)
    }
    play({ type: 'call' })
    play({ type: 'fold' })
    play({ type: 'check' })
    while (!isOver(state)) play({ type: 'check' })

    const known = state.players
      .filter((p) => p.shown)
      .map((p) => ({ seat: p.seat, cards: p.cards! }))
    const partial = deckFromRecord(cfg, state.board, known)
    expect(partial.filter((c) => c === -1)).toHaveLength(52 - 9)
    const replayed = replayHand(cfg, partial, taken)
    const final = replayed[replayed.length - 1]
    expect(final.result).toEqual(state.result)
    expect(final.players.find((p) => p.seat === 1)!.cards).toEqual([-1, -1])
  })
})
