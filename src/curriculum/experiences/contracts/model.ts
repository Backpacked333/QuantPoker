import type { ModelResult } from '../../core/types'
import {
  failure,
  isRecord,
  isSafeJson,
  numberIn,
  success,
  validatedModel,
} from '../../core/validation'

export type ContractInputs =
  | {
      mode: 'layer'
      loss: number
      deductible: number
      limit: number
      premium: number
      states: { loss: number; probability: number }[]
    }
  | {
      mode: 'asset'
      initialPrice: number
      terminalPrice: number
      deductible: number
      cap: number | null
      premium: number
    }
  | {
      mode: 'wording'
      losses: [number, number]
      deductible: number
      limit: number
      premium: number
      basis: 'per-occurrence' | 'aggregate'
    }
export type ContractMode = ContractInputs['mode']
export interface Settlement {
  label: string
  loss: number
  probability: number | null
  promisedPayment: number
  actualPayment: number
  unpaidAmount: number
  retainedLoss: number
  premium: number
  buyerTotalCost: number
  buyerProfit: number
  sellerProfit: number
  stockProfit: number | null
  terminalPrice: number | null
}
export interface ContractOutput {
  mode: ContractMode
  attachment: number
  exhaustion: number | null
  putStrike: number | null
  lowerPutStrike: number | null
  selected: Settlement
  states: Settlement[]
  expected: {
    loss: number
    payout: number
    buyerCost: number
    sellerProfit: number
    loading: number
  } | null
  profile: {
    x: number
    payment: number
    firstComponent: number
    secondComponent: number
    retained: number
    buyerProfit: number
  }[]
}
export const defaults: Record<ContractMode, ContractInputs> = {
  layer: {
    mode: 'layer',
    loss: 90,
    deductible: 50,
    limit: 100,
    premium: 15,
    states: [
      { loss: 0, probability: 0.5 },
      { loss: 90, probability: 0.3 },
      { loss: 250, probability: 0.2 },
    ],
  },
  asset: {
    mode: 'asset',
    initialPrice: 100,
    terminalPrice: 60,
    deductible: 10,
    cap: null,
    premium: 3,
  },
  wording: {
    mode: 'wording',
    losses: [80, 80],
    deductible: 100,
    limit: 1000,
    premium: 0,
    basis: 'per-occurrence',
  },
}
function exactKeys(v: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(v).length === keys.length &&
    keys.every((k) => Object.hasOwn(v, k))
  )
}
export function decodeInputs(v: unknown): ModelResult<ContractInputs> {
  if (!isRecord(v)) return failure('inputs', 'Supply a contract input record.')
  if (!numberIn(v.deductible, 0, 1000))
    return failure(
      'deductible',
      'Deductible must be finite, 0–1000 loss units.',
    )
  if (!numberIn(v.premium, 0, 200))
    return failure('premium', 'Premium must be finite, 0–200 currency units.')
  if (v.mode === 'layer') {
    if (
      !exactKeys(v, [
        'mode',
        'loss',
        'deductible',
        'limit',
        'premium',
        'states',
      ])
    )
      return failure('inputs', 'Unknown or missing loss-layer fields.')
    if (!numberIn(v.loss, 0, 1000))
      return failure('loss', 'Loss must be finite, 0–1000 loss units.')
    if (!numberIn(v.limit, 0, 1000))
      return failure(
        'limit',
        'Payment limit must be finite, 0–1000 currency units.',
      )
    if (!Array.isArray(v.states) || v.states.length < 2 || v.states.length > 5)
      return failure('states', 'Supply 2–5 discrete loss states.')
    const states: { loss: number; probability: number }[] = []
    for (const [index, state] of v.states.entries()) {
      if (
        !isRecord(state) ||
        !exactKeys(state, ['loss', 'probability']) ||
        !numberIn(state.loss, 0, 1000) ||
        !numberIn(state.probability, 0, 1)
      )
        return failure(
          `states.${index}`,
          'Each state needs loss 0–1000 and a finite probability 0–1.',
        )
      states.push({ loss: state.loss, probability: state.probability })
    }
    const total = states.reduce((sum, s) => sum + s.probability, 0)
    if (Math.abs(total - 1) > 1e-10)
      return failure(
        'states',
        `Probabilities must sum to 1, not ${total}. They are never normalized.`,
      )
    return success({
      mode: v.mode,
      loss: v.loss,
      deductible: v.deductible,
      limit: v.limit,
      premium: v.premium,
      states,
    })
  }
  if (v.mode === 'asset') {
    if (
      !exactKeys(v, [
        'mode',
        'initialPrice',
        'terminalPrice',
        'deductible',
        'cap',
        'premium',
      ])
    )
      return failure('inputs', 'Unknown or missing asset fields.')
    if (!numberIn(v.initialPrice, 0.01, 1000))
      return failure(
        'initialPrice',
        'Asset purchase price must be 0.01–1000 currency units.',
      )
    if (!numberIn(v.terminalPrice, 0, 2000))
      return failure(
        'terminalPrice',
        'Terminal price must be 0–2000 currency units.',
      )
    if (v.deductible > v.initialPrice)
      return failure(
        'deductible',
        'An asset deductible must not exceed its purchase price.',
      )
    if (!(v.cap === null || numberIn(v.cap, 0, 1000)))
      return failure('cap', 'Use uncapped protection or a finite cap 0–1000.')
    return success({
      mode: v.mode,
      initialPrice: v.initialPrice,
      terminalPrice: v.terminalPrice,
      deductible: v.deductible,
      cap: v.cap as number | null,
      premium: v.premium,
    })
  }
  if (v.mode === 'wording') {
    if (
      !exactKeys(v, [
        'mode',
        'losses',
        'deductible',
        'limit',
        'premium',
        'basis',
      ]) ||
      !Array.isArray(v.losses) ||
      v.losses.length !== 2 ||
      !v.losses.every((l) => numberIn(l, 0, 1000)) ||
      !numberIn(v.limit, 0, 1000) ||
      (v.basis !== 'per-occurrence' && v.basis !== 'aggregate')
    )
      return failure(
        'inputs',
        'Use two finite losses 0–1000, limit 0–1000, and an explicit deductible basis.',
      )
    return success({
      mode: v.mode,
      losses: [v.losses[0], v.losses[1]],
      deductible: v.deductible,
      limit: v.limit,
      premium: v.premium,
      basis: v.basis as 'per-occurrence' | 'aggregate',
    })
  }
  return failure('mode', 'Choose layer, asset, or wording.')
}
function payment(loss: number, deductible: number, limit: number) {
  return Math.min(Math.max(loss - deductible, 0), limit)
}
function settlement(
  label: string,
  loss: number,
  paid: number,
  premium: number,
  probability: number | null = null,
  stockProfit: number | null = null,
  terminalPrice: number | null = null,
): Settlement {
  return {
    label,
    loss,
    probability,
    promisedPayment: paid,
    actualPayment: paid,
    unpaidAmount: 0,
    retainedLoss: loss - paid,
    premium,
    buyerTotalCost: loss - paid + premium,
    buyerProfit: (stockProfit ?? -loss) + paid - premium,
    sellerProfit: premium - paid,
    stockProfit,
    terminalPrice,
  }
}
function calculate(i: ContractInputs): ContractOutput {
  if (i.mode === 'layer') {
    const row = (
      loss: number,
      label: string,
      probability: number | null = null,
    ) =>
      settlement(
        label,
        loss,
        payment(loss, i.deductible, i.limit),
        i.premium,
        probability,
      )
    const states = i.states.map((s, j) =>
      row(s.loss, `State ${j + 1}`, s.probability),
    )
    const mean = (
      field: keyof Pick<
        Settlement,
        'loss' | 'actualPayment' | 'buyerTotalCost' | 'sellerProfit'
      >,
    ) => states.reduce((sum, s) => sum + s.probability! * s[field], 0)
    const payout = mean('actualPayment')
    const xs = [
      ...new Set([
        0,
        i.deductible,
        i.deductible + i.limit,
        1000,
        i.loss,
        ...i.states.map((s) => s.loss),
      ]),
    ].sort((a, b) => a - b)
    return {
      mode: i.mode,
      attachment: i.deductible,
      exhaustion: i.deductible + i.limit,
      putStrike: null,
      lowerPutStrike: null,
      selected: row(i.loss, 'Selected loss'),
      states,
      expected: {
        loss: mean('loss'),
        payout,
        buyerCost: mean('buyerTotalCost'),
        sellerProfit: mean('sellerProfit'),
        loading: i.premium - payout,
      },
      profile: xs.map((x) => ({
        x,
        payment: payment(x, i.deductible, i.limit),
        firstComponent: Math.max(x - i.deductible, 0),
        secondComponent: Math.max(x - i.deductible - i.limit, 0),
        retained: x - payment(x, i.deductible, i.limit),
        buyerProfit: -x + payment(x, i.deductible, i.limit) - i.premium,
      })),
    }
  }
  if (i.mode === 'asset') {
    const strike = i.initialPrice - i.deductible
    const lower = i.cap === null ? null : Math.max(strike - i.cap, 0)
    const row = (st: number, label: string) => {
      const paid =
        Math.max(strike - st, 0) -
        (lower === null ? 0 : Math.max(lower - st, 0))
      return settlement(
        label,
        Math.max(i.initialPrice - st, 0),
        paid,
        i.premium,
        null,
        st - i.initialPrice,
        st,
      )
    }
    const xs = [
      ...new Set([
        0,
        strike,
        ...(lower === null ? [] : [lower]),
        i.initialPrice,
        i.terminalPrice,
        2000,
      ]),
    ].sort((a, b) => a - b)
    return {
      mode: i.mode,
      attachment: i.deductible,
      exhaustion: i.cap === null ? null : i.deductible + i.cap,
      putStrike: strike,
      lowerPutStrike: lower,
      selected: row(i.terminalPrice, 'Selected terminal price'),
      states: [60, 90, 100, 120].map((st) => row(st, `Terminal ${st}`)),
      expected: null,
      profile: xs.map((x) => {
        const r = row(x, 'Profile')
        return {
          x,
          payment: r.actualPayment,
          firstComponent: Math.max(strike - x, 0),
          secondComponent: lower === null ? 0 : Math.max(lower - x, 0),
          retained: r.retainedLoss,
          buyerProfit: r.buyerProfit,
        }
      }),
    }
  }
  const totalLoss = i.losses[0] + i.losses[1]
  const per = i.losses.reduce(
    (sum, l) => sum + payment(l, i.deductible, i.limit),
    0,
  )
  const aggregate = payment(totalLoss, i.deductible, i.limit)
  const states = [
    settlement(
      'Per occurrence: limit applies to each loss',
      totalLoss,
      per,
      i.premium,
    ),
    settlement(
      'Aggregate: limit applies once to combined loss',
      totalLoss,
      aggregate,
      i.premium,
    ),
  ]
  return {
    mode: i.mode,
    attachment: i.deductible,
    exhaustion: i.deductible + i.limit,
    putStrike: null,
    lowerPutStrike: null,
    selected: states[i.basis === 'per-occurrence' ? 0 : 1],
    states,
    expected: null,
    profile: [],
  }
}
export const contractModel = validatedModel(decodeInputs, calculate)

export function decodeResult(v: unknown): ModelResult<ContractOutput> {
  if (
    !isSafeJson(v) ||
    !isRecord(v) ||
    !exactKeys(v, [
      'mode',
      'attachment',
      'exhaustion',
      'putStrike',
      'lowerPutStrike',
      'selected',
      'states',
      'expected',
      'profile',
    ]) ||
    (v.mode !== 'layer' && v.mode !== 'asset' && v.mode !== 'wording') ||
    !numberIn(v.attachment, 0, 1000) ||
    ![v.exhaustion, v.putStrike, v.lowerPutStrike].every(
      (n) => n === null || numberIn(n, 0, 2000),
    )
  )
    return failure('result', 'Invalid contract result header.')
  function validRow(r: unknown) {
    return (
      isRecord(r) &&
      exactKeys(r, [
        'label',
        'loss',
        'probability',
        'promisedPayment',
        'actualPayment',
        'unpaidAmount',
        'retainedLoss',
        'premium',
        'buyerTotalCost',
        'buyerProfit',
        'sellerProfit',
        'stockProfit',
        'terminalPrice',
      ]) &&
      typeof r.label === 'string' &&
      r.label.length <= 100 &&
      numberIn(r.loss, 0, 2000) &&
      (r.probability === null || numberIn(r.probability, 0, 1)) &&
      [
        'promisedPayment',
        'actualPayment',
        'unpaidAmount',
        'retainedLoss',
      ].every((k) => numberIn(r[k], 0, 2000)) &&
      numberIn(r.premium, 0, 200) &&
      numberIn(r.buyerTotalCost, 0, 2200) &&
      ['buyerProfit', 'sellerProfit'].every((k) =>
        numberIn(r[k], -2200, 2200),
      ) &&
      (r.stockProfit === null || numberIn(r.stockProfit, -1000, 2000)) &&
      (r.terminalPrice === null || numberIn(r.terminalPrice, 0, 2000)) &&
      r.promisedPayment === r.actualPayment &&
      r.unpaidAmount === 0 &&
      Math.abs(
        Number(r.loss) - Number(r.actualPayment) - Number(r.retainedLoss),
      ) < 1e-8 &&
      Math.abs(
        Number(r.buyerTotalCost) - Number(r.retainedLoss) - Number(r.premium),
      ) < 1e-8 &&
      Math.abs(
        Number(r.sellerProfit) - Number(r.premium) + Number(r.actualPayment),
      ) < 1e-8 &&
      Math.abs(
        Number(r.buyerProfit) -
          (r.stockProfit === null ? -Number(r.loss) : Number(r.stockProfit)) -
          Number(r.actualPayment) +
          Number(r.premium),
      ) < 1e-8
    )
  }
  if (
    !validRow(v.selected) ||
    !Array.isArray(v.states) ||
    v.states.length < 2 ||
    v.states.length > 5 ||
    !v.states.every(validRow) ||
    !Array.isArray(v.profile) ||
    v.profile.length > 12 ||
    !v.profile.every(
      (p) =>
        isRecord(p) &&
        exactKeys(p, [
          'x',
          'payment',
          'firstComponent',
          'secondComponent',
          'retained',
          'buyerProfit',
        ]) &&
        ['x', 'payment', 'firstComponent', 'secondComponent', 'retained'].every(
          (k) => numberIn(p[k], 0, 2000),
        ) &&
        numberIn(p.buyerProfit, -2200, 2200) &&
        Math.abs(
          Number(p.payment) -
            Number(p.firstComponent) +
            Number(p.secondComponent),
        ) < 1e-8,
    )
  )
    return failure('result', 'Invalid finite settlement or graph data.')
  if (
    v.expected !== null &&
    (!isRecord(v.expected) ||
      !exactKeys(v.expected, [
        'loss',
        'payout',
        'buyerCost',
        'sellerProfit',
        'loading',
      ]) ||
      !['loss', 'payout', 'buyerCost', 'sellerProfit', 'loading'].every((k) =>
        numberIn(
          v.expected && isRecord(v.expected) ? v.expected[k] : undefined,
          -2200,
          2200,
        ),
      ))
  )
    return failure('result', 'Invalid expectations.')
  if (v.mode === 'layer') {
    if (
      !isRecord(v.expected) ||
      !['loss', 'payout', 'buyerCost'].every((k) =>
        numberIn(
          v.expected && isRecord(v.expected) ? v.expected[k] : null,
          0,
          2200,
        ),
      ) ||
      v.states.some(
        (r) =>
          !isRecord(r) ||
          r.probability === null ||
          r.stockProfit !== null ||
          r.terminalPrice !== null,
      ) ||
      Math.abs(
        v.states.reduce<number>(
          (sum, r) => sum + Number(isRecord(r) ? r.probability : NaN),
          0,
        ) - 1,
      ) > 1e-10
    )
      return failure(
        'result',
        'Loss distributions require valid probabilities and expectations.',
      )
  } else if (
    v.expected !== null ||
    v.states.some((r) => isRecord(r) && r.probability !== null)
  ) {
    return failure(
      'result',
      'Unweighted scenario tables do not define expectations.',
    )
  }
  return success(v as unknown as ContractOutput)
}
