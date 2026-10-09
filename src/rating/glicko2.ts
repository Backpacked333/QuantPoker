// Glicko-2 (Glickman, "Example of the Glicko-2 system", 2013), pure: no I/O,
// no clock, no randomness. Ratings are stored and shown on the familiar
// scale (rating 1500 ± RD); the update runs on the Glicko-2 scale
// (μ, φ) internally. One rated match is one rating period (P1-11), and the
// caller passes elapsed idle periods in, so the same inputs always give the
// same rating (the server recomputes on a version conflict, P1-12).

/** Stored with every rating change (`rating_history.model_version`). */
export const VERSION = 'glicko2.v1'

/** Converts between the display scale and Glicko-2's: 400 / ln 10. */
export const SCALE = 173.7178

/**
 * System constant τ: how much volatility may change per period. Glickman
 * suggests 0.3–1.2; 0.5 is the middle of the commonly used range and
 * the value in his worked example.
 */
export const TAU = 0.5

/** Convergence tolerance for the volatility iteration (Glickman's ε). */
const EPSILON = 1e-6

/** A new player's rating, and the most uncertain RD a player can have. */
export const DEFAULT: Rating = { rating: 1500, rd: 350, sigma: 0.06 }
export const MAX_RD = 350

/** RD grows by one period for every 30 days without a rated match. */
export const IDLE_PERIOD_MS = 30 * 86_400_000

export type Rating = { rating: number; rd: number; sigma: number }
/** 1 win, 0.5 draw, 0 loss (forfeit and abandonment are losses). */
export type Score = 0 | 0.5 | 1
export type Game = { opponent: Rating; score: Score }

/** The new rating plus the intermediate values Glickman's example prints. */
export type PeriodDetail = Rating & {
  mu: number
  phi: number
  v: number
  delta: number
}

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / Math.PI ** 2)
const expected = (mu: number, muJ: number, phiJ: number) =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)))
const toRd = (phi: number) => Math.min(MAX_RD, phi * SCALE)

/** Step 5: the new volatility, by Glickman's Illinois iteration. */
function volatility(sigma: number, phi: number, v: number, delta: number) {
  const a = Math.log(sigma * sigma)
  const f = (x: number) => {
    const ex = Math.exp(x)
    const d = phi * phi + v + ex
    return (
      (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) -
      (x - a) / (TAU * TAU)
    )
  }
  let A = a
  let B: number
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v)
  else {
    let k = 1
    while (f(a - k * TAU) < 0) k++
    B = a - k * TAU
  }
  let fA = f(A)
  let fB = f(B)
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)
    if (fC * fB <= 0) {
      A = B
      fA = fB
    } else fA /= 2
    B = C
    fB = fC
  }
  return Math.exp(A / 2)
}

/** One rating period for `player`, with every intermediate value. */
export function explainPeriod(player: Rating, games: Game[]): PeriodDetail {
  const mu = (player.rating - 1500) / SCALE
  const phi = player.rd / SCALE
  if (games.length === 0) {
    // Step 6 only: an idle period widens the uncertainty.
    const phiIdle = Math.sqrt(phi * phi + player.sigma * player.sigma)
    return {
      ...idle(player, 1),
      mu,
      phi: phiIdle,
      v: Infinity,
      delta: 0,
    }
  }
  let invV = 0
  let sum = 0
  for (const { opponent, score } of games) {
    const muJ = (opponent.rating - 1500) / SCALE
    const phiJ = opponent.rd / SCALE
    const e = expected(mu, muJ, phiJ)
    invV += g(phiJ) ** 2 * e * (1 - e)
    sum += g(phiJ) * (score - e)
  }
  const v = 1 / invV
  const delta = v * sum
  const sigma = volatility(player.sigma, phi, v, delta)
  const phiStar = Math.sqrt(phi * phi + sigma * sigma)
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v)
  const muNew = mu + phiNew * phiNew * sum
  return {
    rating: SCALE * muNew + 1500,
    rd: toRd(phiNew),
    sigma,
    mu: muNew,
    phi: phiNew,
    v,
    delta,
  }
}

/** One rating period for `player` against the given games. */
export function ratePeriod(player: Rating, games: Game[]): Rating {
  const { rating, rd, sigma } = explainPeriod(player, games)
  return { rating, rd, sigma }
}

/**
 * One rated match: both players are rated from their ratings before it,
 * each as one period with one game. `scoreA` is A's result.
 */
export function rateMatch(
  a: Rating,
  b: Rating,
  scoreA: Score,
): [Rating, Rating] {
  return [
    ratePeriod(a, [{ opponent: b, score: scoreA }]),
    ratePeriod(b, [{ opponent: a, score: (1 - scoreA) as Score }]),
  ]
}

/** `periods` idle periods: RD grows, the rating and volatility stay. */
export function idle(player: Rating, periods: number): Rating {
  if (periods <= 0) return player
  let phi = player.rd / SCALE
  const cap = MAX_RD / SCALE
  for (let i = 0; i < periods && phi < cap; i++)
    phi = Math.sqrt(phi * phi + player.sigma * player.sigma)
  return { rating: player.rating, rd: toRd(phi), sigma: player.sigma }
}

/** Whole 30-day periods since the last rated match (none if never rated). */
export function idlePeriods(lastMatchAt: number | null, now: number) {
  if (lastMatchAt === null || now <= lastMatchAt) return 0
  return Math.floor((now - lastMatchAt) / IDLE_PERIOD_MS)
}
