// Retry safety under true concurrency (DBA review 2026-10-09, DB-3).
// PGlite runs one connection, so supabase/tests can show a repeat and a
// partial failure but never two transactions at once. This script starts a
// throwaway PostgreSQL server, loads the Supabase stub, every migration and
// supabase/proposed/phase1.sql, and races two real sessions on each write.
//
//   node supabase/bench/concurrency.ts
//
// Needs PostgreSQL server binaries (PG_BIN, default the Ubuntu 16 path) and
// psql on PATH. Hosted Supabase runs 17; nothing here depends on 16 vs 17.
// Run as root, the server runs as the `postgres` user. Touches nothing but a
// temporary directory, which it deletes.
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  migrationFiles,
  MIGRATIONS_DIR,
  SUPABASE_STUB,
} from '../tests/harness.ts'

const BIN = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'
const PORT = '55432'
const root = process.getuid?.() === 0
const dir = mkdtempSync(join(tmpdir(), 'qp-pg-'))
chmodSync(dir, 0o777)
const data = join(dir, 'data')

function server(cmd: string, args: string[]) {
  const r = root
    ? spawnSync('runuser', ['-u', 'postgres', '--', join(BIN, cmd), ...args], {
        encoding: 'utf8',
      })
    : spawnSync(join(BIN, cmd), args, { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${cmd}: ${r.stderr || r.stdout}`)
}

const PSQL = [
  '-h',
  dir,
  '-p',
  PORT,
  '-U',
  'postgres',
  '-X',
  '-q',
  '-A',
  '-t',
  '-v',
  'ON_ERROR_STOP=1',
]

/** One session: runs `sql` to the end (or the first error). */
function session(
  sql: string,
): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn('psql', [...PSQL, '-f', '-'])
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) =>
      resolve({ ok: code === 0, out: out.trim(), err: err.trim() }),
    )
    p.stdin.end(sql)
  })
}
async function sql(text: string) {
  const r = await session(text)
  if (!r.ok) throw new Error(r.err)
  return r.out
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const lit = (p: object) => `'${JSON.stringify(p).replace(/'/g, "''")}'::jsonb`

/** A holds its transaction open while B runs the same call. */
async function race(callA: string, callB: string, holdMs = 1500) {
  const a = session(
    `begin; ${callA}; select pg_sleep(${holdMs / 1000}); commit;`,
  )
  await sleep(300)
  const started = Date.now()
  const b = await session(callB)
  return { a: await a, b, waitedMs: Date.now() - started }
}

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const CARL = '33333333-3333-4333-8333-333333333333'
const results: [string, boolean, string][] = []
const check = (name: string, ok: boolean, detail: string) =>
  results.push([name, ok, detail])

try {
  server('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8'])
  server('pg_ctl', [
    '-D',
    data,
    '-w',
    '-l',
    join(dir, 'log'),
    '-o',
    `-p ${PORT} -k ${dir} -c listen_addresses=''`,
    'start',
  ])
  await sql(SUPABASE_STUB)
  for (const f of migrationFiles())
    await sql(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'))
  await sql(
    readFileSync(new URL('../proposed/phase1.sql', import.meta.url), 'utf8'),
  )
  await sql(
    `insert into auth.users (id) values ('${ALICE}'), ('${BOB}'), ('${CARL}')`,
  )

  // 1. record_hand twice at once: one hand, chips moved once.
  const m1 = crypto.randomUUID()
  await sql(
    `select public.record_match(${lit({
      id: m1,
      kind: 'hu-casual',
      config: {},
      players: [
        { seat: 0, userId: ALICE },
        { seat: 1, userId: BOB },
      ],
    })})`,
  )
  const hand = {
    id: `${m1}:1`,
    matchId: m1,
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
      { userId: BOB, cards: [2, 3] },
    ],
    netByUser: { [ALICE]: 40, [BOB]: -40 },
  }
  const r1 = await race(
    `select public.record_hand(${lit(hand)})`,
    `select public.record_hand(${lit(hand)})`,
  )
  const s1 =
    await sql(`select (select count(*) from public.hands where id = '${m1}:1') || ',' ||
    (select count(*) from public.hand_holes where hand_id = '${m1}:1') || ',' ||
    (select string_agg(net_chips::text, ' ' order by seat) from public.match_players where match_id = '${m1}')`)
  check(
    'record_hand twice at once: the second waits, then writes nothing',
    r1.a.ok && r1.b.ok && r1.waitedMs > 900 && s1 === '1,2,40 -40',
    `both ok ${r1.a.ok && r1.b.ok}, B waited ${r1.waitedMs} ms, hands,holes,nets ${s1}`,
  )

  // 2. record_match start twice at once: the loser fails whole and its retry succeeds.
  const m2 = crypto.randomUUID()
  const start = {
    id: m2,
    kind: 'hu-rated',
    config: {},
    players: [
      { seat: 0, userId: ALICE },
      { seat: 1, userId: BOB },
    ],
  }
  const r2 = await race(
    `select public.record_match(${lit(start)})`,
    `select public.record_match(${lit(start)})`,
  )
  const retry = await session(`select public.record_match(${lit(start)})`)
  const s2 = await sql(
    `select (select count(*) from public.matches where id = '${m2}') || ',' || (select count(*) from public.match_players where match_id = '${m2}')`,
  )
  check(
    'record_match created twice at once: the second fails whole (23505), its retry succeeds, one match',
    r2.a.ok &&
      !r2.b.ok &&
      /duplicate key|23505/.test(r2.b.err) &&
      retry.ok &&
      s2 === '1,2',
    `B ${r2.b.ok ? 'ok' : r2.b.err.split('\n')[0]}; retry ${retry.ok}; match,seats ${s2}`,
  )

  // 3. record_match finish twice at once: one abandonment.
  const end = {
    ...start,
    handNo: 7,
    timeouts: { 1: 3 },
    // A rated finish carries every seat's outcome and adjusted chips, or
    // record_match v4 refuses it.
    result: {
      netBySeat: { 0: 80, 1: -80 },
      reason: 'forfeit',
      forfeit: 1,
      adjustedBySeat: { 0: 80, 1: -80 },
      outcomeBySeat: { 0: 'win', 1: 'loss' },
    },
  }
  const r3 = await race(
    `select public.record_match(${lit(end)})`,
    `select public.record_match(${lit(end)})`,
  )
  const s3 = await sql(
    `select (select status from public.matches where id = '${m2}') || ',' || (select count(*) from public.abandonments where match_id = '${m2}')`,
  )
  check(
    'record_match finished twice at once: the second waits on the row lock, then writes nothing',
    r3.a.ok && r3.b.ok && r3.waitedMs > 900 && s3 === 'finished,1',
    `B waited ${r3.waitedMs} ms; status,abandonments ${s3}`,
  )

  // 4. apply_rating: two matches sharing a player, rated at once from the
  //    same versions. One applies; the other is stale (40001) and nothing
  //    of it is written; recomputed from fresh versions it applies.
  const m3 = crypto.randomUUID()
  const m4 = crypto.randomUUID()
  await sql(
    `insert into public.matches (id, kind, status, config) values ('${m3}', 'hu-rated', 'finished', '{}'), ('${m4}', 'hu-rated', 'finished', '{}')`,
  )
  const rate = (matchId: string, other: string, v: Record<string, number>) => ({
    matchId,
    format: 'hu-duplicate',
    modelVersion: 'glicko2.v1',
    // Opposite payload orders: the function locks in user_id order anyway.
    players: (matchId === m3
      ? [
          { userId: ALICE, outcome: 'win' },
          { userId: other, outcome: 'loss' },
        ]
      : [
          { userId: other, outcome: 'loss' },
          { userId: ALICE, outcome: 'win' },
        ]
    ).map((x) => ({
      ...x,
      version: v[x.userId] ?? 0,
      rating: 1500,
      rd: 300,
      sigma: 0.06,
    })),
  })
  const r4 = await race(
    `select public.apply_rating(${lit(rate(m3, BOB, {}))})`,
    `select public.apply_rating(${lit(rate(m4, CARL, {}))})`,
  )
  const fresh = Object.fromEntries(
    (await sql(`select user_id || '=' || version from public.ratings`))
      .split('\n')
      .map((l) => {
        const [u, n] = l.split('=')
        return [u, Number(n)]
      }),
  )
  const again = await session(
    `select public.apply_rating(${lit(rate(m4, CARL, fresh))})`,
  )
  const s4 = await sql(
    `select (select matches from public.ratings where user_id = '${ALICE}') || ',' || (select count(*) from public.rating_history where match_id in ('${m3}', '${m4}'))`,
  )
  check(
    'apply_rating at once for two matches sharing a player: one is stale (40001) and writes nothing; recomputed, it applies; no lost update',
    r4.a.ok &&
      !r4.b.ok &&
      /stale rating version/.test(r4.b.err) &&
      again.ok &&
      s4 === '2,4',
    `B ${r4.b.ok ? 'ok' : r4.b.err.split('\n')[0]}; recomputed ${again.ok}; alice matches,history ${s4}`,
  )

  // 5. record_grades twice at once: one row per decision.
  const g = {
    handId: `${m1}:1`,
    format: 'hu-duplicate',
    modelVersion: 'grade.v1',
    grades: [
      {
        seat: 0,
        idx: 0,
        userId: ALICE,
        grade: 'good',
        evLost: 0.2,
        accuracy: 90,
      },
    ],
  }
  const r5 = await race(
    `select public.record_grades(${lit(g)})`,
    `select public.record_grades(${lit(g)})`,
  )
  const s5 = await sql(
    `select count(*) from public.hand_grades where hand_id = '${m1}:1'`,
  )
  check(
    'record_grades twice at once: one row per decision',
    r5.a.ok && r5.b.ok && s5 === '1',
    `rows ${s5}`,
  )

  // 6. The report cap under concurrency: at 9 reports, two at once make 10.
  const asCarl = `set role authenticated; select set_config('request.jwt.claim.sub', '${CARL}', true);`
  const finished: string[] = []
  for (let i = 0; i < 11; i++) {
    const id = crypto.randomUUID()
    finished.push(id)
    await sql(`insert into public.matches (id, kind, status, config) values ('${id}', 'hu-rated', 'finished', '{}');
      insert into public.match_players (match_id, user_id, seat) values ('${id}', '${CARL}', 0), ('${id}', '${BOB}', 1)`)
  }
  for (let i = 0; i < 9; i++)
    await sql(
      `begin; ${asCarl} insert into public.reports (match_id, reported_id, reason) values ('${finished[i]}', '${BOB}', 'other'); commit;`,
    )
  const report = (m: string) =>
    `${asCarl} insert into public.reports (match_id, reported_id, reason) values ('${m}', '${BOB}', 'other')`
  const r6 = await race(
    report(finished[9]),
    `begin; ${report(finished[10])}; commit;`,
  )
  const s6 = await sql(
    `select count(*) from public.reports where reporter_id = '${CARL}'`,
  )
  check(
    'two reports at once at 9 of 10: one lands, one is refused',
    r6.a.ok && !r6.b.ok && /report limit/.test(r6.b.err) && s6 === '10',
    `B ${r6.b.ok ? 'ok' : r6.b.err.split('\n')[0]}; rows ${s6}`,
  )

  // 7. verify_hand twice at once: the second waits on the row, updates nothing.
  const r7 = await race(
    `select public.verify_hand(${lit({ id: `${m1}:1` })})`,
    `select public.verify_hand(${lit({ id: `${m1}:1` })})`,
  )
  const s7 = await sql(`select verified from public.hands where id = '${m1}:1'`)
  check(
    'verify_hand twice at once: both succeed, the hand is verified once',
    r7.a.ok && r7.b.ok && s7 === 't',
    `B waited ${r7.waitedMs} ms; verified ${s7}`,
  )

  // 8. record_incident twice at once: one row.
  const inc = {
    matchId: m1,
    handNo: 1,
    kind: 'replay_mismatch',
    detail: { at: 'test' },
  }
  const r8 = await race(
    `select public.record_incident(${lit(inc)})`,
    `select public.record_incident(${lit(inc)})`,
  )
  const s8 = await sql(
    `select count(*) from public.incidents where match_id = '${m1}'`,
  )
  check(
    'record_incident twice at once: the second waits on the unique index, then writes nothing',
    r8.a.ok && r8.b.ok && r8.waitedMs > 900 && s8 === '1',
    `B waited ${r8.waitedMs} ms; rows ${s8}`,
  )
} catch (error) {
  check('setup', false, String(error))
} finally {
  try {
    server('pg_ctl', ['-D', data, '-m', 'fast', 'stop'])
  } catch {
    // never started
  }
  rmSync(dir, { recursive: true, force: true })
}

for (const [name, ok, detail] of results)
  console.log(`- ${ok ? 'PASS' : 'FAIL'} ${name} (${detail})`)
process.exit(results.every(([, ok]) => ok) ? 0 : 1)
