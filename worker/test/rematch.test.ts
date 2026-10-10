// End of a rated match and the rematch (P1-04, ADR amendment 2026-10-10
// "Rematch"). Both players press within REMATCH_MS and the lobby starts a
// new rated table, counted against the pair cap (R-9) and linked to this
// one; a lone press expires; at the cap there is nothing to press. Players
// are real account ids, so every archive call reaches the stubbed archive.
import { env, runInDurableObject } from 'cloudflare:test'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { PlayerAction, SeatId } from '../../src/engine/types'
import type { ServerMsg } from '../../src/shared/protocol'
import { forgetUsernames } from '../src/auth'
import { IDLE_MS } from '../src/deadlines'
import { lobbyStub, PAIRS_PER_DAY } from '../src/lobby'
import { RATED_CONFIG, REMATCH_MS } from '../src/rated'
import { NEXT_HAND_MS } from '../src/table'
import type { InitBody } from '../src/table'
import { checkFrame } from './frames'
import {
  connect,
  createTable,
  elapse,
  freezeClock,
  isState,
  move,
  peek,
  setClock,
  setLobbyClock,
  storageOf,
  stub,
} from './helpers'
import type { Client } from './helpers'

const T0 = 1_800_000_000_000
const LOBBY_AT = Date.parse('2026-10-10T12:00:00Z')
const NAMES: Record<string, string> = {}
type Call = { rpc: string; p: Record<string, unknown> }
let calls: Call[] = []

/** Two fresh accounts: the lobby's pair counts and tables are per account. */
function accounts() {
  const a = crypto.randomUUID()
  const b = crypto.randomUUID()
  NAMES[a] = `alice${a.slice(0, 4)}`
  NAMES[b] = `bob${b.slice(0, 4)}`
  return [a, b] as const
}

beforeAll(() => {
  const realFetch = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.origin !== new URL(env.SUPABASE_URL).origin)
        return realFetch(input, init)
      if (url.pathname === '/rest/v1/players') {
        const id = url.searchParams.get('user_id')!.slice(3)
        return Response.json([{ username: NAMES[id] }])
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const rpc = url.pathname.slice('/rest/v1/rpc/'.length)
        calls.push({ rpc, p: JSON.parse(String(init!.body)).p })
      }
      return new Response(null, { status: 204 })
    },
  )
})
afterAll(() => vi.unstubAllGlobals())
beforeEach(async () => {
  calls = []
  forgetUsernames()
  await setLobbyClock(LOBBY_AT)
})
afterEach(() => setLobbyClock(null))

async function until(test: () => boolean) {
  for (let i = 0; i < 600 && !test(); i++)
    await new Promise((r) => setTimeout(r, 5))
  if (!test()) throw new Error('timed out')
}

const lobbyGet = (key: string) =>
  runInDurableObject(lobbyStub(env), (_, state) => state.storage.get(key))
const pairKey = (a: string, b: string) =>
  `pairs:2026-10-10:${[a, b].sort().join(':')}`

const fold = (): PlayerAction => ({ type: 'fold' })
const raiseTo = (to: number) => (): PlayerAction => ({ type: 'raise', to })

const isRematch =
  (state: string, from?: (f: ServerMsg) => boolean) => (f: ServerMsg) =>
    f.t === 'rematch_state' && f.state === state && (!from || from(f))

/**
 * A rated match between `a` (seat 0) and `b` (seat 1) that `b` forfeits:
 * Alice folds hand 1, then Bob misses three decisions in a row.
 */
async function forfeited(a: string, b: string) {
  const matchId = crypto.randomUUID()
  const body: InitBody = {
    matchId,
    creator: { userId: a, username: NAMES[a] },
    opponent: { userId: b, username: NAMES[b] },
    kind: 'hu-rated',
  }
  await stub(matchId).fetch('https://table/init', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  await freezeClock(matchId, T0)
  const alice = await connect(matchId, a)
  const bob = await connect(matchId, b)
  const seats: Record<SeatId, Client> = { 0: alice, 1: bob }
  await alice.next(isState(1))
  const away = RATED_CONFIG.decisionMs + RATED_CONFIG.bankMs
  const timeOut = async () => {
    const from = alice.frames.length
    await elapse(matchId, away)
    await alice.next(
      (f) => f.t === 'match_end' || f.t === 'state' || f.t === 'welcome',
      from,
    )
  }
  await move(matchId, seats, fold)
  for (const handNo of [2, 3, 4]) {
    await elapse(matchId, NEXT_HAND_MS)
    await alice.next(isState(handNo))
    if (handNo === 3) await move(matchId, seats, raiseTo(60))
    await timeOut()
  }
  await alice.next((f) => f.t === 'match_end')
  await bob.next((f) => f.t === 'match_end')
  return { matchId, alice, bob }
}

describe('the end of a rated match', () => {
  it('both players press Rematch within 60 s and a new rated match starts with rematch_of set', async () => {
    const [a, b] = accounts()
    const { matchId, alice, bob } = await forfeited(a, b)
    await bob.next(isRematch('open'))
    alice.send({ t: 'rematch' })
    const waiting = await bob.next(isRematch('waiting'))
    expect(waiting).toMatchObject({ pressed: [0], until: expect.any(Number) })
    bob.send({ t: 'rematch' })
    const starting = await alice.next(isRematch('starting'))
    const next = starting.t === 'rematch_state' ? starting.next! : ''
    expect(next).toMatch(/^[0-9a-f-]{36}$/)
    await bob.next(isRematch('starting', (f) => 'next' in f && f.next === next))

    // The lobby counted it as a pairing and holds both players there.
    expect(await lobbyGet(pairKey(a, b))).toBe(1)
    expect(await lobbyGet(`active:${a}`)).toBe(next)
    expect(await lobbyGet(`active:${b}`)).toBe(next)

    // The new table is rated, with the same two players and seats swapped,
    // so Bob has the button for its first hand; its archive links back.
    const bob2 = await connect(next, b)
    const alice2 = await connect(next, a)
    await alice2.next(isState(1))
    const welcome = alice2.frames.find((f) => f.t === 'welcome')
    expect(welcome?.t === 'welcome' && welcome.table).toMatchObject({
      kind: 'hu-rated',
      handsTotal: 40,
      players: [
        { seat: 0, username: NAMES[b] },
        { seat: 1, username: NAMES[a] },
      ],
    })
    await until(() =>
      calls.some((c) => c.rpc === 'record_match' && c.p.id === next),
    )
    const linked = calls.find(
      (c) => c.rpc === 'record_match' && c.p.id === next,
    )!
    expect(linked.p.rematchOf).toBe(matchId)
    expect(bob2.closed).toBeNull()
  })

  it('one press alone expires as declined', async () => {
    const [a, b] = accounts()
    const { matchId, alice, bob } = await forfeited(a, b)
    await alice.next(isRematch('open'))
    alice.send({ t: 'rematch' })
    await bob.next(isRematch('waiting'))
    await elapse(matchId, REMATCH_MS)
    await bob.next(isRematch('declined'))
    await alice.next(isRematch('declined'))
    // A press after it expired starts nothing: it is answered with the
    // offer as it stands.
    const from = bob.frames.length
    bob.send({ t: 'rematch' })
    await bob.next(isRematch('declined'), from)
    expect(bob.frames.some(isRematch('starting'))).toBe(false)
    expect(await lobbyGet(pairKey(a, b))).toBeUndefined()
  })

  it('a second press after the minute starts nothing, even when the expiry alarm is late', async () => {
    const [a, b] = accounts()
    const { matchId, alice, bob } = await forfeited(a, b)
    await alice.next(isRematch('open'))
    alice.send({ t: 'rematch' })
    const waiting = await bob.next(isRematch('waiting'))
    const until = waiting.t === 'rematch_state' ? waiting.until! : 0
    // The clock passes the minute, but no alarm has run.
    await setClock(matchId, until + 1)
    bob.send({ t: 'rematch' })
    await alice.next(isRematch('declined'))
    expect(alice.frames.some(isRematch('starting'))).toBe(false)
    expect(await lobbyGet(pairKey(a, b))).toBeUndefined()
  })

  it('an offer lost to a restart between the result and the offer is made on the next join or press', async () => {
    const [a, b] = accounts()
    const { matchId, alice, bob } = await forfeited(a, b)
    await alice.next(isRematch('open'))
    // As if the object restarted after storing the result, before the offer.
    await runInDurableObject(stub(matchId), async (instance, state) => {
      const t = instance as unknown as { match: { rematch?: unknown } }
      delete t.match.rematch
      await state.storage.put('match', t.match)
    })
    const again = await connect(matchId, a)
    await again.next(isRematch('open'))
    again.send({ t: 'rematch' })
    await bob.next(isRematch('waiting'))
    bob.send({ t: 'rematch' })
    await again.next(isRematch('starting'))
    expect(alice.closed?.code).toBe(4001)
  })

  it('a press near cleanup keeps the table for the whole minute', async () => {
    const [a, b] = accounts()
    const { matchId, alice, bob } = await forfeited(a, b)
    await alice.next(isRematch('open'))
    // Ten seconds before the finished table would clean itself up.
    const idle = (await storageOf(matchId)).alarm!
    await setClock(matchId, idle - 10_000)
    alice.send({ t: 'rematch' })
    await bob.next(isRematch('waiting'))
    await elapse(matchId, 10_000)
    expect((await peek(matchId)).match?.status).toBe('finished')
    bob.send({ t: 'rematch' })
    await alice.next(isRematch('starting'))
    expect(IDLE_MS).toBeGreaterThan(REMATCH_MS)
  })

  it('at the pair cap the state is limit and a forced rematch frame is refused', async () => {
    const [a, b] = accounts()
    await runInDurableObject(lobbyStub(env), (_, state) =>
      state.storage.put(pairKey(a, b), PAIRS_PER_DAY),
    )
    const { alice, bob } = await forfeited(a, b)
    const limit = await alice.next(isRematch('limit'))
    expect(limit).toMatchObject({ pressed: [] })
    await bob.next(isRematch('limit'))
    for (const c of [alice, bob]) {
      const from = c.frames.length
      c.send({ t: 'rematch' })
      await c.next(isRematch('limit'), from)
    }
    expect(alice.frames.some(isRematch('waiting'))).toBe(false)
    expect(alice.frames.some(isRematch('starting'))).toBe(false)
    expect(await lobbyGet(pairKey(a, b))).toBe(PAIRS_PER_DAY)
    expect(await lobbyGet(`active:${a}`)).toBeUndefined()
  })

  it('the cap is checked again when both press', async () => {
    const [a, b] = accounts()
    const { alice, bob } = await forfeited(a, b)
    await alice.next(isRematch('open'))
    // Meanwhile the pair met twice today.
    await runInDurableObject(lobbyStub(env), (_, state) =>
      state.storage.put(pairKey(a, b), PAIRS_PER_DAY),
    )
    alice.send({ t: 'rematch' })
    await bob.next(isRematch('waiting'))
    bob.send({ t: 'rematch' })
    await alice.next(isRematch('limit'))
    expect(alice.frames.some(isRematch('starting'))).toBe(false)
    expect(await lobbyGet(`active:${a}`)).toBeUndefined()
  })

  it('a rematch is declined when a player is already at another table', async () => {
    const [a, b] = accounts()
    const { alice, bob } = await forfeited(a, b)
    await alice.next(isRematch('open'))
    // Bob is now playing elsewhere.
    const [, carol] = accounts()
    const other = await forfeitless(b, carol)
    alice.send({ t: 'rematch' })
    await bob.next(isRematch('waiting'))
    bob.send({ t: 'rematch' })
    await alice.next(isRematch('declined'))
    expect(alice.frames.some(isRematch('starting'))).toBe(false)
    expect(await lobbyGet(`active:${b}`)).toBe(other)
  })

  it('rematch frames carry only the allowed keys', async () => {
    const [a, b] = accounts()
    const { matchId, alice, bob } = await forfeited(a, b)
    await bob.next(isRematch('open'))
    alice.send({ t: 'rematch' })
    alice.send({ t: 'rematch' })
    await bob.next(isRematch('waiting'))
    bob.send({ t: 'rematch' })
    await alice.next(isRematch('starting'))
    await bob.next(isRematch('starting'))
    const seen = [...alice.frames, ...bob.frames]
    const states = seen.filter((f) => f.t === 'rematch_state')
    expect(
      new Set(states.map((f) => f.t === 'rematch_state' && f.state)),
    ).toEqual(new Set(['open', 'waiting', 'starting']))
    for (const f of seen) checkFrame(f)
    for (const f of states) expect(f.matchId).toBe(matchId)
  })

  it('a player who comes back after the end gets the result and the offer again', async () => {
    const [a, b] = accounts()
    const { matchId, alice } = await forfeited(a, b)
    await alice.next(isRematch('open'))
    const again = await connect(matchId, a)
    const end = await again.next((f) => f.t === 'match_end')
    expect(end.t === 'match_end' && end.result).toMatchObject({
      reason: 'forfeit',
      forfeit: 1,
      outcomeBySeat: { 0: 'win', 1: 'loss' },
    })
    await again.next(isRematch('open'))
    // And after a resync too.
    const from = again.frames.length
    again.send({ t: 'resync' })
    await again.next((f) => f.t === 'match_end', from)
    await again.next(isRematch('open'), from)
  })

  it('a casual table offers no rematch, and a rematch frame there is illegal', async () => {
    const matchId = await createTable('casual-a', 1)
    await freezeClock(matchId, T0)
    const alice = await connect(matchId, 'casual-a')
    const bob = await connect(matchId, 'casual-b')
    await alice.next(isState(1))
    await move(matchId, { 0: alice, 1: bob }, fold)
    await elapse(matchId, NEXT_HAND_MS)
    await alice.next((f) => f.t === 'match_end')
    alice.send({ t: 'rematch' })
    const refused = await alice.next((f) => f.t === 'error')
    expect(refused).toMatchObject({ code: 'illegal' })
    expect(alice.frames.some((f) => f.t === 'rematch_state')).toBe(false)
    expect((await peek(matchId)).match.status).toBe('finished')
  })
})

/** A rated table between `a` and `b` that is still playing; its id. */
async function forfeitless(a: string, b: string) {
  const matchId = crypto.randomUUID()
  const body: InitBody = {
    matchId,
    creator: { userId: a, username: NAMES[a] },
    opponent: { userId: b, username: NAMES[b] },
    kind: 'hu-rated',
  }
  await stub(matchId).fetch('https://table/init', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  await freezeClock(matchId, T0)
  const first = await connect(matchId, a)
  await connect(matchId, b)
  await first.next(isState(1))
  await runInDurableObject(lobbyStub(env), (_, state) =>
    Promise.all([
      state.storage.put(`active:${a}`, matchId),
      state.storage.put(`active:${b}`, matchId),
    ]),
  )
  return matchId
}
