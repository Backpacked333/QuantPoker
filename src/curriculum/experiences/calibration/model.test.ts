import { describe, expect, it } from 'vitest'
import { isSafeJson } from '../../core/validation'
import {
  bayesModel,
  betaModel,
  calibrationModel,
  decodeInputs,
  decodeResult,
  defaultInputs,
  encodeResult,
  type CalibrationInputs,
} from './model'

function result(inputs: CalibrationInputs = { ...defaultInputs }) {
  const r = calibrationModel(inputs)
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '))
  return r.value
}
describe('CAL-01 independently authored exact benchmarks', () => {
  it('matches the untouched kit calibration-default vector, not its own forecast as truth', () => {
    const r = result()
    expect(r.populationProbability).toBeCloseTo(0.35, 12)
    expect(r.breakEvenProbability).toBe(0.2)
    expect(r.baselineBrier).toBeCloseTo(0.2275, 12)
    expect(r.informedBrier).toBeCloseTo(0.165, 12)
    expect(r.groups.map((g) => g.trueActionEV)).toEqual([-12.5, 50])
    expect(r.groups.map((g) => g.baseline.action)).toEqual([
      'continue',
      'continue',
    ])
    expect(r.groups.map((g) => g.informed.action)).toEqual([
      'decline',
      'continue',
    ])
    expect(r.groups.map((g) => g.baseline.truePolicyContribution)).toEqual([
      -6.25, 25,
    ])
    expect(r.baselinePolicyValue).toBe(18.75)
    expect(r.informedPolicyValue).toBe(25)
    expect(r.informationGain).toBe(6.25)
    expect(r.resolutionGain).toBeCloseTo(0.0625, 12)
  })
  it('matches kit calibration-equal and collapses the extra label', () => {
    const r = result({
      ...defaultInputs,
      group1Probability: 0.3,
      group2Probability: 0.3,
    })
    expect(r.baselineBrier).toBeCloseTo(0.21, 12)
    expect(r.informedBrier).toBeCloseTo(0.21, 12)
    expect(r.baselinePolicyValue).toBeCloseTo(12.5, 12)
    expect(r.informedPolicyValue).toBeCloseTo(12.5, 12)
    expect(r.informationGain).toBe(0)
    expect(r.resolutionGain).toBe(0)
  })
  it.each([0, 1])(
    'handles zero-weight groups at w=%s without a false conditional frequency',
    (w) => {
      const r = result({ ...defaultInputs, group1Weight: w })
      const empty = r.groups[w === 0 ? 0 : 1]
      expect(empty.modeledFrequency).toBeNull()
      expect(empty.frequencyStatus).toBe('zero-weight')
      expect(empty.baseline.truePolicyContribution).toBe(0)
      expect(empty.informed.truePolicyContribution).toBe(0)
      expect(r.baselineBrier).toBeCloseTo(r.informedBrier, 12)
      expect(r.informationGain).toBe(0)
      expect(isSafeJson(r)).toBe(true)
    },
  )
  it('labels exact ties rather than forcing a uniquely optimal action', () => {
    const r = result({
      ...defaultInputs,
      group1Probability: 0.2,
      group2Probability: 0.2,
    })
    expect(r.groups.map((g) => g.informed.action)).toEqual([
      'indifferent',
      'indifferent',
    ])
    expect(r.groups.map((g) => g.baseline.action)).toEqual([
      'indifferent',
      'indifferent',
    ])
    expect(r.baselinePolicyValue).toBe(0)
    expect(r.informedPolicyValue).toBe(0)
  })
  it('cost changes action and value without changing either Brier loss', () => {
    const a = result(),
      b = result({ ...defaultInputs, loss: 5 })
    expect(b.baselineBrier).toBe(a.baselineBrier)
    expect(b.informedBrier).toBe(a.informedBrier)
    expect(b.groups.map((g) => g.informed.action)).toEqual([
      'continue',
      'continue',
    ])
    expect(b.informationGain).toBe(0)
    expect(b.baselinePolicyValue).toBe(31.75)
  })
  it('handles certainty, impossibility and free losing state', () => {
    const r = result({
      ...defaultInputs,
      group1Probability: 0,
      group2Probability: 1,
      loss: 0,
    })
    expect(r.groups.map((g) => g.informed.action)).toEqual([
      'indifferent',
      'continue',
    ])
    expect(r.informedBrier).toBe(0)
    expect(r.informedPolicyValue).toBe(50)
  })
  it('enumerates 2,160 finite populations independently and checks conservation, Brier and policy ordering', () => {
    for (const w of [0, 0.2, 0.5, 0.9, 1])
      for (const p1 of [0, 0.1, 0.2, 0.5, 0.6, 1])
        for (const p2 of [0, 0.1, 0.2, 0.5, 0.6, 1])
          for (const gain of [1, 100, 500])
            for (const loss of [0, 5, 25, 200]) {
              const r = result({
                group1Weight: w,
                group1Probability: p1,
                group2Probability: p2,
                gain,
                loss,
              })
              const population = [
                [w, p1],
                [1 - w, p2],
              ]
              const q = w * p1 + (1 - w) * p2
              let baseScore = 0,
                informedScore = 0,
                baseValue = 0,
                informedValue = 0
              for (const [weight, p] of population) {
                for (const outcome of [0, 1]) {
                  const mass = weight * (outcome ? p : 1 - p)
                  baseScore += mass * (q - outcome) ** 2
                  informedScore += mass * (p - outcome) ** 2
                  const cashflow = outcome ? gain : -loss
                  if (q >= loss / (gain + loss)) baseValue += mass * cashflow
                  if (p >= loss / (gain + loss))
                    informedValue += mass * cashflow
                }
              }
              expect(r.baselineBrier).toBeCloseTo(baseScore, 10)
              expect(r.informedBrier).toBeCloseTo(informedScore, 10)
              expect(r.baselinePolicyValue).toBeCloseTo(baseValue, 10)
              expect(r.informedPolicyValue).toBeCloseTo(informedValue, 10)
              expect(r.baselineBrier - r.informedBrier).toBeCloseTo(
                w * (1 - w) * (p1 - p2) ** 2,
                10,
              )
              expect(r.informedPolicyValue + 1e-10).toBeGreaterThanOrEqual(
                r.baselinePolicyValue,
              )
              expect(r.informedBrier).toBeGreaterThanOrEqual(0)
              expect(r.baselineBrier).toBeLessThanOrEqual(1)
              expect(isSafeJson(r)).toBe(true)
            }
  })
  it('exchanges group labels without changing weighted outputs', () => {
    const a = result({ ...defaultInputs, group1Weight: 0.2 }),
      b = result({
        ...defaultInputs,
        group1Weight: 0.8,
        group1Probability: 0.6,
        group2Probability: 0.1,
      })
    expect(a.baselineBrier).toBeCloseTo(b.baselineBrier, 12)
    expect(a.informedPolicyValue).toBeCloseTo(b.informedPolicyValue, 12)
  })
  it.each([NaN, Infinity, -Infinity, -0.01, 1.01, null, '0.5'])(
    'rejects invalid probability %s',
    (p) => {
      expect(
        calibrationModel({ ...defaultInputs, group1Probability: p }).ok,
      ).toBe(false)
    },
  )
  it('rejects all invalid payoff and shape inputs', () => {
    for (const i of [
      null,
      [],
      {},
      { ...defaultInputs, gain: 0 },
      { ...defaultInputs, gain: 501 },
      { ...defaultInputs, loss: -1 },
      { ...defaultInputs, loss: 201 },
      { ...defaultInputs, group1Weight: 2 },
      { ...defaultInputs, privateCards: [] },
    ])
      expect(decodeInputs(i).ok).toBe(false)
  })
  it('is deterministic and does not mutate frozen inputs', () => {
    const i = Object.freeze({ ...defaultInputs })
    const a = calibrationModel(i),
      b = calibrationModel(i)
    expect(a).toEqual(b)
    expect(i).toEqual(defaultInputs)
    expect(a.ok && b.ok && a.value !== b.value).toBe(true)
  })
  it('roundtrips only finite consistent public results, rejecting corrupt persisted answers', () => {
    const r = result()
    expect(decodeResult(encodeResult(r))).toEqual({
      ok: true,
      value: r,
      warnings: [],
    })
    for (const bad of [
      { ...r, baselineBrier: NaN },
      { ...r, informationGain: 999 },
      { ...r, game: {} },
      { ...r, groups: [] },
      { ...r, inputs: { ...r.inputs, loss: Infinity } },
    ])
      expect(decodeResult(bad).ok).toBe(false)
  })
})
describe('F05 fixed Bayesian exercises, checked independently against kit', () => {
  it('gets 4/7, not the strong-hand betting likelihood', () => {
    const r = bayesModel({
      prior: 0.25,
      likelihoodStrong: 0.8,
      likelihoodWeak: 0.2,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.posterior).toBeCloseTo(4 / 7, 12)
      expect(r.value.evidenceProbability).toBeCloseTo(0.35, 12)
    }
  })
  it('returns unreachable/null when evidence has zero model probability', () => {
    const r = bayesModel({ prior: 0, likelihoodStrong: 1, likelihoodWeak: 0 })
    expect(r).toEqual({
      ok: true,
      value: { evidenceProbability: 0, posterior: null, status: 'unreachable' },
      warnings: [],
    })
    expect(
      bayesModel({ prior: NaN, likelihoodStrong: 1, likelihoodWeak: 0 }).ok,
    ).toBe(false)
  })
  it('gets Beta(6,9), mean .4, rather than treating 4/5 as a known parameter', () => {
    expect(betaModel({ alpha: 2, beta: 8, successes: 4, failures: 1 })).toEqual(
      {
        ok: true,
        value: {
          alpha: 6,
          beta: 9,
          posteriorMean: 0.4,
          rawRate: 0.8,
          rawRateStatus: 'available',
        },
        warnings: [],
      },
    )
  })
  it('labels no raw data as unavailable and rejects bad prior/count domains', () => {
    const r = betaModel({ alpha: 2, beta: 8, successes: 0, failures: 0 })
    if (r.ok) {
      expect(r.value.rawRate).toBeNull()
      expect(r.value.posteriorMean).toBe(0.2)
    }
    for (const v of [
      { alpha: 0, beta: 8, successes: 4, failures: 1 },
      { alpha: 2, beta: 8, successes: 4.5, failures: 1 },
      { alpha: 2, beta: 8, successes: Infinity, failures: 1 },
    ])
      expect(betaModel(v).ok).toBe(false)
  })
})
