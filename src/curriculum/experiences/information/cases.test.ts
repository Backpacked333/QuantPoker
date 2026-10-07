import { describe, expect, it } from 'vitest'
import { CurriculumRegistry } from '../../core/registry'
import { validateCase } from '../../core/assessment'
import { authoredScenarios, informationFragments } from './cases'
import { informationManifest } from './manifest'
import { informationModel } from './model'

describe('registered authored information case fragments', () => {
  it('installs all three slots transactionally without duplicate sources or cases', () => {
    const registry = new CurriculumRegistry()
    registry.registerSources(informationManifest.sources)
    for (const fragment of informationFragments)
      registry.installFragment(fragment)
    registry.assertIntegrity()
    expect(informationFragments.map((f) => f.slotId)).toEqual([
      'f03-information',
      'f05-information',
      'f10-information',
    ])
    for (const fragment of informationFragments) {
      expect(fragment.cases.filter((c) => c.mode === 'transfer')).toHaveLength(
        3,
      )
      expect(fragment.cases.filter((c) => c.mode === 'review')).toHaveLength(3)
      for (const c of fragment.cases) {
        expect(validateCase(c)).toEqual([])
        expect(c.id.startsWith(`${fragment.slotId}-`)).toBe(true)
        expect(c.connection).toBe('separate-finance')
        expect(c.sources.every((s) => registry.sources.has(s.sourceId))).toBe(
          true,
        )
        expect(new Set(c.questions.map((q) => q.component)).size).toBe(4)
        expect(
          c.questions.filter((q) => q.critical).length,
        ).toBeGreaterThanOrEqual(2)
        expect(c.questions.length).toBeGreaterThanOrEqual(6)
        for (const q of c.questions) {
          expect(q.hints).toHaveLength(4)
          expect(new Set(q.hints).size).toBe(4)
          expect(q.rationale.length).toBeGreaterThan(20)
        }
      }
    }
    expect(registry.units.get('f03')?.transferCaseIds).toContain(
      'f03-information-transfer-1',
    )
    expect(registry.units.get('f10')?.availability).not.toBe('available')
  })
  it('keeps authored rational-arithmetic answers independent of the implementation', () => {
    expect(authoredScenarios).toHaveLength(18)
    for (const s of authoredScenarios) {
      const result = informationModel(s.inputs)
      if (!result.ok) throw new Error(result.errors[0].message)
      const r = result.value
      expect(r.branches[0].probability).toBeCloseTo(s.positive, 12)
      if (s.posterior === null) expect(r.branches[0].posterior).toBeNull()
      else expect(r.branches[0].posterior).toBeCloseTo(s.posterior, 12)
      if (s.negativePosterior === null)
        expect(r.branches[1].posterior).toBeNull()
      else expect(r.branches[1].posterior).toBeCloseTo(s.negativePosterior, 12)
      expect(r.branches.map((b) => b.action)).toEqual(s.policy)
      expect(r.withoutSignal).toBeCloseTo(s.baseline, 10)
      expect(r.withSignalBeforeFee).toBeCloseTo(s.signalValue, 10)
      expect(r.evsi).toBeCloseTo(s.maxFee, 10)
      expect(r.evpi).toBeCloseTo(s.perfectIncrement, 10)
      expect(r.purchaseNet).toBeCloseTo(s.net, 10)
      expect(r.ledger[1].netProfit).toBeCloseTo(s.positiveFailureNet, 10)
    }
  })
  it('changes multiple numbers for each review instead of recoloring a transfer variant', () => {
    for (const unit of ['f03', 'f05', 'f10'])
      for (const variant of [1, 2, 3]) {
        const transfer = authoredScenarios.find(
          (s) =>
            s.unit === unit && s.mode === 'transfer' && s.variant === variant,
        )!
        const review = authoredScenarios.find(
          (s) =>
            s.unit === unit && s.mode === 'review' && s.variant === variant,
        )!
        expect(
          Object.entries(transfer.inputs).filter(
            ([key, value]) =>
              review.inputs[key as keyof typeof review.inputs] !== value,
          ).length,
        ).toBeGreaterThanOrEqual(3)
        expect(transfer.net).not.toBe(review.net)
      }
  })
})
