// What each frame type may carry on the wire, shared by the redaction
// tests (leaks.test.ts, rated-leak.test.ts). The compiler checks every
// list against src/shared/protocol.ts: a field added to a frame without a
// line here fails `npm run typecheck:worker`, so no field reaches a client
// unreviewed.
import { expect } from 'vitest'
import type { HandRecordV1, ServerMsg } from '../../src/shared/protocol'

type Msg<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>
type Name<S> = S extends `${infer K}?` ? K : S

/**
 * `keys` must name every key of T and nothing else ('?' marks a key the
 * frame may omit). A missing key asks for a second argument; an extra one
 * asks for a second argument of type `unknown`. Either way, a type error.
 */
const keysOf =
  <T>() =>
  <const L extends readonly string[]>(
    keys: L,
    ...exact: [Exclude<keyof T, Name<L[number]>>] extends [never]
      ? [Exclude<Name<L[number]>, keyof T>] extends [never]
        ? []
        : [unknown: Exclude<Name<L[number]>, keyof T>]
      : [missing: Exclude<keyof T, Name<L[number]>>]
  ): string[] => {
    void exact
    return [...keys]
  }

// Exactly the keys each frame type may carry (optional ones marked '?').
export const FRAME_KEYS: Record<ServerMsg['t'], string[]> = {
  welcome: keysOf<Msg<'welcome'>>()([
    't',
    'seq',
    'matchId',
    'serverNow',
    'seat',
    'table',
    'view',
  ]),
  state: keysOf<Msg<'state'>>()([
    't',
    'seq',
    'matchId',
    'serverNow',
    'table',
    'view',
  ]),
  hand_start: keysOf<Msg<'hand_start'>>()([
    't',
    'seq',
    'matchId',
    'handNo',
    'commitment',
    'button',
    'blinds',
    'stacks',
  ]),
  hand_end: keysOf<Msg<'hand_end'>>()([
    't',
    'seq',
    'matchId',
    'handNo',
    'record',
  ]),
  // `own`: this seat's two hole slots, opened for this seat only.
  reveal: keysOf<Msg<'reveal'>>()([
    't',
    'seq',
    'matchId',
    'handNo',
    'leaves',
    'slots',
    'own',
  ]),
  match_end: keysOf<Msg<'match_end'>>()(['t', 'seq', 'matchId', 'result']),
  error: keysOf<Msg<'error'>>()([
    't',
    'seq',
    'matchId',
    'code',
    'message',
    'reqId?',
  ]),
  // After a rated match: public ratings only (RATING_CHANGE_KEYS per seat).
  rating: keysOf<Msg<'rating'>>()(['t', 'seq', 'matchId', 'change']),
  rematch_state: keysOf<Msg<'rematch_state'>>()([
    't',
    'seq',
    'matchId',
    'state',
    'pressed',
    'until?',
    'next?',
  ]),
}
export const RATING_CHANGE_KEYS = keysOf<
  Msg<'rating'>['change'][keyof Msg<'rating'>['change']]
>()(['before', 'after', 'matches'])
type View = NonNullable<Msg<'welcome'>['view']>
export const VIEW_KEYS = keysOf<View>()([
  'matchId',
  'handNo',
  'you',
  'button',
  'street',
  'board',
  'commitment',
  'match',
  'pot',
  'toAct',
  'legal',
  'lastRaise',
  'actions',
  'clock',
  'players',
  'lastReqId',
  'result?',
])
export const VIEW_PLAYER_KEYS = keysOf<View['players'][number]>()([
  'seat',
  'stack',
  'bet',
  'invested',
  'folded',
  'allIn',
  'cards',
  'shown',
])
export const TABLE_KEYS = keysOf<View['match']>()([
  'kind',
  'status',
  'handsTotal',
  'players',
])
export const TABLE_PLAYER_KEYS = keysOf<View['match']['players'][number]>()([
  'seat',
  'username',
  'connected',
  'consecutiveTimeouts',
])
// The per-hand luck (equities) stays in the archive and never reaches a
// frame, so the wire record is the archived one without it.
export const RECORD_KEYS = keysOf<Omit<HandRecordV1, 'luck'>>()([
  'v',
  'matchId',
  'handNo',
  'segment',
  'config',
  'seats',
  'commitment',
  'actions',
  'board',
  'shown',
  'awards',
  'netBySeat',
  'showdown',
])
// Rated matches add the luck-adjusted totals and outcomes.
export const RESULT_KEYS = keysOf<Msg<'match_end'>['result']>()([
  'netBySeat',
  'reason',
  'forfeit?',
  'noShow?',
  'abandoned?',
  'adjustedBySeat?',
  'outcomeBySeat?',
])
const SLOT_KEYS = keysOf<Msg<'reveal'>['slots'][number]>()([
  'slot',
  'card',
  'salt',
])
/** Keys that would mean a hidden card or a secret is on the wire. */
const FORBIDDEN_KEYS = /^(deck|secret|holes|holesByUser|salts?Secret|hand)$/
/** Keys that would mean analysis is on the wire (the lab as RTA). */
const ANALYSIS_KEYS =
  /^(equity|equities|ev|evs|evLost|ev_lost|callEV|raiseEV|range|ranges|grade|grades|accuracy|luck|allInAt|bestKind|foldProbability|breakEven)$/i

export function expectKeys(obj: object, allowed: string[], where: string) {
  const keys = Object.keys(obj)
  const required = allowed.filter((k) => !k.endsWith('?'))
  const optional = allowed.map((k) => k.replace(/\?$/, ''))
  expect(
    keys.filter((k) => !optional.includes(k)),
    `${where}: unexpected keys`,
  ).toEqual([])
  expect(
    required.filter((k) => !keys.includes(k)),
    `${where}: missing keys`,
  ).toEqual([])
}

function keysMatching(test: RegExp, value: unknown, path = ''): string[] {
  if (Array.isArray(value))
    return value.flatMap((v, i) => keysMatching(test, v, `${path}[${i}]`))
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => [
      ...(test.test(k) ? [`${path}.${k}`] : []),
      ...keysMatching(test, v, `${path}.${k}`),
    ])
  return []
}

/** Paths of keys, at any depth, that name a hidden card or a secret. */
export const forbiddenKeys = (value: unknown) =>
  keysMatching(FORBIDDEN_KEYS, value)

/** Paths of keys, at any depth, that name an analysis value. */
export const analysisKeys = (value: unknown) =>
  keysMatching(ANALYSIS_KEYS, value)

export function checkFrame(f: ServerMsg) {
  expectKeys(f, FRAME_KEYS[f.t], f.t)
  expect(forbiddenKeys(f), `${f.t}: forbidden keys`).toEqual([])
  if (f.t === 'welcome' || f.t === 'state') {
    expectKeys(f.table, TABLE_KEYS, `${f.t}.table`)
    for (const p of f.table.players)
      expectKeys(p, TABLE_PLAYER_KEYS, `${f.t}.table.players`)
    if (f.view) {
      expectKeys(f.view, VIEW_KEYS, `${f.t}.view`)
      expectKeys(f.view.match, TABLE_KEYS, `${f.t}.view.match`)
      for (const p of f.view.players)
        expectKeys(p, VIEW_PLAYER_KEYS, `${f.t}.view.players`)
    }
  }
  if (f.t === 'hand_end') expectKeys(f.record, RECORD_KEYS, 'hand_end.record')
  if (f.t === 'match_end') expectKeys(f.result, RESULT_KEYS, 'match_end.result')
  if (f.t === 'reveal') {
    for (const s of f.slots) expectKeys(s, SLOT_KEYS, 'slot')
    for (const s of f.own ?? []) expectKeys(s, SLOT_KEYS, 'own')
  }
}
