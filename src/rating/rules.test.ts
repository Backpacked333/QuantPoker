// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { SCORE } from './glicko2'
import { isProvisional, matchesToGo } from './rules'

describe('the provisional rule', () => {
  it('holds until RD is under 100 and 20 matches are played, whichever is later', () => {
    expect(isProvisional({ rd: 350, matches: 0 })).toBe(true)
    expect(isProvisional({ rd: 99, matches: 19 })).toBe(true)
    expect(isProvisional({ rd: 100, matches: 40 })).toBe(true)
    expect(isProvisional({ rd: 99.9, matches: 20 })).toBe(false)
  })

  it('counts the matches to go, never below zero', () => {
    expect(matchesToGo({ rd: 350, matches: 0 })).toBe(20)
    expect(matchesToGo({ rd: 120, matches: 17 })).toBe(3)
    expect(matchesToGo({ rd: 120, matches: 25 })).toBe(0)
  })
})

describe('scores', () => {
  it('give a win 1, a draw 0.5 and a loss (forfeits included) 0', () => {
    expect(SCORE).toEqual({ win: 1, draw: 0.5, loss: 0 })
  })
})
