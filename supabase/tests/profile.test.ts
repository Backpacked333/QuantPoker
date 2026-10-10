// @vitest-environment node
// The public profile and match review (P1-15) read as the browser does
// before sign-in: every query they make returns its rows to anon, while
// hidden cards, the deck and writes stay out of reach.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrationFiles, MIGRATIONS_DIR, SUPABASE_STUB } from './harness'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const M = '33333333-3333-4333-8333-333333333333'

let db: PGlite

async function asAnon<T>(run: () => Promise<T>) {
  await db.exec('set role anon')
  try {
    return await run()
  } finally {
    await db.exec('reset role')
  }
}
const rows = async (sql: string, params: unknown[] = []) =>
  (await db.query<Record<string, unknown>>(sql, params)).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUB)
  for (const f of migrationFiles())
    await db.exec(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'))
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com');
    update public.players set username = 'alice', bio = 'Studying statistics' where user_id = '${ALICE}';
    update public.players set username = 'bob' where user_id = '${BOB}';
    insert into public.matches (id, kind, status, config, finished_at)
      values ('${M}', 'hu-rated', 'finished', '{}', now());
    insert into public.match_players (match_id, user_id, seat, outcome, finished_at)
      values ('${M}', '${ALICE}', 0, 'win', now()), ('${M}', '${BOB}', 1, 'loss', now());
    insert into public.hands (id, match_id, hand_no, button, commitment, leaves, reveal, record, verified)
      values ('${M}:1', '${M}', 1, 0, repeat('ab', 32), decode(repeat('00', 1664), 'hex'),
              '[]', '{"handNo": 1, "shown": []}', true);
    insert into public.hand_holes (hand_id, user_id, cards) values
      ('${M}:1', '${ALICE}', '{0,13}'), ('${M}:1', '${BOB}', '{1,14}');
    insert into public.hands_private (hand_id, deck, secret, holes)
      values ('${M}:1', (select array_agg(g)::smallint[] from generate_series(0, 51) g),
              decode(repeat('05', 32), 'hex'), '{}');
    insert into public.ratings (user_id, format, rating, rd, matches, wins, last_match_at)
      values ('${ALICE}', 'hu-duplicate', 1512, 290, 1, 1, now());
    insert into public.rating_history (user_id, format, kind, match_id, outcome,
        before_rating, before_rd, before_sigma, after_rating, after_rd, after_sigma, model_version)
      values ('${ALICE}', 'hu-duplicate', 'match', '${M}', 'win', 1500, 350, 0.06, 1512, 290, 0.06, 'glicko2.v1');
  `)
}, 60_000)

afterAll(() => db?.close())

describe('the public profile, read before sign-in', () => {
  it('returns every row the profile, the match review and the link preview read', async () => {
    await asAnon(async () => {
      const [player] = await rows(
        `select user_id, username, country, bio, created_at from public.players where username = 'alice'`,
      )
      expect(player).toMatchObject({
        user_id: ALICE,
        bio: 'Studying statistics',
      })
      expect(
        await rows(
          `select rating, rd, matches, wins, draws, abandoned, last_match_at
           from public.ratings where user_id = $1 and format = 'hu-duplicate'`,
          [ALICE],
        ),
      ).toHaveLength(1)
      expect(
        await rows(
          `select kind, match_id, outcome, before_rating, after_rating from public.rating_history
           where user_id = $1 and format = 'hu-duplicate' order by created_at desc limit 500`,
          [ALICE],
        ),
      ).toHaveLength(1)
      expect(
        await rows(
          `select match_id, user_id from public.match_players where match_id = $1 and user_id <> $2`,
          [M, ALICE],
        ),
      ).toEqual([{ match_id: M, user_id: BOB }])
      expect(
        await rows(
          `select id, kind, status, finished_at from public.matches where id = $1`,
          [M],
        ),
      ).toHaveLength(1)
      expect(
        await rows(
          `select hand_no, record, verified from public.hands where match_id = $1`,
          [M],
        ),
      ).toHaveLength(1)
      // The Worker's preview: the player and their heads-up rating.
      expect(
        await rows(
          `select p.username, r.rating, r.rd, r.matches from public.players p
           left join public.ratings r on r.user_id = p.user_id and r.format = 'hu-duplicate'
           where p.username = 'alice'`,
        ),
      ).toEqual([{ username: 'alice', rating: 1512, rd: 290, matches: 1 }])
      const [rate] = await rows(`select public.abandonment_rate($1) as rate`, [
        ALICE,
      ])
      expect(rate.rate).toBe(0)
    })
  })

  it('hidden cards, the deck and email addresses stay out of reach', async () => {
    await asAnon(async () => {
      await expect(rows(`select * from public.hand_holes`)).rejects.toThrow(
        /permission denied/,
      )
      await expect(rows(`select * from public.hands_private`)).rejects.toThrow(
        /permission denied/,
      )
      await expect(rows(`select email from auth.users`)).rejects.toThrow(
        /permission denied/,
      )
    })
  })

  it('nothing on a profile can be changed before sign-in', async () => {
    await asAnon(async () => {
      await expect(
        rows(`update public.players set bio = 'x' where user_id = $1`, [ALICE]),
      ).rejects.toThrow(/permission denied/)
      await expect(
        rows(`update public.ratings set rating = 3000 where user_id = $1`, [
          ALICE,
        ]),
      ).rejects.toThrow(/permission denied/)
      await expect(
        rows(
          `insert into public.rating_history (user_id, format, kind, before_rating, before_rd,
                before_sigma, after_rating, after_rd, after_sigma, model_version)
              values ($1, 'hu-duplicate', 'reset', 1, 1, 0.06, 1, 1, 0.06, 'x')`,
          [ALICE],
        ),
      ).rejects.toThrow(/permission denied/)
    })
  })
})
