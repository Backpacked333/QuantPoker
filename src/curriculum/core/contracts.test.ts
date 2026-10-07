import { describe, expect, it } from 'vitest'
import { parseLearningRoute, routes } from './routes'
import { atlas, CurriculumRegistry } from './registry'
import { foundations, fragmentSlots } from '../content/foundations'
import { baseCases } from '../content/foundationCases/baseBanks'
import { pathways } from '../content/pathways'
import {
  legacyIds,
  unitIds,
  unitSteps,
  experienceIds,
  pathwayIds,
} from './types'
import {
  conditionalCount,
  binaryMoments,
  insurancePreference,
  licenseLedger,
  nominalKelly,
  terminalCall,
  twoStateCall,
} from './foundationMath'
import {
  createRandom,
  deriveSeed,
  namedStream,
  parameterHash,
} from './seededRandom'
import {
  decodePrediction,
  isSafeJson,
  validatedModel,
  success,
} from './validation'
import vectors from './__fixtures__/rng-vectors.json'
import golden from './__fixtures__/math-reference-fixtures.json'

describe('frozen route and registry contracts', () => {
  it('round-trips every stable route and preserves legacy fallback', () => {
    for (const id of unitIds)
      for (const step of unitSteps)
        expect(parseLearningRoute(routes.unit(id, step))).toEqual({
          kind: 'unit',
          id,
          step,
        })
    for (const id of legacyIds)
      for (const tab of ['learn', 'lab', 'check'] as const)
        expect(parseLearningRoute(routes.module(id, tab))).toEqual({
          kind: 'module',
          id,
          tab,
        })
    for (const id of [...legacyIds, ...experienceIds])
      expect(parseLearningRoute(routes.lab(id))).toEqual({ kind: 'lab', id })
    for (const id of pathwayIds)
      expect(parseLearningRoute(routes.pathway(id))).toEqual({
        kind: 'pathway',
        id,
      })
    expect(parseLearningRoute('#learn/module/nope/nope')).toEqual({
      kind: 'module',
      id: 'odds',
      tab: 'learn',
    })
    expect(parseLearningRoute('#learn/')).toEqual({
      kind: 'overview',
      page: 'path',
    })
    expect(parseLearningRoute('#table')).toEqual({ kind: 'table' })
    expect(parseLearningRoute('#learn/map')).toEqual({
      kind: 'overview',
      page: 'atlas',
    })
    expect(parseLearningRoute('#learn/connections')).toEqual({
      kind: 'overview',
      page: 'connections',
    })
  })
  it.each([
    '#learn/unit/unknown',
    '#learn/unit/f01/unknown',
    '#learn/unit/f01/brief/extra',
    '#learn/%ZZ',
    '#learner/unit/f01',
    '#learn/lab/unknown',
    '#learn/pathway/unknown',
  ])('rejects malformed or unregistered %s', (hash) =>
    expect(parseLearningRoute(hash).kind).toBe('not-found'),
  )
  it('has exactly kit-derived inventories and honest resource status', () => {
    const r = new CurriculumRegistry()
    r.assertIntegrity()
    expect(atlas.concepts).toHaveLength(96)
    expect(atlas.domains).toHaveLength(12)
    expect(pathways).toHaveLength(4)
    expect(r.units.size).toBe(10)
    expect(r.experienceInventory).toHaveLength(6)
    expect(
      r.experienceInventory.every((e) => e.availability === 'planned'),
    ).toBe(true)
    expect(pathways.every((p) => p.capstoneAvailability === 'planned')).toBe(
      true,
    )
    expect(
      [...r.units.values()]
        .filter((u) => u.availability === 'available')
        .map((u) => u.id),
    ).toEqual(['f01', 'f02', 'f03', 'f04', 'f06', 'f09'])
    expect(
      atlas.concepts.every(
        (c) => r.conceptAvailability(c.id, 'research') === 'planned',
      ),
    ).toBe(true)
    expect(atlas.concepts.find((c) => c.id === 'A01')?.title).toBe(
      'Legal states and information sets',
    )
  })
  it('delivers all seven steps, progressive hints, partial/practice and six materially varied finance banks', () => {
    for (const u of foundations.filter((u) => u.availability === 'available')) {
      expect(u.steps).toEqual(unitSteps)
      expect(u.lesson?.retrieval).toBeTruthy()
      expect(u.lesson?.predictionQuestion).toBeTruthy()
      expect(u.lesson?.limitation).toBeTruthy()
      expect(u.lesson?.decisionReversal).toBeTruthy()
      expect(u.transferCaseIds).toHaveLength(3)
      expect(u.reviewCaseIds).toHaveLength(3)
      const cases = baseCases.filter((c) => c.unitId === u.id)
      expect(cases.some((c) => c.mode === 'partial')).toBe(true)
      expect(cases.some((c) => c.mode === 'practice')).toBe(true)
      expect(
        new Set(
          cases
            .filter((c) => ['transfer', 'review'].includes(c.mode))
            .map((c) => c.information.join()),
        ).size,
      ).toBe(6)
      expect(
        cases.every(
          (c) =>
            c.questions.every((q) => q.hints.length === 4) &&
            c.sources.every((s) => s.verification === 'checked'),
        ),
      ).toBe(true)
      expect(
        cases
          .filter((c) => ['transfer', 'review'].includes(c.mode))
          .every((c) => c.connection !== 'direct'),
      ).toBe(true)
    }
    expect(
      fragmentSlots
        .filter((s) => ['f05', 'f07', 'f08', 'f10'].includes(s.unitId))
        .every(
          (s) =>
            s.minTransfer ===
              (s.id === 'f09-solvency' || s.id === 'f10-solvency' ? 1 : 3) &&
            s.minReview === s.minTransfer &&
            s.requiredTopics.length,
        ),
    ).toBe(true)
  })
  it('rejects duplicate registration and incomplete fragments transactionally', () => {
    const r = new CurriculumRegistry()
    expect(() =>
      r.installFragment({
        slotId: 'f05-calibration',
        unitId: 'f05',
        cases: [],
        sources: [],
      }),
    ).toThrow('Incomplete')
    expect(r.units.get('f05')?.availability).toBe('partial')
    const load = async () => ({ default: () => null })
    r.registerExperience({
      id: 'information',
      title: 'Example',
      version: '1',
      passedGate: false,
      load,
    })
    expect(
      r.experienceInventory.find((e) => e.id === 'information')?.availability,
    ).toBe('planned')
    expect(() =>
      r.registerExperience({
        id: 'information',
        title: 'Duplicate',
        version: '1',
        passedGate: true,
        load,
      }),
    ).toThrow('duplicate')
  })
})
describe('independent numeric contracts and information boundary', () => {
  it('checks supplied golden fixtures without regenerating their expected values', () => {
    expect(golden.fixtures.length).toBe(44)
    const call = terminalCall({
      probability: 0.3,
      existingPot: 100,
      callCost: 25,
    })
    expect(call).toEqual(
      success({
        winProfit: 100,
        loseProfit: -25,
        expectedProfit: 12.5,
        breakEvenProbability: 0.2,
      }),
    )
    expect(
      licenseLedger({ cost: 18, grossReceipt: 80, failureRecovery: 0 }),
    ).toEqual(
      success({ successProfit: 62, failureProfit: -18, declineProfit: 0 }),
    )
    expect(
      conditionalCount({ eventAndCondition: 9, conditionCount: 47 }),
    ).toEqual(success({ probability: 9 / 47, status: 'available' }))
    const moments = binaryMoments({
      probability: 0.3,
      gain: 100,
      loss: 25,
      trials: 5,
    })
    if (!moments.ok) throw Error('invalid')
    expect(moments.value.mean).toBe(12.5)
    expect(moments.value.variance).toBe(3281.25)
    expect(moments.value.sd).toBeCloseTo(57.282196186948, 10)
    expect(moments.value.allLossProbability).toBeCloseTo(0.16807, 12)
    expect(nominalKelly({ probability: 0.55, fraction: 0.5 })).toMatchObject({
      ok: true,
      value: { chosenFraction: expect.closeTo(0.05, 12) },
    })
    const preference = insurancePreference({
      wealth: 200,
      loss: 100,
      lossProbability: 0.2,
      premium: 22,
    })
    expect(preference).toMatchObject({
      ok: true,
      value: {
        uninsuredExpectedWealth: 180,
        insuredWealth: 178,
        uninsuredCertaintyEquivalent: expect.closeTo(174.1101126592249, 10),
      },
    })
    expect(
      twoStateCall({
        stockNow: 100,
        stockUp: 120,
        stockDown: 80,
        strike: 100,
        physicalUpProbability: 0.7,
        fee: 0,
      }),
    ).toEqual(
      success({
        upPayment: 20,
        downPayment: 0,
        shares: 0.5,
        debt: 40,
        replicationCost: 10,
        buyerCost: 10,
        pricingUpWeight: 0.5,
        physicalExpectedPayment: 14,
      }),
    )
  })
  it('tests limits and unavailable conditionals, not invented zero probabilities', () => {
    expect(
      conditionalCount({ eventAndCondition: 0, conditionCount: 0 }),
    ).toEqual(success({ probability: null, status: 'unavailable' }))
    expect(
      conditionalCount({ eventAndCondition: 1, conditionCount: 0 }).ok,
    ).toBe(false)
    expect(
      conditionalCount({ eventAndCondition: 1.5, conditionCount: 3 }).ok,
    ).toBe(false)
    expect(
      terminalCall({ probability: NaN, existingPot: 100, callCost: 25 }).ok,
    ).toBe(false)
    expect(
      terminalCall({ probability: 0.3, existingPot: -1, callCost: 25 }).ok,
    ).toBe(false)
    expect(
      terminalCall({ probability: 0.3, existingPot: 0, callCost: 0 }),
    ).toMatchObject({ ok: true, value: { breakEvenProbability: null } })
    expect(
      insurancePreference({
        wealth: 100,
        loss: 100,
        lossProbability: 0.2,
        premium: 22,
      }).ok,
    ).toBe(false)
    expect(
      twoStateCall({
        stockNow: 150,
        stockUp: 120,
        stockDown: 80,
        strike: 100,
        physicalUpProbability: 0.7,
        fee: 0,
      }).ok,
    ).toBe(false)
  })
  it('checks cashflow and moment identities over a deterministic grid', () => {
    for (const p of [0, 0.1, 0.3, 0.5, 1])
      for (const pot of [0, 1, 100])
        for (const cost of [0, 1, 25]) {
          const r = terminalCall({
            probability: p,
            existingPot: pot,
            callCost: cost,
          })
          if (!r.ok) throw Error('grid')
          expect(r.value.expectedProfit).toBeCloseTo(
            p * (pot + cost) - cost,
            10,
          )
          const m = binaryMoments({
            probability: p,
            gain: pot,
            loss: cost,
            trials: 16,
          })
          if (!m.ok) throw Error('grid')
          expect(m.value.totalSd / 16).toBeCloseTo(m.value.averageSd, 10)
          expect(m.value.variance).toBeGreaterThanOrEqual(0)
        }
  })
  it('rejects hidden state, unsafe prototypes and non-finite outputs', () => {
    for (const v of [
      { game: {} },
      { futureDeck: [] },
      { nested: { opponentCards: [] } },
      { credentials: 'x' },
      JSON.parse('{"__proto__":{}}'),
      { value: Infinity },
    ])
      expect(isSafeJson(v)).toBe(false)
    expect(
      isSafeJson({
        publicBoard: ['As'],
        note: '<script>literal unexecuted note</script>',
      }),
    ).toBe(true)
    expect(
      validatedModel(
        () => success(1),
        () => Infinity,
      )(1).ok,
    ).toBe(false)
    expect(
      decodePrediction({ confidencePercent: 101, rationale: 'x' }).ok,
    ).toBe(false)
    expect(
      decodePrediction({
        confidencePercent: null,
        rationale: 'x',
        numericEstimate: Infinity,
      }).ok,
    ).toBe(false)
  })
})
describe('seeded named streams', () => {
  it('matches Python uint32 golden vectors including overflow seeds', () => {
    for (const v of vectors.vectors) {
      const rng = createRandom(v.seed)
      expect(Array.from({ length: 5 }, rng)).toEqual(v.values)
    }
    for (const v of vectors.streams) {
      expect(deriveSeed(v.seed, v.purpose, v.candidateId)).toBe(v.derivedSeed)
      const rng = namedStream(v.seed, v.purpose as 'development', v.candidateId)
      expect(Array.from({ length: 5 }, rng)).toEqual(v.values)
    }
  })
  it('does not consume holdout randomness when development search changes', () => {
    const holdout = namedStream(42, 'holdout', 'candidate-a'),
      first = holdout()
    const dev = namedStream(42, 'development', 'candidate-a')
    for (let i = 0; i < 10000; i++) dev()
    expect(namedStream(42, 'holdout', 'candidate-a')()).toBe(first)
    expect(namedStream(42, 'development', 'candidate-a')()).not.toBe(first)
    expect(parameterHash({ a: 1, b: 2 })).toBe(parameterHash({ b: 2, a: 1 }))
    expect(() => createRandom(-1)).toThrow()
    expect(() => createRandom(1.5)).toThrow()
    expect(() => parameterHash({ n: NaN })).toThrow()
  })
})
