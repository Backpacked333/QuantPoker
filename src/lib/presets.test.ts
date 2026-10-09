import { describe, expect, it } from 'vitest'
import { buildPresets } from './presets'

describe('buildPresets', () => {
  it('sizes against the pot after calling, clamped to the legal range', () => {
    // Facing a 40 bet into 120 (pot 160 including it), 40 to call.
    const presets = buildPresets(
      { canRaise: true, minRaiseTo: 80, maxRaiseTo: 1900 },
      160,
      40,
      [0, 40],
    )
    expect(presets.map((p) => [p.key, p.to])).toEqual([
      ['1', 140],
      ['2', 190],
      ['3', 240],
      ['4', 1900],
    ])
  })
  it('clamps to the minimum and maximum', () => {
    const presets = buildPresets(
      { canRaise: true, minRaiseTo: 200, maxRaiseTo: 220 },
      100,
      0,
      [0, 0],
    )
    expect(presets.map((p) => p.to)).toEqual([200, 200, 200, 220])
  })
  it('is empty when raising is not allowed', () => {
    expect(
      buildPresets(
        { canRaise: false, minRaiseTo: 0, maxRaiseTo: 0 },
        100,
        50,
        [0, 50],
      ),
    ).toEqual([])
  })
})
