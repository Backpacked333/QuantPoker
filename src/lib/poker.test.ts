import { describe, expect, it } from 'vitest'
import {
  act,
  botAction,
  cardKey,
  deck,
  estimateEquity,
  evaluate,
  guidedHand,
  legalActions,
  newHand,
  other,
  shuffle,
} from './poker'
import type { Card, Game, Suit } from './poker'

const cards = (s: string): Card[] =>
  s.split(' ').map((value) => ({
    rank: '23456789TJQKA'.indexOf(value[0]) + 2,
    suit: value[1] as Suit,
  }))
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
}

describe('hand ranking', () => {
  it.each([
    ['As Ks Qs Js Ts 2h 3d', 'Straight flush'],
    ['As Ah Ad Ac Ks Kh 2d', 'Four of a kind'],
    ['As Ah Ad Ks Kh Kd 2c', 'Full house'],
    ['As Js 9s 5s 2s Kh Qd', 'Flush'],
    ['As 2h 3d 4c 5s Kh Qd', 'Straight'],
    ['As Ah Ad Ks Qh 4d 2c', 'Three of a kind'],
    ['As Ah Ks Kh Qh 4d 2c', 'Two pair'],
    ['As Ah Ks Qh 9h 4d 2c', 'One pair'],
    ['As Jh 9s 7h 5h 4d 2c', 'High card'],
  ])('evaluates %s as %s', (hand, name) =>
    expect(evaluate(cards(hand)).name).toBe(name),
  )
  it('orders all categories', () => {
    const hands = [
      'As Jh 9s 7h 5h',
      '2s 2h 9s 7h 5h',
      '2s 2h 3s 3h 5h',
      '2s 2h 2d 7h 5h',
      '2s 3h 4d 5h 6h',
      '2s 4s 7s 9s Js',
      '2s 2h 2d 3h 3s',
      '2s 2h 2d 2c 3s',
      '2s 3s 4s 5s 6s',
    ]
    for (let i = 1; i < hands.length; i++)
      expect(evaluate(cards(hands[i])).score).toBeGreaterThan(
        evaluate(cards(hands[i - 1])).score,
      )
  })
  it('uses the highest kicker when quads coexist with a lower pair', () =>
    expect(evaluate(cards('2s 2h 2d 2c 3s 3h Ad')).score).toBe(
      evaluate(cards('2s 2h 2d 2c Ah')).score,
    ))
  it('uses the higher triplet for a full house', () =>
    expect(evaluate(cards('As Ah Ad Ks Kh Kd 2c')).score).toBe(
      evaluate(cards('As Ah Ad Ks Kh')).score,
    ))
  it('uses a third pair as the two-pair kicker if best', () =>
    expect(evaluate(cards('As Ah Ks Kh Qs Qh 2c')).score).toBe(
      evaluate(cards('As Ah Ks Kh Qs')).score,
    ))
  it('orders straights and recognizes the wheel without wrapping QKA23', () => {
    expect(evaluate(cards('As 2h 3c 4d 5s')).score).toBeLessThan(
      evaluate(cards('2s 3h 4c 5d 6s')).score,
    )
    expect(evaluate(cards('Qs Kh Ac 2d 3s')).name).toBe('High card')
  })
  it('requires five to seven cards', () =>
    expect(() => evaluate(cards('As Kh'))).toThrow())
  it('agrees with best-of-five enumeration over 1,000 random seven-card hands', () => {
    const random = rng(420)
    for (let n = 0; n < 1000; n++) {
      const hand = shuffle(deck(), random).slice(0, 7)
      const scores = []
      for (let i = 0; i < 7; i++)
        for (let j = i + 1; j < 7; j++)
          scores.push(
            evaluate(hand.filter((_, index) => index !== i && index !== j))
              .score,
          )
      expect(evaluate(hand).score).toBe(Math.max(...scores))
    }
  })
})

describe('heads-up betting', () => {
  it('deals unique cards and correct blinds', () => {
    const game = newHand(1, [2000, 2000], 0, rng(1))
    expect(game.pot).toBe(30)
    expect(game.stacks).toEqual([1990, 1980])
    expect(game.turn).toBe(0)
    expect(
      new Set([...game.cards.flat(), ...game.deck].map(cardKey)).size,
    ).toBe(52)
  })
  it('keeps the big blind option after a limp and changes order on the flop', () => {
    let game = act(newHand(), { type: 'call' })
    expect(game.street).toBe('preflop')
    expect(game.turn).toBe(1)
    game = act(game, { type: 'check' })
    expect(game.street).toBe('flop')
    expect(game.turn).toBe(1)
    expect(game.board).toHaveLength(3)
    expect(game.pot).toBe(40)
    expect(game.bets).toEqual([0, 0])
  })
  it('rejects checking a bet, calling no bet, and illegal raises', () => {
    expect(() => act(newHand(), { type: 'check' })).toThrow()
    expect(() => act(newHand(), { type: 'raise', to: 39 })).toThrow()
    expect(() => act(newHand(), { type: 'raise', to: 3000 })).toThrow()
    expect(() => act(newHand(), { type: 'raise', to: 40.5 })).toThrow()
    expect(() =>
      act(act(newHand(), { type: 'call' }), { type: 'call' }),
    ).toThrow()
  })
  it('updates minimum raises and does not mutate prior state', () => {
    const original = newHand()
    const next = act(original, { type: 'raise', to: 60 })
    expect(original.pot).toBe(30)
    expect(next.pot).toBe(80)
    expect(legalActions(next).minRaiseTo).toBe(100)
    expect(next.acted).toEqual([true, false])
  })
  it('settles a fold once with correct net chips', () => {
    const game = act(guidedHand(), { type: 'fold' })
    expect(game.result?.net).toBe(-60)
    expect(game.stacks).toEqual([1940, 2060])
    expect(game.pot).toBe(0)
    expect(game.result?.showdown).toBe(false)
    expect(() => act(game, { type: 'fold' })).toThrow()
  })
  it('runs out an all-in and conserves chips with unequal stacks', () => {
    let game = newHand(1, [100, 2000], 0, rng(6))
    expect(legalActions(game).maxRaiseTo).toBe(100)
    game = act(game, { type: 'raise', to: 100 })
    game = act(game, { type: 'call' })
    expect(game.board).toHaveLength(5)
    expect(game.street).toBe('showdown')
    expect(game.stacks[0] + game.stacks[1]).toBe(2100)
    expect(game.result?.showdown).toBe(true)
  })
  it('allows short all-ins below a normal minimum raise', () => {
    let game = newHand(1, [35, 2000])
    expect(legalActions(game).minRaiseTo).toBe(35)
    game = act(game, { type: 'raise', to: 35 })
    expect(legalActions(game).canRaise).toBe(false)
    expect(act(game, { type: 'call' }).street).toBe('showdown')
  })
  it('runs out when a player cannot cover the small blind', () => {
    const game = newHand(1, [5, 2000], 0, rng(9))
    expect(game.street).toBe('showdown')
    expect(game.invested).toEqual([5, 5])
    expect(game.stacks[0] + game.stacks[1]).toBe(2005)
  })
  it('rejects invalid starting stacks', () => {
    expect(() => newHand(1, [0, 2000])).toThrow()
    expect(() => newHand(1, [20.5, 2000])).toThrow()
  })
  it('splits a tied board with both players playing the board', () => {
    const game = guidedHand()
    game.board = cards('As Ks Qs Js Ts')
    game.cards = [cards('2h 3h'), cards('4d 5d')]
    game.street = 'river'
    game.bets = [0, 0]
    game.invested = [80, 80]
    game.stacks = [1920, 1920]
    game.acted = [false, true]
    const result = act(game, { type: 'check' })
    expect(result.result?.winner).toBe('tie')
    expect(result.result?.net).toBe(0)
    expect(result.stacks).toEqual([2000, 2000])
  })
  it('conserves chips and terminates over 500 randomized games', () => {
    const random = rng(55)
    for (let i = 0; i < 500; i++) {
      const starting: [number, number] = [
        1 + Math.floor(random() * 2000),
        1 + Math.floor(random() * 2000),
      ]
      let game = newHand(i, starting, (i % 2) as 0 | 1, random)
      let actions = 0
      while (!game.result && actions < 100) {
        const legal = legalActions(game),
          roll = random()
        game = act(
          game,
          roll < 0.12
            ? { type: 'fold' }
            : roll < 0.5 && legal.canRaise
              ? {
                  type: 'raise',
                  to:
                    legal.minRaiseTo +
                    Math.floor(
                      random() * (legal.maxRaiseTo - legal.minRaiseTo + 1),
                    ),
                }
              : { type: legal.canCheck ? 'check' : 'call' },
        )
        expect(game.stacks.every((s) => s >= 0 && Number.isInteger(s))).toBe(
          true,
        )
        expect(game.stacks[0] + game.stacks[1] + game.pot).toBe(
          starting[0] + starting[1],
        )
        expect(
          new Set(
            [...game.cards.flat(), ...game.board, ...game.deck].map(cardKey),
          ).size,
        ).toBe(52)
        actions++
      }
      expect(game.result).toBeDefined()
    }
  })
  it('bot emits legal actions and does not inspect hero cards', () => {
    let game: Game = newHand(1, [2000, 2000], 1, rng(10))
    const copy = structuredClone(game)
    copy.cards[0] = cards('As Ah')
    expect(botAction(game, rng(18))).toEqual(botAction(copy, rng(18)))
    for (let i = 0; i < 25; i++) {
      if (game.result)
        game = newHand(i + 2, [2000, 2000], other(game.dealer), rng(i))
      if (game.turn === 1) game = act(game, botAction(game, rng(i)))
      else
        game = act(game, {
          type: legalActions(game).canCheck ? 'check' : 'call',
        })
    }
  })
})

describe('visible-information equity', () => {
  it('returns 100% for an unbeatable river hand', () =>
    expect(
      estimateEquity(cards('As Ks'), cards('Qs Js Ts 2h 3d'), 200, rng(1)),
    ).toBe(1))
  it('counts a board tie as half the pot', () =>
    expect(
      estimateEquity(cards('2h 3h'), cards('As Ks Qs Js Ts'), 200, rng(1)),
    ).toBe(0.5))
  it('estimates aces near their known random-hand equity', () =>
    expect(estimateEquity(cards('As Ah'), [], 3000, rng(1))).toBeCloseTo(
      0.85,
      1,
    ))
})
