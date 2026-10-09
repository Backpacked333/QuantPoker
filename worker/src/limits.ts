// How many frames one socket may send. Every frame a Durable Object reads is
// work on a single thread shared by everyone in it (the whole lobby, or both
// seats of a table), so each socket gets a token bucket: a burst of
// FRAMES_PER_WINDOW, refilled at that many per WINDOW_MS. A socket that runs
// dry is closed with CLOSE_RATE_LIMITED; honest clients reconnect after a
// backoff and keep their seat.
//
// Buckets live in memory, keyed by the socket object. Hibernation drops them,
// which is harmless: an object only hibernates after it has been quiet.

export const FRAMES_PER_WINDOW = 20
export const WINDOW_MS = 5000
export const CLOSE_RATE_LIMITED = 4429

type Bucket = { tokens: number; at: number }

export class FrameBudget {
  private buckets = new WeakMap<WebSocket, Bucket>()

  /** `clock` is read on every frame, so a test can move it. */
  constructor(private readonly clock: () => number) {}

  /** Spends one frame; false when the socket has none left. */
  spend(ws: WebSocket): boolean {
    const bucket = this.refill(ws)
    if (bucket.tokens < 1) return false
    bucket.tokens -= 1
    return true
  }

  /** Gives a frame back, for one that did useful work (an applied move). */
  refund(ws: WebSocket) {
    const bucket = this.refill(ws)
    bucket.tokens = Math.min(FRAMES_PER_WINDOW, bucket.tokens + 1)
  }

  private refill(ws: WebSocket) {
    const t = this.clock()
    const bucket = this.buckets.get(ws) ?? { tokens: FRAMES_PER_WINDOW, at: t }
    const earned = (Math.max(0, t - bucket.at) * FRAMES_PER_WINDOW) / WINDOW_MS
    bucket.tokens = Math.min(FRAMES_PER_WINDOW, bucket.tokens + earned)
    bucket.at = t
    this.buckets.set(ws, bucket)
    return bucket
  }
}
