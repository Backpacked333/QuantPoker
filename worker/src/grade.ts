// Grades a verified rated heads-up hand (P1-09) in the hands queue consumer,
// off the game path, and writes the grades. They are readable only after the
// match (hand_grades RLS). A failure here throws, so the message is retried
// and finally dead-lettered as an incident; play, the match result and the
// rating never wait on it.
import { GRADE_VERSION } from '../../src/lib/grader'
import { gradeHand } from '../../src/lib/gradeHand'
import type { WorkerEnv } from './env'
import { logEvent } from './log'
import { rpc } from './supabase'
import type { AuditedHand } from './verify'

/** The rating format these grades count for (hand_grades.format). */
export const HU_FORMAT = 'hu-duplicate'

/** Grades a verified rated hand and writes the grades (idempotent). */
export async function gradeArchived(env: WorkerEnv, hand: AuditedHand) {
  const grades = gradeHand(hand.record, hand.deck)
  if (!grades.length) return
  await rpc(env, 'record_grades', {
    handId: hand.id,
    format: HU_FORMAT,
    modelVersion: GRADE_VERSION,
    grades,
  })
  logEvent('graded', { matchId: hand.matchId, handNo: hand.handNo })
}
