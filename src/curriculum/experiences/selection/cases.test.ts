import { describe, expect, it } from 'vitest'
import { evaluateCase, validateCase } from '../../core/assessment'
import { attemptFor, fixedClock } from '../../core/__fixtures__/testing'
import { CurriculumRegistry } from '../../core/registry'
import type { ExperienceEntryProps } from '../../core/types'
import { selectionCases, selectionFragment } from './cases'
import { selectionManifest } from './manifest'
import Entry from './Entry'

describe('selection package and F05 finance evidence contract', () => {
  it('installs six distinct owned cases and its source transactionally without shared edits', () => {
    const registry = new CurriculumRegistry()
    registry.registerSources(selectionManifest.sources)
    registry.installFragment(selectionFragment)
    registry.registerExperience({
      id: selectionManifest.id,
      title: selectionManifest.title,
      version: selectionManifest.version,
      passedGate: true,
      load: async () => ({ default: Entry }),
    })
    registry.assertIntegrity()
    expect(selectionCases.filter((c) => c.mode === 'transfer')).toHaveLength(3)
    expect(selectionCases.filter((c) => c.mode === 'review')).toHaveLength(3)
    expect(new Set(selectionCases.map((c) => c.information.join())).size).toBe(
      6,
    )
    for (const c of selectionCases) {
      expect(c.id).toMatch(/^f05-selection-(transfer|review)-[123]$/)
      expect(validateCase(c)).toEqual([])
      expect(c.connection).toBe('separate-finance')
      expect(new Set(c.questions.map((q) => q.component))).toEqual(
        new Set(['setup', 'calculation', 'interpretation', 'limitation']),
      )
      expect(c.questions.every((q) => q.hints.length === 4)).toBe(true)
      expect(
        c.questions.filter((q) => q.critical).length,
      ).toBeGreaterThanOrEqual(3)
      expect(
        registry.units.get('f05')?.[
          c.mode === 'transfer' ? 'transferCaseIds' : 'reviewCaseIds'
        ],
      ).toContain(c.id)
    }
    expect(registry.units.get('f05')?.availability).toBe('partial')
  })
  it('uses independently calculated case answers and no zero substitute for undefined rates', () => {
    const answers = selectionCases.map(
      (c) => c.questions.find((q) => q.kind === 'numeric')!.expected,
    )
    expect(answers).toEqual([
      (60 / 345) * 100,
      20,
      150,
      (40 / 720) * 100,
      25,
      0,
    ])
    // Null rates are assessed by categorical unavailable items, not a numeric zero answer.
    for (const c of [selectionCases[2], selectionCases[5]]) {
      const interpretation = c.questions.find((q) => q.id === 'interpret')!
      expect(interpretation.kind).toBe('choice')
      if (interpretation.kind === 'choice')
        expect(
          interpretation.options.find((o) => o.id === interpretation.expected)
            ?.label,
        ).toContain('Unavailable')
    }
    expect(selectionCases[0].information.join()).toContain(
      'Rejected applications have no repayment label',
    )
  })
  it('grants structured eligibility only on fresh unaided transfers and not prose/profit/hints', () => {
    const c = selectionCases[0],
      attempt = attemptFor(c)
    const pass = evaluateCase(c, attempt, [], [], undefined, fixedClock)
    expect(pass).toMatchObject({ earned: 100, passed: true, eligible: true })
    expect(
      evaluateCase(
        c,
        { ...attempt, reflection: 'gibberish' },
        [],
        [],
        undefined,
        fixedClock,
      ),
    ).toEqual(pass)
    expect(
      evaluateCase(
        c,
        {
          ...attempt,
          assistance: { hintIds: ['calculate:0'], solutionViewed: false },
        },
        [],
        [],
        undefined,
        fixedClock,
      ),
    ).toMatchObject({ passed: true, eligible: false, unaided: false })
    expect(
      evaluateCase(c, attempt, [], [], undefined, fixedClock, [`${c.id}@1`]),
    ).toMatchObject({ eligible: false })
    const criticalMiss = {
      ...attempt,
      answers: { ...attempt.answers, calculate: 5 },
    }
    expect(
      evaluateCase(c, criticalMiss, [], [], undefined, fixedClock),
    ).toMatchObject({ eligible: false, criticalFailures: ['calculate'] })
    const earlyReview = selectionCases[3]
    expect(
      evaluateCase(
        earlyReview,
        attemptFor(earlyReview),
        [],
        [],
        undefined,
        fixedClock,
      ),
    ).toMatchObject({ passed: true, eligible: false })
  })
  it('exposes exact lazy View and root Entry signatures', async () => {
    const loaded = await selectionManifest.loadView()
    expect(typeof loaded.default).toBe('function')
    const entrySignature: (p: ExperienceEntryProps) => unknown = Entry
    expect(typeof entrySignature).toBe('function')
  })
})
