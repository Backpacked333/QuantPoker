import { describe, expect, it } from 'vitest'
import {
  betValue,
  binaryRisk,
  binomial,
  blackScholesCall,
  callValue,
  hitProbability,
  impliedVolatility,
  normalCDF,
  showdownEquity,
} from './math'

describe('pot odds and expected profit', () => {
  it('uses the pot before calling and excludes sunk costs', () => {
    expect(callValue(100, 25, 0.3)).toEqual({
      threshold: 0.2,
      ev: 12.5,
      finalPot: 125,
    })
    expect(callValue(120, 40, 0.25).ev).toBe(0)
  })
  it('handles zero cost and endpoint equity', () => {
    expect(callValue(100, 0, 0)).toEqual({
      threshold: 0,
      ev: 0,
      finalPot: 100,
    })
    expect(callValue(100, 50, 0).ev).toBe(-50)
    expect(callValue(100, 50, 1).ev).toBe(100)
  })
  it.each([
    [0, 10, 0.5],
    [100, -1, 0.5],
    [100, 10, 2],
    [100, NaN, 0.5],
  ])('rejects invalid inputs %s %s %s', (pot, cost, equity) => {
    expect(() => callValue(pot, cost, equity)).toThrow(RangeError)
  })
})

describe('outs without replacement', () => {
  it('computes a flush draw exactly', () => {
    expect(hitProbability(9, 47, 2)).toBeCloseTo(1 - ((38 / 47) * 37) / 46, 12)
    expect(hitProbability(9, 46, 1)).toBeCloseTo(9 / 46, 12)
  })
  it('handles empty, certain, and exhausted draws', () => {
    expect(hitProbability(0, 47, 2)).toBe(0)
    expect(hitProbability(47, 47, 2)).toBe(1)
    expect(hitProbability(9, 47, 0)).toBe(0)
    expect(hitProbability(1, 47, 47)).toBe(1)
  })
  it.each([
    [48, 47, 1],
    [9.5, 47, 1],
    [9, 47, 48],
    [9, 0, 1],
    [-1, 47, 2],
  ])('rejects impossible counts %s %s %s', (outs, unseen, draws) => {
    expect(() => hitProbability(outs, unseen, draws)).toThrow(RangeError)
  })
})

describe('showdown equity', () => {
  it('counts half the heads-up ties', () => {
    expect(showdownEquity(0.4, 0.1)).toBe(0.45)
    expect(showdownEquity(0, 1)).toBe(0.5)
    expect(showdownEquity(1, 0)).toBe(1)
  })
  it('rejects invalid probability mass', () => {
    expect(() => showdownEquity(0.8, 0.3)).toThrow()
    expect(() => showdownEquity(-0.1, 0)).toThrow()
  })
})

describe('fold equity', () => {
  it('weights fold and conditional called branches correctly', () => {
    const result = betValue(100, 50, 0.4, 0.25)
    expect(result.ev).toBe(40)
    expect(result.calledEV).toBe(0)
    expect(result.bluffThreshold).toBeCloseTo(1 / 3)
  })
  it('breaks even for a pure bluff at the threshold', () => {
    expect(betValue(100, 50, 1 / 3, 0).ev).toBeCloseTo(0, 10)
    expect(betValue(100, 50, 1, 0).ev).toBe(100)
    expect(betValue(100, 50, 0, 0).ev).toBe(-50)
    expect(betValue(100, 50, 0, 1).ev).toBe(150)
  })
  it('rejects invalid pots, bets, and fold probabilities', () => {
    expect(() => betValue(0, 50, 0.5, 0.5)).toThrow()
    expect(() => betValue(100, -1, 0.5, 0.5)).toThrow()
    expect(() => betValue(100, 50, 1.1, 0.5)).toThrow()
  })
})

describe('binomial replication and put-call parity', () => {
  it('matches the worked example', () => {
    const result = binomial(100, 100, 1.2, 0.8, 0.05)
    expect(result.q).toBeCloseTo(0.625)
    expect(result.call).toBeCloseTo(11.9047619)
    expect(result.put).toBeCloseTo(7.1428571)
    expect(result.delta).toBe(0.5)
    expect(result.cash).toBeCloseTo(-38.0952381)
  })
  it.each([50, 80, 100, 120, 150])(
    'replicates both states and respects parity at strike %s',
    (strike) => {
      const r = 0.05
      const result = binomial(100, strike, 1.2, 0.8, r)
      expect(result.delta * result.stockUp + result.cash * (1 + r)).toBeCloseTo(
        result.callUp,
        10,
      )
      expect(
        result.delta * result.stockDown + result.cash * (1 + r),
      ).toBeCloseTo(result.callDown, 10)
      expect(result.delta * 100 + result.cash).toBeCloseTo(result.call, 10)
      expect(result.call - result.put).toBeCloseTo(100 - strike / (1 + r), 10)
    },
  )
  it.each([0.2, -0.2, 0.3, -1])(
    'rejects a rate outside strict no-arbitrage bounds: %s',
    (rate) => {
      expect(() => binomial(100, 100, 1.2, 0.8, rate)).toThrow(RangeError)
    },
  )
  it('keeps all exposed lab parameter extremes finite', () => {
    for (const spot of [50, 150])
      for (const strike of [50, 150])
        for (const move of [0.1, 0.5])
          for (const rate of [0, 0.09]) {
            const result = binomial(spot, strike, 1 + move, 1 - move, rate)
            expect(Object.values(result).every(Number.isFinite)).toBe(true)
            expect(result.q).toBeGreaterThan(0)
            expect(result.q).toBeLessThan(1)
          }
  })
})

describe('variance and volatility', () => {
  it('uses chip-squared variance and square-root scaling', () => {
    const result = binaryRisk(0.55, 100, 100, 100)
    expect(result.mean).toBeCloseTo(10)
    expect(result.variance).toBeCloseTo(9900)
    expect(result.totalMean).toBeCloseTo(1000)
    expect(result.totalSD).toBeCloseTo(Math.sqrt(990000))
    expect(
      binaryRisk(0.55, 100, 100, 400).totalSD / result.totalSD,
    ).toBeCloseTo(2)
    expect(binaryRisk(1, 100, 100, 10).sd).toBe(0)
  })
  it('rejects fractional hand counts and negative payoffs', () => {
    expect(() => binaryRisk(0.5, 100, 100, 0)).toThrow()
    expect(() => binaryRisk(0.5, 100, 100, 1.5)).toThrow()
    expect(() => binaryRisk(0.5, -100, 100, 10)).toThrow()
  })
  it('matches the standard Black–Scholes call benchmark', () => {
    expect(blackScholesCall(100, 100, 1, 0.05, 0.2)).toBeCloseTo(10.4506, 3)
    expect(normalCDF(0)).toBeCloseTo(0.5, 7)
    expect(normalCDF(-2)).toBeCloseTo(1 - normalCDF(2), 10)
  })
  it('handles expiry and zero volatility', () => {
    expect(blackScholesCall(110, 100, 0, 0.05, 0.2)).toBe(10)
    expect(blackScholesCall(100, 100, 1, 0.05, 0)).toBeCloseTo(
      100 - 100 * Math.exp(-0.05),
    )
    expect(() => blackScholesCall(0, 100, 1, 0.05, 0.2)).toThrow()
  })
  it.each([0.1, 0.2, 0.25, 0.5, 1])(
    'recovers implied volatility %s from its generated premium',
    (vol) => {
      const premium = blackScholesCall(100, 100, 1, 0.05, vol)
      expect(impliedVolatility(premium, 100, 100, 1, 0.05)).toBeCloseTo(vol, 8)
    },
  )
  it('is increasing in volatility and enforces no-arbitrage price bounds', () => {
    expect(blackScholesCall(100, 100, 1, 0.05, 0.4)).toBeGreaterThan(
      blackScholesCall(100, 100, 1, 0.05, 0.2),
    )
    expect(() => impliedVolatility(100, 100, 100, 1, 0.05)).toThrow()
    expect(() => impliedVolatility(1, 100, 100, 1, 0.05)).toThrow()
    expect(() => impliedVolatility(10, 100, 100, 0, 0.05)).toThrow()
    expect(
      impliedVolatility(
        blackScholesCall(100, 100, 1, 0.05, 0),
        100,
        100,
        1,
        0.05,
      ),
    ).toBe(0)
  })
})
