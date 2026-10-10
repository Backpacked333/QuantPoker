import { describe, expect, it, vi } from 'vitest'
import { easeOutBack, easeOutCubic, lerp, linear, Tweens } from './tween'

describe('Tweens', () => {
  it('advances by time, waits for its delay and finishes once', () => {
    const t = new Tweens()
    const seen: number[] = []
    const done = vi.fn()
    t.add(0, 100, (p) => seen.push(p), { delay: 50, ease: linear, done })
    t.tick(25)
    expect(seen).toEqual([])
    t.tick(100)
    t.tick(150)
    t.tick(200)
    expect(seen).toEqual([0.5, 1])
    expect(done).toHaveBeenCalledTimes(1)
    expect(t.busy).toBe(false)
  })

  it('skips a beat to its end but leaves other tweens running', () => {
    const t = new Tweens()
    let beat = 0
    let other = 0
    const done = vi.fn()
    t.add(0, 1000, (p) => (beat = p), { beat: true, done })
    t.add(0, 1000, (p) => (other = p), { ease: linear })
    t.tick(100)
    expect(t.beatBusy).toBe(true)
    t.finish()
    expect(beat).toBe(1)
    expect(done).toHaveBeenCalledTimes(1)
    expect(t.beatBusy).toBe(false)
    expect(t.busy).toBe(true)
    expect(other).toBeCloseTo(0.1)
    t.finish(true)
    expect(other).toBe(1)
  })

  it('eases from 0 to 1', () => {
    for (const ease of [easeOutCubic, easeOutBack, linear]) {
      expect(ease(0)).toBeCloseTo(0)
      expect(ease(1)).toBeCloseTo(1)
    }
    expect(easeOutBack(0.8)).toBeGreaterThan(1)
    expect(lerp(2, 4, 0.25)).toBe(2.5)
  })
})
