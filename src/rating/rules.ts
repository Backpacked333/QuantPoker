// The product rules around the rating (rating-and-leaderboard.md): what
// counts as a draw, when a rating is provisional, and who may appear on the
// ladder. Pure; the ladder SQL (supabase/migrations/…_ladder.sql) applies
// the same numbers, and the Method page (src/info/Method.tsx) states them.

/**
 * A luck-adjusted lead of at most this many big blinds is a draw (R-8;
 * exactly 2.00 is a draw). The rated table decides with it
 * (worker/src/rated.ts).
 */
export const DRAW_BAND_BB = 2

/** Provisional while RD is at least this… */
export const PROVISIONAL_RD = 100
/** …or fewer than this many rated matches are played ("whichever is later"). */
export const PROVISIONAL_MATCHES = 20
/** The ladder lists only players with a rated match in this many days… */
export const ACTIVE_DAYS = 30
/** …and abandonment below this share of rated matches (exactly 10% is out). */
export const MAX_ABANDONMENT = 0.1

export type Standing = { rd: number; matches: number }

/** Provisional until RD < 100 and at least 20 matches, whichever is later. */
export const isProvisional = ({ rd, matches }: Standing) =>
  rd >= PROVISIONAL_RD || matches < PROVISIONAL_MATCHES

/** Rated matches still to play before the 20-match floor ("X matches to go"). */
export const matchesToGo = ({ matches }: Standing) =>
  Math.max(0, PROVISIONAL_MATCHES - matches)
