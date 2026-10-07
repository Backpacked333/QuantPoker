import type { Lens } from './finance'
export type HandRecord = {
  id: string
  hand: number
  net: number
  result: string
  guided: boolean
}
export type Progress = { hands: HandRecord[]; lessons: Lens[] }
export const STORAGE_KEY = 'quantpoker.progress.v1'
export function readProgress(): Progress {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '{}',
    )
    const value =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {}
    const hands = Array.isArray(value.hands)
      ? value.hands
          .filter(
            (h: HandRecord) =>
              h &&
              typeof h.id === 'string' &&
              Number.isInteger(h.hand) &&
              Number.isFinite(h.net) &&
              typeof h.result === 'string' &&
              typeof h.guided === 'boolean',
          )
          .slice(-100)
      : []
    const lessons: Lens[] = Array.isArray(value.lessons)
      ? [
          ...new Set(
            value.lessons.filter((l: Lens) =>
              ['equity', 'options', 'insurance'].includes(l),
            ),
          ),
        ]
      : []
    return { hands, lessons }
  } catch {
    return { hands: [], lessons: [] }
  }
}
export function saveProgress(progress: Progress): boolean {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        hands: progress.hands.slice(-100),
        lessons: progress.lessons,
      }),
    )
    return true
  } catch {
    return false
  }
}
