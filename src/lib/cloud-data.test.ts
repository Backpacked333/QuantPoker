import { describe, expect, it } from 'vitest'
import { acknowledge, emptyCache, mergeProgress } from './cloud-data'

describe('cloud merge and acknowledgement', () => {
  it('deduplicates imported history and keeps the latest 100 in the UI', () => {
    const hands = Array.from({ length: 110 }, (_, i) => ({
      id: String(i),
      hand: i + 1,
      net: i,
      result: 'Result',
      guided: false,
    }))
    const result = mergeProgress(
      { hands, lessons: ['equity'] },
      { hands: [hands[109]], lessons: ['equity', 'options'] },
    )
    expect(result.hands).toHaveLength(100)
    expect(result.hands[0].id).toBe('10')
    expect(result.lessons).toEqual(['equity', 'options'])
  })
  it('does not acknowledge a setting changed after the request started', () => {
    const sent = {
      ...emptyCache().pending,
      settings: { displayName: '', sound: true, fast: false },
    }
    const current = { ...sent, settings: { ...sent.settings, fast: true } }
    expect(acknowledge(current, sent).settings?.fast).toBe(true)
    expect(acknowledge(sent, sent).settings).toBeNull()
  })
})
