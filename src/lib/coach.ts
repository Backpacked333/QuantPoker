import { z } from 'zod'
import { decisionBreakEven, decisionEV, liveSurfaceValue } from './finance.js'
import type { DecisionModel, SurfaceScenario } from './finance.js'
import { cardKey } from './poker.js'
import type { Game } from './poker.js'

export const cardSchema = z
  .object({
    rank: z.number().int().min(2).max(14),
    suit: z.enum(['s', 'h', 'd', 'c']),
  })
  .strict()
const probability = z.number().min(0).max(1)
const chips = z.number().int().min(0).max(1000000)
export const probabilitiesSchema = z
  .object({ win: probability, tie: probability, loss: probability })
  .strict()
  .refine(
    (p) => Math.abs(p.win + p.tie + p.loss - 1) < 0.00001,
    'Probabilities must sum to one',
  )
export const lensSchema = z.enum(['equity', 'options', 'insurance'])
export const probeSchema = z.object({ x: probability, z: probability }).strict()
export const snapshotSchema = z
  .object({
    id: z.string().min(1).max(240),
    hand: z.number().int().positive(),
    mode: z.enum(['live', 'review']),
    hero: z.array(cardSchema).length(2),
    board: z.array(cardSchema).max(5),
    pot: chips,
    heroStack: chips,
    heroBet: chips,
    opponentBet: chips,
    callCost: chips,
    minRaiseTo: chips,
    maxRaiseTo: chips,
    canRaise: z.boolean(),
    raiseTo: chips,
    action: z.enum(['fold', 'continue', 'raise']),
    foldProbability: probability,
    coverageFraction: probability,
    probabilities: probabilitiesSchema,
    hypotheticalCard: cardSchema.nullable(),
    nextCardVolatility: probability.nullable(),
    lens: lensSchema,
    chart: z.enum(['payoff', 'terrain']),
    lesson: z.enum(['price', 'outcomes', 'markets']),
    probe: probeSchema.nullable(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const visible = [
      ...s.hero,
      ...s.board,
      ...(s.hypotheticalCard ? [s.hypotheticalCard] : []),
    ]
    if (new Set(visible.map(cardKey)).size !== visible.length)
      ctx.addIssue({ code: 'custom', message: 'Cards must be distinct' })
    if (![0, 3, 4, 5].includes(s.board.length))
      ctx.addIssue({ code: 'custom', message: 'Invalid public board' })
    if (s.hypotheticalCard && ![3, 4].includes(s.board.length))
      ctx.addIssue({
        code: 'custom',
        message: 'Next-card scenarios require a flop or turn',
      })
    if (
      s.callCost !==
      Math.min(s.heroStack, Math.max(0, s.opponentBet - s.heroBet))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Call price does not match visible bets',
      })
    if (
      s.canRaise &&
      (s.minRaiseTo > s.maxRaiseTo ||
        s.raiseTo < s.minRaiseTo ||
        s.raiseTo > s.maxRaiseTo ||
        s.raiseTo - s.heroBet > s.heroStack)
    )
      ctx.addIssue({ code: 'custom', message: 'Raise outside legal bounds' })
    if (s.action === 'raise' && !s.canRaise)
      ctx.addIssue({ code: 'custom', message: 'Raise unavailable' })
  })
export type CoachSnapshot = z.infer<typeof snapshotSchema>

export function visibleCoachState(game: Game) {
  return {
    hand: game.id,
    hero: game.cards[0].map(({ rank, suit }) => ({ rank, suit })),
    board: game.board.map(({ rank, suit }) => ({ rank, suit })),
    heroStack: game.stacks[0],
    heroBet: game.bets[0],
    opponentBet: game.bets[1],
  }
}

export const demonstrationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lens'), lens: lensSchema }).strict(),
  z
    .object({ kind: z.literal('probe'), lens: lensSchema, point: probeSchema })
    .strict(),
  z
    .object({
      kind: z.literal('decision'),
      action: z.enum(['fold', 'continue', 'raise']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('next-card'),
      card: cardSchema,
      probabilities: probabilitiesSchema,
    })
    .strict(),
])
export type Demonstration = z.infer<typeof demonstrationSchema>
export const coachRequestSchema = z
  .object({
    snapshot: snapshotSchema,
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(2400),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine(
    (r) => r.messages.at(-1)?.role === 'user',
    'A user question is required',
  )
export type CoachRequest = z.infer<typeof coachRequestSchema>
export const coachEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('status'), text: z.string() }),
  z.object({
    type: z.literal('demonstration'),
    title: z.string(),
    demonstration: demonstrationSchema,
    snapshotId: z.string(),
  }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), text: z.string() }),
])
export type CoachEvent = z.infer<typeof coachEventSchema>

export function snapshotModel(
  s: CoachSnapshot,
  action = s.action,
): DecisionModel {
  return {
    action,
    pot: s.pot,
    risk:
      action === 'fold'
        ? 0
        : action === 'raise'
          ? s.raiseTo - s.heroBet
          : s.callCost,
    opponentCall:
      action === 'raise' ? Math.max(0, s.raiseTo - s.opponentBet) : 0,
    foldProbability: action === 'raise' ? s.foldProbability : 0,
  }
}
export function snapshotScenario(s: CoachSnapshot): SurfaceScenario {
  return {
    ...snapshotModel(s),
    equity: s.probabilities.win + s.probabilities.tie / 2,
    lossProbability:
      s.probabilities.loss *
      (s.action === 'raise'
        ? 1 - s.foldProbability
        : s.action === 'fold'
          ? 0
          : 1),
    coverageFraction: s.coverageFraction,
  }
}
export function snapshotFacts(s: CoachSnapshot) {
  const scenario = snapshotScenario(s)
  return {
    equity: scenario.equity,
    selectedEV: decisionEV(scenario, scenario.equity),
    breakEvenEquity: decisionBreakEven(scenario),
    hasBreakEvenCrossing:
      Math.abs(decisionEV(scenario, decisionBreakEven(scenario))) < 0.000001,
    actions: (
      ['fold', 'continue', ...(s.canRaise ? ['raise' as const] : [])] as const
    ).map((action) => ({
      action,
      ev: decisionEV(snapshotModel(s, action), scenario.equity),
    })),
    premium:
      scenario.lossProbability * scenario.risk * scenario.coverageFraction,
    inspectedPoint: s.probe
      ? {
          ...s.probe,
          chips:
            liveSurfaceValue(s.lens, s.probe.x, s.probe.z, scenario) *
            (s.lens === 'insurance' ? scenario.risk : s.pot),
        }
      : null,
  }
}
