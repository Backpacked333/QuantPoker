// @vitest-environment node
// Rated heads-up in the archive (P1-01, ADR amendment 2026-10-10): the
// rated kind, each seat's outcome and luck-adjusted chips, and the copy of
// finished_at that profiles list matches by. The newest migration is applied
// after a casual match is already archived, to prove its backfill.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrationFiles, MIGRATIONS_DIR, SUPABASE_STUB } from './harness'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const OLD = '40000000-0000-4000-8000-000000000000'

let db: PGlite

async function call(p: object) {
  await db.exec('set role service_role')
  try {
    await db.query('select public.record_match($1::jsonb)', [JSON.stringify(p)])
  } finally {
    await db.exec('reset role')
  }
}

const start = (id: string, kind = 'hu-rated') => ({
  id,
  kind,
  config: { handsTotal: 40 },
  players: [
    { seat: 0, userId: ALICE },
    { seat: 1, userId: BOB },
  ],
})

const seats = async (id: string) =>
  (
    await db.query<{
      seat: number
      outcome: string | null
      adjusted_chips: number | null
      finished: boolean
    }>(
      `select mp.seat, mp.outcome, mp.adjusted_chips,
              mp.finished_at is not distinct from m.finished_at
                and mp.finished_at is not null as finished
       from public.match_players mp join public.matches m on m.id = mp.match_id
       where mp.match_id = $1 order by mp.seat`,
      [id],
    )
  ).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUB)
  const files = migrationFiles()
  const newest = files[files.length - 1]
  expect(newest).toMatch(/_rated_matches\.sql$/)
  for (const f of files.slice(0, -1))
    await db.exec(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'))
  await db.query('insert into auth.users (id) values ($1), ($2)', [ALICE, BOB])
  // A casual match finished before the migration.
  await call(start(OLD, 'hu-casual'))
  await call({
    ...start(OLD, 'hu-casual'),
    handNo: 20,
    timeouts: {},
    result: { netBySeat: { 0: 100, 1: -100 }, reason: 'complete' },
  })
  await db.exec(readFileSync(new URL(newest, MIGRATIONS_DIR), 'utf8'))
}, 60_000)

afterAll(() => db?.close())

describe('rated matches', () => {
  it('backfill finished_at for matches archived before the migration', async () => {
    expect(await seats(OLD)).toEqual([
      { seat: 0, outcome: null, adjusted_chips: null, finished: true },
      { seat: 1, outcome: null, adjusted_chips: null, finished: true },
    ])
  })

  it('store the rated kind, each seat outcome and luck-adjusted chips, once', async () => {
    const id = '50000000-0000-4000-8000-000000000001'
    await call(start(id))
    const end = {
      ...start(id),
      handNo: 40,
      timeouts: {},
      result: {
        netBySeat: { 0: 220, 1: -220 },
        reason: 'complete',
        adjustedBySeat: { 0: 52.5, 1: -52.5 },
        outcomeBySeat: { 0: 'win', 1: 'loss' },
      },
    }
    await call(end)
    await call(end) // an outbox retry changes nothing
    const { rows } = await db.query<{ kind: string; status: string }>(
      'select kind, status from public.matches where id = $1',
      [id],
    )
    expect(rows).toEqual([{ kind: 'hu-rated', status: 'finished' }])
    expect(await seats(id)).toEqual([
      { seat: 0, outcome: 'win', adjusted_chips: 52.5, finished: true },
      { seat: 1, outcome: 'loss', adjusted_chips: -52.5, finished: true },
    ])
  })

  it('give a casual match finished_at but no outcome', async () => {
    const id = '50000000-0000-4000-8000-000000000002'
    await call(start(id, 'hu-casual'))
    await call({
      ...start(id, 'hu-casual'),
      handNo: 20,
      timeouts: {},
      result: { netBySeat: { 0: -40, 1: 40 }, reason: 'complete' },
    })
    expect(await seats(id)).toEqual([
      { seat: 0, outcome: null, adjusted_chips: null, finished: true },
      { seat: 1, outcome: null, adjusted_chips: null, finished: true },
    ])
  })

  it('record no outcome for a void rated match (a no-show is not rated)', async () => {
    const id = '50000000-0000-4000-8000-000000000003'
    await call({
      ...start(id),
      handNo: 0,
      timeouts: {},
      result: {
        netBySeat: { 0: 0, 1: 0 },
        reason: 'no_show',
        noShow: [1],
        outcomeBySeat: { 0: 'win', 1: 'loss' },
      },
    })
    const { rows } = await db.query<{ status: string }>(
      'select status from public.matches where id = $1',
      [id],
    )
    expect(rows).toEqual([{ status: 'void' }])
    expect(await seats(id)).toEqual([
      { seat: 0, outcome: null, adjusted_chips: null, finished: true },
      { seat: 1, outcome: null, adjusted_chips: null, finished: true },
    ])
  })

  it('refuse an unknown outcome or kind, writing nothing', async () => {
    const id = '50000000-0000-4000-8000-000000000004'
    await call(start(id))
    await expect(
      call({
        ...start(id),
        handNo: 40,
        timeouts: {},
        result: {
          netBySeat: { 0: 0, 1: 0 },
          reason: 'complete',
          adjustedBySeat: { 0: 0, 1: 0 },
          outcomeBySeat: { 0: 'tie', 1: 'tie' },
        },
      }),
    ).rejects.toThrow(/check constraint/)
    const { rows } = await db.query<{ status: string }>(
      'select status from public.matches where id = $1',
      [id],
    )
    expect(rows).toEqual([{ status: 'playing' }])
    await expect(
      call(start('50000000-0000-4000-8000-000000000005', '6max')),
    ).rejects.toThrow(/check constraint/)
  })

  it('list a player newest first from match_players alone', async () => {
    const plan = (
      await db.query<{ 'QUERY PLAN': string }>(
        `explain (costs off) select match_id from public.match_players
         where user_id = '${ALICE}' and finished_at is not null
         order by finished_at desc limit 20`,
      )
    ).rows
      .map((r) => r['QUERY PLAN'])
      .join('\n')
    // On a few rows the planner may still sort; the index must at least exist
    // and be usable, which enable_seqscan = off proves.
    await db.exec('set enable_seqscan = off')
    try {
      const forced = (
        await db.query<{ 'QUERY PLAN': string }>(
          `explain (costs off) select match_id from public.match_players
           where user_id = '${ALICE}' and finished_at is not null
           order by finished_at desc limit 20`,
        )
      ).rows
        .map((r) => r['QUERY PLAN'])
        .join('\n')
      expect(forced).toMatch(/match_players_history/)
    } finally {
      await db.exec('reset enable_seqscan')
    }
    expect(plan.length).toBeGreaterThan(0)
  })
})
