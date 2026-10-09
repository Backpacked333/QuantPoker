// @vitest-environment node
// Heads-up, the N-player engine must agree with src/lib/poker.ts (the
// trainer's engine) step for step: same stacks, bets, pot, board, turn, legal
// actions and result. The projection into the trainer's Game must match too,
// which is what lets grading and the table run on live hands unchanged.
import { describe, expect, it } from 'vitest'
import { gradeDecision } from '../lib/grading'
import {
  act as oldAct,
  legalActions as oldLegal,
  newHand,
  other,
} from '../lib/poker'
import type { Action, Game, Player } from '../lib/poker'
import { analyzeSpot } from '../lib/range'
import { lcg, toId } from '../lib/sim'
import { spotKey } from '../state/spots'
import { orderedDeck } from './deck'
import { act, isOver, legalActions, potTotal, startHand } from './hand'
import { stateToHeroGame } from './project'
import type { HandConfig, HandState } from './types'

const HANDS = 10_000

/** The new engine's deck for an old game, honouring both deal orders. */
function deckFor(game: Game) {
  const d = game.dealer
  const o = other(d)
  // Slots 0–3: one card per pass from the first seat after the button. The
  // old engine pops the board from the end of its deck.
  const dealt = [
    game.cards[o][0],
    game.cards[d][0],
    game.cards[o][1],
    game.cards[d][1],
    ...game.deck.slice(-5).reverse(),
  ].map(toId)
  const used = new Set(dealt)
  return [...dealt, ...orderedDeck().filter((c) => !used.has(c))]
}

function walkAction(game: Game, random: () => number): Action {
  const legal = oldLegal(game)
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

function compare(old: Game, state: HandState) {
  const seat = (p: Player) => state.players.find((s) => s.seat === p)!
  expect(isOver(state)).toBe(!!old.result)
  expect([seat(0).stack, seat(1).stack]).toEqual(old.stacks)
  expect(state.board).toEqual(old.board.map(toId))
  if (old.result) {
    const net = state.result!.netBySeat[0]
    expect(net).toBe(old.result.net)
    expect(net > 0 ? 0 : net < 0 ? 1 : 'tie').toBe(old.result.winner)
    expect(state.result!.showdown).toBe(old.result.showdown)
    return
  }
  expect(state.street).toBe(old.street)
  expect([seat(0).bet, seat(1).bet]).toEqual(old.bets)
  expect([seat(0).invested, seat(1).invested]).toEqual(old.invested)
  expect(potTotal(state)).toBe(old.pot)
  expect(state.toAct).toBe(old.turn)
  expect(legalActions(state)).toEqual({ seat: old.turn, ...oldLegal(old) })
  if (old.turn === 0) {
    const projected = stateToHeroGame(state, 0)
    for (const key of [
      'dealer',
      'turn',
      'street',
      'cards',
      'board',
      'stacks',
      'bets',
      'invested',
      'acted',
      'pot',
      'lastRaise',
      'history',
    ] as const)
      expect(projected[key], key).toEqual(old[key])
  }
}

describe('heads-up differential against poker.ts', () => {
  it(`agrees on ${HANDS.toLocaleString()} seeded hands`, () => {
    const random = lcg(4242)
    let showdowns = 0
    for (let h = 0; h < HANDS; h++) {
      // Both stacks cover the big blind twice, so both engines post the
      // blinds in full (short-blind posting differs and has crafted tests).
      const stacks: [number, number] = [
        40 + Math.floor(random() * 3961),
        40 + Math.floor(random() * 3961),
      ]
      const dealer = (h % 2) as Player
      let old = newHand(h + 1, stacks, dealer, random)
      const config: HandConfig = {
        handNo: h + 1,
        seats: [
          { seat: 0, stack: stacks[0] },
          { seat: 1, stack: stacks[1] },
        ],
        button: dealer,
        blinds: { sb: 10, bb: 20 },
      }
      let state = startHand(config, deckFor(old))
      compare(old, state)
      while (!old.result) {
        const action = walkAction(old, random)
        const turn = old.turn
        old = oldAct(old, action)
        state = act(state, turn, action)
        compare(old, state)
      }
      if (old.result.showdown) showdowns++
    }
    expect(showdowns).toBeGreaterThan(HANDS / 10)
  }, 180_000)

  it('grades a projected live decision exactly like the trainer', () => {
    const random = lcg(77)
    let graded = 0
    for (let h = 0; graded < 6 && h < 400; h++) {
      let old = newHand(h + 1, [2000, 2000], (h % 2) as Player, random)
      let state = startHand(
        {
          handNo: h + 1,
          seats: [
            { seat: 0, stack: 2000 },
            { seat: 1, stack: 2000 },
          ],
          button: old.dealer,
          blinds: { sb: 10, bb: 20 },
        },
        deckFor(old),
      )
      while (!old.result) {
        const action = walkAction(old, random)
        if (old.turn === 0 && old.street === 'flop' && action.type !== 'fold') {
          const projected = stateToHeroGame(state, 0)
          expect(spotKey(projected, 'balanced')).toBe(spotKey(old, 'balanced'))
          const spot = analyzeSpot(
            {
              key: spotKey(old, 'balanced'),
              hole: old.cards[0],
              board: old.board,
              history: old.history,
              style: 'balanced',
            },
            lcg(h),
          )
          expect(gradeDecision(projected, action, spot, 'balanced')).toEqual(
            gradeDecision(old, action, spot, 'balanced'),
          )
          graded++
        }
        const turn = old.turn
        old = oldAct(old, action)
        state = act(state, turn, action)
      }
    }
    expect(graded).toBe(6)
  }, 60_000)
})
