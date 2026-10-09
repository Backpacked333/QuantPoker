// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { fromId } from '../lib/sim'
import { act, isOver, legalActions, startHand } from './hand'
import { FACE_DOWN, toHeroGame } from './project'
import { seatView } from './redact'
import { config, deckWith, ids } from './testing'
import type { HandState, SeatId } from './types'

const view = (state: HandState, seat: SeatId) =>
  seatView(state, seat, {
    matchId: 'm',
    match: {
      kind: 'hu-casual',
      status: 'playing',
      handsTotal: 20,
      players: [],
    },
    clock: null,
    lastReqId: null,
    commitment: null,
  })

function hand(holes: Record<SeatId, string>, board: string) {
  const cfg = config([2000, 2000], 0)
  return startHand(cfg, deckWith(cfg, holes, board))
}

/** Checks and calls to the end. */
function checkDown(state: HandState) {
  while (!isOver(state))
    state = act(
      state,
      state.toAct!,
      legalActions(state).canCheck ? { type: 'check' } : { type: 'call' },
    )
  return state
}

describe('toHeroGame', () => {
  it('puts the viewer in the hero seat from either side of the table', () => {
    const state = hand({ 0: 'As Kd', 1: '7c 2h' }, '2c 7d 9h Tc 3s')
    const alice = toHeroGame(view(state, 0), 'bob')
    const bob = toHeroGame(view(state, 1), 'alice')
    expect(alice.cards[0]).toEqual(ids('As Kd').map(fromId))
    expect(bob.cards[0]).toEqual(ids('7c 2h').map(fromId))
    // Seat 0 has the button: hero's button for alice, the opponent's for bob.
    expect([alice.dealer, bob.dealer]).toEqual([0, 1])
    expect([alice.turn, bob.turn]).toEqual([0, 1])
    expect(alice.cards[1]).toEqual(FACE_DOWN)
    expect(bob.cards[1]).toEqual(FACE_DOWN)
    expect(alice.result).toBeUndefined()
  })

  it('names the winner and the hand at showdown', () => {
    const state = checkDown(hand({ 0: 'As Kd', 1: '7c 2h' }, '2c 7d 9h Tc 3s'))
    const alice = toHeroGame(view(state, 0), 'bob')
    const bob = toHeroGame(view(state, 1), 'alice')
    expect(alice.result).toMatchObject({
      winner: 1,
      net: -20,
      showdown: true,
      text: 'bob wins · Two pair',
    })
    expect(bob.result).toMatchObject({
      winner: 0,
      net: 20,
      text: 'You win · Two pair',
    })
    // Shown at showdown: the opponent's real cards replace the backs.
    expect(alice.cards[1]).toEqual(ids('7c 2h').map(fromId))
    expect(alice.pot).toBe(0)
  })

  it('calls a chopped board a split pot', () => {
    const state = checkDown(hand({ 0: '2h 3h', 1: '4d 5d' }, 'As Ks Qs Js Ts'))
    for (const seat of [0, 1] as const)
      expect(toHeroGame(view(state, seat), 'x').result).toMatchObject({
        winner: 'tie',
        net: 0,
        text: 'Split pot · Straight flush',
      })
  })

  it('says who folded, without a showdown', () => {
    let state = hand({ 0: 'As Kd', 1: '7c 2h' }, '2c 7d 9h Tc 3s')
    state = act(state, 0, { type: 'raise', to: 60 })
    state = act(state, 1, { type: 'fold' })
    expect(toHeroGame(view(state, 0), 'bob').result).toMatchObject({
      winner: 0,
      net: 20,
      showdown: false,
      text: 'bob folds · you win',
    })
    expect(toHeroGame(view(state, 1), 'alice').result).toMatchObject({
      winner: 1,
      net: -20,
      text: 'You fold · alice wins',
    })
    // A folded hand is never shown.
    expect(toHeroGame(view(state, 0), 'bob').cards[1]).toEqual(FACE_DOWN)
  })

  it('refuses tables that are not heads-up', () => {
    const cfg = config([2000, 2000, 2000], 0)
    const state = startHand(cfg, deckWith(cfg, {}, ''))
    expect(() => toHeroGame(view(state, 0))).toThrow(/heads-up/)
  })
})
