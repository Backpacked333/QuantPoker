// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  commitDeck,
  dealSlots,
  deckFromRecord,
  fromBase64,
  fromHex,
  isValidDeck,
  publicSlots,
  verifyDeal,
  verifyOwn,
  orderedDeck,
  revealSlots,
  toBase64,
  toHex,
  verifyReveal,
} from './deck'
import { act, isOver, replayHand, startHand } from './hand'
import { config, seededDeck } from './testing'
import type { HandConfig, PlayerAction, SeatId } from './types'

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

describe('verifyDeal', () => {
  async function finished(fold: boolean) {
    const cfg = config([2000, 2000], 0)
    const deck = seededDeck(11)
    let state = startHand(cfg, deck)
    state = fold
      ? act(state, 0, { type: 'fold' })
      : (() => {
          let s = act(state, 0, { type: 'call' })
          while (!isOver(s)) s = act(s, s.toAct!, { type: 'check' })
          return s
        })()
    const deal = {
      config: cfg,
      board: state.board,
      shown: state.players
        .filter((p) => p.shown)
        .map((p) => ({ seat: p.seat, cards: p.cards! })),
    }
    const { commitment, leaves } = await commitDeck(deck, secret(9))
    const slots = await revealSlots(deck, secret(9), publicSlots(deal))
    return { deck, deal, commitment, leaves, slots }
  }

  it('accepts the board and shown hands from their dealt slots', async () => {
    const { deal, commitment, leaves, slots } = await finished(false)
    expect(deal.board).toHaveLength(5)
    expect(slots).toHaveLength(9)
    expect(await verifyDeal(commitment, leaves, slots, deal)).toBe(true)
  })

  it('opens nothing but the board and shown hands', async () => {
    const { deal, slots } = await finished(true)
    // A fold before the flop: no board, nobody shows.
    expect(deal.board).toEqual([])
    expect(slots).toEqual([])
  })

  it('rejects a swapped card, an extra slot, or a re-deal', async () => {
    const { deck, deal, commitment, leaves, slots } = await finished(false)
    const swapped = { ...deal, board: [...deal.board].reverse() }
    expect(await verifyDeal(commitment, leaves, slots, swapped)).toBe(false)
    const extra = await revealSlots(deck, secret(9), [...publicSlots(deal), 30])
    expect(await verifyDeal(commitment, leaves, extra, deal)).toBe(false)
    const other = await commitDeck(seededDeck(12), secret(9))
    expect(await verifyDeal(other.commitment, leaves, slots, deal)).toBe(false)
  })

  it("verifies a player's own folded cards against the commitment, and fails a swapped or foreign opening", async () => {
    const { deck, deal, commitment, leaves } = await finished(true)
    const holes = dealSlots(deal.config).holes
    for (const [seat, other] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const mine = holes[seat].map((slot) => deck[slot]) as [number, number]
      const own = await revealSlots(deck, secret(9), holes[seat])
      expect(
        await verifyOwn(commitment, leaves, own, deal.config, seat, mine),
      ).toBe(true)
      // The server dealt the player other cards than it committed to.
      const unused = deck[40]
      expect(
        await verifyOwn(commitment, leaves, own, deal.config, seat, [
          mine[0],
          unused,
        ]),
      ).toBe(false)
      expect(
        await verifyOwn(commitment, leaves, own, deal.config, seat, [
          mine[1],
          mine[0],
        ]),
      ).toBe(false)
      // Openings of other slots (the opponent's, or one twice) never pass.
      const theirs = await revealSlots(deck, secret(9), holes[other])
      expect(
        await verifyOwn(commitment, leaves, theirs, deal.config, seat, mine),
      ).toBe(false)
      expect(
        await verifyOwn(
          commitment,
          leaves,
          [own[0], own[0]],
          deal.config,
          seat,
          mine,
        ),
      ).toBe(false)
      expect(
        await verifyOwn(
          commitment,
          leaves,
          own.slice(0, 1),
          deal.config,
          seat,
          mine,
        ),
      ).toBe(false)
      // A forged salt for the right card does not open the committed leaf.
      const forged = own.map((s, i) =>
        i ? s : { ...s, salt: '00'.repeat(16) },
      )
      expect(
        await verifyOwn(commitment, leaves, forged, deal.config, seat, mine),
      ).toBe(false)
    }
  })

  it('rejects a reveal that repeats one slot to leave a re-dealt card unopened', async () => {
    // A cheating server commits, then changes the river. It cannot open the
    // river slot for the new card, so it sends a genuine opening twice and
    // keeps the slot count right.
    const { deck, deal, commitment, leaves, slots } = await finished(false)
    const riverSlot = dealSlots(deal.config).board[4]
    const used = new Set([...deal.board, ...deal.shown.flatMap((s) => s.cards)])
    const redealt = deck.find((card) => !used.has(card))!
    const cheat = { ...deal, board: [...deal.board.slice(0, 4), redealt] }
    const padded = [...slots.filter((s) => s.slot !== riverSlot), slots[0]]
    expect(padded).toHaveLength(slots.length)
    expect(await verifyDeal(commitment, leaves, padded, cheat)).toBe(false)
  })
})

describe('explicit blind seats in the record', () => {
  it('replay and verifyDeal accept a dead-button config', async () => {
    // A six-casual hand after seats 1 and 2 left: the button stays on the
    // empty seat 1, the small blind is dead and seat 3 posts the big blind.
    const cfg: HandConfig = {
      handNo: 7,
      seats: [0, 3, 4, 5].map((seat) => ({ seat, stack: 2000 })),
      button: 1,
      blinds: { sb: 10, bb: 20 },
      sb: null,
      bb: 3,
    }
    const deck = seededDeck(31)
    let state = startHand(cfg, deck)
    const taken: { seat: SeatId; action: PlayerAction }[] = []
    const play = (action: PlayerAction) => {
      taken.push({ seat: state.toAct!, action })
      state = act(state, state.toAct!, action)
    }
    play({ type: 'call' }) // 4
    play({ type: 'call' }) // 5
    play({ type: 'fold' }) // 0
    play({ type: 'check' }) // 3
    while (!isOver(state)) play({ type: 'check' })

    // The archive keeps the blind seats, null included, as JSON.
    const archived = JSON.parse(JSON.stringify(state.config)) as HandConfig
    expect(JSON.stringify(state.config)).toBe(
      '{"handNo":7,"seats":[{"seat":0,"stack":2000},{"seat":3,"stack":2000},' +
        '{"seat":4,"stack":2000},{"seat":5,"stack":2000}],"button":1,' +
        '"blinds":{"sb":10,"bb":20},"sb":null,"bb":3}',
    )
    const replayed = replayHand(archived, deck, taken)
    expect(JSON.stringify(replayed.at(-1))).toBe(JSON.stringify(state))

    const shown = state.players
      .filter((p) => p.shown)
      .map((p) => ({ seat: p.seat, cards: p.cards! }))
    expect(shown.map((s) => s.seat)).toEqual([3, 4, 5])
    const partial = replayHand(
      archived,
      deckFromRecord(archived, state.board, shown),
      taken,
    )
    expect(partial.at(-1)!.result).toEqual(state.result)

    const deal = { config: archived, board: state.board, shown }
    const { commitment, leaves } = await commitDeck(deck, secret(5))
    const slots = await revealSlots(deck, secret(5), publicSlots(deal))
    expect(slots).toHaveLength(11)
    expect(await verifyDeal(commitment, leaves, slots, deal)).toBe(true)
    // The folded seat 0 can still check its own cards.
    const holes = dealSlots(archived).holes[0]
    const own = await revealSlots(deck, secret(5), holes)
    const mine = holes.map((slot) => deck[slot]) as [number, number]
    expect(await verifyOwn(commitment, leaves, own, archived, 0, mine)).toBe(
      true,
    )
  })

  it('a config without blind seats archives byte-identically', () => {
    // hu-casual and hu-rated leave sb and bb out, so their records keep the
    // exact bytes of the archive written before explicit blinds existed.
    const cfg = config([2000, 2000], 1)
    expect(JSON.stringify(startHand(cfg, seededDeck(3)).config)).toBe(
      '{"handNo":1,"seats":[{"seat":0,"stack":2000},{"seat":1,"stack":2000}],' +
        '"button":1,"blinds":{"sb":10,"bb":20}}',
    )
  })
})
