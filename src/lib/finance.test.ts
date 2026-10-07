import { describe, expect, it } from 'vitest'
import {
  breakEvenEquity,
  callEV,
  decisionBreakEven,
  decisionEV,
  decisionOutcomes,
  fairPremium,
  insuranceProfit,
  liveSurfaceValue,
  optionProfit,
  payoffStatistics,
  surfaceRiskRange,
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
  it('models folds, calls, and raises from the current decision forward', () => {
    expect(
      decisionEV(
        {
          action: 'fold',
          pot: 160,
          risk: 0,
          opponentCall: 0,
          foldProbability: 0,
        },
        0.8,
      ),
    ).toBe(0)
    const call = {
      action: 'continue' as const,
      pot: 160,
      risk: 40,
      opponentCall: 0,
      foldProbability: 0,
    }
    expect(decisionEV(call, 0.2)).toBeCloseTo(0)
    expect(decisionBreakEven(call)).toBeCloseTo(0.2)
    const raise = {
      action: 'raise' as const,
      pot: 160,
      risk: 140,
      opponentCall: 100,
      foldProbability: 0.25,
    }
    expect(decisionEV(raise, 0.5)).toBeCloseTo(85)
    expect(decisionEV(raise, 0.5, 0)).toBeCloseTo(60)
  })
  it('keeps every live 3D surface consistent with the selected hand', () => {
    const scenario = {
      action: 'continue' as const,
      pot: 100,
      risk: 25,
      opponentCall: 0,
      foldProbability: 0,
      equity: 0.5,
      lossProbability: 0.5,
      coverageFraction: 0.5,
    }
    for (const p of [0, 0.2, 0.5, 1])
      for (const z of [0, 0.25, 0.5, 1]) {
        expect(liveSurfaceValue('equity', p, z, scenario)).toBeCloseTo(
          callEV(p, 100, z * 100) / 100,
        )
        expect(liveSurfaceValue('options', p, z, scenario)).toBeCloseTo(
          Math.max(0, callEV(p, 100, z * 100)) / 100,
        )
        expect(liveSurfaceValue('insurance', p, z, scenario)).toBeCloseTo(
          insuranceProfit(25, z * 25, fairPremium(p, z * 25)) / 25,
        )
      }
  })
  it('includes ties and opponent folds in fair coverage pricing', () => {
    const model = {
      action: 'raise' as const,
      pot: 100,
      risk: 60,
      opponentCall: 40,
      foldProbability: 0.3,
    }
    const probabilities = { win: 0.4, tie: 0.2, loss: 0.4 }
    const unhedged = payoffStatistics(decisionOutcomes(model, probabilities))
    const hedged = payoffStatistics(decisionOutcomes(model, probabilities, 45))
    expect(unhedged.mean).toBeCloseTo(decisionEV(model, 0.5))
    expect(hedged.mean).toBeCloseTo(unhedged.mean)
    expect(hedged.deviation).toBeLessThan(unhedged.deviation)
    expect(
      decisionOutcomes(model, probabilities).reduce(
        (sum, item) => sum + item.probability,
        0,
      ),
    ).toBeCloseTo(1)
  })
  it('contains overbet scenarios without clamping the live point', () => {
    const scenario = {
      action: 'raise' as const,
      pot: 100,
      risk: 1250,
      opponentCall: 1230,
      foldProbability: 0.1,
      equity: 0.3,
      lossProbability: 0.6,
      coverageFraction: 0.75,
    }
    const z = scenario.risk / (scenario.pot * surfaceRiskRange(scenario))
    expect(z).toBeLessThanOrEqual(1)
    expect(
      liveSurfaceValue('equity', scenario.equity, z, scenario) * scenario.pot,
    ).toBeCloseTo(decisionEV(scenario, scenario.equity))
    expect(
      liveSurfaceValue('insurance', 0.5, 1, { ...scenario, risk: 0 }),
    ).toBe(0)
  })
})
