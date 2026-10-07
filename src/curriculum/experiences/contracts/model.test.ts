import { describe, expect, it } from 'vitest'
import fixtures from '../../core/__fixtures__/math-reference-fixtures.json'
import {
  contractModel,
  decodeInputs,
  decodeResult,
  defaults,
  type ContractInputs,
} from './model'

function run(i: ContractInputs) {
  const result = contractModel(i)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  expect(decodeResult(result.value).ok).toBe(true)
  return result.value
}
describe('CON-01 exact contract adapters', () => {
  it('matches the independently supplied loss-layer and distribution fixtures', () => {
    const layer = fixtures.fixtures.find((f) => f.id === 'layer-default')!
    expect(layer.expected).toEqual({
      payments: [0, 40, 100],
      retained: [30, 50, 150],
    })
    const values = [30, 90, 250].map(
      (loss) =>
        run({
          ...defaults.layer,
          mode: 'layer',
          loss,
          deductible: 50,
          limit: 100,
          premium: 0,
          states: [
            { loss: 0, probability: 0.5 },
            { loss, probability: 0.5 },
          ],
        }).selected,
    )
    expect(values.map((r) => r.actualPayment)).toEqual([0, 40, 100])
    expect(values.map((r) => r.retainedLoss)).toEqual([30, 50, 150])
    expect(run(defaults.layer).expected).toEqual({
      loss: 77,
      payout: 32,
      buyerCost: 60,
      sellerProfit: -17,
      loading: -17,
    })
  })
  it('matches put profits at the four default terminal prices', () => {
    const rows = run(defaults.asset).states
    expect(rows.map((r) => r.promisedPayment)).toEqual([30, 0, 0, 0])
    expect(rows.map((r) => r.buyerProfit)).toEqual([-13, -13, -3, 17])
    expect(run(defaults.asset).putStrike).toBe(90)
    for (const row of rows)
      expect(row.buyerProfit + row.sellerProfit).toBe(row.stockProfit)
  })
  it('settles wording only on the selected contractual basis; charges one premium', () => {
    expect(run(defaults.wording).states.map((r) => r.actualPayment)).toEqual([
      0, 60,
    ])
    const out = run({
      mode: 'wording',
      losses: [200, 200],
      deductible: 100,
      limit: 50,
      premium: 9,
      basis: 'aggregate',
    })
    expect(out.states.map((r) => r.actualPayment)).toEqual([100, 50])
    expect(out.selected.buyerTotalCost).toBe(359)
    expect(out.selected.sellerProfit).toBe(-41)
  })
  it('independently verifies identities, bounds, monotonicity, kinks and conservation over a grid', () => {
    for (const d of [0, 10, 50, 100, 500, 1000])
      for (const m of [0, 20, 100, 700, 1000])
        for (const l of [
          0,
          1,
          30,
          50,
          90,
          100,
          150,
          250,
          500,
          1000,
          d,
          Math.min(1000, d + m),
        ]) {
          const input: ContractInputs = {
            mode: 'layer',
            loss: l,
            deductible: d,
            limit: m,
            premium: 17,
            states: [
              { loss: 0, probability: 0 },
              { loss: l, probability: 1 },
            ],
          }
          const row = run(input).selected
          const independentlyDerived =
            Math.max(l - d, 0) - Math.max(l - d - m, 0)
          expect(row.actualPayment).toBe(independentlyDerived)
          expect(row.actualPayment).toBeGreaterThanOrEqual(0)
          expect(row.actualPayment).toBeLessThanOrEqual(Math.min(l, m))
          expect(row.buyerProfit + row.sellerProfit).toBeCloseTo(-l, 10)
          expect(row.buyerTotalCost).toBe(row.retainedLoss + 17)
          expect(
            run({ ...input, loss: Math.min(1000, l + 1) }).selected
              .actualPayment,
          ).toBeGreaterThanOrEqual(row.actualPayment)
          expect(
            run({ ...input, limit: Math.min(1000, m + 1) }).selected
              .actualPayment,
          ).toBeGreaterThanOrEqual(row.actualPayment)
          expect(
            run({ ...input, deductible: Math.min(1000, d + 1) }).selected
              .actualPayment,
          ).toBeLessThanOrEqual(row.actualPayment)
        }
  })
  it('covers zero/full loss protection and capped put boundaries including nonpositive lower strike', () => {
    for (const d of [0, 10, 100])
      for (const cap of [null, 0, 20, 90, 100, 1000])
        for (const st of [0, 1, 60, 70, 90, 100, 120, 2000]) {
          const out = run({
            mode: 'asset',
            initialPrice: 100,
            terminalPrice: st,
            deductible: d,
            cap,
            premium: 3,
          })
          const put = Math.max(100 - d - st, 0)
          expect(out.selected.actualPayment).toBe(
            cap === null ? put : Math.min(put, cap),
          )
          expect(out.selected.buyerProfit + out.selected.sellerProfit).toBe(
            st - 100,
          )
        }
    expect(
      run({
        mode: 'asset',
        initialPrice: 100,
        terminalPrice: 0,
        deductible: 0,
        cap: null,
        premium: 0,
      }).selected.retainedLoss,
    ).toBe(0)
  })
  it('rejects invalid probability totals, shape, domain and nonfinite input without normalizing', () => {
    const bad: unknown[] = [
      null,
      {},
      { ...defaults.layer, extra: 1 },
      { ...defaults.layer, loss: NaN },
      { ...defaults.layer, limit: Infinity },
      { ...defaults.layer, deductible: -1 },
      { ...defaults.layer, premium: -1 },
      { ...defaults.layer, states: [] },
      {
        ...defaults.layer,
        states: [
          { loss: 10, probability: 0 },
          { loss: 90, probability: 0 },
        ],
      },
      {
        ...defaults.layer,
        states: [
          { loss: 10, probability: 0.2 },
          { loss: 90, probability: 0.2 },
        ],
      },
      {
        ...defaults.layer,
        states: [
          { loss: -1, probability: 0.5 },
          { loss: 90, probability: 0.5 },
        ],
      },
      { ...defaults.asset, deductible: 101 },
      { ...defaults.asset, initialPrice: 0 },
      { ...defaults.asset, cap: -1 },
      { ...defaults.wording, losses: [80] },
      { ...defaults.wording, basis: 'guess' },
    ]
    for (const input of bad) expect(contractModel(input).ok).toBe(false)
    expect(
      decodeInputs({
        ...defaults.layer,
        states: [
          { loss: 0, probability: 0.1 },
          { loss: 100, probability: 0.2 },
          { loss: 500, probability: 0.7 },
        ],
      }).ok,
    ).toBe(true)
  })
  it('round trips bounded public results and rejects poisoned output', () => {
    for (const i of Object.values(defaults)) {
      const out = run(i)
      expect(decodeResult(JSON.parse(JSON.stringify(out)))).toEqual({
        ok: true,
        value: out,
        warnings: [],
      })
      expect(decodeResult({ ...out, attachment: NaN }).ok).toBe(false)
      expect(decodeResult({ ...out, expected: { loss: Infinity } }).ok).toBe(
        false,
      )
      expect(decodeResult({ ...out, deck: [] }).ok).toBe(false)
      expect(decodeResult({ ...out, mode: [out.mode] }).ok).toBe(false)
      expect(
        decodeResult({
          ...out,
          selected: {
            ...out.selected,
            retainedLoss: out.selected.retainedLoss + 1,
          },
        }).ok,
      ).toBe(false)
      expect(out.selected.promisedPayment).toBe(
        out.selected.actualPayment + out.selected.unpaidAmount,
      )
      expect(
        decodeResult({
          ...out,
          selected: { ...out.selected, actualPayment: Infinity },
        }).ok,
      ).toBe(false)
    }
  })
})
