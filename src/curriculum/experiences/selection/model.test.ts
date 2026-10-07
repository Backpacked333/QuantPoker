import { describe, expect, it } from 'vitest'
import fixtures from '../../core/__fixtures__/math-reference-fixtures.json'
import { isSafeJson } from '../../core/validation'
import {
  correctObservedCounts,
  decodeSelectionInputs,
  decodeSelectionResult,
  defaultInputs,
  defaultParameters,
  encodeSelectionInputs,
  encodeSelectionResult,
  selectionExperimentModel,
  selectionModel,
  type SelectionParameters,
} from './model'

function output(p: Partial<SelectionParameters> = {}) {
  const result = selectionModel({
    ...defaultParameters,
    observationRatesKnown: true,
    ...p,
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}
describe('SEL-01 exact selection model', () => {
  it('matches independently authored golden counts and rates without rounding', () => {
    const fixture = fixtures.fixtures.find((f) => f.id === 'selection-default')!
    const expected = fixture.expected as {
      population_counts: number[]
      observed_counts: number[]
      omitted_counts: number[]
      observed_share: number
      corrected_share: number
    }
    const o = output()
    expect([o.populationBluffs, o.populationValues]).toEqual(
      expected.population_counts,
    )
    expect([o.observedBluffs, o.observedValues]).toEqual(
      expected.observed_counts,
    )
    expect([o.omittedBluffs, o.omittedValues]).toEqual(expected.omitted_counts)
    expect(o.observedShare).toBeCloseTo(expected.observed_share, 12)
    expect(o.correctedShare).toBeCloseTo(expected.corrected_share, 12)
    expect(o.correctionStatus).toBe('available')
  })
  it('returns explicit unavailable states instead of invented zeros', () => {
    expect(output({ bluffRecordingRate: 0 })).toMatchObject({
      observedShare: 0,
      correctedShare: null,
      correctionStatus: 'not-identifiable',
    })
    expect(output({ valueRecordingRate: 0 })).toMatchObject({
      observedShare: 1,
      correctedShare: null,
      correctionStatus: 'not-identifiable',
    })
    const empty = fixtures.fixtures.find(
      (f) => f.id === 'selection-unobserved',
    )!
    expect(
      output({ bluffRecordingRate: 0, valueRecordingRate: 0 }),
    ).toMatchObject({
      observedTotal: empty.expected.observed_total,
      observedShare: empty.expected.observed_share,
      observedStatus: 'no-observations',
      correctedShare: empty.expected.corrected_share,
      correctionStatus: 'not-identifiable',
    })
    expect(output({ observationRatesKnown: false }).correctionStatus).toBe(
      'rates-unknown',
    )
    expect(
      output({ bluffPrevalence: 0, bluffRecordingRate: 0 }).correctedShare,
    ).toBeNull()
    expect(
      output({ bluffPrevalence: 1, valueRecordingRate: 0 }).correctedShare,
    ).toBeNull()
  })
  it('keeps fractional expected counts and prevalence endpoints', () => {
    const o = output({
      populationSize: 101,
      bluffPrevalence: 0.23,
      bluffRecordingRate: 0.17,
    })
    expect(o.populationBluffs).toBeCloseTo(23.23, 12)
    expect(o.observedBluffs).toBeCloseTo(3.9491, 12)
    for (const b of [0, 1]) {
      const edge = output({ bluffPrevalence: b })
      expect(edge.correctedShare).toBe(b)
      expect(edge.observedShare).toBe(b)
    }
  })
  it('checks conservation, selection direction and correction on an independent grid', () => {
    for (const populationSize of [100, 997, 10000])
      for (const bluffPrevalence of [0, 0.03, 0.3, 0.8, 1])
        for (const bluffRecordingRate of [0, 0.01, 0.2, 0.6, 1])
          for (const valueRecordingRate of [0, 0.01, 0.2, 0.6, 1]) {
            const o = output({
              populationSize,
              bluffPrevalence,
              bluffRecordingRate,
              valueRecordingRate,
            })
            expect(isSafeJson(o)).toBe(true)
            expect(o.populationBluffs + o.populationValues).toBeCloseTo(
              populationSize,
              8,
            )
            expect(o.observedBluffs + o.omittedBluffs).toBe(o.populationBluffs)
            expect(o.observedValues + o.omittedValues).toBe(o.populationValues)
            const denominator =
              bluffPrevalence * bluffRecordingRate +
              (1 - bluffPrevalence) * valueRecordingRate
            if (denominator > 0)
              expect(o.observedShare).toBeCloseTo(
                (bluffPrevalence * bluffRecordingRate) / denominator,
                10,
              )
            else expect(o.observedShare).toBeNull()
            if (bluffRecordingRate > 0 && valueRecordingRate > 0) {
              expect(o.correctedShare).toBeCloseTo(bluffPrevalence, 10)
              if (bluffRecordingRate === valueRecordingRate)
                expect(o.observedShare).toBeCloseTo(bluffPrevalence, 10)
            } else expect(o.correctedShare).toBeNull()
          }
  })
  it('does not let a larger population fix a selected fraction', () => {
    expect(output({ populationSize: 100 }).observedShare).toBeCloseTo(
      output({ populationSize: 10000 }).observedShare!,
      12,
    )
  })
  it('rejects malformed, non-finite, extra/private and out-of-range input', () => {
    for (const field of [
      'populationSize',
      'bluffPrevalence',
      'bluffRecordingRate',
      'valueRecordingRate',
    ])
      for (const bad of [NaN, Infinity, -Infinity, -1, '0.3', null, undefined])
        expect(selectionModel({ ...defaultParameters, [field]: bad }).ok).toBe(
          false,
        )
    for (const populationSize of [0, 99, 10001, 100.5])
      expect(selectionModel({ ...defaultParameters, populationSize }).ok).toBe(
        false,
      )
    for (const field of [
      'bluffPrevalence',
      'bluffRecordingRate',
      'valueRecordingRate',
    ])
      expect(selectionModel({ ...defaultParameters, [field]: 1.1 }).ok).toBe(
        false,
      )
    expect(
      selectionModel({ ...defaultParameters, observationRatesKnown: 'yes' }).ok,
    ).toBe(false)
    expect(selectionModel({ ...defaultParameters, opponentCards: [] }).ok).toBe(
      false,
    )
  })
  it('corrects only supplied counts with known positive rates, even at tiny rates', () => {
    expect(
      correctObservedCounts(
        { observedBluffs: 0, observedValues: 0 },
        { bluffRecordingRate: 0.2, valueRecordingRate: 0.8 },
      ),
    ).toMatchObject({
      ok: true,
      value: { share: null, status: 'no-observations' },
    })
    expect(
      correctObservedCounts({ observedBluffs: 12, observedValues: 228 }, null),
    ).toMatchObject({
      ok: true,
      value: { share: null, status: 'rates-unknown' },
    })
    const extreme = correctObservedCounts(
      { observedBluffs: 30, observedValues: 420 },
      {
        bluffRecordingRate: Number.MIN_VALUE,
        valueRecordingRate: Number.MIN_VALUE,
      },
    )
    expect(extreme.ok).toBe(true)
    if (extreme.ok) expect(extreme.value.share).toBeCloseTo(1 / 15, 12)
    expect(
      correctObservedCounts({ observedBluffs: NaN, observedValues: 1 }, null)
        .ok,
    ).toBe(false)
    expect(
      correctObservedCounts(
        { observedBluffs: 1, observedValues: 1 },
        { bluffRecordingRate: -1, valueRecordingRate: 1 },
      ).ok,
    ).toBe(false)
  })
  it('allowlists observed-only input and validates reconciled result summaries', () => {
    expect(encodeSelectionInputs(defaultInputs)).toEqual({
      kind: 'observed-only',
      datasetId: 'selection-default-v1',
      observedBluffs: 30,
      observedValues: 420,
    })
    expect(
      decodeSelectionInputs({ ...defaultInputs, bluffPrevalence: 0.3 }).ok,
    ).toBe(false)
    expect(
      decodeSelectionInputs({ ...defaultInputs, observedBluffs: 29 }).ok,
    ).toBe(false)
    const reveal = selectionExperimentModel(defaultInputs)
    expect(reveal.ok).toBe(true)
    if (reveal.ok) {
      expect(
        decodeSelectionResult(encodeSelectionResult(reveal.value)),
      ).toEqual(reveal)
      expect(
        decodeSelectionResult({ ...reveal.value, correctedShare: 0.3 }).ok,
      ).toBe(false)
      expect(
        decodeSelectionResult({ ...reveal.value, observedShare: NaN }).ok,
      ).toBe(false)
      expect(decodeSelectionResult({ ...reveal.value, deck: [] }).ok).toBe(
        false,
      )
      expect(
        decodeSelectionResult({ ...reveal.value, omittedBluffs: 1 }).ok,
      ).toBe(false)
    }
  })
})
