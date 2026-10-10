import { describe, expect, it } from 'vitest'
import { simulateCalls } from './landingSimulation'

describe('landing call simulation', () => {
  it('computes every outcome and cumulative result from independent draws', () => {
    let draw = 0
    const result = simulateCalls(30, 25, () => (draw++ % 10) / 10)
    expect(draw).toBe(100)
    expect(result.wins).toBe(30)
    expect(result.net).toBe(1250)
    expect(result.expectedNet).toBe(1250)
    expect(result.cumulative).toHaveLength(101)
    expect(result.cumulative.slice(0, 5)).toEqual([0, 100, 200, 300, 275])
    expect(result.cumulative[100]).toBe(result.net)
    expect(result.outcomes).toHaveLength(100)
  })

  it('does not guarantee the expected result or force the expected number of wins', () => {
    const result = simulateCalls(30, 25, () => 0.9)
    expect(result.wins).toBe(0)
    expect(result.net).toBe(-2500)
    expect(result.expectedNet).toBe(1250)
  })

  it.each([
    [0, 80, 0, -8000],
    [100, 80, 100, 10000],
    [20, 25, 100, 10000],
  ])('handles %i%% chance and %i-chip calls', (chance, call, wins, net) => {
    const result = simulateCalls(chance, call, () => 0)
    expect(result.wins).toBe(wins)
    expect(result.net).toBe(net)
    if (chance === 20) expect(result.expectedNet).toBe(0)
  })

  it.each([
    [-1, 25],
    [101, 25],
    [NaN, 25],
    [30, -1],
    [30, Infinity],
  ])('rejects invalid assumptions (%s, %s)', (chance, call) => {
    expect(() => simulateCalls(chance, call)).toThrow(RangeError)
  })
})
