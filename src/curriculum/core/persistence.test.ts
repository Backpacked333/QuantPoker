import { describe, expect, it } from 'vitest'
import {
  compactStore,
  decodeAttempt,
  decodeStore,
  emptyStore,
  exportLearning,
  LEARNING_KEY,
  LEARNING_V1_KEY,
  LIMITS,
  loadLearning,
  serializedBytes,
} from './persistence'
import { LearningSession } from './session'
import { legacyIds } from './types'
import { attemptFor, fixedClock, MemoryStorage } from './__fixtures__/testing'
import { baseCases } from '../content/foundationCases/baseBanks'
import { evaluateCase } from './assessment'

describe('v2 migration and non-destructive recovery', () => {
  it('migrates all eight known legacy records without inventing timestamps or evidence', () => {
    const port = new MemoryStorage()
    const raw = JSON.stringify({
      version: 1,
      completed: [...legacyIds],
      notes: Object.fromEntries(legacyIds.map((id) => [id, `note ${id}`])),
    })
    port.setItem(LEARNING_V1_KEY, raw)
    port.setItem('quantpoker.progress.v1', 'table sentinel')
    const first = loadLearning(port, fixedClock)
    expect(first.available).toBe(true)
    expect(first.store.legacy.completed).toEqual(legacyIds)
    expect(first.store.legacy.notes.risk).toBe('note risk')
    expect(first.store.migration).toEqual({
      fromV1: true,
      migratedAt: fixedClock().toISOString(),
    })
    expect(first.store.attempts).toEqual([])
    expect(first.store.receipts).toEqual([])
    expect(first.store.reviewSchedule).toEqual({})
    expect(port.getItem(LEARNING_V1_KEY)).toBe(raw)
    expect(port.getItem('quantpoker.progress.v1')).toBe('table sentinel')
    port.setItem(
      LEARNING_V1_KEY,
      JSON.stringify({ version: 1, completed: [], notes: {} }),
    )
    expect(loadLearning(port, fixedClock).store).toEqual(first.store)
  })
  it.each(['garbage', 'null', '{"version":99}', '{"version":2}'])(
    'preserves unsupported/corrupt v2 raw %s',
    (raw) => {
      const port = new MemoryStorage()
      port.setItem(LEARNING_KEY, raw)
      const session = new LearningSession(port, fixedClock)
      expect(session.recovery).toBe(true)
      expect(session.raw).toBe(raw)
      session.update((store) => ({ ...store, unitNotes: { f01: 'temporary' } }))
      expect(session.store.unitNotes.f01).toBe('temporary')
      expect(port.getItem(LEARNING_KEY)).toBe(raw)
      expect(session.export('json')).toContain('temporary')
    },
  )
  it('salvages known v1 records visibly without overwriting damaged data', () => {
    const port = new MemoryStorage(),
      raw = JSON.stringify({
        version: 1,
        completed: ['odds', 'odds', 'unknown'],
        notes: { odds: 'valid', outs: 7 },
      })
    port.setItem(LEARNING_V1_KEY, raw)
    const loaded = loadLearning(port, fixedClock)
    expect(loaded.recovery).toBe(true)
    expect(loaded.notice).toMatch(/salvaged/)
    expect(loaded.store.legacy).toEqual({
      completed: ['odds'],
      notes: { odds: 'valid' },
    })
    expect(port.getItem(LEARNING_KEY)).toBeNull()
    expect(port.getItem(LEARNING_V1_KEY)).toBe(raw)
  })
  it('retains root-session work when reads/writes or quota fail', () => {
    for (const failure of ['failRead', 'failWrite'] as const) {
      const port = new MemoryStorage()
      port[failure] = true
      const root = { current: new LearningSession(port, fixedClock) }
      root.current.update((store) => ({
        ...store,
        unitNotes: { f03: 'unsaved work' },
      }))
      expect(root.current.available).toBe(false)
      expect(root.current.store.unitNotes.f03).toBe('unsaved work')
      expect(root.current.notice).toMatch(/This session only/)
      expect(root.current.export('markdown')).toContain('unsaved work')
    }
    const port = new MemoryStorage(),
      s = new LearningSession(port, fixedClock)
    port.failWrite = true
    s.update((store) => ({ ...store, unitNotes: { f02: 'quota-failed' } }))
    expect(s.store.unitNotes.f02).toBe('quota-failed')
  })
  it('resets durably before removing learning v1 and never touches table v1', () => {
    const port = new MemoryStorage()
    port.setItem(
      LEARNING_V1_KEY,
      JSON.stringify({
        version: 1,
        completed: ['risk'],
        notes: { risk: 'old' },
      }),
    )
    port.setItem('quantpoker.progress.v1', 'table')
    const session = new LearningSession(port, fixedClock)
    expect(session.reset()).toBe(true)
    expect(port.getItem(LEARNING_V1_KEY)).toBeNull()
    expect(port.getItem('quantpoker.progress.v1')).toBe('table')
    expect(loadLearning(port, fixedClock).store.legacy).toEqual({
      completed: [],
      notes: {},
    })
    expect(port.removals).toEqual([LEARNING_V1_KEY])
  })
  it('reports session-only reset on blocked write without deleting the old saved data', () => {
    const port = new MemoryStorage()
    port.setItem(
      LEARNING_V1_KEY,
      JSON.stringify({ version: 1, completed: ['odds'], notes: {} }),
    )
    const s = new LearningSession(port, fixedClock),
      old = port.getItem(LEARNING_KEY)
    port.failWrite = true
    expect(s.reset()).toBe(false)
    expect(s.notice).toMatch(/Session-only reset/)
    expect(s.store.legacy.completed).toEqual([])
    expect(port.getItem(LEARNING_KEY)).toBe(old)
    expect(port.removals).toEqual([])
  })
  it('keeps v2 authoritative if removing the retired learning v1 fails', () => {
    const port = new MemoryStorage()
    port.setItem(
      LEARNING_V1_KEY,
      JSON.stringify({ version: 1, completed: ['odds'], notes: {} }),
    )
    const s = new LearningSession(port, fixedClock)
    port.failRemove = true
    expect(s.reset()).toBe(true)
    expect(loadLearning(port, fixedClock).store.legacy.completed).toEqual([])
  })
  it('detects same-revision competing tabs and never silently overwrites local work', () => {
    const port = new MemoryStorage(),
      a = new LearningSession(port, fixedClock),
      b = new LearningSession(port, fixedClock)
    a.update((store) => ({ ...store, unitNotes: { f01: 'first tab' } }))
    b.update((store) => ({ ...store, unitNotes: { f02: 'second tab' } }))
    expect(b.conflict).toBe(true)
    expect(b.store.unitNotes.f02).toBe('second tab')
    expect(JSON.parse(port.getItem(LEARNING_KEY)!).unitNotes).toEqual({
      f01: 'first tab',
    })
    b.observeStorage(LEARNING_KEY, port.getItem(LEARNING_KEY))
    expect(b.export('json')).toContain('second tab')
    b.reloadSaved()
    expect(b.conflict).toBe(false)
    expect(b.store.unitNotes).toEqual({ f01: 'first tab' })
    a.observeStorage('quantpoker.progress.v1', 'irrelevant')
    expect(a.conflict).toBe(false)
    a.observeStorage(null, null)
    expect(a.conflict).toBe(true)
  })
})
describe('strict finite decoding, exports and compaction', () => {
  it('round-trips valid snapshots and rejects nested malformed/unsafe fields', () => {
    const c = baseCases.find((c) => c.mode === 'transfer')!,
      a = attemptFor(c)
    expect(decodeAttempt(a).ok).toBe(true)
    for (const bad of [
      { ...a, seed: -1 },
      { ...a, assistance: { hintIds: 'x', solutionViewed: false } },
      { ...a, inputs: { futureDeck: [] } },
      { ...a, prediction: { confidencePercent: Infinity, rationale: 'x' } },
      { ...a, createdAt: 'bad' },
      { ...a, answers: { q: { wrong: true } } },
    ])
      expect(decodeAttempt(bad).ok).toBe(false)
    const store = emptyStore(fixedClock)
    store.attempts = [a]
    expect(decodeStore(store).ok).toBe(true)
    expect(decodeStore({ ...store, unitNotes: { wrong: 'x' } }).ok).toBe(false)
    expect(
      decodeStore({ ...store, reviewSchedule: { f01: { dueAt: 'bad' } } }).ok,
    ).toBe(false)
    expect(
      decodeStore({
        ...store,
        drafts: { bad: { attempt: a, protocol: { opponentCards: [] } } },
      }).ok,
    ).toBe(false)
  })
  it('exports complete prediction, notes, input/version/seed/result/search metadata and literal prose safely', () => {
    const store = emptyStore(fixedClock),
      c = baseCases.find((c) => c.mode === 'transfer')!
    const a = attemptFor(c, {
      seed: 42,
      generatorVersion: 'qp-rng-v1',
      reflection: '<script>alert(1)</script>',
      resultSummary: { expected: 12.5 },
      searchSummary: { totalSearchCount: 9, holdoutCount: 1 },
    })
    store.attempts = [a]
    store.unitNotes.f01 = 'A retained defense'
    store.legacy.notes.odds = 'old note'
    store.drafts.active = { attempt: a, protocol: { frozen: true } }
    const data = JSON.parse(exportLearning(store, 'json'))
    expect(decodeStore(data).ok).toBe(true)
    expect(data.attempts[0].prediction).toEqual(a.prediction)
    expect(data.drafts.active.protocol.frozen).toBe(true)
    const markdown = exportLearning(store, 'markdown')
    for (const token of [
      '42',
      'qp-rng-v1',
      'totalSearchCount',
      'A retained defense',
      'old note',
      '12.5',
      'Active draft',
    ])
      expect(markdown).toContain(token)
    expect(markdown).not.toContain('<script>')
    expect(markdown).toContain('&lt;script&gt;')
    expect(() =>
      exportLearning(
        { ...store, attempts: [{ ...a, inputs: { opponentCards: [] } }] },
        'json',
      ),
    ).toThrow('Invalid export')
  })
  it('compacts archived details to bounded data while retaining first/recent receipts, exposure history, active drafts and research counts', () => {
    const c = baseCases.find((c) => c.mode === 'transfer')!,
      store = emptyStore(fixedClock)
    const session = new LearningSession(null, fixedClock)
    for (let i = 0; i < 25; i++) {
      const a = attemptFor(c, {
        id: `evidence-${i}`,
        submittedAt: fixedClock().toISOString(),
        phase: 'archived',
      })
      a.evaluation = evaluateCase(c, a, [], [], undefined, fixedClock)
      session.recordAttempt(a)
    }
    store.receipts = session.store.receipts
    store.exposedVariants = session.store.exposedVariants
    const huge = Array.from({ length: 210 }, (_, i) =>
      attemptFor(c, {
        id: `detail-${i}`,
        phase: 'archived',
        resultSummary: { blob: 'x'.repeat(9500) },
        searchSummary: { totalSearchCount: 1 },
      }),
    )
    const active = attemptFor(c, { id: 'active' })
    store.attempts = [...huge, active]
    store.drafts.active = {
      attempt: active,
      protocol: { candidateHistoryCount: 210 },
    }
    const next = compactStore(store)
    expect(next.attempts.length).toBeLessThanOrEqual(LIMITS.attempts)
    expect(serializedBytes(next)).toBeLessThanOrEqual(LIMITS.bytes)
    expect(next.receipts.some((r) => r.firstDemonstration)).toBe(true)
    expect(next.receipts.some((r) => r.attemptId === 'evidence-24')).toBe(true)
    expect(next.exposedVariants).toEqual(store.exposedVariants)
    expect(next.drafts.active).toEqual(store.drafts.active)
    expect(next.attempts.some((a) => a.id === 'active')).toBe(true)
    expect(
      next.attempts.reduce(
        (n, a) =>
          n +
          Number(a.searchSummary?.totalSearchCount ?? 0) +
          Number(a.searchSummary?.compactedSearches ?? 0),
        0,
      ),
    ).toBe(210)
    expect(decodeStore(next).ok).toBe(true)
  })
  it('blocks oversized durable envelopes without overwriting the last good save', () => {
    const port = new MemoryStorage(),
      session = new LearningSession(port, fixedClock),
      old = port.getItem(LEARNING_KEY)
    session.update((store) => ({
      ...store,
      drafts: Object.fromEntries(
        Array.from({ length: 21 }, (_, i) => [
          `draft${i}`,
          { attempt: attemptFor(baseCases[0]), protocol: {} },
        ]),
      ),
    }))
    expect(session.available).toBe(false)
    expect(session.notice).toMatch(/limit reached/)
    expect(port.getItem(LEARNING_KEY)).toBe(old)
    const exported = JSON.parse(session.export('json'))
    expect(exported.schema).toBe('quantpoker.learning.export.v1')
    expect(exported.parts).toHaveLength(2)
    expect(
      exported.parts.reduce(
        (n: number, p: ReturnType<typeof emptyStore>) =>
          n + Object.keys(p.drafts).length,
        0,
      ),
    ).toBe(21)
    expect(
      exported.parts.every(
        (p: ReturnType<typeof emptyStore>) =>
          decodeStore(p).ok &&
          serializedBytes(p) <= LIMITS.bytes &&
          Object.keys(p.drafts).length <= LIMITS.drafts,
      ),
    ).toBe(true)
  })
})
