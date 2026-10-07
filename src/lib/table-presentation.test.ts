import { describe, expect, it } from 'vitest'
import { act, cardKey, evaluate, guidedHand, newHand } from './poker'
import { bestFiveKeys, tableFrames } from './table-presentation'

describe('poker presentation choreography', () => {
  it('shows the paid action before the next street without mutating either engine state', () => {
    const previous = guidedHand(),
      before = structuredClone(previous)
    const next = act(previous, { type: 'call' }),
      final = structuredClone(next)
    const frames = tableFrames(previous, next)
    expect(frames.map((f) => f.phase)).toEqual(['bet', 'street'])
    expect(frames[0].game.board).toEqual(previous.board)
    expect(frames[0].game.bets).toEqual([40, 40])
    expect(frames[0].game.stacks).toEqual(next.stacks)
    expect(frames[0].actor).toBe(0)
    expect(frames[0].amount).toBe(40)
    expect(frames[1].game.board).toEqual(next.board)
    expect(frames[1].game.street).toBe('turn')
    expect(previous).toEqual(before)
    expect(next).toEqual(final)
  })
  it('sequences an all-in flop, turn, river, reveal and payout with conserved chips', () => {
    const previous = act(
      newHand(2, [100, 100], 0, () => 0.5),
      { type: 'raise', to: 100 },
    )
    const next = act(previous, { type: 'call' })
    expect(next.result?.showdown).toBe(true)
    const frames = tableFrames(previous, next)
    expect(frames.map((f) => f.phase)).toEqual([
      'bet',
      'street',
      'street',
      'street',
      'reveal',
      'settle',
    ])
    expect(frames.map((f) => f.game.board.length)).toEqual([0, 3, 4, 5, 5, 5])
    frames.slice(0, -1).forEach((frame) => {
      expect(frame.game.result).toBeUndefined()
      expect(frame.game.stacks).toEqual([0, 0])
      expect(frame.game.stacks[0] + frame.game.stacks[1] + frame.game.pot).toBe(
        200,
      )
    })
    expect(frames.find((f) => f.revealOpponent)?.game.board.length).toBe(5)
    expect(frames.at(-1)?.game).toBe(next)
  })
  it('keeps folded opponent cards hidden and defers payout until settlement', () => {
    const previous = guidedHand(),
      next = act(previous, { type: 'fold' })
    const frames = tableFrames(previous, next)
    expect(frames.map((f) => f.phase)).toEqual(['bet', 'settle'])
    expect(frames.some((f) => f.revealOpponent)).toBe(false)
    expect(frames[0].game.stacks).toEqual(previous.stacks)
    expect(frames[0].game.pot).toBe(previous.pot)
    expect(frames.at(-1)?.game.result?.showdown).toBe(false)
  })
  it('stages a new hand separately and keeps non-street actions unchanged', () => {
    const previous = guidedHand(),
      next = newHand(2)
    expect(tableFrames(previous, next)).toEqual([
      { game: next, phase: 'deal', duration: 850 },
    ])
    const raise = act(previous, { type: 'raise', to: 100 })
    expect(tableFrames(previous, raise)[0].game).toBe(raise)
  })
  it('does not expose later street log entries during an intermediate reveal', () => {
    const previous = act(
      newHand(2, [100, 100], 0, () => 0.5),
      { type: 'raise', to: 100 },
    )
    const next = act(previous, { type: 'call' })
    tableFrames(previous, next)
      .slice(0, -1)
      .forEach((frame) => {
        expect(
          frame.game.log.some((entry) => /wins|Split pot/.test(entry)),
        ).toBe(false)
      })
  })
})

describe('winning five-card spotlight', () => {
  it('highlights five cards that have the same score as the full seven-card hand', () => {
    const cards = [
      { rank: 14, suit: 's' as const },
      { rank: 13, suit: 's' as const },
      { rank: 12, suit: 's' as const },
      { rank: 11, suit: 's' as const },
      { rank: 10, suit: 's' as const },
      { rank: 2, suit: 'h' as const },
      { rank: 2, suit: 'd' as const },
    ]
    const keys = bestFiveKeys(cards)
    expect(keys.size).toBe(5)
    expect(evaluate(cards.filter((c) => keys.has(cardKey(c)))).score).toBe(
      evaluate(cards).score,
    )
    expect(keys.has('2h')).toBe(false)
    expect(bestFiveKeys(cards.slice(0, 3)).size).toBe(0)
  })
})
