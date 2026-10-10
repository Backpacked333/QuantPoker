// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { matchHeadline, matchOverText, ratingLine } from './matchResult'

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

  it('never names a winner of a match a server fault stopped', () => {
    const fault = {
      netBySeat: { 0: 100, 1: -100 },
      reason: 'engine_fault' as const,
    }
    expect(
      matchOverText({ ...fault, adjustedBySeat: { 0: 100, 1: -100 } }, 0, 20),
    ).toBe(
      'Match over: a server fault stopped it, so it is void and not rated.',
    )
    expect(matchOverText(fault, 0, 20)).toBe(
      'Match over: a server fault stopped it.',
    )
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

  it('heads the end screen with the luck-adjusted bb and the outcome', () => {
    const rated = {
      netBySeat: { 0: 220, 1: -220 },
      reason: 'complete' as const,
      adjustedBySeat: { 0: 250, 1: -250 },
      outcomeBySeat: { 0: 'win' as const, 1: 'loss' as const },
    }
    expect(matchHeadline(rated, 0, 20)).toBe('+12.5 bb · Win')
    expect(matchHeadline(rated, 1, 20)).toBe('-12.5 bb · Loss')
    expect(matchHeadline(rated, 0)).toBe('Win')
    expect(
      matchHeadline(
        {
          ...rated,
          adjustedBySeat: { 0: -30, 1: 30 },
          outcomeBySeat: { 0: 'draw', 1: 'draw' },
        },
        1,
        20,
      ),
    ).toBe('+1.5 bb · Draw')
    expect(
      matchHeadline({ ...rated, reason: 'forfeit', forfeit: 0 }, 0, 20),
    ).toBe('Win by forfeit')
    // Casual, and void rated matches, have no headline.
    expect(
      matchHeadline({ netBySeat: { 0: 1, 1: -1 }, reason: 'complete' }, 0, 20),
    ).toBeNull()
    expect(
      matchHeadline(
        {
          netBySeat: { 0: 0, 1: 0 },
          reason: 'abandoned',
          abandoned: [0, 1],
          adjustedBySeat: { 0: 0, 1: 0 },
        },
        0,
        20,
      ),
    ).toBeNull()
  })
})

describe('the rating line', () => {
  const change = (
    me: [number, number, number, number],
    them: [number, number],
    matches: number,
  ) => ({
    0: {
      before: { rating: me[0], rd: me[1] },
      after: { rating: me[2], rd: me[3] },
      matches,
    },
    1: {
      before: { rating: them[0], rd: them[1] },
      after: { rating: them[0] - 10, rd: them[1] },
      matches: 30,
    },
  })

  it('reads the change and why: "1520 → 1534 (+14): beat a 1610 ± 80 player"', () => {
    expect(
      ratingLine(change([1520, 95, 1534.4, 92], [1610.2, 80.4], 25), 0, 'win'),
    ).toEqual({
      line: 'Rating 1520 → 1534 (+14): beat a 1610 ± 80 player. Now 1534 ± 92.',
      standing: 'Established rating.',
    })
  })

  it('reads a loss and a draw, with the minus sign', () => {
    expect(
      ratingLine(change([1500, 120, 1488, 115], [1400, 60], 25), 0, 'loss')!
        .line,
    ).toBe(
      'Rating 1500 → 1488 (−12): lost to a 1400 ± 60 player. Now 1488 ± 115.',
    )
    expect(
      ratingLine(change([1500, 120, 1503, 115], [1550, 60], 25), 0, 'draw')!
        .line,
    ).toMatch(/\(\+3\): drew with a 1550 ± 60 player/)
  })

  it('says how long a rating stays provisional', () => {
    expect(
      ratingLine(change([1500, 350, 1662, 290], [1500, 350], 1), 0, 'win')!
        .standing,
    ).toBe('Provisional: 19 rated matches to go.')
    expect(
      ratingLine(change([1500, 130, 1510, 120], [1500, 80], 24), 0, 'win')!
        .standing,
    ).toBe('Provisional until your rating deviation is under 100.')
  })

  it('is nothing until the change is applied, or for a match without an outcome', () => {
    expect(ratingLine(null, 0, 'win')).toBeNull()
    expect(
      ratingLine(change([1500, 350, 1662, 290], [1500, 350], 1), 0, undefined),
    ).toBeNull()
  })
})
