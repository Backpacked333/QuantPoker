import { describe, expect, it } from 'vitest'
import { evaluateCase, validateCase } from '../../core/assessment'
import { CurriculumRegistry } from '../../core/registry'
import { attemptFor, fixedClock } from '../../core/__fixtures__/testing'
import {
  calibrationCases,
  calibrationFragment,
  calibrationLesson,
} from './cases'
import { sourceRecords } from './sources'
import { calibrationModel } from './model'

describe('CAL-04 F05 authored fragment', () => {
  it('installs real cases transactionally without claiming the missing selection bank shipped', () => {
    const r = new CurriculumRegistry()
    r.registerSources(sourceRecords)
    r.installFragment(calibrationFragment)
    r.assertIntegrity()
    expect(r.units.get('f05')?.availability).toBe('partial')
    expect(calibrationCases).toHaveLength(9)
    expect(calibrationCases.filter((c) => c.mode === 'transfer')).toHaveLength(
      3,
    )
    expect(calibrationCases.filter((c) => c.mode === 'review')).toHaveLength(3)
    expect(new Set(calibrationCases.map((c) => c.id)).size).toBe(9)
    expect(
      calibrationCases.every((c) => c.id.startsWith('f05-calibration-')),
    ).toBe(true)
    expect(calibrationLesson.experiment.experienceId).toBe('calibration')
  })
  it.each(calibrationCases.map((c) => [c.id, c] as const))(
    'validates %s, all rubric components and progressive assistance',
    (_, c) => {
      expect(validateCase(c)).toEqual([])
      expect(new Set(c.questions.map((q) => q.component)).size).toBe(4)
      expect(
        c.questions.filter((q) => q.critical).length,
      ).toBeGreaterThanOrEqual(2)
      expect(c.questions.every((q) => q.hints.length === 4)).toBe(true)
      expect(c.workedSolution.length).toBeGreaterThanOrEqual(4)
      expect(
        c.sources.every(
          (s) => s.verification === 'checked' && s.locator && s.checkedAt,
        ),
      ).toBe(true)
      expect(c.reflectionPrompt).toContain('ungraded')
      const unassisted = evaluateCase(
        c,
        attemptFor(c),
        [],
        [],
        undefined,
        fixedClock,
      )
      expect(unassisted.passed).toBe(true)
      const assisted = evaluateCase(
        c,
        attemptFor(c, {
          assistance: { hintIds: ['setup:1'], solutionViewed: false },
        }),
        [],
        [],
        undefined,
        fixedClock,
      )
      expect(assisted.eligible).toBe(false)
    },
  )
  it('has independently fixed transfer/review numerical answers, with policies unlike the default', () => {
    const vectors = [
      {
        mode: 'transfer',
        id: 1,
        w: 0.7,
        p1: 0.05,
        p2: 0.45,
        gain: 150,
        loss: 100,
        expected: 3.75,
        quantity: 'informationGain',
      },
      {
        mode: 'transfer',
        id: 2,
        w: 0.4,
        p1: 0.8,
        p2: 0.95,
        gain: 40,
        loss: 200,
        expected: 3.2,
        quantity: 'informationGain',
      },
      {
        mode: 'transfer',
        id: 3,
        w: 0.25,
        p1: 0.15,
        p2: 0.35,
        gain: 80,
        loss: 10,
        expected: 0,
        quantity: 'informationGain',
      },
      {
        mode: 'review',
        id: 1,
        w: 0.3,
        p1: 0.55,
        p2: 0.1,
        gain: 90,
        loss: 30,
        expected: 10.8,
        quantity: 'informedPolicyValue',
      },
      {
        mode: 'review',
        id: 2,
        w: 0.5,
        p1: 0.75,
        p2: 0.9,
        gain: 60,
        loss: 180,
        expected: 0.75,
        quantity: 'breakEvenProbability',
      },
      {
        mode: 'review',
        id: 3,
        w: 0.8,
        p1: 0.1,
        p2: 0.3,
        gain: 80,
        loss: 40,
        expected: 0.114,
        quantity: 'informedBrier',
      },
    ] as const
    for (const v of vectors) {
      const c = calibrationCases.find(
        (c) => c.id === `f05-calibration-${v.mode}-${v.id}`,
      )!
      const r = calibrationModel({
        group1Weight: v.w,
        group1Probability: v.p1,
        group2Probability: v.p2,
        gain: v.gain,
        loss: v.loss,
      })
      expect(c.questions.find((q) => q.kind === 'numeric')?.expected).toBe(
        v.expected,
      )
      expect(c.connection).toBe('separate-finance')
      if (!r.ok) throw new Error('Fixture rejected')
      expect(r.value[v.quantity]).toBeCloseTo(v.expected, 10)
      if (v.mode === 'review')
        expect(
          r.value.groups.map((g) => [g.baseline.action, g.informed.action]),
        ).not.toEqual([
          ['continue', 'decline'],
          ['continue', 'continue'],
        ])
    }
  })
  it('keeps Bayes likelihood direction and credibility count answers explicit', () => {
    expect(
      calibrationCases[0].questions.find((q) => q.kind === 'numeric')?.expected,
    ).toBe(4 / 7)
    expect(
      calibrationCases[1].questions.find((q) => q.kind === 'numeric')?.expected,
    ).toBe(0.4)
    expect(calibrationLesson.worked.join(' ')).toContain('4/7')
    expect(calibrationLesson.decisionReversal).toContain('loss5')
  })
})
