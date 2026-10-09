// The guided path: three labeled teaching setups with internally consistent
// pots, stacks and public action histories. Atlas's cards are fixed so the
// lesson is reproducible, but they are never an input to the hero's analysis.
import { cardKey, deck, guidedHand, shuffle } from './poker'
import type { Card, Game, HistoryEntry, Suit } from './poker'

const parse = (text: string): Card[] =>
  text.split(' ').map((value) => ({
    rank: '23456789TJQKA'.indexOf(value[0]) + 2,
    suit: value[1] as Suit,
  }))

export type GuidedStep = 1 | 2 | 3
export const GUIDED_STEPS = 3
export const guidedIntro: Record<GuidedStep, { title: string; body: string }> =
  {
    1: {
      title: 'Guided hand 1 of 3 · A big draw',
      body: 'You hold a flush draw plus overcards. Atlas bets small. Is the price right?',
    },
    2: {
      title: 'Guided hand 2 of 3 · Price matters',
      body: 'An open-ended straight draw facing a larger turn bet. Compare your equity with the price.',
    },
    3: {
      title: 'Guided hand 3 of 3 · The river call',
      body: 'Top pair, top kicker. Atlas bets after checking twice. Bluff, or value?',
    },
  }

function build(
  id: number,
  hero: string,
  atlas: string,
  board: string,
  rest: Omit<Game, 'id' | 'guided' | 'cards' | 'board' | 'deck'>,
): Game {
  const cards: [Card[], Card[]] = [parse(hero), parse(atlas)]
  const boardCards = parse(board)
  const used = new Set([...cards.flat(), ...boardCards].map(cardKey))
  return {
    id,
    guided: true,
    cards,
    board: boardCards,
    deck: shuffle(deck().filter((c) => !used.has(cardKey(c)))),
    ...rest,
  }
}

const entry = (e: HistoryEntry) => e

export function scriptedHand(step: GuidedStep): Game {
  if (step === 1) return guidedHand()
  if (step === 2)
    return build(2, '9h 8h', 'Kc Js', '7c 6h Kd 2s', {
      dealer: 0,
      street: 'turn',
      turn: 0,
      stacks: [1900, 1780],
      bets: [0, 120],
      invested: [100, 220],
      acted: [false, true],
      pot: 320,
      lastRaise: 120,
      log: [
        'Guided hand: you raised to 40 and Atlas called.',
        'Flop 7♣ 6♥ K♦ · Atlas bets 60. You call.',
        'Turn 2♠ · Atlas bets 120. Your decision.',
      ],
      history: [
        entry({
          player: 0,
          street: 'preflop',
          boardCount: 0,
          action: 'raise',
          amount: 40,
          toCall: 10,
          pot: 30,
          canRaise: true,
        }),
        entry({
          player: 1,
          street: 'preflop',
          boardCount: 0,
          action: 'call',
          amount: 20,
          toCall: 20,
          pot: 70,
          canRaise: true,
          note: 'Called 20. King-jack is comfortably ahead of a random hand at this price.',
        }),
        entry({
          player: 1,
          street: 'flop',
          boardCount: 3,
          action: 'raise',
          amount: 60,
          toCall: 0,
          pot: 80,
          canRaise: true,
          note: 'Bet 60 for value. Top pair is strong against a random hand.',
        }),
        entry({
          player: 0,
          street: 'flop',
          boardCount: 3,
          action: 'call',
          amount: 60,
          toCall: 60,
          pot: 140,
          canRaise: true,
        }),
        entry({
          player: 1,
          street: 'turn',
          boardCount: 4,
          action: 'raise',
          amount: 120,
          toCall: 0,
          pot: 200,
          canRaise: true,
          note: 'Bet 120 for value. A blank turn keeps top pair ahead.',
        }),
      ],
    })
  return build(3, 'Ac Qd', '7s 6s', 'Qs 8h 5d 3c 2h', {
    dealer: 0,
    street: 'river',
    turn: 0,
    stacks: [1860, 1660],
    bets: [0, 200],
    invested: [140, 340],
    acted: [false, true],
    pot: 480,
    lastRaise: 200,
    log: [
      'Guided hand: you raised to 60 and Atlas called.',
      'Flop Q♠ 8♥ 5♦ · Atlas checks, you bet 80, Atlas calls.',
      'Turn 3♣ · Both check.',
      'River 2♥ · Atlas bets 200. Your decision.',
    ],
    history: [
      entry({
        player: 0,
        street: 'preflop',
        boardCount: 0,
        action: 'raise',
        amount: 60,
        toCall: 10,
        pot: 30,
        canRaise: true,
      }),
      entry({
        player: 1,
        street: 'preflop',
        boardCount: 0,
        action: 'call',
        amount: 40,
        toCall: 40,
        pot: 90,
        canRaise: true,
        note: 'Called 40. Suited connectors play well enough at this price.',
      }),
      entry({
        player: 1,
        street: 'flop',
        boardCount: 3,
        action: 'check',
        amount: 0,
        toCall: 0,
        pot: 120,
        canRaise: true,
        note: 'Checked. An open-ended draw, but not yet a made hand.',
      }),
      entry({
        player: 0,
        street: 'flop',
        boardCount: 3,
        action: 'raise',
        amount: 80,
        toCall: 0,
        pot: 120,
        canRaise: true,
      }),
      entry({
        player: 1,
        street: 'flop',
        boardCount: 3,
        action: 'call',
        amount: 80,
        toCall: 80,
        pot: 200,
        canRaise: true,
        note: 'Called 80 light. My draw is under the price, but I defend sometimes.',
      }),
      entry({
        player: 1,
        street: 'turn',
        boardCount: 4,
        action: 'check',
        amount: 0,
        toCall: 0,
        pot: 280,
        canRaise: true,
        note: 'Checked. Still drawing.',
      }),
      entry({
        player: 0,
        street: 'turn',
        boardCount: 4,
        action: 'check',
        amount: 0,
        toCall: 0,
        pot: 280,
        canRaise: true,
      }),
      entry({
        player: 1,
        street: 'river',
        boardCount: 5,
        action: 'raise',
        amount: 200,
        toCall: 0,
        pot: 280,
        canRaise: true,
        note: 'Bet 200 with seven-high. An occasional bluff keeps me unpredictable.',
      }),
    ],
  })
}
