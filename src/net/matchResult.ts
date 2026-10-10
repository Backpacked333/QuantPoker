// What a finished match means for one seat, in words. A rated match is
// decided by its outcome (the luck-adjusted total and the draw band, or a
// forfeit), never by the chips actually won; a casual one by its chips.
import type { SeatId } from '../engine/types'
import type { ServerMsg } from '../shared/protocol'

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
