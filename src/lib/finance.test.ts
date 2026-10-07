import { describe, expect, it } from 'vitest'
import {
  breakEvenEquity,
  callEV,
  fairPremium,
  insuranceProfit,
  optionProfit,
  surfaceValue,
} from './finance'

describe('finance models', () => {
  it('computes call EV and correct pot odds', () => {
    expect(breakEvenEquity(160, 40)).toBe(0.2)
    expect(callEV(0.2, 160, 40)).toBe(0)
    expect(callEV(0.3, 160, 40)).toBe(20)
    expect(breakEvenEquity(100, 0)).toBe(0)
  })
  it('includes the premium in option profit', () => {
    expect(optionProfit(80, 100, 10)).toBe(-10)
    expect(optionProfit(100, 100, 10)).toBe(-10)
    expect(optionProfit(110, 100, 10)).toBe(0)
    expect(optionProfit(130, 100, 10)).toBe(20)
  })
  it('caps insurance payout at loss and coverage and charges premium', () => {
    expect(fairPremium(0.2, 100)).toBe(20)
    expect(insuranceProfit(200, 100, 20)).toBe(-120)
    expect(insuranceProfit(50, 100, 20)).toBe(-20)
    expect(insuranceProfit(0, 100, 20)).toBe(-20)
    expect(insuranceProfit(100, 0, 0)).toBe(-100)
  })
  it('preserves expected wealth under fair full insurance', () => {
    const premium = fairPremium(0.2, 200)
    expect(
      0.2 * insuranceProfit(200, 200, premium) +
        0.8 * insuranceProfit(0, 200, premium),
    ).toBe(-40)
  })
  it('keeps 3D surfaces consistent with their formulas', () => {
    for (const p of [0, 0.2, 0.5, 1])
      for (const z of [0, 0.25, 0.5, 1]) {
        expect(surfaceValue('equity', p, z)).toBeCloseTo(
          callEV(p, 100, z * 200) / 100,
        )
        expect(surfaceValue('options', p, z)).toBeCloseTo(
          optionProfit(p * 200, z * 160, 10) / 70,
        )
        expect(surfaceValue('insurance', p, z)).toBeCloseTo(
          insuranceProfit(p * 200, z * 200, fairPremium(0.2, z * 200)) / 100,
        )
      }
  })
})
