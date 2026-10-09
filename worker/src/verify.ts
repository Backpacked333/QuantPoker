// Every archived hand is re-verified off the game path (ADR §Post-hand
// grading placement). The table queues { matchId, handNo } once Postgres has
// the hand; this consumer reads it back with the service role, replays it
// from the full deck and checks it against its own commitment and record.
// A sound hand is marked `hands.verified`; anything else becomes one
// `incidents` row. Play never waits on any of this, and every step is safe
// to repeat: queue messages can be redelivered or arrive out of order.
import {
  commitDeck,
  dealSlots,
  fromBase64,
  toBase64,
  verifyDeal,
} from '../../src/engine/deck'
import type { RevealedSlot } from '../../src/engine/deck'
import { assertInvariants, isOver, replayHand } from '../../src/engine/hand'
import type { HandState } from '../../src/engine/types'
import type { HandRecordV1 } from '../../src/shared/protocol'
import type { WorkerEnv } from './env'
import { describeError, logEvent } from './log'
import { rpc } from './supabase'

export { HANDS_DLQ, HANDS_QUEUE } from './queues'

/** What the table sends for each archived hand. */
export type HandMessage = { matchId: string; handNo: number }

/** A hand as `audit_hand` returns it: the public row plus the private one. */
export type AuditedHand = {
  id: string
  matchId: string
  handNo: number
  commitment: string
  /** Base64 of all 52 leaves. */
  leaves: string
  reveal: RevealedSlot[]
  record: HandRecordV1
  verified: boolean
  deck: number[]
  /** Base64 of the 32-byte hand secret. */
  secret: string
  holes: Record<string, number[]>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Why `hand` is not what the table said it was: fixed words, never cards.
 * Empty when it replays from its deck to exactly its record, and the deck
 * matches the commitment players saw before the deal.
 */
export async function problemsWith(hand: AuditedHand): Promise<string[]> {
  const problems = new Set<string>()
  const { record } = hand
  if (
    record.matchId !== hand.matchId ||
    record.handNo !== hand.handNo ||
    hand.id !== `${hand.matchId}:${hand.handNo}`
  )
    problems.add('ids')

  // The deck and secret open to the commitment the players were sent.
  try {
    const { commitment, leaves } = await commitDeck(
      hand.deck,
      fromBase64(hand.secret),
    )
    if (commitment !== hand.commitment || record.commitment !== hand.commitment)
      problems.add('commitment')
    if (toBase64(leaves) !== hand.leaves) problems.add('leaves')
  } catch {
    problems.add('commitment')
  }

  // The recorded actions, replayed from that deck, give the recorded hand.
  let states: HandState[] = []
  try {
    states = replayHand(
      record.config,
      hand.deck,
      record.actions.map(({ seat, action }) => ({ seat, action })),
    )
  } catch {
    problems.add('replay')
  }
  const final = states.at(-1)
  if (final) {
    const chips = record.config.seats.reduce((sum, s) => sum + s.stack, 0)
    try {
      for (const state of states) assertInvariants(state, chips)
    } catch {
      problems.add('chips')
    }
    if (!isOver(final) || !final.result) problems.add('unfinished')
    else if (
      !same(final.result.netBySeat, record.netBySeat) ||
      !same(final.result.awards, record.awards) ||
      final.result.showdown !== record.showdown
    )
      problems.add('result')
    if (!same(final.board, record.board)) problems.add('board')
    const shown = final.players
      .filter((p) => p.shown && p.cards)
      .map((p) => ({ seat: p.seat, cards: p.cards }))
    if (!same(shown, record.shown)) problems.add('shown')
  }

  // The public reveal opens exactly the board and shown hands.
  try {
    if (
      !(await verifyDeal(
        hand.commitment,
        fromBase64(hand.leaves),
        hand.reveal,
        record,
      ))
    )
      problems.add('reveal')
  } catch {
    problems.add('reveal')
  }

  // The private copy of each seat's cards is what the deck dealt them.
  try {
    const slots = dealSlots(record.config).holes
    for (const { seat } of record.config.seats)
      if (
        !same(
          slots[seat].map((s) => hand.deck[s]),
          hand.holes[String(seat)],
        )
      )
        problems.add('holes')
  } catch {
    problems.add('holes')
  }
  return [...problems]
}

function parseMessage(body: unknown): HandMessage | null {
  if (typeof body !== 'object' || body === null) return null
  const { matchId, handNo } = body as Record<string, unknown>
  return typeof matchId === 'string' &&
    UUID.test(matchId) &&
    Number.isSafeInteger(handNo) &&
    (handNo as number) >= 1
    ? { matchId, handNo: handNo as number }
    : null
}

/** Seconds before the n-th retry: 10 s doubling, at most 10 minutes. */
export const retryDelay = (attempts: number) =>
  Math.min(600, 10 * 2 ** Math.max(0, attempts - 1))

/** One hand: verified, failed (an incident), or not archived yet. */
async function verifyArchived(
  env: WorkerEnv,
  { matchId, handNo }: HandMessage,
) {
  const id = `${matchId}:${handNo}`
  const hand = await rpc<AuditedHand>(env, 'audit_hand', { id })
  if (!hand) return 'missing'
  // A redelivery after a success: nothing to do.
  if (hand.verified) return 'verified'
  const problems = await problemsWith(hand)
  if (problems.length === 0) {
    await rpc(env, 'verify_hand', { id })
    logEvent('verified', { matchId, handNo })
    return 'verified'
  }
  await rpc(env, 'record_incident', {
    matchId,
    handNo,
    kind: 'verify_failed',
    detail: { problems },
  })
  logEvent('verify_failed', { matchId, handNo, detail: problems.join(',') })
  return 'failed'
}

/** The `quantpoker-hands` consumer (one message per batch in production). */
export async function consumeHands(batch: MessageBatch, env: WorkerEnv) {
  for (const message of batch.messages) {
    const body = parseMessage(message.body)
    if (!body) {
      // Retrying cannot fix it: say so once and drop it.
      logEvent('error', { reason: 'bad_hand_message' })
      message.ack()
      continue
    }
    try {
      if ((await verifyArchived(env, body)) === 'missing')
        message.retry({ delaySeconds: retryDelay(message.attempts) })
      else message.ack()
    } catch (error) {
      logEvent('error', {
        ...body,
        reason: 'verify',
        attempt: message.attempts,
        detail: describeError(error),
      })
      message.retry({ delaySeconds: retryDelay(message.attempts) })
    }
  }
}

/** The DLQ consumer: a hand that could not be verified is an incident. */
export async function consumeDeadLetters(batch: MessageBatch, env: WorkerEnv) {
  for (const message of batch.messages) {
    const body = parseMessage(message.body)
    try {
      await rpc(env, 'record_incident', {
        matchId: body?.matchId ?? null,
        handNo: body?.handNo ?? null,
        kind: 'dlq',
        detail: { attempts: message.attempts },
      })
      logEvent('dlq', { ...body, attempt: message.attempts })
      message.ack()
    } catch (error) {
      logEvent('error', {
        ...body,
        reason: 'dlq',
        detail: describeError(error),
      })
      message.retry()
    }
  }
}
