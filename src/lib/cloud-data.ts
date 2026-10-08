import { z } from 'zod'
import type { Progress } from './storage'

export const lensSchema = z.enum(['equity', 'options', 'insurance'])
export const settingsSchema = z.object({
  displayName: z.string().max(80).default(''),
  sound: z.boolean().default(false),
  fast: z.boolean().default(false),
})
export const messageSchema = z.object({
  id: z.uuid(),
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1).max(12000),
  snapshotId: z.string().max(1000),
  label: z.string().max(200),
  createdAt: z.iso.datetime(),
})
export const attemptSchema = z.object({
  id: z.uuid(),
  lens: lensSchema,
  stage: z.enum(['prediction', 'transfer']),
  answerId: z.string().min(1).max(80),
  correct: z.boolean(),
  context: z.object({
    title: z.string(),
    question: z.string(),
    pot: z.number(),
    call: z.number(),
  }),
  createdAt: z.iso.datetime(),
})
const progressSchema = z.object({
  hands: z.array(
    z.object({
      id: z.string().min(1).max(120),
      hand: z.number().int().positive(),
      net: z.number().int(),
      result: z.string().max(1000),
      guided: z.boolean(),
    }),
  ),
  lessons: z.array(lensSchema),
})
export const cacheSchema = z.object({
  progress: progressSchema,
  settings: settingsSchema,
  messages: z.array(messageSchema),
  pending: z.object({
    hands: progressSchema.shape.hands,
    lessons: progressSchema.shape.lessons,
    attempts: z.array(attemptSchema),
    messages: z.array(messageSchema),
    settings: settingsSchema.nullable(),
  }),
})
export type Settings = z.infer<typeof settingsSchema>
export type SavedMessage = z.infer<typeof messageSchema>
export type PracticeAttempt = z.infer<typeof attemptSchema>
export type CloudCache = z.infer<typeof cacheSchema>
export const emptyCache = (): CloudCache => ({
  progress: { hands: [], lessons: [] },
  settings: settingsSchema.parse({}),
  messages: [],
  pending: {
    hands: [],
    lessons: [],
    attempts: [],
    messages: [],
    settings: null,
  },
})
export const cacheKey = (userId: string) => `quantpoker.cloud.v1.${userId}`

export function mergeProgress(remote: Progress, pending: Progress): Progress {
  return {
    hands: [
      ...new Map(
        [...remote.hands, ...pending.hands].map((hand) => [hand.id, hand]),
      ).values(),
    ].slice(-100),
    lessons: [...new Set([...remote.lessons, ...pending.lessons])],
  }
}

export function acknowledge(
  current: CloudCache['pending'],
  sent: CloudCache['pending'],
): CloudCache['pending'] {
  const remaining = <T extends { id: string }>(rows: T[], saved: T[]) =>
    rows.filter(
      (row) =>
        !saved.some(
          (item) =>
            item.id === row.id && JSON.stringify(item) === JSON.stringify(row),
        ),
    )
  return {
    hands: remaining(current.hands, sent.hands),
    lessons: current.lessons.filter((lens) => !sent.lessons.includes(lens)),
    attempts: remaining(current.attempts, sent.attempts),
    messages: remaining(current.messages, sent.messages),
    settings:
      JSON.stringify(current.settings) === JSON.stringify(sent.settings)
        ? null
        : current.settings,
  }
}
