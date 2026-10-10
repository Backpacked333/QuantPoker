// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { matchOverText } from './matchResult'

describe('the match-over text', () => {
  it('reads the rated outcome, not the chips: a forfeit while ahead is a loss', () => {
    const result = {
      netBySeat: { 0: -560, 1: 560 },
      reason: 'forfeit' as const,
      forfeit: 1,
      adjustedBySeat: { 0: -560, 1: 560 },
      outcomeBySeat: { 0: 'win' as const, 1: 'loss' as const },
    }
    expect(matchOverText(result, 1, 20)).toBe(
      'Match over: you lost by forfeit.',
    )
    expect(matchOverText(result, 0, 20)).toBe('Match over: you won by forfeit.')
  })

  it('reads a luck-adjusted win while behind on chips as a win, in bb', () => {
    const result = {
      netBySeat: { 0: -300, 1: 300 },
      reason: 'complete' as const,
      adjustedBySeat: { 0: 70, 1: -70 },
      outcomeBySeat: { 0: 'win' as const, 1: 'loss' as const },
    }
    expect(matchOverText(result, 0, 20)).toBe(
      'Match over: you won, +3.5 bb luck-adjusted.',
    )
    expect(matchOverText(result, 1, 20)).toBe(
      'Match over: you lost, -3.5 bb luck-adjusted.',
    )
    // Without a big blind to divide by, the outcome alone.
    expect(matchOverText(result, 0)).toBe('Match over: you won.')
  })

  it('reads a draw, and a void rated match', () => {
    expect(
      matchOverText(
        {
          netBySeat: { 0: 400, 1: -400 },
          reason: 'complete',
          adjustedBySeat: { 0: 40, 1: -40 },
          outcomeBySeat: { 0: 'draw', 1: 'draw' },
        },
        1,
        20,
      ),
    ).toBe('Match over: a draw, -2.0 bb luck-adjusted.')
    expect(
      matchOverText(
        {
          netBySeat: { 0: 0, 1: 0 },
          reason: 'abandoned',
          abandoned: [0, 1],
          adjustedBySeat: { 0: 0, 1: 0 },
        },
        0,
        20,
      ),
    ).toBe('Match over: both players left, so it is void and not rated.')
  })

  it('reads a casual match by its chips, as before', () => {
    const result = {
      netBySeat: { 0: 1240, 1: -1240 },
      reason: 'complete' as const,
    }
    expect(matchOverText(result, 0, 20)).toBe(
      'Match over: you won 1,240 chips.',
    )
    expect(matchOverText(result, 1, 20)).toBe(
      'Match over: you lost 1,240 chips.',
    )
  })
})
