import { describe, expect, it } from 'vitest'
import { chipStacks, stackValue } from './chips'

describe('chip stacks', () => {
  it('breaks amounts into the largest denominations first', () => {
    const { stacks, exact } = chipStacks(160)
    expect(stacks.map((s) => [s.denomination.value, s.count])).toEqual([
      [100, 1],
      [25, 2],
      [5, 2],
    ])
    expect(exact).toBe(true)
    expect(stackValue(stacks)).toBe(160)
  })
  it('round-trips every amount up to 4,000 when uncapped', () => {
    for (let amount = 0; amount <= 4000; amount += 7)
      expect(
        stackValue(
          chipStacks(amount, { maxPerStack: 1e9, maxStacks: 9 }).stacks,
        ),
      ).toBe(amount)
  })
  it('caps the drawing for large pots and reports it', () => {
    const { stacks, exact } = chipStacks(3999)
    expect(stacks.length).toBeLessThanOrEqual(4)
    expect(stacks.every((s) => s.count <= 8)).toBe(true)
    expect(exact).toBe(false)
  })
  it('draws nothing for zero or negative amounts', () => {
    expect(chipStacks(0).stacks).toEqual([])
    expect(chipStacks(-5).stacks).toEqual([])
  })
})
