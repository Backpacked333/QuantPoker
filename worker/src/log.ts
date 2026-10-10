// One JSON line per event, ids only. Workers Logs indexes the fields of a
// JSON line, so every event can be found by evt, matchId, handNo or userId
// (README §Operations has the queries). Only the keys below are ever
// written: never cards, decks, secrets, tokens, client addresses or a full
// hand state. A full state on an engine fault goes to `incidents` (service
// role only) through the outbox instead.

export type LogEvent =
  | 'match_start'
  | 'hand_end'
  | 'match_end'
  | 'forfeit'
  | 'no_show'
  | 'limit_hit'
  | 'outbox_retry'
  /** An archive call Postgres kept refusing for its data, set aside. */
  | 'outbox_parked'
  | 'verified'
  | 'verify_failed'
  /** A verified rated hand's decisions were graded (P1-09). */
  | 'graded'
  | 'dlq'
  | 'error'

export type LogFields = {
  matchId?: string
  handNo?: number
  userId?: string
  /** Both accounts at a table, for match_start. */
  userIds?: string[]
  seat?: number
  /** A close code or HTTP status. */
  code?: number
  /** A fixed, short word: why it happened. */
  reason?: string
  /** An archive or queue function name. */
  rpc?: string
  attempt?: number
  /** Queued archive calls at this table. */
  depth?: number
  ms?: number
  /** A fixed error message (engine invariants, platform errors). */
  detail?: string
}

export const LOG_KEYS: string[] = [
  'evt',
  'matchId',
  'handNo',
  'userId',
  'userIds',
  'seat',
  'code',
  'reason',
  'rpc',
  'attempt',
  'depth',
  'ms',
  'detail',
] satisfies ('evt' | keyof LogFields)[]

const LOUD = new Set<LogEvent>([
  'verify_failed',
  'dlq',
  'outbox_parked',
  'error',
])

export function logEvent(evt: LogEvent, fields: LogFields = {}) {
  const line: Record<string, unknown> = { evt }
  for (const key of LOG_KEYS) {
    const value = (fields as Record<string, unknown>)[key]
    if (value === undefined) continue
    line[key] = typeof value === 'string' ? value.slice(0, 200) : value
  }
  const text = JSON.stringify(line)
  if (LOUD.has(evt)) console.error(text)
  else console.log(text)
}

/** A short, card-free description of something thrown. */
export function describeError(error: unknown) {
  return error instanceof Error
    ? `${error.name}: ${error.message}`.slice(0, 200)
    : 'non-error thrown'
}
