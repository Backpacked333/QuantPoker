// @vitest-environment node
// The golden set (P1-09): 50 hands played in the trainer's engine
// (src/lib/poker.ts), every decision of both players graded twice:
//  - the trainer's way, on the trainer's own view of the hand (for the
//    second player, the same view with the seats swapped), and
//  - the grading consumer's way (src/lib/gradeHand.ts), from the archived
//    record and deck, replayed in the live engine and seen through the
//    redacted seat view.
// Every grade must be identical, field for field: the server grades exactly
// what the trainer would have shown that player.
import { describe, expect, it } from 'vitest'
import { orderedDeck } from '../engine/deck'
import type { HandConfig } from '../engine/types'
import type { HandRecordV1 } from '../shared/protocol'
import { botAction } from './atlas'
import { gradeHand } from './gradeHand'
import type { GradeRow } from './gradeHand'
import { gradeVsPopulation } from './grader'
import { act, newHand, other } from './poker'
import type { Game, Player } from './poker'
import { lcg, toId } from './sim'

const HANDS = 50

/** The live engine's deck for a trainer hand (as differential.test.ts). */
function deckFor(game: Game) {
  const d = game.dealer
  const o = other(d)
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

/** The same hand from the other player's chair. */
function mirrored(game: Game): Game {
  const swap = <T>(pair: [T, T]): [T, T] => [pair[1], pair[0]]
  return {
    ...game,
    dealer: other(game.dealer),
    turn: other(game.turn),
    cards: swap(game.cards),
    stacks: swap(game.stacks),
    bets: swap(game.bets),
    invested: swap(game.invested),
    acted: swap(game.acted),
    history: game.history.map((h) => ({ ...h, player: other(h.player) })),
  }
}

/** A finished hand as the archive holds it, enough for the consumer. */
function recordOf(
  handNo: number,
  dealer: Player,
  actions: HandRecordV1['actions'],
): HandRecordV1 {
  const config: HandConfig = {
    handNo,
    seats: [
      { seat: 0, stack: 2000 },
      { seat: 1, stack: 2000 },
    ],
    button: dealer,
    blinds: { sb: 10, bb: 20 },
  }
  return {
    v: 1,
    matchId: 'golden',
    handNo,
    segment: 1,
    config,
    seats: [],
    commitment: '',
    actions,
    board: [],
    shown: [],
    awards: [],
    netBySeat: { 0: 0, 1: 0 },
    showdown: false,
  }
}

describe('the golden set', () => {
  it(`${HANDS} recorded hands: consumer grades equal the trainer's on the same decision, field for field`, () => {
    const random = lcg(2026)
    let decisions = 0
    const streets = new Set<string>()
    for (let h = 1; h <= HANDS; h++) {
      const dealer = (h % 2) as Player
      let game = newHand(h, [2000, 2000], dealer, random)
      const deck = deckFor(game)
      const actions: HandRecordV1['actions'] = []
      const trainer: GradeRow[] = []
      while (!game.result) {
        const seat = game.turn
        // Atlas plays both chairs; each sees the hand from its own.
        const view = seat === 0 ? game : mirrored(game)
        const action = botAction(mirrored(view), random, 'balanced')
        const graded = gradeVsPopulation(view, action)
        trainer.push({
          seat,
          idx: actions.length,
          grade: graded.grade.toLowerCase() as GradeRow['grade'],
          evLost: graded.evLost,
          accuracy: graded.accuracy,
          pot: view.pot,
        })
        streets.add(game.street)
        actions.push({
          seat,
          action,
          source: 'client',
        } as HandRecordV1['actions'][number])
        game = act(game, action)
      }
      const consumer = gradeHand(recordOf(h, dealer, actions), deck)
      expect(consumer, `hand ${h}`).toEqual(trainer)
      decisions += consumer.length
    }
    // Enough decisions, on every street, to mean something.
    expect(decisions).toBeGreaterThan(150)
    expect(streets).toEqual(new Set(['preflop', 'flop', 'turn', 'river']))
  }, 240_000)

  it('the consumer grades the same hand bit for bit every time', () => {
    const random = lcg(7)
    const dealer: Player = 1
    let game = newHand(1, [2000, 2000], dealer, random)
    const deck = deckFor(game)
    const actions: HandRecordV1['actions'] = []
    while (!game.result) {
      const seat = game.turn
      const view = seat === 0 ? game : mirrored(game)
      const action = botAction(mirrored(view), random, 'balanced')
      actions.push({
        seat,
        action,
        source: 'client',
      } as HandRecordV1['actions'][number])
      game = act(game, action)
    }
    const record = recordOf(1, dealer, actions)
    expect(gradeHand(record, deck)).toEqual(gradeHand(record, deck))
  })

  it('grades a move the clock made like any other, from the same view', () => {
    const random = lcg(8)
    const dealer: Player = 0
    const game = newHand(1, [2000, 2000], dealer, random)
    const deck = deckFor(game)
    const record = recordOf(1, dealer, [
      {
        seat: 0,
        action: { type: 'fold' },
        source: 'timeout',
      } as HandRecordV1['actions'][number],
    ])
    const trainer = gradeVsPopulation(game, { type: 'fold' })
    expect(gradeHand(record, deck)).toEqual([
      {
        seat: 0,
        idx: 0,
        grade: trainer.grade.toLowerCase(),
        evLost: trainer.evLost,
        accuracy: trainer.accuracy,
        pot: game.pot,
      },
    ])
  })
})
