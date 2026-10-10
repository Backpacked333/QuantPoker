// @vitest-environment node
// Per-decision grades (P1-09). A grade is analysis data, so nobody reads one
// while its match is playing (the lab-off rule, P1-03); once the match is
// over, its two players read both seats and nobody else reads any (Q6). The
// grading consumer writes them through record_grades, which must be safe to
// repeat on every redelivery.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrationFiles, MIGRATIONS_DIR, SUPABASE_STUB } from './harness'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const CAROL = '44444444-4444-4444-8444-444444444444'
const M = '55555555-5555-4555-8555-555555555555'
const H = `${M}:1`

let db: PGlite

async function as<T>(role: string, sub: string, run: () => Promise<T>) {
  await db.exec(`set role ${role}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub])
  try {
    return await run()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}

const recordGrades = (p: object, role = 'service_role') =>
  as(role, '', () =>
    db.query('select public.record_grades($1::jsonb)', [JSON.stringify(p)]),
  )

const visible = (role: string, sub: string) =>
  as(
    role,
    sub,
    async () =>
      (
        await db.query<{ seat: number; user_id: string }>(
          'select seat, user_id from public.hand_grades order by seat, idx',
        )
      ).rows,
  )

const GRADES = {
  handId: H,
  format: 'hu-duplicate',
  modelVersion: 'grade.v1+population.v1',
  grades: [
    { seat: 0, idx: 0, grade: 'best', evLost: 0, accuracy: 100 },
    { seat: 1, idx: 1, grade: 'mistake', evLost: 12.5, accuracy: 37.5 },
  ],
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUB)
  for (const f of migrationFiles())
    await db.exec(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'))
  await db.exec(`
    insert into auth.users (id) values ('${ALICE}'), ('${BOB}'), ('${CAROL}');
    insert into public.matches (id, kind, config) values ('${M}', 'hu-rated', '{}');
    insert into public.match_players (match_id, user_id, seat)
      values ('${M}', '${ALICE}', 0), ('${M}', '${BOB}', 1);
    insert into public.hands (id, match_id, hand_no, button, commitment, leaves, reveal, record, verified)
      values ('${H}', '${M}', 1, 0, repeat('b', 64), decode(repeat('00', 1664), 'hex'), '[]', '{}', true);
  `)
  await recordGrades(GRADES)
}, 60_000)

afterAll(() => db?.close())

describe('hand grades', () => {
  it('no player reads any grade while the match is playing, not even their own', async () => {
    for (const who of [ALICE, BOB, CAROL])
      expect(await visible('authenticated', who)).toEqual([])
    await expect(visible('anon', '')).rejects.toThrow(/permission denied/)
    // The server sees them.
    expect(await visible('service_role', '')).toHaveLength(2)
  })

  it('once the match is over its two players read both seats, and nobody else reads any', async () => {
    await db.exec(
      `update public.matches set status = 'finished' where id = '${M}'`,
    )
    const both = [
      { seat: 0, user_id: ALICE },
      { seat: 1, user_id: BOB },
    ]
    expect(await visible('authenticated', ALICE)).toEqual(both)
    expect(await visible('authenticated', BOB)).toEqual(both)
    expect(await visible('authenticated', CAROL)).toEqual([])
    await expect(visible('anon', '')).rejects.toThrow(/permission denied/)
  })

  it('record_grades is idempotent: a redelivery writes nothing new and changes nothing', async () => {
    await recordGrades({
      ...GRADES,
      grades: GRADES.grades.map((g) => ({
        ...g,
        accuracy: 0,
        grade: 'blunder',
      })),
    })
    const rows = await as(
      'service_role',
      '',
      async () =>
        (
          await db.query<{ grade: string; accuracy: number }>(
            'select grade, accuracy from public.hand_grades order by seat',
          )
        ).rows,
    )
    expect(rows).toEqual([
      { grade: 'best', accuracy: 100 },
      { grade: 'mistake', accuracy: 37.5 },
    ])
  })

  it("takes each grade's player from the seat, not from the payload", async () => {
    const id = `${M}:2`
    await db.exec(`
      insert into public.hands (id, match_id, hand_no, button, commitment, leaves, reveal, record, verified)
        values ('${id}', '${M}', 2, 1, repeat('c', 64), decode(repeat('00', 1664), 'hex'), '[]', '{}', true);
    `)
    await recordGrades({
      ...GRADES,
      handId: id,
      grades: [{ ...GRADES.grades[0], userId: CAROL }],
    })
    const rows = await as(
      'service_role',
      '',
      async () =>
        (
          await db.query<{ user_id: string }>(
            'select user_id from public.hand_grades where hand_id = $1',
            [id],
          )
        ).rows,
    )
    expect(rows).toEqual([{ user_id: ALICE }])
  })

  it('refuses grades for a hand that is not archived, so the consumer retries', async () => {
    await expect(
      recordGrades({ ...GRADES, handId: `${M}:99` }),
    ).rejects.toThrow(/not archived/)
  })

  it('refuses grades for a hand that failed or has not had verification, and for a casual hand', async () => {
    const CASUAL = '66666666-6666-4666-8666-666666666666'
    await db.exec(`
      insert into public.hands (id, match_id, hand_no, button, commitment, leaves, reveal, record)
        values ('${M}:3', '${M}', 3, 0, repeat('d', 64), decode(repeat('00', 1664), 'hex'), '[]', '{}');
      insert into public.matches (id, kind, config) values ('${CASUAL}', 'hu-casual', '{}');
      insert into public.match_players (match_id, user_id, seat)
        values ('${CASUAL}', '${ALICE}', 0), ('${CASUAL}', '${BOB}', 1);
      insert into public.hands (id, match_id, hand_no, button, commitment, leaves, reveal, record, verified)
        values ('${CASUAL}:1', '${CASUAL}', 1, 0, repeat('e', 64), decode(repeat('00', 1664), 'hex'), '[]', '{}', true);
    `)
    await expect(recordGrades({ ...GRADES, handId: `${M}:3` })).rejects.toThrow(
      /not verified/,
    )
    await expect(
      recordGrades({ ...GRADES, handId: `${CASUAL}:1` }),
    ).rejects.toThrow(/not rated/)
    const rows = await as(
      'service_role',
      '',
      async () =>
        (
          await db.query(
            'select 1 from public.hand_grades where hand_id in ($1, $2)',
            [`${M}:3`, `${CASUAL}:1`],
          )
        ).rows,
    )
    expect(rows).toEqual([])
  })

  it('only the server writes: record_grades and inserts are refused to every browser role', async () => {
    for (const role of ['anon', 'authenticated'])
      await expect(recordGrades(GRADES, role)).rejects.toThrow(
        /permission denied/,
      )
    await expect(
      as('authenticated', ALICE, () =>
        db.query(
          `insert into public.hand_grades (hand_id, seat, idx, user_id, format, grade, ev_lost, accuracy, model_version)
           values ('${H}', 0, 9, '${ALICE}', 'hu-duplicate', 'best', 0, 100, 'x')`,
        ),
      ),
    ).rejects.toThrow(/permission denied|row-level security/)
  })
})
