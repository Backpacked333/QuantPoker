// What a finished match means for one seat, in words. A rated match is
// decided by its outcome (the luck-adjusted total and the draw band, or a
// forfeit), never by the chips actually won; a casual one by its chips.
import type { SeatId } from '../engine/types'
import { isProvisional, matchesToGo } from '../rating/rules'
import type { Outcome, RatingChange, ServerMsg } from '../shared/protocol'

export type MatchResult = Extract<ServerMsg, { t: 'match_end' }>['result']

const chips = (n: number) => Math.round(n).toLocaleString('en-US')
/** Chips in big blinds, signed, one decimal: "+3.5", "-3.5", "0.0". */
export const inBb = (n: number, bb: number) => {
  const text = (n / bb).toFixed(1)
  return text.startsWith('-') || text === '0.0' ? text : `+${text}`
}

/** `bb` is the big blind, for the luck-adjusted total; omitted, no total. */
export function matchOverText(
  result: MatchResult,
  you: SeatId,
  bb?: number,
): string {
  const outcome = result.outcomeBySeat?.[you]
  if (outcome) {
    const said =
      outcome === 'win' ? 'you won' : outcome === 'loss' ? 'you lost' : 'a draw'
    if (result.reason === 'forfeit') return `Match over: ${said} by forfeit.`
    const adjusted = result.adjustedBySeat?.[you]
    if (adjusted === undefined || !bb) return `Match over: ${said}.`
    return `Match over: ${said}, ${inBb(adjusted, bb)} bb luck-adjusted.`
  }
  if (result.reason === 'abandoned')
    return 'Match over: both players left, so it is void and not rated.'
  // Halted, not decided: nobody won it.
  if (result.reason === 'engine_fault')
    return result.adjustedBySeat
      ? 'Match over: a server fault stopped it, so it is void and not rated.'
      : 'Match over: a server fault stopped it.'
  const net = result.netBySeat[you] ?? 0
  return `Match over: ${net >= 0 ? 'you won' : 'you lost'} ${chips(Math.abs(net))} chips.`
}

/**
 * The end screen's headline for a rated match with a result: the
 * luck-adjusted total and the outcome ("+12.5 bb · Win"), or the outcome
 * after a forfeit. Null for casual and void matches.
 */
export function matchHeadline(
  result: MatchResult,
  you: SeatId,
  bb?: number,
): string | null {
  const outcome = result.outcomeBySeat?.[you]
  if (!outcome) return null
  const word = outcome === 'win' ? 'Win' : outcome === 'loss' ? 'Loss' : 'Draw'
  if (result.reason === 'forfeit') return `${word} by forfeit`
  const adjusted = result.adjustedBySeat?.[you]
  if (adjusted === undefined || !bb) return word
  return `${inBb(adjusted, bb)} bb · ${word}`
}

/**
 * The rating change after a rated match, and why: "Rating 1520 → 1534
 * (+14): beat a 1610 ± 80 player". The opponent's rating is theirs before
 * the match, which is what Glicko-2 rated you against. Null until applied.
 */
export function ratingLine(
  change: Partial<Record<SeatId, RatingChange>> | null,
  you: SeatId,
  outcome: Outcome | undefined,
): { line: string; standing: string } | null {
  const mine = change?.[you]
  const theirs = change?.[(1 - you) as SeatId]
  if (!mine || !theirs || !outcome) return null
  const before = Math.round(mine.before.rating)
  const after = Math.round(mine.after.rating)
  const delta = after - before
  const verb =
    outcome === 'win' ? 'beat' : outcome === 'loss' ? 'lost to' : 'drew with'
  const opponent = `${Math.round(theirs.before.rating)} ± ${Math.round(theirs.before.rd)}`
  const standing = isProvisional({ rd: mine.after.rd, matches: mine.matches })
    ? matchesToGo({ rd: mine.after.rd, matches: mine.matches }) > 0
      ? `Provisional: ${matchesToGo({ rd: mine.after.rd, matches: mine.matches })} rated matches to go.`
      : 'Provisional until your rating deviation is under 100.'
    : 'Established rating.'
  return {
    line: `Rating ${before} → ${after} (${delta >= 0 ? '+' : '−'}${Math.abs(delta)}): ${verb} a ${opponent} player. Now ${after} ± ${Math.round(mine.after.rd)}.`,
    standing,
  }
}
