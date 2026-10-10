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
}

/**
 * Heads-up only. Moves the clock made for a player who ran out of time are
 * not decisions, so they are not graded.
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
    if (entry.source !== 'client') return
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
    const graded = gradeVsPopulation(toHeroGame(view), entry.action as Action)
    rows.push({
      seat: entry.seat,
      idx,
      grade: graded.grade.toLowerCase() as GradeRow['grade'],
      evLost: graded.evLost,
      accuracy: graded.accuracy,
    })
  })
  return rows
}
