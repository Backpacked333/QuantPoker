import { describe, expect, it } from 'vitest'
import { atlas, registry } from './registry'
import { evaluateCase, validateCase } from './assessment'
import { independentCases } from '../content/foundationCases/independent'
import {
  unitIds,
  experienceIds,
  type Answer,
  type AttemptSnapshot,
} from './types'
import { fixedClock } from './__fixtures__/testing'
import { isSafeJson } from './validation'

describe('R1 assembled contract', () => {
  it('registers exactly six lazy Entries and complete banks for every foundation', () => {
    registry.assertIntegrity()
    expect([...registry.experiences.keys()]).toEqual(experienceIds)
    for (const id of unitIds) {
      const u = registry.units.get(id)!
      expect(u.availability).toBe('available')
      expect(u.lesson?.retrieval).toBeTruthy()
      expect(u.lesson?.predictionQuestion).toBeTruthy()
      expect(u.lesson?.experiment.question).toBeTruthy()
      expect(
        u.lesson?.experiment.legacyId ?? u.lesson?.experiment.experienceId,
      ).toBeTruthy()
      expect(u.workedCaseIds.length).toBeGreaterThan(0)
      expect(
        u.practiceCaseIds.map((id) => registry.cases.get(id)!.mode),
      ).toContain('partial')
      expect(
        u.practiceCaseIds.map((id) => registry.cases.get(id)!.mode),
      ).toContain('practice')
      expect(u.transferCaseIds.length).toBeGreaterThanOrEqual(3)
      expect(u.reviewCaseIds.length).toBeGreaterThanOrEqual(3)
      expect(u.sources.every((s) => registry.sources.has(s.sourceId))).toBe(
        true,
      )
    }
    expect(atlas.concepts).toHaveLength(96)
    expect(
      atlas.concepts.every(
        (c) => registry.conceptAvailability(c.id, 'research') === 'planned',
      ),
    ).toBe(true)
  })
  it('keeps independent final business banks first and all rubric items explicit, finite and sourced', () => {
    expect(registry.units.get('f10')!.transferCaseIds.slice(0, 3)).toEqual([
      'f10-independent-transfer-a',
      'f10-independent-transfer-b',
      'f10-independent-transfer-c',
    ])
    for (const c of registry.cases.values()) {
      expect(validateCase(c)).toEqual([])
      expect(isSafeJson(c)).toBe(true)
    }
    for (const c of independentCases) {
      expect(c.questions.length).toBeGreaterThanOrEqual(6)
      expect(new Set(c.questions.map((q) => q.component))).toEqual(
        new Set(['setup', 'calculation', 'interpretation', 'limitation']),
      )
      expect(
        c.questions.filter((q) => q.critical).length,
      ).toBeGreaterThanOrEqual(2)
      expect(c.reflectionPrompt).toContain('ungraded')
      expect(c.decisionReversal).toBeTruthy()
      expect(c.questions.every((q) => new Set(q.hints).size === 4)).toBe(true)
    }
  })
  it.each(
    independentCases.filter(
      (c) => c.mode === 'transfer' || c.mode === 'review',
    ),
  )(
    'deterministically grades $id, rejects critical misses, hints and repeat exposures',
    (c) => {
      const answers = Object.fromEntries(
        c.questions.map((q) => [
          q.id,
          Array.isArray(q.expected) ? [...q.expected] : q.expected,
        ]),
      ) as Record<string, Answer>
      const at = fixedClock().toISOString()
      const a: AttemptSnapshot = {
        id: 'attempt',
        unitId: 'f10',
        caseId: c.id,
        contentVersion: 1,
        rubricVersion: 1,
        modelVersion: 'foundation-cases-v1',
        mode: c.mode === 'review' ? 'review' : 'transfer',
        createdAt: at,
        committedAt: at,
        inputs: { caseId: c.id },
        prediction: {
          actionId: c.actions[0],
          confidencePercent: null,
          rationale:
            'Stipulated physical probabilities, allowed actions and funding.',
        },
        answers,
        assistance: { hintIds: [], solutionViewed: false },
        phase: 'prediction_committed',
      }
      const schedule = {
        dueAt: at,
        lastPassAt: at,
        streak: 0,
        passedVariants: [],
        firstDemonstrationAt: at,
      }
      expect(evaluateCase(c, a, [], [], schedule, fixedClock).eligible).toBe(
        true,
      )
      const critical = c.questions.find((q) => q.critical)!
      expect(
        evaluateCase(
          c,
          { ...a, answers: { ...answers, [critical.id]: 'invalid' } },
          [],
          [],
          schedule,
          fixedClock,
        ).eligible,
      ).toBe(false)
      expect(
        evaluateCase(
          c,
          { ...a, assistance: { hintIds: ['first'], solutionViewed: false } },
          [],
          [],
          schedule,
          fixedClock,
        ).eligible,
      ).toBe(false)
      expect(
        evaluateCase(c, a, [], [], schedule, fixedClock, [`${c.id}@1`])
          .eligible,
      ).toBe(false)
      expect(
        evaluateCase(
          c,
          { ...a, reflection: 'I earned a million therefore I am correct.' },
          [],
          [],
          schedule,
          fixedClock,
        ).earned,
      ).toBe(evaluateCase(c, a, [], [], schedule, fixedClock).earned)
    },
  )
})

describe('independently enumerated F10 arithmetic', () => {
  const expected: Record<string, Record<string, number>> = {
    'transfer-a': {
      baseline: 30,
      positive: 0.42,
      contingent: 32.4,
      'research-net': 28.4,
      'insured-ev': 29,
      'insured-floor': 20,
    },
    'review-a': {
      baseline: 30,
      positive: 0.45,
      contingent: 40.5,
      'research-net': 37.5,
      'insured-ev': 33,
      'insured-floor': 24,
    },
    'transfer-b': {
      baseline: 13,
      positive: 0.4775,
      contingent: 32.825,
      'signal-net': 24.825,
      'protected-ev': 10,
      'signal-floor': 8,
      'protected-floor': 20,
    },
    'review-b': {
      baseline: 8,
      positive: 0.38,
      contingent: 23.2,
      'signal-net': 18.2,
      'protected-ev': 10,
      'signal-floor': 20,
      'protected-floor': 33,
    },
    'transfer-c': {
      payment: 100,
      funds: 400,
      expected: 200,
      margin: 80,
      threshold: 5,
      default: 0.1,
      unpaid: 1600,
      actual: 20,
      retained: 50,
      'actual-retained': 130,
      capital: 1720,
      additional: 1600,
    },
    'review-c': {
      payment: 60,
      funds: 720,
      expected: 180,
      margin: 36,
      threshold: 13,
      default: 0,
      unpaid: 0,
      actual: 60,
      retained: 60,
      'actual-retained': 60,
      capital: 504,
      additional: 0,
    },
  }
  it.each(Object.entries(expected))(
    'preserves authored golden values for %s (not model outputs)',
    (id, values) => {
      const c = independentCases.find((c) => c.id === `f10-independent-${id}`)!
      for (const [key, value] of Object.entries(values))
        expect(c.questions.find((q) => q.id === key)!.expected).toBeCloseTo(
          value,
          10,
        )
    },
  )
  it('enumerates every permitted signal policy without using any specialist implementation', () => {
    const jobs = [
      { p: 0.4, s: 0.75, t: 0.8, g: 120, l: 30, h: 4, best: 28.4 },
      { p: 0.4, s: 0.9, t: 0.85, g: 120, l: 30, h: 3, best: 37.5 },
      { p: 0.35, s: 0.9, t: 0.75, g: 130, l: 50, h: 8, best: 24.825 },
      { p: 0.3, s: 0.8, t: 0.8, g: 120, l: 40, h: 5, best: 18.2 },
    ]
    for (const j of jobs) {
      const policies = [0, 1, 2, 3].map(
        (mask) =>
          (mask & 1 ? j.p * j.s * j.g - (1 - j.p) * (1 - j.t) * j.l : 0) +
          (mask & 2 ? j.p * (1 - j.s) * j.g - (1 - j.p) * j.t * j.l : 0) -
          j.h,
      )
      expect(Math.max(...policies)).toBeCloseTo(j.best, 10)
      expect(policies.indexOf(Math.max(...policies))).toBe(1)
    }
  })
  it('independently enumerates warranty promises, funding and strict equality states', () => {
    const choose = (n: number, k: number) => {
      let v = 1
      for (let i = 1; i <= k; i++) v = (v * (n - i + 1)) / i
      return v
    }
    let fail = 0,
      mean = 0
    for (let x = 0; x <= 20; x++) {
      const w = choose(20, x) * 0.1 ** x * 0.9 ** (20 - x)
      mean += w * x * 100
      if (x * 100 > 400) fail += w
    }
    expect(mean).toBeCloseTo(200, 10)
    expect(fail).toBeCloseTo(0.0431744952844634, 12)
    expect(4 * 100 > 400).toBe(false)
    expect(20 * 100 - 400).toBe(1600)
    expect(12 * 60 > 720).toBe(false)
  })
})
