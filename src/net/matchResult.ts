// What a finished match means for one seat, in words. A rated match is
// decided by its outcome (the luck-adjusted total and the draw band, or a
// forfeit), never by the chips actually won; a casual one by its chips.
import type { SeatId } from '../engine/types'
import type { ServerMsg } from '../shared/protocol'

export type MatchResult = Extract<ServerMsg, { t: 'match_end' }>['result']

const chips = (n: number) => Math.round(n).toLocaleString('en-US')

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
    const inBb = (adjusted / bb).toFixed(1)
    const signed = inBb.startsWith('-') || inBb === '0.0' ? inBb : `+${inBb}`
    return `Match over: ${said}, ${signed} bb luck-adjusted.`
  }
  if (result.reason === 'abandoned')
    return 'Match over: both players left, so it is void and not rated.'
  const net = result.netBySeat[you] ?? 0
  return `Match over: ${net >= 0 ? 'you won' : 'you lost'} ${chips(Math.abs(net))} chips.`
}
