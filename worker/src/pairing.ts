// Rated pairing rules (P1-13, ADR §Lobby), pure so the lobby and the
// liquidity simulation (scripts/pairing-sim.ts) share them.

/**
 * Two rated players may meet when their ratings are at most 100 apart, plus
 * 50 for every minute the longer waiter has waited, so nobody waits long for
 * a perfect match.
 */
export const RATING_WINDOW = { base: 100, perMinute: 50 }

/** While two or more rated players wait, pairing is retried this often. */
export const REPAIR_MS = 15_000

/** The widest rating gap two rated players may be paired across. */
export const ratingWindow = (waitedMs: number) =>
  RATING_WINDOW.base +
  (RATING_WINDOW.perMinute * Math.max(0, waitedMs)) / 60_000
