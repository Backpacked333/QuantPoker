// Every decision of an archived heads-up hand, graded against the human
// population model: what the grading consumer runs (worker/src/grade.ts).
// Each decision is replayed from the deck and seen exactly as that player
// saw it (the redacted view: their own cards, the board, the actions), so a
// grade can never use the opponent's hidden cards. Pure and deterministic.
import { replayHand } from '../engine/hand'
import { toHeroGame } from '../engine/project'
import { seatView } from '../engine/redact'
import type { HandRecordV1 } from '../shared/protocol'
import { gradeVsPopulation } from './grader'
import type { Action } from './poker'

/** One graded decision, as record_grades takes it. */
export type GradeRow = {
  seat: number
  /** The decision's index in the hand's actions (record.actions). */
  idx: number
  grade: 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'
  evLost: number
  accuracy: number
  /** The pot the grade is a share of, so aggregates can weigh by stakes. */
  pot: number
}

/**
 * Heads-up only. Every move is graded, including one the clock made for a
 * player who ran out of time: leaving hard spots to the clock must not hide
 * them from the grade (the QA review in .10x/decisions/qa/accuracy.md).
 */
export function gradeHand(record: HandRecordV1, deck: number[]): GradeRow[] {
  if (record.config.seats.length !== 2) return []
  const states = replayHand(
    record.config,
    deck,
    record.actions.map(({ seat, action }) => ({ seat, action })),
  )
  const rows: GradeRow[] = []
  record.actions.forEach((entry, idx) => {
    const view = seatView(states[idx], entry.seat, {
      matchId: record.matchId,
      match: {
        kind: 'hu-rated',
        status: 'playing',
        handsTotal: 0,
        players: [],
      },
      clock: null,
      lastReqId: null,
      commitment: null,
    })
    const game = toHeroGame(view)
    const graded = gradeVsPopulation(game, entry.action as Action)
    rows.push({
      seat: entry.seat,
      idx,
      grade: graded.grade.toLowerCase() as GradeRow['grade'],
      evLost: graded.evLost,
      accuracy: graded.accuracy,
      pot: game.pot,
    })
  })
  return rows
}
