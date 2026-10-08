// @vitest-environment node
// Applies supabase/migrations to an in-process Postgres (PGlite) with a stub of
// Supabase's auth schema and API roles, then checks the access rules as the
// browser (anon / authenticated) and the table server (service_role) see them.
import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = new URL('../migrations/', import.meta.url)
// The learning_cloud migration predates this repo's history and is applied in
// production already; these migrations only depend on auth.users.
const MIGRATIONS = readdirSync(dir)
  .filter((f) => f.endsWith('.sql') && f > '20261007192620')
  .sort()

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const EARLY = '00000000-0000-4000-8000-000000000000'
const MATCH = '33333333-3333-4333-8333-333333333333'

// What Supabase provides before any project migration runs.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase's permissive defaults, which the migrations must narrow.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

let db: PGlite

async function as<T = Record<string, unknown>>(
  role: 'anon' | 'authenticated' | 'service_role',
  sql: string,
  user?: string,
) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`,
  )
  await db.exec(`set role ${role}`)
  try {
    return (await db.query<T>(sql)).rows
  } finally {
    await db.exec('reset role')
  }
}

const denied = (p: Promise<unknown>) =>
  expect(p).rejects.toThrow(/permission denied|row-level security/)

function handPayload(id = `${MATCH}:1`) {
  return {
    id,
    matchId: MATCH,
    handNo: 1,
    segment: 1,
    button: 0,
    commitment: 'a'.repeat(64),
    leaves: Buffer.alloc(52 * 32, 7).toString('base64'),
    reveal: [{ slot: 4, card: 12, salt: '00'.repeat(16) }],
    record: { v: 1 },
    deck: Array.from({ length: 52 }, (_, i) => i),
    secret: Buffer.alloc(32, 1).toString('base64'),
    holes: { 0: [0, 1], 1: [2, 3] },
    holesByUser: [
      { userId: ALICE, cards: [0, 1] },
      { userId: BOB, cards: [2, 3] },
    ],
    netByUser: { [ALICE]: 40, [BOB]: -40 },
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUB)
  // An account created before the migrations: the backfill must cover it.
  await db.query('insert into auth.users (id) values ($1)', [EARLY])
  for (const file of MIGRATIONS)
    await db.exec(readFileSync(new URL(file, dir), 'utf8'))
  await db.query('insert into auth.users (id) values ($1), ($2)', [ALICE, BOB])
  await db.query(
    `insert into public.matches (id, config) values ($1, '{}');
     `,
    [MATCH],
  )
  await db.query(
    'insert into public.match_players (match_id, user_id, seat) values ($1, $2, 0), ($1, $3, 1)',
    [MATCH, ALICE, BOB],
  )
}, 60_000)

afterAll(() => db?.close())

describe('migrations', () => {
  it('apply in order', () => {
    expect(MIGRATIONS).toEqual([
      '20261008133809_players.sql',
      '20261008134201_matches_hands.sql',
      '20261008134322_record_hand.sql',
      '20261008134345_abandonments_match_index.sql',
    ])
  })
})

describe('players', () => {
  it('get a placeholder name on sign-up, and existing accounts are backfilled', async () => {
    const rows = await as<{ user_id: string; username: string }>(
      'anon',
      'select user_id, username from public.players order by user_id',
    )
    expect(rows.map((r) => r.user_id)).toEqual([EARLY, ALICE, BOB])
    expect(rows[1].username).toBe('player_111111111111')
  })

  it('are public to read but not writable by anon', async () => {
    await denied(as('anon', `update public.players set bio = 'x'`))
    await denied(
      as(
        'anon',
        `insert into public.players (user_id, username) values ('${ALICE}', 'zed')`,
      ),
    )
  })

  it('can rename themselves, and nobody else', async () => {
    await as(
      'authenticated',
      `update public.players set username = 'alice' where user_id = '${ALICE}'`,
      ALICE,
    )
    // RLS hides other rows from the update, so this changes nothing.
    await as(
      'authenticated',
      `update public.players set username = 'mallory' where user_id = '${BOB}'`,
      ALICE,
    )
    const names = await as<{ username: string }>(
      'anon',
      'select username from public.players order by user_id',
    )
    expect(names.map((r) => r.username)).toEqual([
      'player_000000000000',
      'alice',
      'player_222222222222',
    ])
  })

  it('cannot change identity columns or delete rows', async () => {
    await denied(
      as(
        'authenticated',
        `update public.players set user_id = '${BOB}'`,
        ALICE,
      ),
    )
    await denied(
      as(
        'authenticated',
        `update public.players set created_at = now()`,
        ALICE,
      ),
    )
    await denied(as('authenticated', `delete from public.players`, ALICE))
  })

  it('rejects bad, reserved and duplicate usernames', async () => {
    for (const name of [
      'Al',
      'has space',
      'UPPER',
      'x'.repeat(21),
      'atlas',
      'admin',
    ])
      await expect(
        as(
          'authenticated',
          `update public.players set username = '${name}' where user_id = '${ALICE}'`,
          ALICE,
        ),
      ).rejects.toThrow(/check constraint/)
    await as(
      'authenticated',
      `update public.players set username = 'bob' where user_id = '${BOB}'`,
      BOB,
    )
    await expect(
      as(
        'authenticated',
        `update public.players set username = 'bob' where user_id = '${ALICE}'`,
        ALICE,
      ),
    ).rejects.toThrow(/unique/)
  })
})

describe('hand records', () => {
  it('can only be written through record_hand by the service role', async () => {
    const payload = JSON.stringify(handPayload()).replace(/'/g, "''")
    await denied(
      as(
        'authenticated',
        `select public.record_hand('${payload}'::jsonb)`,
        ALICE,
      ),
    )
    await denied(as('anon', `select public.record_hand('${payload}'::jsonb)`))
    await denied(
      as(
        'authenticated',
        `insert into public.hands (id, match_id, hand_no, button, commitment, leaves, reveal, record)
        values ('${MATCH}:9', '${MATCH}', 9, 0, '${'a'.repeat(64)}', '\\x00', '[]', '{}')`,
        ALICE,
      ),
    )
    await as('service_role', `select public.record_hand('${payload}'::jsonb)`)
    // Idempotent: an outbox retry changes nothing.
    await as('service_role', `select public.record_hand('${payload}'::jsonb)`)
    const hands = await as<{ id: string }>(
      'anon',
      'select id from public.hands',
    )
    expect(hands).toEqual([{ id: `${MATCH}:1` }])
    const nets = await as<{ net_chips: number }>(
      'anon',
      'select net_chips from public.match_players order by seat',
    )
    expect(nets.map((r) => r.net_chips)).toEqual([40, -40])
  })

  it('keep the deck and every hole card private', async () => {
    await denied(as('anon', 'select * from public.hands_private'))
    await denied(
      as('authenticated', 'select * from public.hands_private', ALICE),
    )
    await denied(as('authenticated', 'select * from public.incidents', ALICE))
    const own = await as<{ cards: number[] }>(
      'authenticated',
      'select cards from public.hand_holes',
      ALICE,
    )
    expect(own).toEqual([{ cards: [0, 1] }])
    await denied(as('anon', 'select * from public.hand_holes'))
    const audit = await as<{ n: number }>(
      'service_role',
      'select count(*)::int as n from public.hands_private',
    )
    expect(audit).toEqual([{ n: 1 }])
  })

  it('reject malformed records', async () => {
    const bad = { ...handPayload(`${MATCH}:2`), commitment: 'nothex' }
    await expect(
      as(
        'service_role',
        `select public.record_hand('${JSON.stringify(bad)}'::jsonb)`,
      ),
    ).rejects.toThrow(/check constraint/)
  })
})
