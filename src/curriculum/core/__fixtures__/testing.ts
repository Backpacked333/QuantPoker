import type { AttemptSnapshot, CaseRecord, Clock } from '../types'
import type { StoragePort } from '../persistence'
export const fixedClock: Clock = () => new Date('2026-10-07T12:00:00.000Z')
export class MemoryStorage implements StoragePort {
  values = new Map<string, string>()
  failRead = false
  failWrite = false
  failRemove = false
  writes: string[] = []
  removals: string[] = []
  getItem(key: string) {
    if (this.failRead) throw new Error('blocked')
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error('quota')
    this.writes.push(key)
    this.values.set(key, value)
  }
  removeItem(key: string) {
    if (this.failRemove) throw new Error('blocked')
    this.removals.push(key)
    this.values.delete(key)
  }
}
let sequence = 0
export function attemptFor(
  c: CaseRecord,
  changes: Partial<AttemptSnapshot> = {},
): AttemptSnapshot {
  return {
    id: `test-${sequence++}`,
    unitId: c.unitId,
    caseId: c.id,
    contentVersion: c.contentVersion,
    rubricVersion: c.rubricVersion,
    modelVersion: 'foundation-cases-v1',
    mode: c.mode === 'review' ? 'review' : 'transfer',
    createdAt: fixedClock().toISOString(),
    committedAt: fixedClock().toISOString(),
    prediction: {
      actionId: 'decide',
      numericEstimate: 1,
      confidencePercent: null,
      rationale: 'I will use the stated objective.',
    },
    inputs: { caseId: c.id },
    answers: Object.fromEntries(
      c.questions.map((q) => [
        q.id,
        typeof q.expected === 'string' || typeof q.expected === 'number'
          ? q.expected
          : [...q.expected],
      ]),
    ),
    assistance: { hintIds: [], solutionViewed: false },
    phase: 'prediction_committed',
    ...changes,
  }
}
