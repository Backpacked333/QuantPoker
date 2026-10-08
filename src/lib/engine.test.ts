import { describe, expect, it } from 'vitest'
import { atlasDecision, policy, STYLES } from './atlas'
import type { AtlasStyle } from './atlas'
import { decisionEV } from './finance'
import {
  gradeDecision,
  gradeFor,
  GRADE_LIMITS,
  raiseCandidates,
} from './grading'
import {
  handClass,
  nextScenarios,
  raiseAnalysis,
  rangeGrid,
  spotOutcome,
} from './model'
import { act, analyzeEquity, deck, guidedHand, newHand, shuffle } from './poker'
import type { Card, Game, Suit } from './poker'
import { analyzeSpot, COMBOS, COMBO_A, COMBO_B, comboIndex } from './range'
import { lcg, score, toId } from './sim'
import { faceUpEquity } from './showdown'

const cards = (s: string): Card[] =>
  s.split(' ').map((value) => ({
    rank: '23456789TJQKA'.indexOf(value[0]) + 2,
    suit: value[1] as Suit,
  }))

// The original (slow, readable) evaluator, kept as a reference oracle.
function reference(cards: Card[]) {
  const encode = (category: number, kickers: number[]) =>
    [category, ...kickers, ...Array(5 - kickers.length).fill(0)].reduce(
      (s, n) => s * 15 + n,
      0,
    )
  const straight = (ranks: number[]) => {
    const unique = [...new Set(ranks)].sort((a, b) => b - a)
    if (unique[0] === 14) unique.push(1)
    for (let i = 0; i <= unique.length - 5; i++)
      if (unique[i] - unique[i + 4] === 4) return unique[i]
    return 0
  }
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a)
  const counts = new Map<number, number>()
  ranks.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1))
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  )
  const flush = (['s', 'h', 'd', 'c'] as Suit[])
    .map((s) =>
      cards
        .filter((c) => c.suit === s)
        .map((c) => c.rank)
        .sort((a, b) => b - a),
    )
    .find((c) => c.length >= 5)
  const sf = flush ? straight(flush) : 0
  const st = straight(ranks)
  if (sf) return encode(8, [sf])
  if (groups[0][1] === 4)
    return encode(7, [groups[0][0], ranks.find((r) => r !== groups[0][0])!])
  if (groups[0][1] === 3 && groups[1][1] >= 2)
    return encode(6, [groups[0][0], groups[1][0]])
  if (flush) return encode(5, flush.slice(0, 5))
  if (st) return encode(4, [st])
  if (groups[0][1] === 3)
    return encode(3, [
      groups[0][0],
      ...groups
        .slice(1)
        .map((g) => g[0])
        .sort((a, b) => b - a)
        .slice(0, 2),
    ])
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = groups
      .filter((g) => g[1] === 2)
      .map((g) => g[0])
      .slice(0, 2)
    return encode(2, [
      ...pairs,
      ...ranks.filter((r) => !pairs.includes(r)).slice(0, 1),
    ])
  }
  if (groups[0][1] === 2)
    return encode(1, [
      groups[0][0],
      ...groups
        .slice(1)
        .map((g) => g[0])
        .slice(0, 3),
    ])
  return encode(0, ranks.slice(0, 5))
}

describe('fast evaluator', () => {
  it('matches the reference evaluator on 6,000 random 5–7 card hands', () => {
    const random = lcg(7)
    for (let i = 0; i < 6000; i++) {
      const hand = shuffle(deck(), random).slice(0, 5 + (i % 3))
      expect(score(hand.map(toId))).toBe(reference(hand))
    }
  })
  it('matches on crafted edge cases', () => {
    for (const hand of [
      'As 2h 3d 4c 5s Kh Qd',
      'As Ah Ad Ks Kh Kd 2c',
      'As Ah Ks Kh Qs Qh 2c',
      'As Ah Ad Ac Ks Kh 2d',
      '2s 3s 4s 5s 6s 7s 8s',
      'As Ks Qs Js 9s 8s 7h',
    ])
      expect(score(cards(hand).map(toId))).toBe(reference(cards(hand)))
  })
})

describe('engine fixes', () => {
  it('runs out immediately after a covered all-in call', () => {
    let game = newHand(1, [15, 2000], 0, lcg(3))
    game = act(game, { type: 'call' })
    expect(game.street).toBe('showdown')
    expect(game.board).toHaveLength(5)
    expect(game.stacks[0] + game.stacks[1]).toBe(2015)
  })
  it('records public action history with context', () => {
    let game = newHand(1, [2000, 2000], 0, lcg(4))
    game = act(game, { type: 'raise', to: 60 }, 'note')
    expect(game.history).toEqual([
      {
        player: 0,
        street: 'preflop',
        boardCount: 0,
        action: 'raise',
        amount: 60,
        toCall: 10,
        pot: 30,
        canRaise: true,
        note: 'note',
      },
    ])
    game = act(game, { type: 'call' })
    expect(game.history[1]).toMatchObject({
      player: 1,
      action: 'call',
      amount: 40,
    })
  })
})

describe('Atlas policy', () => {
  const styles: AtlasStyle[] = ['tight', 'balanced', 'aggressive']
  it('returns a probability mix that is monotone in equity', () => {
    for (const style of styles)
      for (const sigma of [0, 0.03]) {
        let lastFold = 1,
          lastRaise = 0
        for (let e = 0; e <= 1.0001; e += 0.05) {
          const mix = policy(
            e,
            { toCall: 50, pot: 150, canRaise: true },
            style,
            sigma,
          )
          expect(mix.fold + mix.passive + mix.raise).toBeCloseTo(1)
          expect(mix.fold).toBeLessThanOrEqual(lastFold + 1e-9)
          expect(mix.raise).toBeGreaterThanOrEqual(lastRaise - 1e-9)
          lastFold = mix.fold
          lastRaise = mix.raise
        }
      }
  })
  it('never folds when checking is free and never raises when it cannot', () => {
    expect(
      policy(0.1, { toCall: 0, pot: 100, canRaise: true }, 'tight').fold,
    ).toBe(0)
    expect(
      policy(0.9, { toCall: 20, pot: 100, canRaise: false }, 'aggressive')
        .raise,
    ).toBe(0)
  })
  it('defends weak hands against small bets but not against huge overbets', () => {
    const weak = (toCall: number, pot: number) =>
      policy(0.2, { toCall, pot, canRaise: true }, 'balanced').fold
    expect(weak(40, 160)).toBeCloseTo(0.85)
    expect(weak(1900, 2100)).toBe(1)
  })
  it('makes tight fold more than aggressive at the same price', () => {
    const at = (style: AtlasStyle) =>
      policy(0.3, { toCall: 50, pot: 150, canRaise: true }, style).fold
    expect(at('tight')).toBeGreaterThan(at('aggressive'))
    expect(STYLES.aggressive.bluffFrequency).toBeGreaterThan(
      STYLES.tight.bluffFrequency,
    )
  })
  it('explains every action and never reads the hero cards', () => {
    let game: Game = newHand(1, [2000, 2000], 1, lcg(10))
    for (let i = 0; i < 40; i++) {
      if (game.result) game = newHand(i + 2, [2000, 2000], 1, lcg(i))
      if (game.turn === 1) {
        const copy = structuredClone(game)
        copy.cards[0] = cards('As Ah')
        for (const style of styles) {
          const decision = atlasDecision(game, style, lcg(i))
          expect(decision.explanation.length).toBeGreaterThan(20)
          expect(atlasDecision(copy, style, lcg(i))).toEqual(decision)
        }
        game = act(game, atlasDecision(game, 'balanced', lcg(i)).action)
      } else
        game = act(game, {
          type: game.bets[0] < game.bets[1] ? 'call' : 'check',
        })
    }
  })
})

describe('range-aware spot analysis', () => {
  const guided = guidedHand()
  const spot = analyzeSpot(
    {
      key: 'g',
      hole: guided.cards[0],
      board: guided.board,
      history: guided.history,
      style: 'balanced',
    },
    lcg(21),
  )
  it('indexes every combo exactly once', () => {
    const seen = new Set<number>()
    for (let k = 0; k < COMBOS; k++) {
      expect(comboIndex(COMBO_A[k], COMBO_B[k])).toBe(k)
      seen.add(COMBO_A[k] * 52 + COMBO_B[k])
    }
    expect(seen.size).toBe(1326)
  })
  it('produces a normalized posterior that excludes visible cards', () => {
    const sum = spot.weights.reduce((s, w) => s + w, 0)
    expect(sum).toBeCloseTo(1, 5)
    const dead = [...guided.cards[0], ...guided.board].map(toId)
    for (let k = 0; k < COMBOS; k++)
      if (dead.includes(COMBO_A[k]) || dead.includes(COMBO_B[k]))
        expect(spot.weights[k]).toBe(0)
  })
  it("strengthens Atlas's range after it bets", () => {
    expect(spot.steps).toHaveLength(2)
    expect(spot.steps[1].buckets[0]).toBeGreaterThan(spot.steps[0].buckets[0])
  })
  it('agrees with the uniform estimator under the uniform model', () => {
    const uniform = spotOutcome(spot, 'uniform').equity
    const reference = analyzeEquity(
      guided.cards[0],
      guided.board,
      4000,
      lcg(5),
    ).equity
    expect(Math.abs(uniform - reference)).toBeLessThan(0.03)
    const ranged = spotOutcome(spot, 'range')
    expect(ranged.win + ranged.tie + ranged.loss).toBeCloseTo(1)
  })
  it('is exact on the river', () => {
    const river = analyzeSpot(
      {
        key: 'r',
        hole: cards('As Ks'),
        board: cards('Qs Js Ts 2h 3d'),
        history: [],
        style: 'balanced',
      },
      lcg(1),
    )
    expect(spotOutcome(river, 'range').win).toBe(1)
    expect(river.next).toEqual([])
  })
  it('reprices every legal next card on the flop', () => {
    const next = nextScenarios(spot, 'range')
    expect(next.all).toHaveLength(47)
    expect(next.volatility).toBeGreaterThan(0)
    expect(next.best[0].equity).toBeGreaterThanOrEqual(next.worst[0].equity)
  })
  it('makes bigger raises fold more of the range and keeps EV consistent', () => {
    let lastFold = -1
    for (const raiseTo of [80, 160, 300, 600, 1940]) {
      const r = raiseAnalysis(
        spot,
        'range',
        { pot: 160, heroBet: 0, atlasBet: 40, raiseTo },
        'balanced',
      )
      expect(r.foldProbability).toBeGreaterThanOrEqual(lastFold - 1e-9)
      lastFold = r.foldProbability
      expect(r.ev).toBeCloseTo(
        decisionEV(
          {
            action: 'raise',
            pot: 160,
            risk: raiseTo,
            opponentCall: raiseTo - 40,
            foldProbability: r.foldProbability,
          },
          r.called.equity,
        ),
      )
    }
  })
  it('builds a 169-cell range grid', () => {
    const grid = rangeGrid(spot, 'range')
    expect(grid).toHaveLength(169)
    expect(grid[0].label).toBe('AA')
    expect(grid[1].label).toBe('AKs')
    expect(grid[13].label).toBe('AKo')
    expect(grid.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1)
    expect(Math.max(...grid.map((c) => c.likelihood))).toBeCloseTo(1)
  })
})

describe('decision grading', () => {
  it('maps EV loss to monotone grades', () => {
    let last = -1
    for (const lost of [0, 2, 6, 12, 30, 100]) {
      const index = GRADE_LIMITS.findIndex(([g]) => g === gradeFor(lost, 100))
      expect(index).toBeGreaterThanOrEqual(last)
      last = index
    }
    expect(gradeFor(0, 100)).toBe('Best')
    expect(gradeFor(50, 100)).toBe('Blunder')
  })
  it('flags folding the nuts on the river as a blunder', () => {
    const game = guidedHand()
    game.board = cards('Ks Qs 7d Ts 2c')
    game.street = 'river'
    const spot = analyzeSpot(
      {
        key: 'n',
        hole: game.cards[0],
        board: game.board,
        history: game.history,
        style: 'balanced',
      },
      lcg(2),
    )
    const fold = gradeDecision(game, { type: 'fold' }, spot, 'balanced')
    expect(fold.grade).toBe('Blunder')
    expect(fold.best.kind).toBe('raise')
    const call = gradeDecision(game, { type: 'call' }, spot, 'balanced')
    expect(call.evLost).toBeLessThan(fold.evLost)
  })
  it('shows overbet shoves but grades against standard sizes', () => {
    const game = guidedHand()
    const spot = analyzeSpot(
      {
        key: 's',
        hole: game.cards[0],
        board: game.board,
        history: game.history,
        style: 'balanced',
      },
      lcg(8),
    )
    const graded = gradeDecision(game, { type: 'call' }, spot, 'balanced')
    const shove = graded.options.find((o) => o.to === 1940)!
    // A 15-out draw really is +EV to shove against Atlas's calling range...
    expect(shove.graded).toBe(false)
    // ...but calling is judged against pot-sized alternatives.
    expect(graded.best.to ?? 0).toBeLessThanOrEqual(400)
    expect(['Best', 'Good', 'Inaccuracy']).toContain(graded.grade)
    const shoved = gradeDecision(
      game,
      { type: 'raise', to: 1940 },
      spot,
      'balanced',
    )
    expect(shoved.grade).toBe('Best')
  })
  it('offers legal raise candidates including the actual size', () => {
    const game = guidedHand()
    const sizes = raiseCandidates(game, 123)
    expect(sizes).toContain(123)
    expect(sizes).toContain(1940)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(80)
  })
})

describe('hand classes', () => {
  it.each([
    ['As Ad', '', 'Pocket pair'],
    ['As Kd', '', 'Two high cards'],
    ['7s 2d', '', 'Weak starting hand'],
    ['As Js', 'Ks Qs 7d', 'Flush draw'],
    ['9h 8d', '7c 6s Kd', 'Straight draw'],
    ['Ah Kd', 'Ac 6s 2d', 'One pair'],
    ['Ah Kd', 'Ac Ks 2d', 'Strong made hand'],
    ['Ah Kd', '9c 6s 2d', 'High card'],
  ])('%s on %s is %s', (hole, board, label) =>
    expect(handClass(cards(hole), board ? cards(board) : [])).toBe(label),
  )
})

describe('face-up equity', () => {
  it('splits a tied board as half the pot each, not zero', () => {
    const e = faceUpEquity(
      cards('2h 3h'),
      cards('4d 5d'),
      cards('As Ks Qs Js Ts'),
    )
    expect(e).toEqual({ hero: 0.5, atlas: 0.5, tie: 1 })
  })
  it('keeps shares summing to one with partial ties', () => {
    const e = faceUpEquity(cards('Ah Kd'), cards('Ac Ks'), cards('Qh Jd 2c'))
    expect(e.hero + e.atlas).toBeCloseTo(1)
    expect(e.tie).toBeGreaterThan(0.5)
    expect(e.hero).toBeGreaterThan(e.tie / 2 - 1e-9)
  })
})
