// One line of "why" for a graded challenge decision (L-4): what the best
// option was worth, in chips and as a share of the pot, with the price and
// the equity when there was a bet to call. Phrased as a challenge, never a
// put-down: the numbers do the talking.
import type { ChallengeNode, ChallengeOption } from '../challenge/score'

const pct = (x: number) => `${Math.round(x * 100)}%`
const chips = (x: number) => Math.round(x).toLocaleString('en-US')

/** The break-even equity for calling `toCall` into `pot`. */
export const breakEven = (node: ChallengeNode) =>
  node.toCall ? node.toCall / (node.pot + node.toCall) : 0

export function why(node: ChallengeNode, chosen: ChallengeOption) {
  const best = node.options.find((o) => o.best) ?? chosen
  const price = node.toCall
    ? ` You had about ${pct(node.equity)} equity against Atlas's likely hands; calling needed ${pct(breakEven(node))}.`
    : ` You had about ${pct(node.equity)} equity against Atlas's likely hands.`
  if (chosen === best || chosen.accuracy >= 100)
    return `${chosen.label} was the highest-value play.${price}`
  const lost = Math.max(0, best.ev - chosen.ev)
  return `${best.label} was worth about ${chips(lost)} more chips, ${pct(lost / Math.max(1, node.pot))} of the pot.${price}`
}

/** Atlas's action as a short label for its speech bubble. */
export function atlasSays(code: string, toCall: number) {
  if (code === 'f') return 'Fold.'
  if (code === 'c') return toCall ? `Call ${chips(toCall)}.` : 'Check.'
  return `${toCall ? 'Raise to' : 'Bet'} ${chips(Number(code.slice(1)))}.`
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return suffix
}

/** Grade bands as a share of the pot given up (src/lib/grading.ts). */
export const GRADE_BANDS = [
  ['Best', 'up to 3% of the pot'],
  ['Good', 'up to 8%'],
  ['Inaccuracy', 'up to 18%'],
  ['Mistake', 'up to 35%'],
  ['Blunder', 'more than 35%'],
] as const
