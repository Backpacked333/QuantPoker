// Tables do not live forever. A finished table keeps its storage for
// IDLE_MS so late arrivals still see the result, then deletes everything once
// its archive calls are done; an invite nobody joined expires after
// INVITE_TTL_MS. Otherwise every table ever created would be stored forever.
import { describe, expect, it } from 'vitest'
import { CLOSE_GONE } from '../../src/shared/protocol'
import { now } from '../src/clock'
import { IDLE_MS, INVITE_TTL_MS } from '../src/deadlines'
import { NEXT_HAND_MS } from '../src/table'
import {
  connect,
  createTable,
  elapse,
  freezeClock,
  isState,
  peek,
  storageOf,
  tryConnect,
} from './helpers'

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

/** A one-hand match, played to its end by a fold. */
async function finishedMatch() {
  const matchId = await createTable('alice', 1)
  await freezeClock(matchId)
  const alice = await connect(matchId, 'alice')
  const bob = await connect(matchId, 'bob')
  await alice.next(isState(1))
  alice.send({
    t: 'act',
    reqId: 'fold',
    handNo: 1,
    actionIndex: 0,
    action: { type: 'fold' },
  })
  await alice.next(isState(1, 1))
  await elapse(matchId, NEXT_HAND_MS)
  await alice.next((f) => f.t === 'match_end')
  return { matchId, alice, bob }
}

describe('a finished table', () => {
  it('keeps its result for late arrivals, then deletes its storage and alarm', async () => {
    const { matchId, alice, bob } = await finishedMatch()
    // Shortly after the end the result is still there.
    await elapse(matchId, IDLE_MS - 1000)
    expect((await peek(matchId)).match?.status).toBe('finished')
    expect((await storageOf(matchId)).keys).toContain('match')
    await elapse(matchId, 1000)
    expect(await storageOf(matchId)).toEqual({ keys: [], alarm: null })
    await settle()
    // Anyone still looking at it is told it closed.
    expect(alice.closed?.code).toBe(CLOSE_GONE)
    expect(bob.closed?.code).toBe(CLOSE_GONE)
  })

  it('refuses a socket after cleanup as closed, and opening it stores nothing', async () => {
    const { matchId } = await finishedMatch()
    await elapse(matchId, IDLE_MS)
    const late = await tryConnect(matchId, 'alice')
    expect(late.status).toBe(101)
    expect((await late.closed)?.code).toBe(CLOSE_GONE)
    expect(await storageOf(matchId)).toEqual({ keys: [], alarm: null })
  })
})

describe('an invite nobody joined', () => {
  it('expires: the creator is told the table closed and nothing is stored', async () => {
    const matchId = await createTable('alice')
    // The expiry was set from the real clock at creation.
    await freezeClock(matchId, now())
    const alice = await connect(matchId, 'alice')
    await alice.next((f) => f.t === 'welcome')
    await elapse(matchId, INVITE_TTL_MS - 1000)
    expect((await storageOf(matchId)).keys).toContain('match')
    expect(alice.closed).toBeNull()
    await elapse(matchId, 1000)
    expect(await storageOf(matchId)).toEqual({ keys: [], alarm: null })
    await settle()
    expect(alice.closed?.code).toBe(CLOSE_GONE)
    // And a friend arriving with the old link is told the same.
    const late = await tryConnect(matchId, 'bob')
    expect((await late.closed)?.code).toBe(CLOSE_GONE)
  })

  it('does not expire once both players are there', async () => {
    const matchId = await createTable('alice')
    await freezeClock(matchId)
    const alice = await connect(matchId, 'alice')
    const bob = await connect(matchId, 'bob')
    await alice.next(isState(1))
    await bob.next(isState(1))
    // The turn clock replaces the invite's expiry; play goes on.
    expect((await peek(matchId)).match?.status).toBe('playing')
    expect((await storageOf(matchId)).alarm).not.toBeNull()
  })
})
