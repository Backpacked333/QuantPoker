import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const {
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: key,
  SUPABASE_SERVICE_ROLE_KEY: service,
} = process.env
assert(
  url && key && service,
  'Set server-side Supabase URL, anon key and service-role key to run this explicit integration test.',
)
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, service, options)
const clients = []
const ids = []
try {
  for (let i = 0; i < 2; i++) {
    const email = `quantpoker-test-${randomUUID()}@example.com`
    const password = randomUUID() + randomUUID()
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    assert.ifError(created.error)
    ids.push(created.data.user.id)
    const client = createClient(url, key, options)
    assert.ifError(
      (await client.auth.signInWithPassword({ email, password })).error,
    )
    clients.push(client)
  }
  const [a, b] = clients
  const rows = {
    profiles: {
      user_id: ids[0],
      display_name: 'Integration fixture',
      sound: true,
      fast: true,
    },
    hand_results: {
      user_id: ids[0],
      id: `${randomUUID()}:1`,
      hand_number: 1,
      net: 20,
      result: 'Test hand',
      guided: true,
    },
    lesson_progress: { user_id: ids[0], lens: 'equity' },
    practice_attempts: {
      user_id: ids[0],
      id: randomUUID(),
      lens: 'equity',
      stage: 'prediction',
      answer_id: 'price',
      correct: true,
      context: { pot: 100, call: 25 },
    },
    coach_messages: {
      user_id: ids[0],
      id: randomUUID(),
      role: 'user',
      text: 'Test question',
      snapshot_id: 'visible-only',
      label: 'Hand 1',
    },
  }
  for (const [table, row] of Object.entries(rows)) {
    assert.ifError((await a.from(table).upsert(row)).error)
    const own = await a.from(table).select('*')
    assert.ifError(own.error)
    assert.equal(own.data.length, 1)
    const other = await b.from(table).select('*')
    assert.ifError(other.error)
    assert.equal(other.data.length, 0, `${table}: cross-account read blocked`)
    const forged = await b.from(table).upsert(row)
    assert(forged.error, `${table}: cross-account write blocked`)
  }
  const anonymous = createClient(url, key, options)
  assert(
    (await anonymous.from('hand_results').select('*')).error,
    'Unauthenticated reads denied',
  )
  assert(
    (await a.rpc('reserve_coach_request', { learner: ids[0] })).error,
    'Client cannot change coach quota',
  )
  for (let i = 0; i < 3; i++) {
    const allowance = await admin.rpc('reserve_coach_request', {
      learner: ids[0],
    })
    assert.ifError(allowance.error)
    assert.equal(allowance.data, true)
  }
  const limited = await admin.rpc('reserve_coach_request', { learner: ids[0] })
  assert.ifError(limited.error)
  assert.equal(limited.data, false, 'Durable per-minute coach cap enforced')
  if (process.env.DEPLOYMENT_URL) {
    const base = new URL(process.env.DEPLOYMENT_URL).origin
    const health = await fetch(`${base}/api/coach/health`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), {
      configured: true,
      authRequired: true,
      authMode: 'account',
      model: 'anthropic/claude-sonnet-5.5',
    })
    const headers = { 'Content-Type': 'application/json', Origin: base }
    assert.equal(
      (
        await fetch(`${base}/api/coach`, {
          method: 'POST',
          headers,
          body: '{}',
        })
      ).status,
      401,
    )
    const { guidedHand, legalActions } = await import(
      '../dist-server/src/lib/poker.js'
    )
    const { visibleCoachState } = await import(
      '../dist-server/src/lib/coach.js'
    )
    const game = guidedHand(),
      legal = legalActions(game)
    const snapshot = {
      ...visibleCoachState(game),
      id: 'integration-visible-only',
      mode: 'live',
      pot: 160,
      callCost: 40,
      minRaiseTo: legal.minRaiseTo,
      maxRaiseTo: legal.maxRaiseTo,
      canRaise: true,
      raiseTo: 120,
      action: 'continue',
      foldProbability: 0.25,
      coverageFraction: 0.75,
      probabilities: { win: 0.5, tie: 0.1, loss: 0.4 },
      hypotheticalCard: null,
      nextCardVolatility: 0.1,
      lens: 'equity',
      chart: 'payoff',
      lesson: 'price',
      probe: null,
    }
    const {
      data: { session },
    } = await b.auth.getSession()
    const reply = await fetch(`${base}/api/coach`, {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        snapshot,
        messages: [
          {
            role: 'user',
            content:
              'Explain the price of this call in two sentences. Do not use tools.',
          },
        ],
      }),
      signal: AbortSignal.timeout(55000),
    })
    assert.equal(
      reply.status,
      200,
      'Verified account can call the deployed coach',
    )
    assert.match(reply.headers.get('content-type'), /application\/x-ndjson/)
    const events = (await reply.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    assert(
      !events.some((e) => e.type === 'error'),
      'Live provider returned an error',
    )
    assert(
      events.some((e) => e.type === 'done'),
      'Stream completed',
    )
    assert(
      events.some((e) => e.type === 'text' && e.text.trim()),
      'Received generated text',
    )
    console.log(
      'PASS: production health, guest rejection, verified-account authorization and live streamed AI answer.',
    )
  }
  assert.ifError((await a.rpc('clear_learning_progress')).error)
  for (const table of [
    'hand_results',
    'lesson_progress',
    'practice_attempts',
  ]) {
    assert.equal(
      (await a.from(table).select('*')).data.length,
      0,
      `${table}: cleared`,
    )
  }
  assert.equal(
    (await a.from('coach_messages').select('*')).data.length,
    1,
    'Learning reset preserves conversation history',
  )
  console.log(
    'PASS: live account sessions, all five data tables, cross-user isolation, coach quota and transactional progress reset.',
  )
} finally {
  for (const client of clients) await client.auth.signOut()
  for (const id of ids) {
    const result = await admin.auth.admin.deleteUser(id)
    assert.ifError(result.error)
    for (const table of [
      'profiles',
      'hand_results',
      'lesson_progress',
      'practice_attempts',
      'coach_messages',
    ]) {
      const remaining = await admin
        .from(table)
        .select('user_id')
        .eq('user_id', id)
      assert.ifError(remaining.error)
      assert.equal(
        remaining.data.length,
        0,
        `${table}: account deletion cascades`,
      )
    }
  }
  console.log('PASS: temporary accounts deleted and owned data removed.')
}
