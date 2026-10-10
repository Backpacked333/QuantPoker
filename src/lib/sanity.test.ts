// @vitest-environment node
// Does accuracy rank players the way a poker player would? Four scripted
// players play heads-up against Atlas, and every one of their decisions is
// graded against the population model, as rated play will be. A thinking
// player (a tight-aggressive script, and Atlas's own policy) must beat a
// calling station, which must beat a player who folds to every bet. If it
// does not, the model is wrong, not the players.
import { describe, expect, it } from 'vitest'
import { atlasDecision, botAction } from './atlas'
import { gradeVsPopulation } from './grader'
import { act, estimateEquity, legalActions, newHand } from './poker'
import type { Action, Game, Player } from './poker'
import { lcg } from './sim'

type Script = (game: Game, random: () => number) => Action

const check: Action = { type: 'check' }
const call: Action = { type: 'call' }
const fold: Action = { type: 'fold' }

const alwaysFold: Script = (game) =>
  legalActions(game).canCheck ? check : fold
const alwaysCall: Script = (game) =>
  legalActions(game).canCheck ? check : call

/** Plays few hands, and raises the ones it plays; prices calls honestly. */
const tightAggressive: Script = (game, random) => {
  const legal = legalActions(game)
  const equity = estimateEquity(game.cards[0], game.board, 300, random)
  const odds = legal.toCall / (game.pot + legal.toCall)
  const preflop = game.street === 'preflop'
  if (legal.canRaise && equity >= (preflop ? 0.58 : 0.7)) {
    const target =
      Math.max(...game.bets) + Math.round(0.75 * (game.pot + legal.toCall))
    return {
      type: 'raise',
      to: Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, target)),
    }
  }
  if (legal.canCheck) return check
  return equity >= (preflop ? 0.52 : odds + 0.05) ? call : fold
}

/** The hero seat as Atlas's player 1, so Atlas's policy can play it. */
function mirrored(game: Game): Game {
  const swap = <T>(pair: [T, T]): [T, T] => [pair[1], pair[0]]
  return {
    ...game,
    dealer: (1 - game.dealer) as Player,
    turn: (1 - game.turn) as Player,
    cards: swap(game.cards),
    stacks: swap(game.stacks),
    bets: swap(game.bets),
    invested: swap(game.invested),
    acted: swap(game.acted),
    history: game.history.map((h) => ({
      ...h,
      player: (1 - h.player) as Player,
    })),
  }
}
const atlasPolicy: Script = (game, random) =>
  atlasDecision(mirrored(game), 'balanced', random).action

/**
 * Mean accuracy of the script's first `count` decisions against Atlas, from
 * each seed. Several seeds, because a folder's score depends on how many
 * bets it happens to face: one 150-decision sample once put it within a
 * point of the calling station (the SDE log has the numbers).
 */
function accuracy(script: Script, count: number) {
  const scores: number[] = []
  for (const seed of SEEDS) {
    const random = lcg(seed)
    const start = scores.length
    for (let h = 1; scores.length - start < count; h++) {
      let game = newHand(h, [2000, 2000], (h % 2) as Player, random)
      while (!game.result && scores.length - start < count) {
        if (game.turn === 0) {
          const action = script(game, random)
          scores.push(gradeVsPopulation(game, action).accuracy)
          game = act(game, action)
        } else game = act(game, botAction(game, random, 'balanced'))
      }
    }
  }
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

const SEEDS = [23, 37, 51]
const PER_SEED = 60
const DECISIONS = SEEDS.length * PER_SEED

describe('accuracy against the population model', () => {
  it(`ranks a thinking player above a calling station above a folder, over ${DECISIONS} decisions each`, () => {
    const scores = {
      alwaysFold: accuracy(alwaysFold, PER_SEED),
      alwaysCall: accuracy(alwaysCall, PER_SEED),
      tightAggressive: accuracy(tightAggressive, PER_SEED),
      atlas: accuracy(atlasPolicy, PER_SEED),
    }
    console.log(
      `sanity: ${Object.entries(scores)
        .map(([who, s]) => `${who} ${s.toFixed(1)}`)
        .join(', ')}`,
    )
    // A clear margin where this sample shows one. Atlas's edge over the
    // station is smaller (2.6 points here; 4.9 ± 1.8 over 600 decisions on
    // five other seeds, in the SDE log), so only its order is asserted.
    expect(scores.tightAggressive).toBeGreaterThan(scores.alwaysCall + 5)
    expect(scores.tightAggressive).toBeGreaterThan(scores.atlas)
    expect(scores.atlas).toBeGreaterThan(scores.alwaysCall)
    expect(scores.alwaysCall).toBeGreaterThan(scores.alwaysFold + 5)
  }, 240_000)

  it('grades the same decisions identically every time', () => {
    const random = lcg(5)
    const game = act(newHand(3, [2000, 2000], 1, random), {
      type: 'raise',
      to: 60,
    })
    const first = gradeVsPopulation(game, call)
    const again = gradeVsPopulation(game, call)
    expect(again).toEqual(first)
  })
})
