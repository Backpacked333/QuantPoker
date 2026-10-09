// Luck adjustment for rated heads-up (tickets.md Q1 = B, P1-02). Every hand
// is dealt from a fresh deck; to take card luck out of the result, a pot
// that was all in before the river is settled at each player's equity at the
// moment the betting ended, counted exactly over every remaining board, not
// by the cards that actually came. Hands with no cards left to come (a fold,
// or betting that reached the river) are unchanged. Pure and deterministic:
// the table server, the verify consumer and the review all get the same
// numbers. Heads-up only.
import { score } from '../lib/sim'
import type { HandState, SeatId } from './types'

export type Adjustment = {
  /** Net chips per seat with the all-in pot settled at equity. */
  netBySeat: Record<SeatId, number>
  /** Board cards known when the betting ended (0, 3 or 4); null if unchanged. */
  allInAt: number | null
  /** Each seat's share of that pot; null if unchanged. */
  equity: Record<SeatId, number> | null
}

/**
 * Board cards known when the betting ended with cards still to come, or null
 * when nothing was left to chance: a fold, a showdown reached by betting
 * through the river, or more than two players.
 */
export function allInPoint(state: HandState): number | null {
  if (!state.result?.showdown) return null
  if (state.players.filter((p) => !p.folded).length !== 2) return null
  const last = state.actions[state.actions.length - 1]
  const known = last ? last.boardCount : 0
  return known < 5 ? known : null
}

/**
 * Seat A's exact share of a two-way pot over every completion of `board`:
 * wins count 1, ties 1/2. Preflop this scores 1,712,304 boards (≈ 0.5 s of
 * CPU in Node), after the flop 990, after the turn 44.
 */
export function equity(a: number[], b: number[], board: number[]): number {
  const dead = new Uint8Array(52)
  for (const c of [...a, ...b, ...board]) dead[c] = 1
  const live: number[] = []
  for (let c = 0; c < 52; c++) if (!dead[c]) live.push(c)
  const ha = new Int32Array(7)
  const hb = new Int32Array(7)
  ha[0] = a[0]
  ha[1] = a[1]
  hb[0] = b[0]
  hb[1] = b[1]
  board.forEach((c, i) => (ha[2 + i] = hb[2 + i] = c))
  // Halves: a win counts 2, a tie 1, so the sum stays an exact integer.
  let halves = 0
  let boards = 0
  const fill = (pos: number, start: number) => {
    if (pos === 7) {
      const sa = score(ha, 7)
      const sb = score(hb, 7)
      halves += sa > sb ? 2 : sa === sb ? 1 : 0
      boards++
      return
    }
    for (let i = start; i <= live.length - (7 - pos); i++) {
      ha[pos] = hb[pos] = live[i]
      fill(pos + 1, i + 1)
    }
  }
  fill(2 + board.length, 0)
  return halves / (2 * boards)
}

/** The hand's result with an all-in pot settled at equity (see above). */
export function luckAdjusted(state: HandState): Adjustment {
  const result = state.result!
  const at = allInPoint(state)
  if (at === null)
    return { netBySeat: result.netBySeat, allInAt: null, equity: null }
  const [p, q] = state.players.filter((s) => !s.folded)
  const eqP = equity(p.cards!, q.cards!, state.board.slice(0, at))
  const share: Record<SeatId, number> = { [p.seat]: eqP, [q.seat]: 1 - eqP }
  const pot = result.awards.reduce((t, a) => t + a.amount, 0)
  const netBySeat: Record<SeatId, number> = {}
  for (const seat of [p.seat, q.seat]) {
    const won = result.awards
      .filter((a) => a.seat === seat)
      .reduce((t, a) => t + a.amount, 0)
    netBySeat[seat] = result.netBySeat[seat] - won + share[seat] * pot
  }
  return { netBySeat, allInAt: at, equity: share }
}
