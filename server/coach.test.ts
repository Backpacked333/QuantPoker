import { describe, expect, it, vi } from 'vitest'
import { generateCoachEvents } from './coach'
import { visibleCoachState } from '../src/lib/coach'
import type { CoachSnapshot } from '../src/lib/coach'
import { guidedHand, legalActions } from '../src/lib/poker'

type Configuration = {
  tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>
  prepareStep: (input: { stepNumber: number }) => { toolChoice?: string }
}
const captured = vi.hoisted(() => ({
  configuration: undefined as Configuration | undefined,
}))
vi.mock('ai', () => ({
  ToolLoopAgent: class {
    constructor(configuration: Configuration) {
      captured.configuration = configuration
    }
  },
  stepCountIs: () => () => false,
  tool: (definition: unknown) => definition,
}))
async function configuration(changes: Partial<CoachSnapshot> = {}) {
  const game = guidedHand(),
    legal = legalActions(game)
  const snapshot: CoachSnapshot = {
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
    nextCardVolatility: 0.1,
    lens: 'equity',
    chart: 'payoff',
    lesson: 'price',
    probe: null,
    ...changes,
  }
  const events = generateCoachEvents(
    { snapshot, messages: [{ role: 'user', content: 'Explain' }] },
    new AbortController().signal,
  )
  await events.next()
  await events.return(undefined)
  return captured.configuration!
}
describe('bounded deterministic coach tools (no provider calls)', () => {
  it('returns the actual next-card button and recalculated facts together', async () => {
    const { tools } = await configuration()
    const result = await tools.simulate_next_card.execute({
      card: { rank: 10, suit: 's' },
    })
    expect(result).toMatchObject({
      hypothetical: true,
      trials: 2000,
      equity: 1,
      offeredButton: 'What if 10♠ arrives?',
      demonstration: {
        kind: 'next-card',
        card: { rank: 10, suit: 's' },
        probabilities: { win: 1, tie: 0, loss: 0 },
      },
      hypotheticalFacts: { equity: 1, selectedEV: 160 },
    })
  })
  it('rejects visible cards and caps even invalid simulation attempts', async () => {
    const { tools } = await configuration()
    const attempt = () =>
      tools.simulate_next_card.execute({ card: { rank: 14, suit: 's' } })
    expect(await attempt()).toMatchObject({
      error: expect.stringMatching(/visible/),
    })
    await attempt()
    expect(await attempt()).toMatchObject({
      error: expect.stringMatching(/At most two/),
    })
  })
  it('does not simulate an impossible single preflop or post-river card', async () => {
    for (const board of [
      [],
      [
        ...guidedHand().board,
        { rank: 2, suit: 'c' as const },
        { rank: 3, suit: 'h' as const },
      ],
    ]) {
      const { tools } = await configuration({ board })
      expect(
        await tools.simulate_next_card.execute({
          card: { rank: 10, suit: 's' },
        }),
      ).toMatchObject({ error: expect.stringMatching(/flop or turn/) })
    }
  })
  it('rejects an unavailable raise and computes the graph point with canonical math', async () => {
    const { tools } = await configuration({ canRaise: false })
    expect(
      await tools.demonstrate.execute({ lens: 'equity', action: 'raise' }),
    ).toMatchObject({ error: expect.any(String) })
    expect(
      await tools.inspect_graph.execute({
        lens: 'equity',
        point: { x: 0.2, z: 0.25 },
      }),
    ).toMatchObject({ chips: 0 })
  })
  it('reserves the final model step for an explanation instead of another tool', async () => {
    const { prepareStep } = await configuration()
    expect(prepareStep({ stepNumber: 0 })).toEqual({})
    expect(prepareStep({ stepNumber: 2 })).toEqual({ toolChoice: 'none' })
  })
})
