import { describe, expect, it } from 'vitest'
import { CurriculumRegistry } from '../../core/registry'
import { evaluateCase, validateCase } from '../../core/assessment'
import { attemptFor, fixedClock } from '../../core/__fixtures__/testing'
import { contractFragments } from './cases'
import { contractManifest } from './manifest'

describe('contracts authored fragments', () => {
  it('installs the actual manifest fragments transactionally against the frozen registry', () => {
    const registry = new CurriculumRegistry()
    registry.registerSources(contractManifest.sources)
    contractManifest.cases.forEach((f) => registry.installFragment(f))
    registry.assertIntegrity()
    expect(registry.units.get('f08')?.availability).toBe('available')
    for (const fragment of contractFragments) {
      expect(fragment.cases.filter((c) => c.mode === 'transfer')).toHaveLength(
        3,
      )
      expect(fragment.cases.filter((c) => c.mode === 'review')).toHaveLength(3)
      expect(
        fragment.cases.every((c) => c.id.startsWith(`${fragment.slotId}-`)),
      ).toBe(true)
      for (const c of fragment.cases) {
        expect(validateCase(c)).toEqual([])
        expect(new Set(c.questions.map((q) => q.component)).size).toBe(4)
        expect(c.questions.every((q) => q.hints.length === 4)).toBe(true)
        const attempt = attemptFor(c)
        const evaluation = evaluateCase(
          c,
          attempt,
          [],
          [],
          undefined,
          fixedClock,
        )
        expect(evaluation.passed).toBe(true)
        expect(evaluation.criticalFailures).toEqual([])
      }
    }
  })
  it('authors distinct transfer and changed-number review mechanics with independent ledger expectations', () => {
    const cases = contractFragments.flatMap((f) => f.cases)
    const question = (id: string, q: string) =>
      cases.find((c) => c.id === id)!.questions.find((x) => x.id === q)!
        .expected
    expect(question('f08-contracts-transfer-1', 'payment')).toBe(80)
    expect(question('f08-contracts-transfer-1', 'cost')).toBe(156)
    expect(question('f08-contracts-transfer-1', 'retained')).toBe(140)
    expect(question('f08-contracts-review-1', 'payment')).toBe(130)
    expect(question('f08-contracts-review-1', 'expectation')).toBe(47)
    expect(question('f08-contracts-transfer-2', 'profit')).toBe(-13)
    expect(question('f08-contracts-transfer-2', 'retained')).toBe(10)
    expect(question('f08-contracts-transfer-2', 'cost')).toBe(13)
    expect(question('f08-contracts-review-2', 'profit')).toBe(-26)
    expect(question('f08-contracts-transfer-3', 'per')).toBe(0)
    expect(question('f08-contracts-transfer-3', 'aggregate')).toBe(60)
    expect(question('f08-contracts-transfer-3', 'retained')).toBe(100)
    expect(question('f08-contracts-review-3', 'per')).toBe(90)
    expect(question('f08-contracts-review-3', 'aggregate')).toBe(50)
    expect(question('f09-contracts-transfer-1', 'cashout')).toBe(72)
    expect(question('f09-contracts-transfer-1', 'protected')).toBe(95)
    expect(question('f09-contracts-review-1', 'cashout')).toBe(91)
    expect(question('f09-contracts-review-1', 'protected')).toBe(92)
    expect(question('f09-contracts-transfer-2', 'cost')).toBe(104)
    expect(question('f09-contracts-review-2', 'cost')).toBe(93)
    expect(question('f09-contracts-transfer-3', 'net')).toBe(2)
    expect(question('f09-contracts-review-3', 'net')).toBe(-4)
  })
  it('does not place worked loss distribution contributions in pre-outcome case information', () => {
    for (const c of contractFragments[0].cases.filter(
      (c) => c.mode === 'transfer' || c.mode === 'review',
    ))
      expect(c.information.join(' ')).not.toContain('payment contributions')
  })
})
