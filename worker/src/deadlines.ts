// Everything the table waits for, as data: one list, one alarm at its
// earliest entry. Each entry says exactly which decision or hand it belongs
// to, so a late, early or repeated alarm can never act on the wrong one.
import { legalActions } from '../../src/engine/hand'
import type { HandState, PlayerAction, SeatId } from '../../src/engine/types'

export type Deadline =
  | {
      kind: 'turn'
      at: number
      handNo: number
      actionIndex: number
      seat: SeatId
    }
  | { kind: 'nextHand'; at: number; handNo: number }
  | { kind: 'outbox'; at: number }
  /** A paired table both players must open by `at`, or it is a no-show. */
  | { kind: 'start'; at: number }
  /**
   * A table with no more play: an invite nobody joined, or a finished
   * match. At `at` it deletes itself once its archive calls are done.
   */
  | { kind: 'idle'; at: number }

/** A finished table keeps its storage this long for late arrivals. */
export const IDLE_MS = 600_000
/** An invite table nobody joined closes after this long. */
export const INVITE_TTL_MS = 24 * 3600_000

/** Consecutive missed decisions that end the match as a forfeit. */
export const FORFEIT_TIMEOUTS = 3

/** When the player to act runs out: their decision time, then their bank. */
export function turnDeadline(
  hand: HandState,
  startedAt: number,
  decisionMs: number,
  bankMs: number,
): Deadline | null {
  if (hand.toAct === null || hand.street === 'showdown') return null
  return {
    kind: 'turn',
    at: startedAt + decisionMs + bankMs,
    handNo: hand.config.handNo,
    actionIndex: hand.actions.length,
    seat: hand.toAct,
  }
}

/** True while `d` still refers to the decision `hand` is waiting on. */
export const isCurrentTurn = (d: Deadline, hand: HandState | null) =>
  d.kind === 'turn' &&
  !!hand &&
  hand.street !== 'showdown' &&
  hand.config.handNo === d.handNo &&
  hand.actions.length === d.actionIndex &&
  hand.toAct === d.seat

/** The bank left after a decision that took `tookMs`. */
export const bankAfter = (bankMs: number, tookMs: number, decisionMs: number) =>
  Math.max(0, bankMs - Math.max(0, tookMs - decisionMs))

/** What the table does for a player whose time ran out. */
export const timeoutAction = (hand: HandState): PlayerAction =>
  legalActions(hand).canCheck ? { type: 'check' } : { type: 'fold' }

/** Retry delay for the n-th failed archive write: 2 s doubling to 5 min. */
export const outboxBackoff = (attempts: number) =>
  Math.min(300_000, 2000 * 2 ** Math.max(0, attempts - 1))

export const earliest = (deadlines: Deadline[]) =>
  deadlines.length ? Math.min(...deadlines.map((d) => d.at)) : null
