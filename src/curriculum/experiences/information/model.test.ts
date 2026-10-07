import { describe, expect, it } from 'vitest'
import {
  decodeInputs,
  decodeResult,
  defaultInputs,
  encodeInputs,
  encodeResult,
  informationModel,
  type InformationInputs,
} from './model'
import { isSafeJson } from '../../core/validation'

function output(changes: Partial<InformationInputs> = {}) {
  const result = informationModel({ ...defaultInputs, ...changes })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.errors[0].message)
  return result.value
}
function enumeration(i: InformationInputs) {
  const probabilities = [
    i.prior * i.sensitivity,
    (1 - i.prior) * (1 - i.specificity),
    i.prior * (1 - i.sensitivity),
    (1 - i.prior) * i.specificity,
  ]
  const payoffs = [i.gain, -i.loss, i.gain, -i.loss]
  return Math.max(
    ...[
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ].map((policy) =>
      probabilities.reduce(
        (value, probability, index) =>
          value +
          probability * (policy[index < 2 ? 0 : 1] ? payoffs[index] : 0),
        0,
      ),
    ),
  )
}
describe('INFO-01 exact signal model', () => {
  it('matches independently computed kit defaults, not model-derived golden answers', () => {
    const r = output()
    expect(r.branches[0].probability).toBeCloseTo(0.38, 12)
    expect(r.branches[0].posterior).toBeCloseTo(12 / 19, 12)
    expect(r.branches[1].posterior).toBeCloseTo(3 / 31, 12)
    expect(r.branches.map((b) => b.action)).toEqual(['take', 'decline'])
    expect(r.withoutSignal).toBeCloseTo(12.5, 12)
    expect(r.withSignalBeforeFee).toBeCloseTo(20.5, 12)
    expect(r.evsi).toBeCloseTo(8, 12)
    expect(r.perfectValue).toBeCloseTo(30, 12)
    expect(r.evpi).toBeCloseTo(17.5, 12)
  })
  it('rejects fee9, accepts fees below8 and labels exact fee8 indifference', () => {
    const r = output({ fee: 9 })
    expect(r.purchaseNet).toBeCloseTo(11.5, 12)
    expect(r.optimalValue).toBeCloseTo(12.5, 12)
    expect(r.purchaseDecision).toBe('do-not-buy')
    expect(output({ fee: 8 }).purchaseDecision).toBe('indifferent')
    expect(output({ fee: 7 }).purchaseDecision).toBe('buy')
  })
  it('charges the fee in every state, including declined and unreachable states', () => {
    const r = output({ fee: 9 })
    expect(r.ledger.map((row) => row.netProfit)).toEqual([91, -34, -9, -9])
    expect(r.ledger.every((row) => row.fee === 9)).toBe(true)
    expect(
      r.ledger.reduce((v, row) => v + row.expectedContribution, 0),
    ).toBeCloseTo(11.5, 12)
    expect(r.branches[1].netContribution).toBeCloseTo(-0.62 * 9, 12)
  })
  it('handles uninformative, perfect, inverted and same-action signals', () => {
    expect(output({ sensitivity: 0.35, specificity: 0.65 }).evsi).toBeCloseTo(
      0,
      12,
    )
    expect(output({ sensitivity: 1, specificity: 1 }).evsi).toBeCloseTo(
      17.5,
      12,
    )
    const inverted = output({ sensitivity: 0, specificity: 0 })
    expect(inverted.branches.map((b) => b.posterior)).toEqual([0, 1])
    expect(inverted.branches.map((b) => b.action)).toEqual(['decline', 'take'])
    expect(inverted.withSignalBeforeFee).toBeCloseTo(30, 12)
    expect(inverted.evsi).toBeCloseTo(17.5, 12)
    const highPrior = output({ prior: 0.9 })
    expect(highPrior.branches.map((b) => b.action)).toEqual(['take', 'take'])
    expect(highPrior.evsi).toBeCloseTo(0, 12)
    expect(highPrior.purchaseDecision).toBe('indifferent')
    for (const prior of [0.73, 0.85, 0.91, 0.97])
      for (const sensitivity of [0.63, 0.73, 0.83])
        for (const specificity of [0.61, 0.71, 0.81]) {
          const r = output({
            prior,
            sensitivity,
            specificity,
            gain: 133,
            loss: 7,
          })
          expect(r.branches.map((b) => b.action)).toEqual(['take', 'take'])
          expect(r.evsi).toBe(0)
          expect(r.purchaseDecision).toBe('indifferent')
        }
  })
  it('labels zero-probability branches unavailable rather than reporting false zero posteriors', () => {
    for (const prior of [0, 1])
      for (const sensitivity of [0, 1])
        for (const specificity of [0, 1]) {
          const r = output({ prior, sensitivity, specificity })
          expect(r.evsi).toBeCloseTo(0, 12)
          expect(r.evpi).toBeCloseTo(0, 12)
          for (const branch of r.branches)
            if (branch.probability === 0) {
              expect(branch).toMatchObject({
                status: 'unreachable',
                posterior: null,
                conditionalTakeProfit: null,
                action: 'unreachable',
                optimalContribution: 0,
              })
            }
        }
    expect(
      output({ sensitivity: 1, specificity: 0 }).branches[1].posterior,
    ).toBeNull()
    expect(
      output({ sensitivity: 0, specificity: 1 }).branches[0].posterior,
    ).toBeNull()
    expect(
      output({ prior: 0.2, sensitivity: 0.5, specificity: 0.5 }).branches.map(
        (b) => b.action,
      ),
    ).toEqual(['indifferent', 'indifferent'])
  })
  it('uses four-policy enumeration and independent identities over the control grid', () => {
    for (const prior of [0, 0.05, 0.3, 0.5, 0.95, 1])
      for (const sensitivity of [0, 0.2, 0.5, 0.8, 1])
        for (const specificity of [0, 0.2, 0.5, 0.8, 1])
          for (const gain of [1, 100, 500])
            for (const loss of [0, 25, 200]) {
              const inputs = {
                ...defaultInputs,
                prior,
                sensitivity,
                specificity,
                gain,
                loss,
                fee: 9,
              }
              const r = output(inputs)
              expect(r.withSignalBeforeFee).toBeCloseTo(enumeration(inputs), 10)
              expect(
                r.branches.reduce((v, b) => v + b.probability, 0),
              ).toBeCloseTo(1, 12)
              expect(
                r.branches.reduce((v, b) => v + b.fixedClaimContribution, 0),
              ).toBeCloseTo(r.fixedClaimExpectedProfit, 10)
              expect(
                r.ledger.reduce((v, row) => v + row.expectedContribution, 0),
              ).toBeCloseTo(r.purchaseNet, 10)
              expect(r.evsi).toBeGreaterThanOrEqual(0)
              expect(r.evsi).toBeLessThanOrEqual(r.evpi + 1e-10)
              expect(r.optimalValue).toBeGreaterThanOrEqual(r.withoutSignal)
              expect(isSafeJson(encodeResult(r))).toBe(true)
              expect(decodeResult(encodeResult(r)).ok).toBe(true)
            }
  })
  it('handles tiny reachable branches without rounded or fabricated zero probability', () => {
    const r = output({ prior: 1e-250, sensitivity: 1, specificity: 1 })
    expect(r.branches[0].probability).toBe(1e-250)
    expect(r.branches[0].posterior).toBe(1)
    expect(r.branches[0].status).toBe('reachable')
  })
  it('strictly rejects invalid inputs, unknown fields and non-finite result summaries', () => {
    for (const field of Object.keys(defaultInputs))
      for (const bad of [NaN, Infinity, -Infinity, '', null, undefined, -1]) {
        expect(informationModel({ ...defaultInputs, [field]: bad }).ok).toBe(
          false,
        )
      }
    for (const field of ['prior', 'sensitivity', 'specificity'])
      expect(informationModel({ ...defaultInputs, [field]: 1.01 }).ok).toBe(
        false,
      )
    for (const [field, invalid] of [
      ['gain', 0],
      ['gain', 501],
      ['loss', 201],
      ['fee', 101],
    ])
      expect(informationModel({ ...defaultInputs, [field]: invalid }).ok).toBe(
        false,
      )
    expect(decodeInputs({ ...defaultInputs, opponentCards: [] }).ok).toBe(false)
    expect(decodeInputs(encodeInputs(defaultInputs)).ok).toBe(true)
    const r = encodeResult(output())
    expect(decodeResult({ ...r, evsi: Infinity }).ok).toBe(false)
    expect(
      decodeResult({
        ...r,
        branches: [
          { ...r.branches[0], probability: 0, posterior: 0.8 },
          r.branches[1],
        ],
      }).ok,
    ).toBe(false)
    expect(decodeResult({ ...r, deck: [] }).ok).toBe(false)
    expect(decodeResult({ ...r, ledger: r.ledger.slice(1) }).ok).toBe(false)
    expect(decodeResult({ ...r, evsi: -1 }).ok).toBe(false)
    expect(decodeResult({ ...r, purchaseNet: 500 }).ok).toBe(false)
    expect(
      decodeResult({
        ...r,
        ledger: r.ledger.map((row) => ({ ...row, fee: 1 })),
      }).ok,
    ).toBe(false)
  })
})
