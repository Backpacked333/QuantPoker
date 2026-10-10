// @vitest-environment node
// Rematches in the archive (P1-04): matches.rematch_of links a rated match
// to the one it follows, for the rematch rate. record_match v5 stores the
// link on the call that creates the match row, only when the earlier match
// is already archived, and otherwise behaves exactly as v4.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrationFiles, MIGRATIONS_DIR, SUPABASE_STUB } from './harness'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const FIRST = '50000000-0000-4000-8000-000000000001'
const REMATCH = '50000000-0000-4000-8000-000000000002'
const EARLY = '50000000-0000-4000-8000-000000000003'
const MISSING = '50000000-0000-4000-8000-0000000000ff'

let db: PGlite

async function call(p: object, role = 'service_role') {
  await db.exec(`set role ${role}`)
  try {
    await db.query('select public.record_match($1::jsonb)', [JSON.stringify(p)])
  } finally {
    await db.exec('reset role')
  }
}

const start = (id: string, rematchOf?: string) => ({
  id,
  kind: 'hu-rated',
  config: { handsTotal: 40 },
  players: [
    { seat: 0, userId: ALICE },
    { seat: 1, userId: BOB },
  ],
  ...(rematchOf ? { rematchOf } : {}),
})
const finish = (id: string, rematchOf?: string) => ({
  ...start(id, rematchOf),
  handNo: 40,
  timeouts: {},
  result: {
    netBySeat: { 0: 300, 1: -300 },
    reason: 'complete',
    adjustedBySeat: { 0: 250, 1: -250 },
    outcomeBySeat: { 0: 'win', 1: 'loss' },
  },
})

const row = async (id: string) =>
  (
    await db.query<{ status: string; rematch_of: string | null }>(
      'select status, rematch_of from public.matches where id = $1',
      [id],
    )
  ).rows[0]

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUB)
  for (const f of migrationFiles())
    await db.exec(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'))
  await db.query('insert into auth.users (id) values ($1), ($2)', [ALICE, BOB])
}, 60_000)

afterAll(() => db?.close())

describe('rematches', () => {
  it('record_match v5 links a rematch to the archived match it follows', async () => {
    await call(start(FIRST))
    await call(finish(FIRST))
    await call(start(REMATCH, FIRST))
    expect(await row(REMATCH)).toEqual({
      status: 'playing',
      rematch_of: FIRST,
    })
    // The finish, and any repeat of either call, leave the link as it is.
    await call(finish(REMATCH, FIRST))
    await call(start(REMATCH, FIRST))
    await call(finish(REMATCH))
    expect(await row(REMATCH)).toEqual({
      status: 'finished',
      rematch_of: FIRST,
    })
    expect(await row(FIRST)).toEqual({ status: 'finished', rematch_of: null })
  })

  it('a rematch archived before the match it follows is archived without the link', async () => {
    await call(start(EARLY, MISSING))
    await call(finish(EARLY, MISSING))
    expect(await row(EARLY)).toEqual({ status: 'finished', rematch_of: null })
  })

  it('a rematch archived before the match it follows is linked when it finishes', async () => {
    const before = '50000000-0000-4000-8000-000000000010'
    const after = '50000000-0000-4000-8000-000000000011'
    await call(start(after, before))
    expect(await row(after)).toEqual({ status: 'playing', rematch_of: null })
    await call(start(before))
    await call(finish(before))
    await call(finish(after, before))
    expect(await row(after)).toEqual({ status: 'finished', rematch_of: before })
  })

  it('links only to a finished rated match: one still playing in the archive is linked once it finishes', async () => {
    const before = '50000000-0000-4000-8000-000000000020'
    const after = '50000000-0000-4000-8000-000000000021'
    await call(start(before))
    await call(start(after, before))
    expect(await row(after)).toEqual({ status: 'playing', rematch_of: null })
    await call(finish(before))
    await call(finish(after, before))
    expect(await row(after)).toEqual({ status: 'finished', rematch_of: before })
    // A casual match is never a rated rematch's predecessor.
    const casual = '50000000-0000-4000-8000-000000000022'
    const linked = '50000000-0000-4000-8000-000000000023'
    await call({ ...start(casual), kind: 'hu-casual' })
    await call({
      ...start(casual),
      kind: 'hu-casual',
      handNo: 20,
      timeouts: {},
      result: { netBySeat: { 0: 10, 1: -10 }, reason: 'complete' },
    })
    await call(start(linked, casual))
    await call(finish(linked, casual))
    expect(await row(linked)).toEqual({ status: 'finished', rematch_of: null })
  })

  it("keeps v4's rules: a rated finish missing a seat's result is refused", async () => {
    const id = '50000000-0000-4000-8000-000000000004'
    await call(start(id, FIRST))
    const partial = finish(id, FIRST)
    delete (partial.result.outcomeBySeat as Record<number, string>)[1]
    await expect(call(partial)).rejects.toThrow(/rated result incomplete/)
    expect(await row(id)).toEqual({ status: 'playing', rematch_of: FIRST })
  })

  it("keeps v4's rules: a match both players left is void with an abandonment each", async () => {
    const id = '50000000-0000-4000-8000-000000000005'
    await call(start(id, FIRST))
    await call({
      ...start(id, FIRST),
      handNo: 12,
      timeouts: {},
      result: {
        netBySeat: { 0: 0, 1: 0 },
        reason: 'abandoned',
        abandoned: [0, 1],
        adjustedBySeat: { 0: 0, 1: 0 },
      },
    })
    expect(await row(id)).toEqual({ status: 'void', rematch_of: FIRST })
    const left = await db.query<{ n: number }>(
      `select count(*)::int as n from public.abandonments
       where match_id = $1 and kind = 'leave_mid_hand'`,
      [id],
    )
    expect(left.rows[0].n).toBe(2)
  })

  it('record_match stays service_role only, and rematch_of reads like the rest of matches', async () => {
    for (const role of ['anon', 'authenticated'])
      await expect(
        call(start('50000000-0000-4000-8000-000000000006'), role),
      ).rejects.toThrow(/permission denied/)
    await db.exec('set role anon')
    try {
      const read = await db.query<{ rematch_of: string | null }>(
        'select rematch_of from public.matches where id = $1',
        [REMATCH],
      )
      expect(read.rows).toEqual([{ rematch_of: FIRST }])
    } finally {
      await db.exec('reset role')
    }
  })
})
