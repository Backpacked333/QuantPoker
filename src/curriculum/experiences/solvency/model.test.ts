import { describe, expect, it } from 'vitest'
import {
  decodeInputs,
  decodeResult,
  defaultInputs,
  solvencyModel,
  type SolvencyInputs,
} from './model'
import { isSafeJson } from '../../core/validation'

function run(changes: Partial<SolvencyInputs> = {}) {
  const result = solvencyModel({ ...defaultInputs, ...changes })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}
function enumerate(n: number, p: number, rho: number) {
  const mass = Array<number>(n + 1).fill(0)
  for (let mask = 0; mask < 2 ** n; mask++) {
    let count = 0,
      probability = 1
    for (let bit = 0; bit < n; bit++) {
      const claim = (mask & (1 << bit)) !== 0
      count += Number(claim)
      probability *= claim ? p : 1 - p
    }
    mass[count] += (1 - rho) * probability
  }
  mass[0] += rho * (1 - p)
  mass[n] += rho * p
  return mass
}
describe('SOL-01 exact funded common-event mixture', () => {
  it.each([
    [0, 0.01000727926212509, 1.7858751495477883, 998.2141248504548],
    [0.25, 0.03250545944659382, 208.83940636216084, 791.1605936378412],
    [1, 0.1, 830, 170],
  ])(
    'matches independently prepared kit fixtures at rho=%s',
    (rho, probability, shortfall, payments) => {
      const r = run({ rho })
      expect(r.funds).toBe(1700)
      expect(r.expectedPromisedClaims).toBe(1000)
      expect(r.promisedUnderwritingMargin).toBe(200)
      expect(r.firstDefaultCount).toBe(18)
      expect(r.defaultProbability).toBeCloseTo(probability, 12)
      expect(r.expectedShortfall).toBeCloseTo(shortfall, 9)
      expect(r.expectedActualPayments).toBeCloseTo(payments, 9)
      expect(r.states[100].unpaidClaims).toBe(8300)
    },
  )
  it('matches all small books against direct joint-event enumeration', () => {
    for (const n of [1, 2, 5, 8])
      for (const p of [0, 0.1, 0.2, 0.51, 0.99, 1])
        for (const rho of [0, 0.25, 0.8, 1]) {
          const r = run({ n, p, rho }),
            expected = enumerate(n, p, rho)
          r.states.forEach((s, k) =>
            expect(s.probability).toBeCloseTo(expected[k], 13),
          )
        }
  })
  it('uses strict default and separates shareholder capital from revenue', () => {
    const equal = run({ n: 1, p: 0.4, premium: 20, capital: 80, rho: 0.7 })
    expect(equal.funds).toBe(100)
    expect(equal.defaultProbability).toBe(0)
    expect(equal.logDefaultProbability).toBeNull()
    expect(equal.conditionalShortfall).toBeNull()
    expect(equal.pairwiseCorrelation).toBeNull()
    expect(equal.expectedActualPayments).toBeCloseTo(40, 12)
    expect(equal.promisedUnderwritingMargin).toBe(-20)
    expect(equal.states[1].shareholderNetResult).toBe(-80)
    expect(
      run({ n: 1, p: 0.4, premium: 20, capital: 79.999 }).defaultProbability,
    ).toBeCloseTo(0.4, 14)
  })
  it.each(
    [1, 2, 100, 500].flatMap((n) =>
      [0, Number.MIN_VALUE, 1e-12, 0.01, 0.5, 0.99, 1 - Number.EPSILON, 1].map(
        (p) => ({ n, p }),
      ),
    ),
  )(
    'meets mass, moments, promise/payment conservation and finite outputs at n=$n, p=$p',
    ({ n, p }) => {
      for (const rho of [0, 0.25, 1])
        for (const capital of [0, 500, 100000])
          for (const severity of [1, 1000])
            for (const premium of [0, 200]) {
              const r = run({ n, p, rho, capital, severity, premium })
              expect(isSafeJson(r)).toBe(true)
              expect(decodeResult(r).ok).toBe(true)
              expect(
                r.states.reduce((s, x) => s + x.probability, 0),
              ).toBeCloseTo(1, 11)
              const mean = n * p,
                variance = n * p * (1 - p) * (1 + (n - 1) * rho)
              expect(
                Math.abs(
                  r.states.reduce(
                    (s, x) => s + x.probability * x.claimCount,
                    0,
                  ) - mean,
                ),
              ).toBeLessThan(1e-9 * Math.max(1, mean))
              expect(
                Math.abs(
                  r.states.reduce(
                    (s, x) => s + x.probability * (x.claimCount - mean) ** 2,
                    0,
                  ) - variance,
                ),
              ).toBeLessThan(1e-9 * Math.max(1, variance))
              expect(
                Math.abs(
                  r.expectedActualPayments +
                    r.expectedShortfall -
                    r.expectedPromisedClaims,
                ),
              ).toBeLessThan(1e-9 * Math.max(1, r.expectedPromisedClaims))
              for (const s of r.states) {
                expect(s.actualPayments + s.unpaidClaims).toBe(s.promisedClaims)
                expect(s.remainingFunds + s.actualPayments).toBe(r.funds)
                expect(s.isDefault).toBe(s.promisedClaims > r.funds)
              }
            }
    },
  )
  it('never increases failure or unpaid claims with capital, and is linear in mixture weight', () => {
    for (const n of [1, 7, 100, 500])
      for (const p of [0, 0.1, 0.5, 0.99, 1])
        for (const rho of [0, 0.25, 1]) {
          let previous = run({ n, p, rho, capital: 0 })
          for (const capital of [1, 100, 500, 1000, 100000]) {
            const current = run({ n, p, rho, capital })
            expect(current.defaultProbability).toBeLessThanOrEqual(
              previous.defaultProbability + 1e-12,
            )
            expect(current.expectedShortfall).toBeLessThanOrEqual(
              previous.expectedShortfall + 1e-9,
            )
            previous = current
          }
          const independent = run({ n, p, rho: 0 }),
            common = run({ n, p, rho: 1 }),
            mixed = run({ n, p, rho })
          expect(mixed.defaultProbability).toBeCloseTo(
            (1 - rho) * independent.defaultProbability +
              rho * common.defaultProbability,
            12,
          )
          expect(mixed.expectedShortfall).toBeCloseTo(
            (1 - rho) * independent.expectedShortfall +
              rho * common.expectedShortfall,
            8,
          )
        }
  })
  it('matches average/total SD and the F10 warranty independently fixed benchmarks', () => {
    for (const [rho, sd] of [
      [0, 4],
      [0.25, 20.29778313018444],
      [1, 40],
    ]) {
      const r = run({ p: 0.2, rho })
      expect(r.singleClaimSD).toBe(40)
      expect(r.averageClaimsSD).toBeCloseTo(sd, 11)
      expect(r.totalClaimsSD).toBeCloseTo(sd * 100, 9)
    }
    const r = run({ n: 20, p: 0.1, severity: 100, premium: 14, capital: 120 })
    expect(r.funds).toBe(400)
    expect(r.expectedPromisedClaims).toBe(200)
    expect(r.promisedUnderwritingMargin).toBe(80)
    expect(r.defaultProbability).toBeCloseTo(0.043174495284463404, 12)
    expect(
      run({ n: 20, p: 0.1, severity: 100, premium: 14, capital: 120, rho: 1 })
        .states[20].unpaidClaims,
    ).toBe(1600)
  })
  it('sums tiny tails directly rather than subtracting a near-one CDF; underflow is not impossible', () => {
    const tiny = run({ n: 100, p: 0.1, premium: 0, capital: 9900 })
    expect(tiny.defaultProbability).toBeCloseTo(1e-100, 110)
    expect(tiny.defaultProbabilityStatus).toBe('represented')
    const rescued = run({ n: 100, p: 0.00058, premium: 0, capital: 9900 })
    expect(rescued.defaultProbabilityStatus).toBe('below-number-range')
    expect(rescued.expectedShortfall).toBeGreaterThan(0)
    expect(rescued.expectedShortfall).toBe(2.2e-322)
    expect(rescued.shortfallStatus).toBe('represented')
    const underflow = run({
      n: 500,
      p: Number.MIN_VALUE,
      premium: 0,
      capital: 49900,
    })
    expect(underflow.defaultProbability).toBe(0)
    expect(underflow.defaultProbabilityStatus).toBe('below-number-range')
    expect(underflow.logDefaultProbability).not.toBeNull()
    expect(underflow.conditionalShortfall).toBeCloseTo(100, 6)
  })
  it('rejects bad inputs and nonfinite or malformed serialized results', () => {
    for (const bad of [
      null,
      {},
      { ...defaultInputs, n: 1.5 },
      { ...defaultInputs, p: NaN },
      { ...defaultInputs, capital: Infinity },
      { ...defaultInputs, n: 501 },
      { ...defaultInputs, severity: 0 },
      { ...defaultInputs, p: -1 },
      { ...defaultInputs, rho: 2 },
      { ...defaultInputs, game: {} },
      { ...defaultInputs, constructor: 'bad' },
    ])
      expect(decodeInputs(bad).ok).toBe(false)
    expect(decodeResult({ ...run(), expectedShortfall: Infinity }).ok).toBe(
      false,
    )
    expect(decodeResult({ ...run(), states: [] }).ok).toBe(false)
    expect(decodeResult({ ...run(), futureDeck: [] }).ok).toBe(false)
    expect(decodeResult({ ...run(), expectedShortfall: -1 }).ok).toBe(false)
    expect(decodeResult({ ...run(), pairwiseCorrelation: 2 }).ok).toBe(false)
    expect(decodeResult({ ...run(), conditionalShortfall: null }).ok).toBe(
      false,
    )
    expect(
      decodeResult({ ...run(), defaultProbabilityStatus: 'exact-zero' }).ok,
    ).toBe(false)
    const corrupted = run()
    corrupted.states[20].actualPayments = 1
    expect(decodeResult(corrupted).ok).toBe(false)
    expect(
      decodeResult({ ...run(), logDefaultProbability: undefined }).ok,
    ).toBe(false)
  })
})
