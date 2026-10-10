// The landing page's challenge hands (L-3): curated spots with fixed hole
// cards, a fixed board and a scripted start, so every visitor faces the same
// decisions and the percentile compares like with like. Atlas's later
// responses come from its published policy under a seed fixed per path
// (src/challenge/build.ts), so the whole hand is reproducible.
//
// Changing a hand changes its tree: bump its `ver` so new scores start a fresh
// histogram (ScoreDO keys every count by hand and ver).
import type { Action, Card, Game, Player, Suit } from '../lib/poker'
import { act, cardKey, deck, newHand } from '../lib/poker'

export type ChallengeSpec = {
  id: string
  ver: number
  title: string
  /** One line shown before the first decision. */
  setup: string
  hero: string
  atlas: string
  /** Flop, turn and river, in order. */
  board: string
  dealer: Player
  /** Played before the hero's first graded decision (both players). */
  prelude: Action[]
}

export const STYLE = 'balanced' as const

export const CHALLENGE_HANDS: ChallengeSpec[] = [
  {
    id: 'overpair',
    ver: 1,
    title: 'Overpair under pressure',
    setup: 'Pocket queens, and an ace hits the flop. Atlas leads out.',
    hero: 'Qh Qd',
    atlas: 'Ac 5c',
    board: 'Ah 9c 4c 2d Kc',
    dealer: 0,
    prelude: [
      { type: 'raise', to: 60 },
      { type: 'call' },
      { type: 'raise', to: 50 },
    ],
  },
  {
    id: 'nut-draw',
    ver: 1,
    title: 'The nut flush draw',
    setup: 'Ace-four of diamonds on a two-diamond flop. Atlas bets.',
    hero: 'Ad 4d',
    atlas: 'Kh Ts',
    board: 'Kd 8d 2s 6c 9d',
    dealer: 0,
    prelude: [
      { type: 'raise', to: 60 },
      { type: 'call' },
      { type: 'raise', to: 80 },
    ],
  },
  {
    id: 'underpair',
    ver: 1,
    title: 'Pocket nines, overcard flop',
    setup: 'Pocket nines under a king. Atlas bets half the pot.',
    hero: '9s 9c',
    atlas: 'Ah Jh',
    board: 'Kh 7h 4s 6d 2c',
    dealer: 0,
    prelude: [
      { type: 'raise', to: 60 },
      { type: 'call' },
      { type: 'raise', to: 50 },
    ],
  },

  {
    id: 'open-ender',
    ver: 1,
    title: 'Five-four suited, open-ended',
    setup: 'An open-ended straight draw. Atlas bets into you.',
    hero: '5h 4h',
    atlas: 'Kd Ks',
    board: '6s 3d Js 7c Ah',
    dealer: 0,
    prelude: [
      { type: 'raise', to: 60 },
      { type: 'call' },
      { type: 'raise', to: 70 },
    ],
  },

  {
    id: 'big-blind',
    ver: 1,
    title: 'Defending the big blind',
    setup: 'Middle pair from the big blind. Your move first.',
    hero: '8h 7h',
    atlas: 'Ad Kc',
    board: '8c 5s 2d Kh 7c',
    dealer: 1,
    prelude: [{ type: 'raise', to: 60 }, { type: 'call' }],
  },
  {
    id: 'overcards',
    ver: 1,
    title: 'Overcards and a gutshot',
    setup: 'Ace-queen misses, but you have outs. Atlas bets small.',
    hero: 'Ah Qc',
    atlas: '5d 5c',
    board: 'Js Tc 3h 2h Kd',
    dealer: 0,
    prelude: [
      { type: 'raise', to: 60 },
      { type: 'call' },
      { type: 'raise', to: 40 },
    ],
  },
]

const parse = (text: string): Card[] =>
  text.split(' ').map((value) => ({
    rank: '23456789TJQKA'.indexOf(value[0]) + 2,
    suit: value[1] as Suit,
  }))

/**
 * The hand at the hero's first graded decision. The deck is in a fixed order
 * (the engine deals from its end), so every street comes out as specified.
 */
export function startGame(spec: ChallengeSpec): Game {
  const cards: [Card[], Card[]] = [parse(spec.hero), parse(spec.atlas)]
  const board = parse(spec.board)
  const used = new Set([...cards.flat(), ...board].map(cardKey))
  const rest = deck().filter((c) => !used.has(cardKey(c)))
  let game: Game = {
    ...newHand(1, [2000, 2000], spec.dealer, () => 0),
    cards,
    deck: [...rest, ...[...board].reverse()],
    log: [spec.setup],
  }
  for (const action of spec.prelude) game = act(game, action)
  if (game.turn !== 0 || game.result)
    throw new Error(`${spec.id}: the prelude must end on the hero's turn`)
  return game
}
