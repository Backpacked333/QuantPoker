// How much one account may ask of a Durable Object. Every frame or connect an
// object handles is work on a single thread shared by everyone in it (the
// whole lobby, or both seats of a table), so each account gets a token
// bucket there: a burst of FRAMES_PER_WINDOW, refilled at that many per
// WINDOW_MS. Frames and new sockets both spend from it, so reconnecting does
// not buy a fresh budget. A socket that runs dry is closed with
// CLOSE_RATE_LIMITED; honest clients reconnect after a backoff and keep their
// seat.
//
// Buckets live in memory, keyed by account. Hibernation drops them, which is
// harmless: an object only hibernates after it has been quiet, and a quiet
// bucket is full again within WINDOW_MS.

export { CLOSE_RATE_LIMITED } from '../../src/shared/protocol'

export const FRAMES_PER_WINDOW = 20
export const WINDOW_MS = 5000
/** Illegal frames one seat may send in one hand before it is closed. */
export const ILLEGAL_PER_HAND = 5
/** Invite tables one account may create per UTC day. */
export const MATCH_CREATES_PER_DAY = 30
/**
 * Signed-in requests (socket upgrades, /api/matches, /api/me) per client
 * address per minute. Must equal `ratelimits[IP_LIMITER].simple.limit` in
 * wrangler.jsonc (checked by scripts/wrangler-config.test.ts).
 */
export const UPGRADES_PER_IP_PER_MINUTE = 300

type Bucket = { tokens: number; at: number }

/** Buckets kept before full (idle) ones are dropped. */
const MAX_BUCKETS = 1000

export class FrameBudget {
  private buckets = new Map<string, Bucket>()

  /** `clock` is read on every frame, so a test can move it. */
  constructor(private readonly clock: () => number) {}

  /** Spends one frame or connect; false when the account has none left. */
  spend(userId: string): boolean {
    const bucket = this.refill(userId)
    if (bucket.tokens < 1) return false
    bucket.tokens -= 1
    if (this.buckets.size > MAX_BUCKETS) this.prune()
    return true
  }

  /** Gives a frame back, for one that did useful work (an applied move). */
  refund(userId: string) {
    const bucket = this.refill(userId)
    bucket.tokens = Math.min(FRAMES_PER_WINDOW, bucket.tokens + 1)
  }

  /** Forgets every account (tests start each case with full budgets). */
  clear() {
    this.buckets.clear()
  }

  private refill(userId: string) {
    const t = this.clock()
    const bucket = this.buckets.get(userId) ?? {
      tokens: FRAMES_PER_WINDOW,
      at: t,
    }
    const earned = (Math.max(0, t - bucket.at) * FRAMES_PER_WINDOW) / WINDOW_MS
    bucket.tokens = Math.min(FRAMES_PER_WINDOW, bucket.tokens + earned)
    bucket.at = t
    this.buckets.set(userId, bucket)
    return bucket
  }

  /** A full bucket is the same as no bucket: drop those. */
  private prune() {
    for (const userId of [...this.buckets.keys()])
      if (this.refill(userId).tokens >= FRAMES_PER_WINDOW)
        this.buckets.delete(userId)
  }
}
