import { afterEach, describe, expect, it, vi } from 'vitest'
import { readProgress, saveProgress } from './storage'

afterEach(() => vi.unstubAllGlobals())
describe('local progress storage', () => {
  it.each(['not json', 'null', '5', '{}'])(
    'recovers safely from %s',
    (value) => {
      vi.stubGlobal('localStorage', { getItem: () => value })
      expect(readProgress()).toEqual({ hands: [], lessons: [] })
    },
  )
  it('filters invalid records and deduplicates lessons', () => {
    vi.stubGlobal('localStorage', {
      getItem: () =>
        JSON.stringify({
          hands: [
            null,
            {},
            { id: '1', hand: 1, net: 20, result: 'Win', guided: false },
          ],
          lessons: ['options', 'options', 'not-a-lesson'],
        }),
    })
    expect(readProgress().hands).toHaveLength(1)
    expect(readProgress().lessons).toEqual(['options'])
  })
  it('handles blocked browser storage without breaking play', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Disabled')
      },
      setItem: () => {
        throw new Error('Disabled')
      },
    })
    expect(readProgress()).toEqual({ hands: [], lessons: [] })
    expect(saveProgress({ hands: [], lessons: [] })).toBe(false)
  })
  it('caps stored hand history at 100 records', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem })
    const hands = Array.from({ length: 110 }, (_, i) => ({
      id: String(i),
      hand: i,
      net: 10,
      result: 'Win',
      guided: false,
    }))
    expect(saveProgress({ hands, lessons: [] })).toBe(true)
    const saved = JSON.parse(setItem.mock.calls[0][1])
    expect(saved.hands).toHaveLength(100)
    expect(saved.hands[0].hand).toBe(10)
  })
})
