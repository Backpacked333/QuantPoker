// @vitest-environment node
// The landing page's database side (20261010110000_landing.sql): a school
// badge set only from a confirmed email by the auth trigger, never by the
// player, and claimed challenge scores written only by the server, best
// score per hand, idempotent on the receipt.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrationFiles, MIGRATIONS_DIR, SUPABASE_STUB } from './harness'

let db: PGlite
// Random: the placeholder username is built from the id's first 12 digits.
const uid = () => crypto.randomUUID()

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUB)
  for (const file of migrationFiles())
    await db.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'))
}, 60_000)
afterAll(() => db?.close())

async function signUp(email: string, confirmed = true) {
  const id = uid()
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)`,
    [id, email, confirmed ? new Date().toISOString() : null],
  )
  return id
}
async function badge(id: string) {
  const { rows } = await db.query<{
    school: string | null
    school_domain: string | null
    verified: boolean
  }>(
    `select school, school_domain, school_verified_at is not null as verified
     from public.players where user_id = $1`,
    [id],
  )
  return rows[0]
}

describe('school badges', () => {
  it.each([
    ['a listed school', 'ada@mit.edu', 'MIT', 'mit.edu'],
    [
      'a listed school, any case',
      'Ada@Princeton.EDU',
      'Princeton',
      'princeton.edu',
    ],
    [
      'a subdomain of a listed school',
      'ada@andrew.cmu.edu',
      'Carnegie Mellon',
      'cmu.edu',
    ],
    ['a listed subdomain', 'ada@baruch.cuny.edu', 'Baruch', 'baruch.cuny.edu'],
    ['a school abroad', 'ada@cs.ox.ac.uk', 'Oxford', 'ox.ac.uk'],
    [
      'an unlisted .edu',
      'ada@mail.smallcollege.edu',
      'smallcollege.edu',
      'smallcollege.edu',
    ],
    [
      'an unlisted .ac.uk',
      'ada@bristol.ac.uk',
      'bristol.ac.uk',
      'bristol.ac.uk',
    ],
  ])('verifies %s', async (_, email, school, domain) => {
    const id = await signUp(email)
    expect(await badge(id)).toEqual({
      school,
      school_domain: domain,
      verified: true,
    })
  })

  it.each([
    ['a personal address', 'ada@gmail.com'],
    ['an address that only mentions .edu', 'ada@edu.example.com'],
    ['no address', ''],
  ])('leaves %s without a badge', async (_, email) => {
    const id = await signUp(email)
    expect(await badge(id)).toEqual({
      school: null,
      school_domain: null,
      verified: false,
    })
  })

  it('waits for the email link to be confirmed', async () => {
    const id = await signUp('ada@yale.edu', false)
    expect((await badge(id)).school).toBeNull()
    await db.query(
      `update auth.users set email_confirmed_at = now() where id = $1`,
      [id],
    )
    expect(await badge(id)).toEqual({
      school: 'Yale',
      school_domain: 'yale.edu',
      verified: true,
    })
  })

  it('never moves a badge once set', async () => {
    const id = await signUp('ada@harvard.edu')
    await db.query(
      `update auth.users set email = 'ada@stanford.edu' where id = $1`,
      [id],
    )
    expect((await badge(id)).school).toBe('Harvard')
  })

  it('a player cannot set or change their own badge', async () => {
    const id = await signUp('ada@gmail.com')
    await db.exec(`set role authenticated`)
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
      id,
    ])
    try {
      await expect(
        db.query(
          `update public.players set school = 'MIT' where user_id = $1`,
          [id],
        ),
      ).rejects.toThrow(/permission denied/)
      await expect(
        db.query(`select * from private.school_for('ada@mit.edu')`),
      ).rejects.toThrow(/permission denied/)
      // Their name is still theirs to edit.
      await db.query(
        `update public.players set bio = 'hi' where user_id = $1`,
        [id],
      )
    } finally {
      await db.exec('reset role')
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    }
  })
})

describe('record_challenge_claim', () => {
  const claim = (p: Record<string, unknown>) =>
    db.query(`select public.record_challenge_claim($1::jsonb)`, [
      JSON.stringify(p),
    ])
  const scores = async (id: string) =>
    (
      await db.query<{ hand: string; accuracy: number; receipt: string }>(
        `select hand, accuracy, receipt from public.challenge_scores where user_id = $1 order by hand`,
        [id],
      )
    ).rows
  const body = (
    userId: string,
    accuracy: number,
    receipt: string,
    hand = 'overpair',
  ) => ({
    userId,
    hand,
    ver: 1,
    accuracy,
    receipt,
    playedAt: '2026-10-10T12:00:00Z',
  })

  it('keeps the best score per hand and repeats safely', async () => {
    const id = await signUp('ada@gmail.com')
    await claim(body(id, 70, 'a'.repeat(32)))
    await claim(body(id, 70, 'a'.repeat(32)))
    await claim(body(id, 60, 'b'.repeat(32)))
    expect(await scores(id)).toEqual([
      { hand: 'overpair', accuracy: 70, receipt: 'a'.repeat(32) },
    ])
    await claim(body(id, 90, 'c'.repeat(32)))
    await claim(body(id, 40, 'd'.repeat(32), 'nut-draw'))
    expect(await scores(id)).toEqual([
      { hand: 'nut-draw', accuracy: 40, receipt: 'd'.repeat(32) },
      { hand: 'overpair', accuracy: 90, receipt: 'c'.repeat(32) },
    ])
  })

  it('refuses an unknown account and bad data (class 23 or 22)', async () => {
    await expect(claim(body(uid(), 50, 'e'.repeat(32)))).rejects.toMatchObject({
      code: '23503',
    })
    const id = await signUp('ada@gmail.com')
    await expect(claim(body(id, 101, 'f'.repeat(32)))).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('is the server’s alone', async () => {
    const id = await signUp('ada@gmail.com')
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      try {
        await expect(claim(body(id, 50, '1'.repeat(32)))).rejects.toThrow(
          /permission denied/,
        )
      } finally {
        await db.exec('reset role')
      }
    }
  })
})
