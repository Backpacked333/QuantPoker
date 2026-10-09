// @vitest-environment node
// Retry safety of the archive writes (DBA review 2026-10-09). The table
// server's outbox and the hand queue redeliver, and calls can arrive out of
// order: every write must be all or nothing, and a repeat must change
// nothing. PGlite runs one connection, so two transactions racing cannot be
// staged here; the argument for those is structural and written down in
// .10x/reviews/2026-10-09-dba-review.md (finding DB-3).
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrationFiles, MIGRATIONS_DIR, SUPABASE_STUB } from './harness'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const LATE = '77777777-7777-4777-8777-777777777777'
const STRANGER = '99999999-9999-4999-8999-999999999999'

let db: PGlite

/** Runs one archive call the way PostgREST does: one statement, service role. */
async function call(fn: 'record_hand' | 'record_match', p: object) {
  await db.exec('set role service_role')
  try {
    await db.query(`select public.${fn}($1::jsonb)`, [JSON.stringify(p)])
  } finally {
    await db.exec('reset role')
  }
}

const count = async (sql: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n ${sql}`)).rows[0].n

const start = (id: string, players = [ALICE, BOB]) => ({
  id,
  kind: 'hu-casual',
  config: {},
  players: players.map((userId, seat) => ({ seat, userId })),
})

const finish = (id: string, timeouts: object = { 1: 3 }) => ({
  ...start(id),
  handNo: 4,
  timeouts,
  result: { netBySeat: { 0: 80, 1: -80 }, reason: 'forfeit', forfeit: 1 },
})

function hand(matchId: string, holesFor = BOB) {
  return {
    id: `${matchId}:1`,
    matchId,
    handNo: 1,
    segment: 1,
    button: 0,
    commitment: 'a'.repeat(64),
    leaves: Buffer.alloc(52 * 32, 7).toString('base64'),
    reveal: [],
    record: { v: 1 },
    deck: Array.from({ length: 52 }, (_, i) => i),
    secret: Buffer.alloc(32, 1).toString('base64'),
    holes: { 0: [0, 1], 1: [2, 3] },
    holesByUser: [
      { userId: ALICE, cards: [0, 1] },
      { userId: holesFor, cards: [2, 3] },
    ],
    netByUser: { [ALICE]: 40, [BOB]: -40 },
  }
}

async function written(matchId: string) {
  const id = `'${matchId}:1'`
  return {
    hands: await count(`from public.hands where id = ${id}`),
    private: await count(`from public.hands_private where hand_id = ${id}`),
    holes: await count(`from public.hand_holes where hand_id = ${id}`),
    nets: (
      await db.query<{ net_chips: number }>(
        'select net_chips from public.match_players where match_id = $1 order by seat',
        [matchId],
      )
    ).rows.map((r) => r.net_chips),
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUB)
  for (const file of migrationFiles())
    await db.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'))
  await db.query('insert into auth.users (id) values ($1), ($2)', [ALICE, BOB])
}, 60_000)

afterAll(() => db?.close())

describe('a hand record', () => {
  it('that fails part-way leaves nothing behind, and its retries apply it once', async () => {
    const match = '30000000-0000-4000-8000-000000000001'
    await call('record_match', start(match))
    // The second hole-card row names an account that does not exist: the
    // failure comes after the hand row and the private row are inserted.
    await expect(call('record_hand', hand(match, STRANGER))).rejects.toThrow(
      /foreign key/,
    )
    expect(await written(match)).toEqual({
      hands: 0,
      private: 0,
      holes: 0,
      nets: [0, 0],
    })
    // Had the hand row survived, the retry would stop at "already recorded"
    // and the chips would never move.
    for (let i = 0; i < 3; i++) await call('record_hand', hand(match))
    expect(await written(match)).toEqual({
      hands: 1,
      private: 1,
      holes: 2,
      nets: [40, -40],
    })
  })

  it('that arrives before its match is refused whole, and lands once the match exists', async () => {
    const match = '30000000-0000-4000-8000-000000000002'
    await expect(call('record_hand', hand(match))).rejects.toThrow(
      /foreign key/,
    )
    expect(await written(match)).toEqual({
      hands: 0,
      private: 0,
      holes: 0,
      nets: [],
    })
    await call('record_match', start(match))
    await call('record_hand', hand(match))
    expect(await written(match)).toEqual({
      hands: 1,
      private: 1,
      holes: 2,
      nets: [40, -40],
    })
  })
})

describe('a match record', () => {
  it('whose start fails part-way leaves no match, and the retry creates it', async () => {
    const match = '30000000-0000-4000-8000-000000000003'
    // The second seat's account is not there yet: the match row is
    // inserted, then the seat insert fails.
    await expect(
      call('record_match', start(match, [ALICE, LATE])),
    ).rejects.toThrow(/foreign key/)
    expect(await count(`from public.matches where id = '${match}'`)).toBe(0)
    await db.query('insert into auth.users (id) values ($1)', [LATE])
    await call('record_match', start(match, [ALICE, LATE]))
    await call('record_match', start(match, [ALICE, LATE]))
    expect(
      await count(`from public.match_players where match_id = '${match}'`),
    ).toBe(2)
  })

  it('whose finish fails part-way stays playing, and the retry finishes it with one abandonment', async () => {
    const match = '30000000-0000-4000-8000-000000000004'
    await call('record_match', start(match))
    // A timeout count the column refuses stands in for any failure after
    // the status update: it comes from the seat update that follows it.
    await expect(
      call('record_match', finish(match, { 1: 99999 })),
    ).rejects.toThrow(/out of range/)
    const status = async () =>
      (
        await db.query<{ status: string }>(
          'select status from public.matches where id = $1',
          [match],
        )
      ).rows[0].status
    expect(await status()).toBe('playing')
    expect(
      await count(`from public.abandonments where match_id = '${match}'`),
    ).toBe(0)
    for (let i = 0; i < 3; i++) await call('record_match', finish(match))
    expect(await status()).toBe('finished')
    expect(
      await count(`from public.abandonments where match_id = '${match}'`),
    ).toBe(1)
  })

  it('whose start arrives after its finish changes nothing', async () => {
    const match = '30000000-0000-4000-8000-000000000005'
    await call('record_match', finish(match))
    await call('record_match', start(match))
    const { rows } = await db.query<{ status: string; reason: string }>(
      `select status, result ->> 'reason' as reason from public.matches where id = $1`,
      [match],
    )
    expect(rows).toEqual([{ status: 'finished', reason: 'forfeit' }])
    expect(
      await count(`from public.match_players where match_id = '${match}'`),
    ).toBe(2)
    expect(
      await count(`from public.abandonments where match_id = '${match}'`),
    ).toBe(1)
  })
})
