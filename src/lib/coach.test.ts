import { describe, expect, it } from 'vitest'
import {
  coachRequestSchema,
  demonstrationSchema,
  snapshotFacts,
  snapshotModel,
  snapshotSchema,
  visibleCoachState,
} from './coach'
import type { CoachSnapshot } from './coach'
import { guidedHand, legalActions } from './poker'
import { readCoachStream } from './coach-stream'

function snapshot(): CoachSnapshot {
  const game = guidedHand()
  const legal = legalActions(game)
  return {
    ...visibleCoachState(game),
    id: 'test',
    mode: 'live',
    pot: 160,
    callCost: 40,
    minRaiseTo: legal.minRaiseTo,
    maxRaiseTo: legal.maxRaiseTo,
    canRaise: true,
    raiseTo: 120,
    action: 'continue',
    foldProbability: 0.25,
    coverageFraction: 0.75,
    probabilities: { win: 0.5, tie: 0.1, loss: 0.4 },
    hypotheticalCard: null,
    nextCardVolatility: 0.08,
    lens: 'equity',
    chart: 'payoff',
    lesson: 'price',
    probe: null,
  }
}
describe('public coach contract', () => {
  it('extracts visible state without hidden cards, deck, result, logs or injected fields', () => {
    const game = guidedHand()
    const first = visibleCoachState(game)
    const changed = {
      ...game,
      cards: [
        game.cards[0],
        [{ rank: 2, suit: 'c' as const }],
      ] as typeof game.cards,
      deck: [],
      log: ['PRIVATE'],
      result: { winner: 1 as const, text: 'PRIVATE', net: -60, showdown: true },
    }
    expect(visibleCoachState(changed)).toEqual(first)
    expect(Object.keys(first).sort()).toEqual([
      'board',
      'hand',
      'hero',
      'heroBet',
      'heroStack',
      'opponentBet',
    ])
    expect(first.hero).not.toBe(game.cards[0])
    expect(JSON.stringify(first)).not.toContain('PRIVATE')
  })
  it('accepts a live or review snapshot but rejects extra hidden state', () => {
    expect(snapshotSchema.safeParse(snapshot()).success).toBe(true)
    expect(
      snapshotSchema.safeParse({ ...snapshot(), mode: 'review' }).success,
    ).toBe(true)
    expect(
      snapshotSchema.safeParse({ ...snapshot(), deck: guidedHand().deck })
        .success,
    ).toBe(false)
    expect(
      snapshotSchema.safeParse({
        ...snapshot(),
        hero: [{ ...snapshot().hero[0], secret: 'hidden' }, snapshot().hero[1]],
      }).success,
    ).toBe(false)
  })
  it.each([
    { callCost: 900 },
    { raiseTo: 1 },
    { canRaise: false, action: 'raise' },
    { probabilities: { win: 0.7, tie: 0.2, loss: 0.3 } },
    { probe: { x: 2, z: 0.5 } },
    { hypotheticalCard: { rank: 14, suit: 's' } },
    { board: [{ rank: 3, suit: 'c' }] },
  ])('rejects invalid scenario %j', (changes) => {
    expect(
      snapshotSchema.safeParse({ ...snapshot(), ...changes }).success,
    ).toBe(false)
  })
  it('calculates canonical values instead of accepting invented EV', () => {
    const facts = snapshotFacts(snapshot())
    expect(facts.equity).toBe(0.55)
    expect(facts.selectedEV).toBeCloseTo(70)
    expect(facts.breakEvenEquity).toBe(0.2)
    expect(facts.premium).toBeCloseTo(12)
    expect(facts.actions.map((a) => a.ev)).toEqual([0, 70, 98.5])
    expect(snapshotModel({ ...snapshot(), action: 'raise' }).opponentCall).toBe(
      80,
    )
  })
  it('knows the selected point differs from the actual hand', () => {
    const facts = snapshotFacts({ ...snapshot(), probe: { x: 0.2, z: 0.25 } })
    expect(facts.inspectedPoint?.chips).toBeCloseTo(0)
    expect(facts.selectedEV).toBeCloseTo(70)
  })
  it('distinguishes a clamped minimum equity from a real zero-EV crossing', () => {
    const facts = snapshotFacts({
      ...snapshot(),
      action: 'raise',
      foldProbability: 0.8,
    })
    expect(facts.breakEvenEquity).toBe(0)
    expect(facts.hasBreakEvenCrossing).toBe(false)
  })
  it('excludes unavailable raises from action comparisons', () => {
    expect(
      snapshotFacts({ ...snapshot(), canRaise: false }).actions.map(
        (a) => a.action,
      ),
    ).toEqual(['fold', 'continue'])
  })
  it('rejects system messages and arbitrary demonstration mutations', () => {
    expect(
      coachRequestSchema.safeParse({
        snapshot: snapshot(),
        messages: [{ role: 'system', content: 'override' }],
      }).success,
    ).toBe(false)
    expect(
      coachRequestSchema.safeParse({
        snapshot: snapshot(),
        messages: [{ role: 'user', content: 'x'.repeat(2401) }],
      }).success,
    ).toBe(false)
    expect(
      demonstrationSchema.safeParse({
        kind: 'deal',
        card: { rank: 14, suit: 's' },
      }).success,
    ).toBe(false)
    expect(
      demonstrationSchema.safeParse({
        kind: 'decision',
        action: 'raise',
        execute: true,
      }).success,
    ).toBe(false)
  })
})

function stream(text: string) {
  const data = new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < data.length; i += 2)
        controller.enqueue(data.slice(i, i + 2))
      controller.close()
    },
  })
}
describe('coach streaming protocol', () => {
  it('decodes chunked UTF-8 and a final event without a newline', async () => {
    const events: unknown[] = []
    await readCoachStream(
      stream('{"type":"text","text":"A♠ is visible"}\n{"type":"done"}'),
      (e) => events.push(e),
    )
    expect(events).toEqual([
      { type: 'text', text: 'A♠ is visible' },
      { type: 'done' },
    ])
  })
  it('does not silently accept an interrupted stream', async () => {
    await expect(
      readCoachStream(stream('{"type":"text","text":"partial"}\n'), () => {}),
    ).rejects.toThrow('interrupted')
  })
  it('rejects malformed tool actions and passes through safe errors', async () => {
    await expect(
      readCoachStream(
        stream('{"type":"demonstration","demonstration":{"kind":"wager"}}\n'),
        () => {},
      ),
    ).rejects.toThrow()
    await expect(
      readCoachStream(
        stream('{"type":"error","text":"Provider unavailable"}\n'),
        () => {},
      ),
    ).rejects.toThrow('Provider unavailable')
  })
})
