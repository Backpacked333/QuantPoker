import { describe, expect, it } from 'vitest'
import { ratingText, standingLine, trendText, winRate } from './ladder'
import type { Standing } from './ladder'

const NOW = Date.parse('2026-10-10T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
const standing = (s: Partial<Standing>): Standing => ({
  rating: 1612.4,
  rd: 64.2,
  matches: 30,
  abandoned: 0,
  lastMatchAt: daysAgo(1),
  ...s,
})

describe('the ladder’s formatting', () => {
  it('never shows a rating without its ±', () => {
    expect(ratingText({ rating: 1612.4, rd: 64.6 })).toBe('1612 ± 65')
  })

  it('win rate is wins over matches; trend is signed', () => {
    expect(winRate({ wins: 13, matches: 20 })).toBe('65%')
    expect(winRate({ wins: 0, matches: 0 })).toBe('–')
    expect(trendText(18.4)).toBe('+18')
    expect(trendText(-7.6)).toBe('−8')
    expect(trendText(0.2)).toBe('0')
    expect(trendText(null)).toBe('–')
  })
})

describe('where the viewer stands', () => {
  it('provisional players see how many matches are left', () => {
    expect(standingLine(standing({ matches: 13, rd: 140 }), NOW)).toBe(
      'Your rating is 1612 ± 140, provisional: 7 rated matches to go.',
    )
    expect(standingLine(standing({ matches: 19, rd: 90 }), NOW)).toMatch(
      /provisional: 1 rated match to go\.$/,
    )
  })

  it('20 matches with the ± still 100 or more is provisional too ("whichever is later")', () => {
    expect(standingLine(standing({ matches: 24, rd: 100 }), NOW)).toBe(
      'Your rating is 1612 ± 100, provisional until the ± is under 100: keep playing rated matches.',
    )
  })

  it('no rated match yet', () => {
    for (const s of [null, standing({ matches: 0, rd: 350 })])
      expect(standingLine(s, NOW)).toBe(
        'You have no rated matches yet. Your rating appears on the ladder after 20.',
      )
  })

  it('exactly 10% abandoned is off the ladder; just under is on (the SQL’s rule)', () => {
    expect(standingLine(standing({ matches: 30, abandoned: 3 }), NOW)).toMatch(
      /off the ladder while abandoned matches are 10% or more .*\(3 of 30\)\.$/,
    )
    expect(standingLine(standing({ matches: 31, abandoned: 3 }), NOW)).toBe(
      'Your rating is 1612 ± 64. You are on the ladder.',
    )
  })

  it('no rated match in 30 days is off the ladder; 29 days is on', () => {
    expect(standingLine(standing({ lastMatchAt: daysAgo(31) }), NOW)).toMatch(
      /off the ladder until you play a rated match: your last was over 30 days ago\.$/,
    )
    expect(standingLine(standing({ lastMatchAt: daysAgo(29) }), NOW)).toMatch(
      /You are on the ladder\.$/,
    )
  })
})
