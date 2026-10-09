// Frame floods from one signed-in account. The lobby is a single object every
// player shares, so an unmetered socket there slows matchmaking for everyone
// and turns each junk frame into a broadcast to every connected player.
import { describe, expect, it } from 'vitest'
import { legalActions } from '../../src/engine/hand'
import {
  CLOSE_RATE_LIMITED,
  FRAMES_PER_WINDOW,
  FrameBudget,
} from '../src/limits'
import {
  connect,
  createTable,
  freezeClock,
  isState,
  lobby,
  peek,
} from './helpers'
import type { Client, LobbyClient } from './helpers'

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))

async function closedWithin(c: Client | LobbyClient, ms = 2000) {
  for (let t = 0; t < ms && !c.closed; t += 10) await settle(10)
  return c.closed
}

describe('frame budget', () => {
  it('allows a window of frames, refuses the next, and refills with time', () => {
    let t = 0
    const budget = new FrameBudget(() => t)
    const ws = {} as WebSocket
    for (let i = 0; i < FRAMES_PER_WINDOW; i++)
      expect(budget.spend(ws)).toBe(true)
    expect(budget.spend(ws)).toBe(false)
    t += 5000
    for (let i = 0; i < FRAMES_PER_WINDOW; i++)
      expect(budget.spend(ws)).toBe(true)
    expect(budget.spend(ws)).toBe(false)
    budget.refund(ws)
    expect(budget.spend(ws)).toBe(true)
  })

  it('keeps one budget per socket', () => {
    const budget = new FrameBudget(() => 0)
    const [a, b] = [{} as WebSocket, {} as WebSocket]
    for (let i = 0; i < FRAMES_PER_WINDOW; i++) budget.spend(a)
    expect(budget.spend(a)).toBe(false)
    expect(budget.spend(b)).toBe(true)
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
})

describe('a table under a frame flood', () => {
  it('closes the flooding socket, and a reconnect resumes the same seat and hand', async () => {
    const matchId = await createTable('alice')
    const alice = await connect(matchId, 'alice')
    const bob = await connect(matchId, 'bob')
    await alice.next(isState(1))
    await bob.next(isState(1))
    for (let i = 0; i < 100; i++) alice.send({ t: 'resync' })
    expect((await closedWithin(alice))?.code).toBe(CLOSE_RATE_LIMITED)
    // Bob is told alice dropped, and nothing else changed at the table.
    await bob.next(
      (f) =>
        f.t === 'state' &&
        f.table.players.some((p) => p.seat === 0 && !p.connected),
    )
    const again = await connect(matchId, 'alice')
    const welcome = await again.next((f) => f.t === 'welcome')
    const { hand } = await peek(matchId)
    expect(welcome.t === 'welcome' && welcome.seat).toBe(0)
    expect(welcome.t === 'welcome' && welcome.view?.handNo).toBe(1)
    expect(welcome.t === 'welcome' && welcome.view?.players[0].cards).toEqual(
      hand!.players[0].cards,
    )
  })

  it('refuses an oversized frame without parsing it, and the hand goes on', async () => {
    const matchId = await createTable('alice')
    const alice = await connect(matchId, 'alice')
    const bob = await connect(matchId, 'bob')
    await alice.next(isState(1))
    await bob.next(isState(1))
    const from = alice.frames.length
    // Just under the platform's 1 MiB message limit, all of it junk.
    alice.ws.send(`{"t":"act","pad":"${'x'.repeat(1_000_000)}"}`)
    expect(await alice.next((f) => f.t === 'error', from)).toMatchObject({
      code: 'illegal',
    })
    const { hand } = await peek(matchId)
    expect(hand!.actions).toHaveLength(0)
    expect(alice.closed).toBeNull()
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
    // must be refunded, or alice would be cut off mid-hand.
    for (let i = 0; i < FRAMES_PER_WINDOW - 2; i++) alice.send({ t: 'resync' })
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
