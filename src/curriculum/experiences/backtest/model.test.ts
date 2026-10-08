import { describe, expect, it } from 'vitest'
import { GENERATOR_VERSION, deriveSeed } from '../../core/seededRandom'
import { isSafeJson } from '../../core/validation'
import {
  backtestModel,
  candidateId,
  decodeDevelopment,
  decodeHoldout,
  decodeInputs,
  decodeResult,
  defaultInputs,
  encodeResult,
  evaluationOutput,
  independentFalsePositive,
  makeHoldout,
  roleHash,
  score,
  selectCandidate,
  wilsonInterval,
} from './model'
import { decodeJob, SimulationBatch } from './simulation'
import { simulate } from './testing'

describe('backtest finite analytic model and independent golden arithmetic', () => {
  it('matches the independent exact-size test formula and endpoints, not a simulator p-value', () => {
    const benchmark = independentFalsePositive(20, 0.05)
    expect(benchmark.ok).toBe(true)
    if (benchmark.ok)
      expect(benchmark.value).toBeCloseTo(0.6415140775914581, 14)
    expect(independentFalsePositive(1, 0.05)).toMatchObject({
      ok: true,
      value: 0.05,
    })
    expect(independentFalsePositive(20, 0)).toMatchObject({
      ok: true,
      value: 0,
    })
    expect(independentFalsePositive(200, 1)).toMatchObject({
      ok: true,
      value: 1,
    })
    expect(independentFalsePositive(0, 0.05).ok).toBe(false)
    expect(independentFalsePositive(20, NaN).ok).toBe(false)
    const a = backtestModel({ ...defaultInputs, cost: 0.075 })
    expect(a).toMatchObject({
      ok: true,
      value: {
        kind: 'analytic',
        expectedGrossMean: 0,
        expectedNetMean: -0.075,
      },
    })
    if (a.ok) expect(decodeResult(encodeResult(a.value))).toEqual(a)
  })
  it.each([
    [0, 20, 0, 0.16112515805281938],
    [20, 20, 0.8388748419471806, 1],
    [500, 1000, 0.4690696003681042, 0.5309303996318958],
  ])('matches Wilson golden wins %s/%s', (w, n, low, high) => {
    const r = wilsonInterval(w, n)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.low).toBeCloseTo(low, 14)
      expect(r.value.high).toBeCloseTo(high, 14)
    }
  })
  it.each([NaN, Infinity, -Infinity, -1, 0, 201, 1.5, Number.MAX_SAFE_INTEGER])(
    'rejects invalid candidate count %s',
    (candidateCount) => {
      expect(backtestModel({ ...defaultInputs, candidateCount }).ok).toBe(false)
    },
  )
  it('rejects bad trials, costs, unsupported keys and invalid interval domains', () => {
    for (const field of ['developmentTrials', 'holdoutTrials'] as const)
      for (const value of [NaN, Infinity, -2, 0, 1.5, 10000])
        expect(decodeInputs({ ...defaultInputs, [field]: value }).ok).toBe(
          false,
        )
    for (const cost of [NaN, Infinity, -0.01, 0.10001, '0.05'])
      expect(decodeInputs({ ...defaultInputs, cost }).ok).toBe(false)
    expect(decodeInputs({ ...defaultInputs, game: {} }).ok).toBe(false)
    for (const [wins, n] of [
      [0, 0],
      [-1, 20],
      [21, 20],
      [0.5, 20],
      [0, Infinity],
    ])
      expect(wilsonInterval(wins, n).ok).toBe(false)
    expect(
      () =>
        new SimulationBatch(
          { stage: 'development', inputs: defaultInputs },
          -1,
        ),
    ).toThrow('uint32')
    expect(
      () =>
        new SimulationBatch(
          { stage: 'development', inputs: defaultInputs },
          2 ** 32,
        ),
    ).toThrow('uint32')
    expect(
      () =>
        new SimulationBatch(
          { stage: 'development', inputs: defaultInputs },
          1.2,
        ),
    ).toThrow('uint32')
  })
  it('ties choose stable ascending IDs without mutating the full search record', () => {
    const rows = [
      score('candidate-003', 10, 20, 0.05),
      score('candidate-001', 10, 20, 0.05),
      score('candidate-002', 9, 20, 0.05),
    ]
    const before = structuredClone(rows)
    expect(selectCandidate(rows)).toBe('candidate-001')
    expect(rows).toEqual(before)
    expect(() => selectCandidate([])).toThrow('No candidates')
  })
  it('matches independent Python uint32/FNV1a/Mulberry32 counts and maps separate roles', () => {
    const inputs = {
      candidateCount: 3,
      developmentTrials: 20,
      holdoutTrials: 100,
      cost: 0.05,
    }
    const d = simulate({ stage: 'development', inputs })
    expect(GENERATOR_VERSION).toBe('qp-rng-v1')
    expect(deriveSeed(42, 'development', 'candidate-001')).toBe(4279879086)
    expect(deriveSeed(42, 'holdout', 'candidate-001')).toBe(645297192)
    expect(d.kind).toBe('development')
    if (d.kind !== 'development') throw Error('development expected')
    expect(d.leaderboard.map((r) => r.wins)).toEqual([10, 9, 7])
    expect(d.selectedId).toBe('candidate-001')
    const h = simulate({ stage: 'holdout', inputs, selectedId: d.selectedId })
    expect(h).toMatchObject({
      kind: 'holdout',
      wins: 51,
      trials: 100,
      grossMean: 0.020000000000000018,
      netMean: -0.029999999999999985,
    })
    const seeds = Array.from({ length: 200 }, (_, k) => [
      deriveSeed(42, 'development', candidateId(k)),
      deriveSeed(42, 'holdout', candidateId(k)),
    ]).flat()
    expect(new Set(seeds).size).toBe(400)
    expect(roleHash(inputs, 42, 'development')).not.toBe(
      roleHash(inputs, 42, 'holdout', d.selectedId),
    )
    expect(roleHash(inputs, 42, 'holdout', d.selectedId)).not.toBe(
      roleHash({ ...inputs, holdoutTrials: 200 }, 42, 'holdout', d.selectedId),
    )
  })
  it('subtracts cost on every observation and transforms both interval endpoints', () => {
    const h = makeHoldout(
      { ...defaultInputs, cost: 0.08 },
      42,
      'candidate-001',
      500,
    )
    expect(h.grossMean).toBe(0)
    expect(h.netMean).toBe(-0.08)
    expect(h.netMeanInterval.low).toBeCloseTo(-0.1418607992637916, 14)
    expect(h.netMeanInterval.high).toBeCloseTo(-0.0181392007362084, 14)
    const i = { ...defaultInputs, cost: 0.05 }
    const d = simulate({ stage: 'development', inputs: i })
    if (d.kind !== 'development') throw Error('development expected')
    for (const r of d.leaderboard)
      expect(r.netMean * r.trials).toBeCloseTo(
        2 * r.wins - r.trials - i.cost * r.trials,
        12,
      )
  })
  it('replays version/seed/protocol across batch sizes and enforces finite summary decoding', () => {
    const job = { stage: 'development' as const, inputs: defaultInputs }
    const d = simulate(job)
    const small = new SimulationBatch(job, 42)
    let r = null
    while (!r) r = small.step(1)
    expect(r).toEqual(d)
    expect(isSafeJson(r)).toBe(true)
    if (d.kind !== 'development') throw Error('development expected')
    expect(decodeDevelopment(d).ok).toBe(true)
    expect(decodeDevelopment({ ...d, totalSearchCount: 1 }).ok).toBe(false)
    expect(
      decodeDevelopment({ ...d, leaderboard: d.leaderboard.slice(0, 1) }).ok,
    ).toBe(false)
    expect(decodeDevelopment({ ...d, selectedId: 'candidate-999' }).ok).toBe(
      false,
    )
    const h = makeHoldout(defaultInputs, 42, d.selectedId, 500)
    expect(
      decodeHoldout(
        { ...h, netMean: Infinity },
        defaultInputs,
        42,
        d.selectedId,
      ).ok,
    ).toBe(false)
    expect(
      decodeJob({
        stage: 'holdout',
        inputs: defaultInputs,
        selectedId: 'candidate-999',
      }).ok,
    ).toBe(false)
    const output = evaluationOutput(d, h, '1234abcd')
    expect(decodeResult(encodeResult(output))).toEqual({
      ok: true,
      value: output,
      warnings: [],
    })
    expect(
      decodeResult({ ...encodeResult(output), generatorVersion: 'unsupported' })
        .ok,
    ).toBe(false)
    expect(decodeResult({ ...encodeResult(output), privateCards: [] }).ok).toBe(
      false,
    )
    expect(() => small.step(9000)).toThrow('bounded')
  })
  it('handles the maximum requested batch profile without storing raw draws', () => {
    const inputs = {
      candidateCount: 200,
      developmentTrials: 2000,
      holdoutTrials: 5000,
      cost: 0.1,
    }
    const d = simulate({ stage: 'development', inputs }, 0xffffffff)
    if (d.kind !== 'development') throw Error('development expected')
    expect(d.totalSearchCount).toBe(200)
    expect(d.leaderboard).toHaveLength(200)
    const h = simulate(
      { stage: 'holdout', inputs, selectedId: d.selectedId },
      0xffffffff,
    )
    expect(isSafeJson(d)).toBe(true)
    expect(isSafeJson(h)).toBe(true)
    expect(JSON.stringify(d).length).toBeLessThan(50000)
  })
  it('holds average independent held-out edge near zero over declared 256-seed suite (tolerance .01)', () => {
    let development = 0,
      heldout = 0,
      positive = 0,
      negative = 0
    for (let seed = 0; seed < 256; seed++) {
      const d = simulate({ stage: 'development', inputs: defaultInputs }, seed)
      if (d.kind !== 'development') throw Error('development expected')
      const h = simulate(
        { stage: 'holdout', inputs: defaultInputs, selectedId: d.selectedId },
        seed,
      )
      if (h.kind !== 'holdout') throw Error('holdout expected')
      development += d.leaderboard.find(
        (r) => r.candidateId === d.selectedId,
      )!.grossMean
      heldout += h.grossMean
      positive += h.grossMean > 0 ? 1 : 0
      negative += h.grossMean < 0 ? 1 : 0
    }
    expect(development / 256).toBeGreaterThan(0.1)
    expect(Math.abs(heldout / 256)).toBeLessThan(0.01)
    expect(positive).toBeGreaterThan(0)
    expect(negative).toBeGreaterThan(0)
  })
})
