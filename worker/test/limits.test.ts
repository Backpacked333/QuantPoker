// Abuse limits from one signed-in account. The lobby is a single object every
// player shares, so an unmetered socket there slows matchmaking for everyone
// and turns each junk frame into a broadcast to every connected player. A
// table is shared by two players. Every limit answers with a typed error or a
// documented close code (src/shared/protocol.ts), never silence.
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { legalActions } from '../../src/engine/hand'
import {
  CLOSE_ABUSE,
  CLOSE_RATE_LIMITED,
  MAX_FRAME,
} from '../../src/shared/protocol'
import {
  FRAMES_PER_WINDOW,
  FrameBudget,
  ILLEGAL_PER_HAND,
  MATCH_CREATES_PER_DAY,
  UPGRADES_PER_IP_PER_MINUTE,
} from '../src/limits'
import type { WorkerEnv } from '../src/env'
import { overAddressLimit } from '../src/index'
import { NEXT_HAND_MS } from '../src/table'
import {
  connect,
  createMatch,
  createTable,
  elapse,
  freezeClock,
  isState,
  lobby,
  ORIGIN,
  peek,
  setClock,
  setLobbyClock,
  token,
  tryConnect,
  tryLobby,
} from './helpers'
import type { Client, LobbyClient } from './helpers'

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))
const T0 = 1_800_000_000_000

async function closedWithin(c: Client | LobbyClient, ms = 2000) {
  for (let t = 0; t < ms && !c.closed; t += 10) await settle(10)
  return c.closed
}

async function seated(handsTotal?: number) {
  const matchId = await createTable('alice', handsTotal)
  await freezeClock(matchId, T0)
  const alice = await connect(matchId, 'alice')
  const bob = await connect(matchId, 'bob')
  await alice.next(isState(1))
  await bob.next(isState(1))
  return { matchId, alice, bob }
}

/** Sends a resync and waits until it is answered or the socket closes. */
async function resync(c: Client) {
  const from = c.frames.length
  c.send({ t: 'resync' })
  for (let i = 0; i < 200; i++) {
    if (c.closed) return false
    if (c.frames.slice(from).some((f) => f.t === 'welcome')) return true
    await settle(5)
  }
  throw new Error('resync neither answered nor closed')
}

describe('frame budget', () => {
  it('allows a window of frames, refuses the next, and refills with time', () => {
    let t = 0
    const budget = new FrameBudget(() => t)
    for (let i = 0; i < FRAMES_PER_WINDOW; i++)
      expect(budget.spend('alice')).toBe(true)
    expect(budget.spend('alice')).toBe(false)
    t += 5000
    for (let i = 0; i < FRAMES_PER_WINDOW; i++)
      expect(budget.spend('alice')).toBe(true)
    expect(budget.spend('alice')).toBe(false)
    budget.refund('alice')
    expect(budget.spend('alice')).toBe(true)
  })

  it('keeps one budget per account, whatever socket it uses', () => {
    const budget = new FrameBudget(() => 0)
    for (let i = 0; i < FRAMES_PER_WINDOW; i++) budget.spend('alice')
    expect(budget.spend('alice')).toBe(false)
    expect(budget.spend('bob')).toBe(true)
  })
})

describe('the lobby under a frame flood', () => {
  it('closes the flooding socket, and other players see a bounded number of frames', async () => {
    const carol = await lobby('carol')
    const mallory = await lobby('mallory')
    await carol.next((f) => f.t === 'presence' && f.online === 2)
    await settle()
    const before = carol.frames.length
    for (let i = 0; i < 200; i++)
      mallory.send(i % 2 ? { t: 'dequeue' } : { t: 'queue', kind: 'hu-casual' })
    expect((await closedWithin(mallory))?.code).toBe(CLOSE_RATE_LIMITED)
    // The flooder was told why before the close.
    expect(mallory.frames.at(-1)).toMatchObject({
      t: 'error',
      code: 'rate_limited',
    })
    await settle()
    // Without a budget every junk frame became a presence frame for carol.
    expect(carol.frames.length - before).toBeLessThanOrEqual(
      2 * FRAMES_PER_WINDOW + 4,
    )
    // Mallory's queue row went with her socket.
    const last = [...carol.frames].reverse().find((f) => f.t === 'presence')
    expect(last).toMatchObject({ online: 1, queued: 0 })
  })

  it('leaves an honest player alone', async () => {
    const alice = await lobby('alice')
    alice.send({ t: 'queue', kind: 'hu-casual' })
    alice.send({ t: 'dequeue' })
    alice.send({ t: 'queue', kind: 'hu-casual' })
    await alice.next((f) => f.t === 'queued')
    await settle()
    expect(alice.closed).toBeNull()
  })

  it('refuses a burst of reconnects from one account without telling anyone', async () => {
    const carol = await lobby('carol')
    await carol.next((f) => f.t === 'presence' && f.online === 1)
    await setLobbyClock(T0)
    const codes: number[] = []
    let beforeRefusals = 0
    for (let i = 0; i < FRAMES_PER_WINDOW + 10; i++) {
      if (i === FRAMES_PER_WINDOW) {
        await settle()
        beforeRefusals = carol.frames.length
      }
      const attempt = await tryLobby('mallory')
      const closed = await Promise.race([
        attempt.closed,
        settle(50).then(() => null),
      ])
      if (closed) codes.push(closed.code)
    }
    await settle()
    // Each accepted socket replaced the one before it (4001); every
    // attempt past the account's budget was refused with 4429.
    expect(codes.filter((c) => c === CLOSE_RATE_LIMITED)).toHaveLength(10)
    // A refused connect told nobody anything.
    expect(carol.frames.length).toBe(beforeRefusals)
  })

  it('answers an oversized frame with too_large, closes it with 4400, and drops its queue row', async () => {
    const carol = await lobby('carol')
    const mallory = await lobby('mallory')
    mallory.send({ t: 'queue', kind: 'hu-casual' })
    await carol.next((f) => f.t === 'presence' && f.queued === 1)
    mallory.ws.send('x'.repeat(MAX_FRAME + 1))
    expect(await mallory.next((f) => f.t === 'error')).toMatchObject({
      code: 'too_large',
    })
    expect((await closedWithin(mallory))?.code).toBe(CLOSE_ABUSE)
    await carol.next((f) => f.t === 'presence' && f.queued === 0)
  })
})

describe('a table under a frame flood', () => {
  it('closes the flooding socket; an instant reconnect is refused too, and after a client backoff the seat and hand resume', async () => {
    const { matchId, alice, bob } = await seated()
    for (let i = 0; i < 100; i++) alice.send({ t: 'resync' })
    expect((await closedWithin(alice))?.code).toBe(CLOSE_RATE_LIMITED)
    // Bob is told alice dropped, and nothing else changed at the table.
    await bob.next(
      (f) =>
        f.t === 'state' &&
        f.table.players.some((p) => p.seat === 0 && !p.connected),
    )
    // Reconnecting at once does not buy a fresh budget.
    const instant = await tryConnect(matchId, 'alice')
    expect((await instant.closed)?.code).toBe(CLOSE_RATE_LIMITED)
    // The client's backoff (≥ 1 s) is enough.
    await setClock(matchId, T0 + 1000)
    const again = await connect(matchId, 'alice')
    const welcome = await again.next((f) => f.t === 'welcome')
    const { hand } = await peek(matchId)
    expect(welcome.t === 'welcome' && welcome.seat).toBe(0)
    expect(welcome.t === 'welcome' && welcome.view?.handNo).toBe(1)
    expect(welcome.t === 'welcome' && welcome.view?.players[0].cards).toEqual(
      hand!.players[0].cards,
    )
  })

  it('answers an oversized frame with too_large and closes it with 4400 unparsed; the seat comes back and the hand is unchanged', async () => {
    const { matchId, alice } = await seated()
    const from = alice.frames.length
    // Just under the platform's 1 MiB message limit, all of it junk.
    alice.ws.send(`{"t":"act","pad":"${'x'.repeat(1_000_000)}"}`)
    expect(await alice.next((f) => f.t === 'error', from)).toMatchObject({
      code: 'too_large',
    })
    expect((await closedWithin(alice))?.code).toBe(CLOSE_ABUSE)
    const { hand } = await peek(matchId)
    expect(hand!.actions).toHaveLength(0)
    await setClock(matchId, T0 + 1000)
    const again = await connect(matchId, 'alice')
    expect(await again.next((f) => f.t === 'welcome')).toMatchObject({
      seat: 0,
    })
  })

  it('parses a frame of exactly MAX_FRAME and closes one byte more', async () => {
    const { alice } = await seated()
    // 21 characters of JSON around the padding.
    const pad = (n: number) => `{"t":"resync","x":"${'x'.repeat(n - 21)}"}`
    expect(pad(MAX_FRAME)).toHaveLength(MAX_FRAME)
    alice.ws.send(pad(MAX_FRAME))
    expect(await alice.next((f) => f.t === 'error')).toMatchObject({
      code: 'illegal',
    })
    expect(alice.closed).toBeNull()
    alice.ws.send(pad(MAX_FRAME + 1))
    expect((await closedWithin(alice))?.code).toBe(CLOSE_ABUSE)
  })

  it('lets honest pacing through for a minute, and stops a drip faster than the refill', async () => {
    const { matchId, alice } = await seated()
    let t = T0
    // One frame every 300 ms for 60 s.
    for (let i = 0; i < 200; i++) {
      await setClock(matchId, (t += 300))
      expect(await resync(alice)).toBe(true)
    }
    // One every 150 ms is 6.7 a second against a refill of 4: the burst
    // drains, then the socket closes. It is not cut off early either.
    let answered = 0
    for (let i = 0; i < 100 && !alice.closed; i++) {
      await setClock(matchId, (t += 150))
      if (await resync(alice)) answered++
    }
    expect((await closedWithin(alice))?.code).toBe(CLOSE_RATE_LIMITED)
    expect(answered).toBeGreaterThanOrEqual(40)
    expect(answered).toBeLessThanOrEqual(60)
  })

  it('never charges moves that the table applied', async () => {
    const matchId = await createTable('alice', 3)
    await freezeClock(matchId)
    const alice = await connect(matchId, 'alice')
    const bob = await connect(matchId, 'bob')
    const clients: Record<number, Client> = { 0: alice, 1: bob }
    await alice.next(isState(1))
    // Spend most of alice's budget on junk first, then play a whole hand at
    // machine speed with a frozen clock (no refill): every applied move
    // must be refunded, or alice would be cut off mid-hand. (The connect
    // itself took one frame.)
    for (let i = 0; i < FRAMES_PER_WINDOW - 3; i++) alice.send({ t: 'resync' })
    await settle()
    for (let guard = 0; guard < 20; guard++) {
      const { hand } = await peek(matchId)
      if (!hand || hand.street === 'showdown') break
      const seat = hand.toAct!
      const legal = legalActions(hand)
      const from = clients[seat].frames.length
      clients[seat].send({
        t: 'act',
        reqId: `m${hand.actions.length}`,
        handNo: 1,
        actionIndex: hand.actions.length,
        action: legal.canCheck ? { type: 'check' } : { type: 'call' },
      })
      await clients[seat].next(isState(1, hand.actions.length + 1), from)
    }
    const { hand } = await peek(matchId)
    expect(hand?.street).toBe('showdown')
    expect(alice.closed).toBeNull()
  })
})

describe('illegal frames', () => {
  it(`closes a seat with 4400 after more than ${ILLEGAL_PER_HAND} in one hand; ${ILLEGAL_PER_HAND} per hand over two hands are fine, and wrong-turn clicks never count`, async () => {
    const { matchId, alice, bob } = await seated(3)
    // Frames an honest client never sends: unreadable, not for a table,
    // or a move the engine refuses.
    const junk = [
      () => alice.ws.send('{nope'),
      () => alice.send({ t: 'queue', kind: 'hu-casual' }),
    ]
    const illegal = async (n: number, extra?: () => void) => {
      for (let i = 0; i < n; i++) {
        const from = alice.frames.length
        if (extra && i === 0) extra()
        else junk[i % junk.length]()
        expect(await alice.next((f) => f.t === 'error', from)).toMatchObject({
          code: 'illegal',
        })
      }
    }
    // Hand 1: alice is on the button and acts first; bob clicking out of
    // turn is what a laggy honest client does.
    for (let i = 0; i < ILLEGAL_PER_HAND + 2; i++) {
      const from = bob.frames.length
      bob.send({
        t: 'act',
        reqId: `early${i}`,
        handNo: 1,
        actionIndex: 0,
        action: { type: 'check' },
      })
      expect(await bob.next((f) => f.t === 'error', from)).toMatchObject({
        code: 'not_your_turn',
      })
    }
    await illegal(ILLEGAL_PER_HAND, () =>
      alice.send({
        t: 'act',
        reqId: 'tiny',
        handNo: 1,
        actionIndex: 0,
        action: { type: 'raise', to: 1 },
      }),
    )
    alice.send({
      t: 'act',
      reqId: 'fold1',
      handNo: 1,
      actionIndex: 0,
      action: { type: 'fold' },
    })
    await alice.next(isState(1, 1))
    await elapse(matchId, NEXT_HAND_MS)
    await alice.next(isState(2))
    await illegal(ILLEGAL_PER_HAND)
    expect(alice.closed).toBeNull()
    expect(bob.closed).toBeNull()
    const from = alice.frames.length
    junk[0]()
    expect(await alice.next((f) => f.t === 'error', from)).toMatchObject({
      code: 'illegal',
    })
    expect((await closedWithin(alice))?.code).toBe(CLOSE_ABUSE)
    // The seat keeps its reconnect rights.
    const again = await connect(matchId, 'alice')
    expect(await again.next((f) => f.t === 'welcome')).toMatchObject({
      seat: 0,
    })
  })
})

describe('new tables', () => {
  it(`caps invite tables at ${MATCH_CREATES_PER_DAY} per account per UTC day, with 429 and Retry-After; the next day is open`, async () => {
    const noon = Date.parse('2026-10-09T12:00:00Z')
    await setLobbyClock(noon)
    try {
      for (let i = 0; i < MATCH_CREATES_PER_DAY; i++)
        expect((await createMatch('maker')).status).toBe(201)
      const refused = await createMatch('maker')
      expect(refused.status).toBe(429)
      expect(refused.headers.get('Retry-After')).toBe(String(12 * 3600))
      expect(await refused.json()).toMatchObject({ error: 'too_many_tables' })
      // Someone else is not affected.
      expect((await createMatch('other')).status).toBe(201)
      await setLobbyClock(Date.parse('2026-10-10T00:00:01Z'))
      expect((await createMatch('maker')).status).toBe(201)
    } finally {
      await setLobbyClock(null)
    }
  })
})

describe('one address', () => {
  it('is let through when the rate limiter itself fails (a backstop never blocks sign-in)', async () => {
    const request = new Request(`${ORIGIN}/api/me`, {
      headers: { 'CF-Connecting-IP': '203.0.113.9' },
    })
    const broken = {
      IP_LIMITER: {
        limit: async () => {
          throw new Error('limiter unavailable')
        },
      },
    } as unknown as WorkerEnv
    expect(await overAddressLimit(request, broken)).toBe(false)
  })

  it(`gets ${UPGRADES_PER_IP_PER_MINUTE} sign-in requests a minute, then 429 before any token check`, async () => {
    const from = { 'CF-Connecting-IP': '203.0.113.7' }
    const statuses: number[] = []
    for (let i = 0; i <= UPGRADES_PER_IP_PER_MINUTE; i++)
      statuses.push(
        (
          await SELF.fetch(`${ORIGIN}/api/me`, {
            headers: { ...from, Authorization: `Bearer ${token('ip')}` },
          })
        ).status,
      )
    expect(statuses.slice(0, -1).every((s) => s === 200)).toBe(true)
    expect(statuses.at(-1)).toBe(429)
    // Another address is unaffected.
    const other = await SELF.fetch(`${ORIGIN}/api/me`, {
      headers: {
        'CF-Connecting-IP': '203.0.113.8',
        Authorization: `Bearer ${token('ip')}`,
      },
    })
    expect(other.status).toBe(200)
  })
})
