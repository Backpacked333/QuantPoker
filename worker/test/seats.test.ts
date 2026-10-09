// Who gets a seat, and keeps it, when clients race or misbehave.
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { lobbyStub } from '../src/lobby'
import {
  connect,
  createTable,
  isState,
  ORIGIN,
  peek,
  token,
  tryConnect,
} from './helpers'

const createMatch = (user: string) =>
  SELF.fetch(`${ORIGIN}/api/matches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(user)}` },
  })

describe('an invite seat under a race', () => {
  it('seats exactly one of two accounts, and the other stays free', async () => {
    const matchId = await createTable('alice')
    const alice = await connect(matchId, 'alice')
    await alice.next((f) => f.t === 'welcome')
    const [bob, carol] = await Promise.all([
      tryConnect(matchId, 'bob'),
      tryConnect(matchId, 'carol'),
    ])
    const { match } = await peek(matchId)
    const seated = (
      match as unknown as { players: { userId: string }[] }
    ).players.map((p) => p.userId)
    expect(seated).toHaveLength(2)
    const winner = seated[1]
    const loser = winner === 'bob' ? 'carol' : 'bob'
    expect(['bob', 'carol']).toContain(winner)
    expect((winner === 'bob' ? bob : carol).status).toBe(101)
    expect((loser === 'bob' ? bob : carol).status).toBe(403)
    // The loser holds no table and can start one.
    expect(await lobbyStub(env).activeFor(loser)).toBeNull()
    expect((await createMatch(loser)).status).toBe(201)
  })

  it('keeps an account that opens the invite twice at once to one table', async () => {
    const matchId = await createTable('alice')
    const alice = await connect(matchId, 'alice')
    await alice.next((f) => f.t === 'welcome')
    // Two tabs (or a double-click) racing for the same seat.
    const [first, second] = await Promise.all([
      tryConnect(matchId, 'bob'),
      tryConnect(matchId, 'bob'),
    ])
    expect([first.status, second.status]).toContain(101)
    await alice.next(isState(1))
    const { match } = await peek(matchId)
    expect(
      (match as unknown as { players: { userId: string }[] }).players.map(
        (p) => p.userId,
      ),
    ).toEqual(['alice', 'bob'])
    // Bob is playing here, so the lobby must still say so: no second table.
    expect(await lobbyStub(env).activeFor('bob')).toBe(matchId)
    expect((await createMatch('bob')).status).toBe(409)
  })
})

describe('seat and session integrity', () => {
  it('ignores a client that names a seat or user in its frames', async () => {
    const matchId = await createTable('alice')
    const alice = await connect(matchId, 'alice')
    const bob = await connect(matchId, 'bob')
    await alice.next(isState(1))
    const { hand } = await peek(matchId)
    // Whoever is not to act tries to move for the other seat.
    const [idle, idleSeat] = hand!.toAct === 0 ? [bob, 1] : [alice, 0]
    const from = idle.frames.length
    idle.ws.send(
      JSON.stringify({
        t: 'act',
        reqId: 'spoof',
        handNo: 1,
        actionIndex: 0,
        action: { type: 'fold' },
        seat: 1 - idleSeat,
      }),
    )
    const error = await idle.next((f) => f.t === 'error', from)
    expect(error).toMatchObject({ t: 'error', code: 'illegal' })
    const after = await peek(matchId)
    expect(after.hand!.actions).toHaveLength(0)
  })

  it('takes identity only from the verified token, never from request headers', async () => {
    const matchId = await createTable('alice')
    const response = await SELF.fetch(`${ORIGIN}/ws/table/${matchId}`, {
      headers: {
        Upgrade: 'websocket',
        Origin: ORIGIN,
        'Sec-WebSocket-Protocol': `qp.v1, bearer.${token('mallory')}`,
        // Spoofed: the Worker must not forward these to the table.
        'x-user-id': 'alice',
        'x-username': 'alice',
      },
    })
    expect(response.status).toBe(101)
    const ws = response.webSocket!
    const frames: { t: string; seat?: number }[] = []
    ws.addEventListener('message', (e) =>
      frames.push(JSON.parse(e.data as string)),
    )
    ws.accept()
    for (let i = 0; i < 100 && !frames.length; i++)
      await new Promise((r) => setTimeout(r, 5))
    // Mallory took the empty seat 1 as herself, not alice's seat 0.
    expect(frames[0]).toMatchObject({ t: 'welcome', seat: 1 })
    const { match } = await peek(matchId)
    expect(
      (match as unknown as { players: { userId: string }[] }).players.map(
        (p) => p.userId,
      ),
    ).toEqual(['alice', 'mallory'])
  })

  it('never reads a token from the URL', async () => {
    const matchId = await createTable('alice')
    const response = await SELF.fetch(
      `${ORIGIN}/ws/table/${matchId}?token=${token('alice')}&access_token=${token('alice')}`,
      {
        headers: {
          Upgrade: 'websocket',
          Origin: ORIGIN,
          'Sec-WebSocket-Protocol': 'qp.v1',
        },
      },
    )
    expect(response.status).toBe(401)
    const api = await SELF.fetch(
      `${ORIGIN}/api/matches?token=${token('alice')}`,
      { method: 'POST' },
    )
    expect(api.status).toBe(401)
  })
})
