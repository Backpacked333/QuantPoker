// @vitest-environment node
// Hands of a match still being played are not readable by any client
// (Devin, PR #29): the live table sends each player what they may see over
// its socket, and the public archive opens a match's hands once it ends.
// Before this rule anyone with the publishable key could follow a live
// match hand by hand, with decision times and all-in equity.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrationFiles, MIGRATIONS_DIR, SUPABASE_STUB } from './harness'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const CAROL = '33333333-3333-4333-8333-333333333333'
const LIVE = 'aaaaaaaa-0000-4000-8000-000000000001'
const DONE = 'aaaaaaaa-0000-4000-8000-000000000002'
const VOID = 'aaaaaaaa-0000-4000-8000-000000000003'

let db: PGlite

/** Rows `sql` returns to a client role (`sub` signed in, or anon). */
async function seen(role: 'anon' | 'authenticated', sub: string, sql: string) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      sub,
    ])
    await tx.exec(`set local role ${role}`)
    return (await tx.query<Record<string, unknown>>(sql)).rows
  })
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUB)
  for (const f of migrationFiles())
    await db.exec(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'))
  const hands = (m: string) =>
    [1, 2]
      .map(
        (n) =>
          `('${m}:${n}', '${m}', ${n}, 0, repeat('a', 64), decode(repeat('00', 1664), 'hex'), '[]', '{"handNo": ${n}}')`,
      )
      .join(', ')
  await db.exec(`
    insert into auth.users (id) values ('${ALICE}'), ('${BOB}'), ('${CAROL}');
    insert into public.matches (id, kind, status, config) values
      ('${LIVE}', 'hu-rated', 'playing', '{}'),
      ('${DONE}', 'hu-rated', 'finished', '{}'),
      ('${VOID}', 'hu-casual', 'void', '{}');
    insert into public.match_players (match_id, user_id, seat) values
      ('${LIVE}', '${ALICE}', 0), ('${LIVE}', '${BOB}', 1),
      ('${DONE}', '${ALICE}', 0), ('${DONE}', '${BOB}', 1),
      ('${VOID}', '${ALICE}', 0), ('${VOID}', '${BOB}', 1);
    insert into public.hands (id, match_id, hand_no, button, commitment, leaves, reveal, record)
      values ${hands(LIVE)}, ${hands(DONE)}, ${hands(VOID)};
    insert into public.hand_holes (hand_id, user_id, cards) values
      ('${LIVE}:1', '${ALICE}', '{0,13}'), ('${LIVE}:1', '${BOB}', '{1,14}');
  `)
}, 60_000)

afterAll(() => db?.close())

const handsOf = (m: string) =>
  `select id from public.hands where match_id = '${m}' order by hand_no`

describe('hands of a match in play', () => {
  it('no client reads them: not a visitor, not a player at the table, not anyone else', async () => {
    for (const [role, sub] of [
      ['anon', ''],
      ['authenticated', ALICE],
      ['authenticated', BOB],
      ['authenticated', CAROL],
    ] as const)
      expect(await seen(role, sub, handsOf(LIVE))).toEqual([])
  })

  it('the archive still holds them for the server', async () => {
    expect((await db.query(handsOf(LIVE))).rows).toHaveLength(2)
  })

  it('a player still reads their own hole cards of a hand already played', async () => {
    expect(
      await seen(
        'authenticated',
        ALICE,
        `select cards from public.hand_holes where hand_id = '${LIVE}:1'`,
      ),
    ).toEqual([{ cards: [0, 13] }])
  })

  it('once the match is over, finished or void, its hands are public', async () => {
    for (const m of [DONE, VOID])
      for (const [role, sub] of [
        ['anon', ''],
        ['authenticated', CAROL],
      ] as const)
        expect(await seen(role, sub, handsOf(m))).toHaveLength(2)
  })

  it('and they open the moment the match ends', async () => {
    await db.exec(
      `update public.matches set status = 'finished' where id = '${LIVE}'`,
    )
    expect(await seen('anon', '', handsOf(LIVE))).toHaveLength(2)
    await db.exec(
      `update public.matches set status = 'playing' where id = '${LIVE}'`,
    )
  })
})
