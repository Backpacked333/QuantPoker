// A tiny tween engine for the landing stage: time-based, eased, skippable.
// Pure (the clock is passed in), so it is tested without a GPU.

export type Ease = (t: number) => number

export const easeOutCubic: Ease = (t) => 1 - (1 - t) ** 3
export const easeInOutCubic: Ease = (t) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
export const easeOutBack: Ease = (t) => {
  const c = 1.4
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}
export const linear: Ease = (t) => t

export type Tween = {
  /** Start time, ms. */
  at: number
  duration: number
  ease: Ease
  /** Called with eased progress 0–1. */
  update: (p: number) => void
  done?: () => void
  /** Part of a skippable beat. */
  beat: boolean
}

export class Tweens {
  private list: Tween[] = []

  get busy() {
    return this.list.length > 0
  }
  get beatBusy() {
    return this.list.some((t) => t.beat)
  }

  /** Starts `duration` ms after `now + delay`. */
  add(
    now: number,
    duration: number,
    update: (p: number) => void,
    {
      delay = 0,
      ease = easeOutCubic,
      done,
      beat = false,
    }: { delay?: number; ease?: Ease; done?: () => void; beat?: boolean } = {},
  ) {
    const tween: Tween = { at: now + delay, duration, ease, update, done, beat }
    this.list.push(tween)
    return tween
  }

  /** Advances every tween to `now`; finished ones run `done` once. */
  tick(now: number) {
    const finished: Tween[] = []
    for (const t of this.list) {
      if (now < t.at) continue
      const raw = t.duration ? Math.min(1, (now - t.at) / t.duration) : 1
      t.update(t.ease(raw))
      if (raw >= 1) finished.push(t)
    }
    if (!finished.length) return
    this.list = this.list.filter((t) => !finished.includes(t))
    for (const t of finished) t.done?.()
  }

  /** Jumps every beat tween (or all, with `all`) to its end. */
  finish(all = false) {
    const ending = this.list.filter((t) => all || t.beat)
    this.list = this.list.filter((t) => !ending.includes(t))
    for (const t of ending) {
      t.update(1)
      t.done?.()
    }
  }

  clear() {
    this.list = []
  }
}

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p
