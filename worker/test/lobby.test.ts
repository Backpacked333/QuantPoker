// Quick-match: the queue, pairing, the one-table rule, the pair limiter and
// no-shows. Players are dev accounts; tables run for real behind the lobby.
import {
  abortAllDurableObjects,
  env,
  runInDurableObject,
  SELF,
} from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { LobbyMsg } from '../../src/shared/protocol'
import { lobbyStub, START_WITHIN_MS } from '../src/lobby'
import type { LobbyDO } from '../src/lobby'
import {
  connect,
  createTable,
  elapse,
  freezeClock,
  isState,
  lobby,
  ORIGIN,
  peek,
  token,
  tryConnect,
} from './helpers'
import type { LobbyClient } from './helpers'

const matched = (f: LobbyMsg) => f.t === 'matched'
const idOf = (f: LobbyMsg) => (f.t === 'matched' ? f.matchId : '')

async function queue(client: LobbyClient) {
  client.send({ t: 'queue', kind: 'hu-casual' })
}

/** Two players queue and are paired; returns the table they were sent to. */
async function pair(a: string, b: string) {
  const [la, lb] = [await lobby(a), await lobby(b)]
  await queue(la)
  await la.next((f) => f.t === 'queued')
  await queue(lb)
  const [ma, mb] = [await la.next(matched), await lb.next(matched)]
  expect(idOf(ma)).toBe(idOf(mb))
  return { matchId: idOf(ma), la, lb }
}

/** Lets a paired table's start window pass with nobody there. */
async function expire(matchId: string) {
  await freezeClock(matchId)
  await elapse(matchId, START_WITHIN_MS)
}

const lobbyState = () =>
  runInDurableObject(lobbyStub(env), async (instance: LobbyDO) => {
    const state = (instance as unknown as { ctx: DurableObjectState }).ctx
    return Object.fromEntries(await state.storage.list())
  })

describe('the queue', () => {
  it('pairs two waiting players at one new table, both seated', async () => {
    const { matchId, la } = await pair('alice', 'bob')
    expect(matchId).toMatch(/^[0-9a-f-]{36}$/)
    const { match } = await peek(matchId)
    expect(match.status).toBe('waiting')
    // The first hand deals once both open the table.
    const alice = await connect(matchId, 'alice')
    await connect(matchId, 'bob')
    await alice.next(isState(1))
    // Nobody is left waiting.
    const presence = await la.next(
      (f) => f.t === 'presence' && f.queued === 0,
      la.frames.findIndex(matched),
    )
    expect(presence).toMatchObject({ online: 2, queued: 0 })
    const stored = await lobbyState()
    expect(stored['active:alice']).toBe(matchId)
    expect(stored['active:bob']).toBe(matchId)
  })

  it('tells a waiting player their place and everyone the counts', async () => {
    const alice = await lobby('alice')
    await queue(alice)
    expect(await alice.next((f) => f.t === 'queued')).toMatchObject({
      position: 1,
    })
    const carol = await lobby('carol')
    expect(
      await carol.next((f) => f.t === 'presence' && f.online === 2),
    ).toMatchObject({ online: 2, queued: 1 })
  })

  it('drops a player who cancels or leaves', async () => {
    const alice = await lobby('alice')
    const carol = await lobby('carol')
    await queue(alice)
    await carol.next((f) => f.t === 'presence' && f.queued === 1)
    let from = carol.frames.length
    alice.send({ t: 'dequeue' })
    await carol.next((f) => f.t === 'presence' && f.queued === 0, from)

    await queue(alice)
    await carol.next((f) => f.t === 'presence' && f.queued === 1)
    from = carol.frames.length
    alice.ws.close(1000)
    await carol.next(
      (f) => f.t === 'presence' && f.queued === 0 && f.online === 1,
      from,
    )
    expect(
      Object.keys(await lobbyState()).some((k) => k.startsWith('queue:')),
    ).toBe(false)
  })

  it('forgets waiting players whose sockets did not survive a restart', async () => {
    const alice = await lobby('alice')
    await queue(alice)
    await alice.next((f) => f.t === 'queued')
    await abortAllDurableObjects()
    const carol = await lobby('carol')
    expect(await carol.next((f) => f.t === 'presence')).toMatchObject({
      queued: 0,
    })
  })

  it('refuses a lobby socket without an account or with an old protocol', async () => {
    const url = `${ORIGIN}/ws/lobby`
    const bare = await SELF.fetch(url, {
      headers: {
        Upgrade: 'websocket',
        Origin: ORIGIN,
        'Sec-WebSocket-Protocol': 'qp.v1',
      },
    })
    expect(bare.status).toBe(401)
    const old = await SELF.fetch(url, {
      headers: {
        Upgrade: 'websocket',
        Origin: ORIGIN,
        'Sec-WebSocket-Protocol': `qp.v0, bearer.${token('a')}`,
      },
    })
    expect(old.status).toBe(426)
  })
})

describe('one active table per account', () => {
  it('sends a player who queues again back to their table', async () => {
    const { matchId, la } = await pair('alice', 'bob')
    const from = la.frames.length
    await queue(la)
    expect(await la.next(matched, from)).toMatchObject({
      matchId,
      resumed: true,
    })
  })

  it('will not open an invite table while playing, and says which table', async () => {
    const { matchId } = await pair('alice', 'bob')
    const busy = await SELF.fetch(`${ORIGIN}/api/matches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token('alice')}` },
    })
    expect(busy.status).toBe(409)
    expect(await busy.json()).toEqual({ error: 'active', matchId })
    const me = await SELF.fetch(`${ORIGIN}/api/me`, {
      headers: { Authorization: `Bearer ${token('alice')}` },
    })
    expect(await me.json()).toEqual({ activeMatch: matchId })
  })

  it('will not seat a player at an invite while they play elsewhere', async () => {
    const { matchId } = await pair('alice', 'bob')
    const invite = await createTable('carol')
    const carol = await connect(invite, 'carol')
    const tried = await tryConnect(invite, 'bob')
    expect(await tried.closed).toEqual({ code: 4409, reason: matchId })
    // The seat stays open for someone free.
    await connect(invite, 'dave')
    await carol.next(isState(1))
  })

  it('lets go when the table ends, even if the release was lost', async () => {
    const { matchId, la } = await pair('alice', 'bob')
    await expire(matchId) // no-show: the table is over
    // Simulate a lost release: the lobby still thinks alice is there.
    await runInDurableObject(lobbyStub(env), async (instance: LobbyDO) => {
      const state = (instance as unknown as { ctx: DurableObjectState }).ctx
      await state.storage.put('active:alice', matchId)
    })
    const from = la.frames.length
    await queue(la)
    expect(await la.next((f) => f.t === 'queued', from)).toMatchObject({
      position: 1,
    })
    expect(la.frames.slice(from).some(matched)).toBe(false)
  })

  it('does not count an invite nobody joined as playing', async () => {
    const created = await SELF.fetch(`${ORIGIN}/api/matches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token('alice')}` },
    })
    expect(created.status).toBe(201)
    const la = await lobby('alice')
    await queue(la)
    expect(await la.next((f) => f.t === 'queued')).toMatchObject({
      position: 1,
    })
  })
})

describe('the pair limiter', () => {
  it('pairs the same two accounts at most twice a day', async () => {
    for (let round = 0; round < 2; round++) {
      const { matchId, la, lb } = await pair('alice', 'bob')
      await expire(matchId)
      la.ws.close()
      lb.ws.close()
    }
    const [la, lb] = [await lobby('alice'), await lobby('bob')]
    await queue(la)
    await queue(lb)
    await lb.next((f) => f.t === 'queued' && f.position === 2)
    expect([...la.frames, ...lb.frames].some(matched)).toBe(false)
    // Someone new is fine.
    const lc = await lobby('carol')
    await queue(lc)
    const m = await lc.next(matched)
    expect(idOf(await la.next(matched))).toBe(idOf(m))
  })
})

describe('rated play', () => {
  it('pairs rated players only with each other, at a rated table', async () => {
    const [alice, bob] = [await lobby('alice'), await lobby('bob')]
    alice.send({ t: 'queue', kind: 'hu-rated' })
    await alice.next((f) => f.t === 'queued')
    await queue(bob) // casual
    expect(await bob.next((f) => f.t === 'queued')).toMatchObject({
      position: 1,
    })
    expect([...alice.frames, ...bob.frames].some(matched)).toBe(false)
    const carol = await lobby('carol')
    carol.send({ t: 'queue', kind: 'hu-rated' })
    const m = await carol.next(matched)
    expect(idOf(await alice.next(matched))).toBe(idOf(m))
    const { match } = await peek(idOf(m))
    expect(
      (match as unknown as { config: { kind: string; handsTotal: number } })
        .config,
    ).toMatchObject({ kind: 'hu-rated', handsTotal: 40 })
    // Bob is still waiting for a casual opponent.
    expect(bob.frames.some(matched)).toBe(false)
    const dave = await lobby('dave')
    await queue(dave)
    const casual = await dave.next(matched)
    expect(idOf(await bob.next(matched))).toBe(idOf(casual))
    expect(
      (
        (await peek(idOf(casual))).match as unknown as {
          config: { kind: string }
        }
      ).config.kind,
    ).toBe('hu-casual')
  })
})

describe('no-shows', () => {
  it('ends a paired table nobody else opened, and frees both players', async () => {
    const { matchId, la } = await pair('alice', 'bob')
    const alice = await connect(matchId, 'alice')
    await alice.next((f) => f.t === 'welcome')
    await expire(matchId)
    expect(await alice.next((f) => f.t === 'match_end')).toMatchObject({
      result: { reason: 'no_show', noShow: [1] },
    })
    expect((await peek(matchId)).match.status).toBe('finished')
    // Free to queue again at once.
    const from = la.frames.length
    await queue(la)
    await la.next((f) => f.t === 'queued', from)
    expect(la.frames.slice(from).some(matched)).toBe(false)
  })

  it('does nothing once both players are there', async () => {
    const { matchId } = await pair('alice', 'bob')
    await freezeClock(matchId)
    const alice = await connect(matchId, 'alice')
    await connect(matchId, 'bob')
    await alice.next(isState(1))
    await elapse(matchId, START_WITHIN_MS)
    expect((await peek(matchId)).match.status).toBe('playing')
  })
})
