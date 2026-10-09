// What the table server writes to Workers Logs: one JSON line per event, with
// ids only. The log sink is captured here and searched for anything shaped
// like a card, a deck, a secret or a token, across every event kind:
// match start and end, hand end, forfeit, no-show, limit hit and an engine
// fault.
import { runInDurableObject } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { legalActions } from '../../src/engine/hand'
import type { HandState } from '../../src/engine/types'
import { MAX_FRAME } from '../../src/shared/protocol'
import type { TableController } from '../src/controller'
import { LocalController } from '../src/controller'
import { LOG_KEYS } from '../src/log'
import { START_WITHIN_MS } from '../src/lobby'
import { DEFAULT_CONFIG, NEXT_HAND_MS } from '../src/table'
import type { TableDO } from '../src/table'
import {
  connect,
  createTable,
  DEV_SECRET,
  elapse,
  freezeClock,
  isState,
  lobby,
  peek,
  stub,
} from './helpers'
import type { Client } from './helpers'

type Line = Record<string, unknown> & { evt: string }

let sink: string[] = []
beforeEach(() => {
  sink = []
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const)
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      sink.push(args.map((a) => String(a)).join(' '))
    })
})
afterEach(() => vi.restoreAllMocks())

/** Every captured line, parsed; fails on anything that is not one object. */
function lines(): Line[] {
  return sink.map((raw) => {
    const line = JSON.parse(raw) as Line
    expect(typeof line).toBe('object')
    expect(typeof line.evt).toBe('string')
    return line
  })
}

/** Nothing a player must not see, and only the allowed keys. */
function expectClean(holes: number[][] = []) {
  for (const line of lines())
    for (const key of Object.keys(line)) expect(LOG_KEYS).toContain(key)
  const all = sink.join('\n')
  expect(all).not.toMatch(
    /"(cards|deck|secret|holes|leaves|state|board)"|bearer\.|eyJ[\w-]{10,}|sb_secret_/,
  )
  expect(all).not.toContain(DEV_SECRET)
  // Card shapes: a pair of card ids, or a rank and suit like "As" or "Td".
  expect(all).not.toMatch(/\[\s*\d{1,2}\s*,\s*\d{1,2}\s*\]/)
  expect(all).not.toMatch(/\b[2-9TJQKA][shdc]\b/)
  for (const cards of holes) expect(all).not.toContain(cards.join(','))
}

const events = (matchId: string) => lines().filter((l) => l.matchId === matchId)

async function holesOf(matchId: string) {
  const { hand } = await peek(matchId)
  return hand!.players.map((p) => p.cards!)
}

describe('the log sink', () => {
  it('has a start, two hand ends and an end for a two-hand match, and no cards', async () => {
    const matchId = await createTable('alice', 2)
    await freezeClock(matchId)
    const alice = await connect(matchId, 'alice')
    const bob = await connect(matchId, 'bob')
    const seats: Record<number, Client> = { 0: alice, 1: bob }
    await alice.next(isState(1))
    const holes: number[][] = []
    for (const handNo of [1, 2]) {
      await seats[0].next(isState(handNo))
      holes.push(...(await holesOf(matchId)))
      // Play to showdown so hole cards are shown and in the record.
      for (let guard = 0; guard < 20; guard++) {
        const { hand } = await peek(matchId)
        if (hand!.street === 'showdown') break
        const c = seats[hand!.toAct!]
        const from = c.frames.length
        c.send({
          t: 'act',
          reqId: `h${handNo}-${hand!.actions.length}`,
          handNo,
          actionIndex: hand!.actions.length,
          action: legalActions(hand as HandState).canCheck
            ? { type: 'check' }
            : { type: 'call' },
        })
        await c.next(isState(handNo, hand!.actions.length + 1), from)
      }
      await elapse(matchId, NEXT_HAND_MS)
    }
    await alice.next((f) => f.t === 'match_end')
    const seen = events(matchId)
    expect(seen.map((l) => l.evt)).toEqual([
      'match_start',
      'hand_end',
      'hand_end',
      'match_end',
    ])
    expect(seen[0]).toMatchObject({ userIds: ['alice', 'bob'] })
    expect(seen[1]).toMatchObject({ handNo: 1, reason: 'showdown' })
    expect(seen[3]).toMatchObject({ reason: 'complete', handNo: 2 })
    expectClean(holes)
  })

  it('logs a forfeit with the seat and account that timed out', async () => {
    const matchId = await createTable('alice')
    await freezeClock(matchId)
    const alice = await connect(matchId, 'alice')
    const bob = await connect(matchId, 'bob')
    await alice.next(isState(1))
    const holes = await holesOf(matchId)
    // Nobody acts: alice and bob time out in turn until one has three.
    for (let i = 0; i < 20; i++) {
      const { match } = await peek(matchId)
      if (match.status !== 'playing') break
      await elapse(
        matchId,
        DEFAULT_CONFIG.decisionMs + DEFAULT_CONFIG.bankMs + NEXT_HAND_MS,
      )
    }
    await bob.next((f) => f.t === 'match_end')
    const forfeit = events(matchId).find((l) => l.evt === 'forfeit')
    expect(forfeit).toMatchObject({ seat: expect.any(Number) })
    expect(['alice', 'bob']).toContain(forfeit?.userId)
    expect(events(matchId).at(-1)).toMatchObject({
      evt: 'match_end',
      reason: 'forfeit',
    })
    expectClean(holes)
  })

  it('logs a no-show for the account that never came', async () => {
    const [carol, dave] = [await lobby('carol'), await lobby('dave')]
    carol.send({ t: 'queue', kind: 'hu-casual' })
    await carol.next((f) => f.t === 'queued')
    dave.send({ t: 'queue', kind: 'hu-casual' })
    const m = await carol.next((f) => f.t === 'matched')
    const matchId = m.t === 'matched' ? m.matchId : ''
    await connect(matchId, 'carol')
    await freezeClock(matchId)
    await elapse(matchId, START_WITHIN_MS)
    expect(events(matchId).filter((l) => l.evt === 'no_show')).toEqual([
      { evt: 'no_show', matchId, seat: 1, userId: 'dave' },
    ])
    expectClean()
  })

  it('logs a limit hit once, with the account and close code', async () => {
    const matchId = await createTable('alice')
    const alice = await connect(matchId, 'alice')
    await connect(matchId, 'bob')
    await alice.next(isState(1))
    const holes = await holesOf(matchId)
    alice.ws.send('x'.repeat(MAX_FRAME + 1))
    await alice.next((f) => f.t === 'error')
    for (let i = 0; i < 100 && !alice.closed; i++)
      await new Promise((r) => setTimeout(r, 10))
    expect(events(matchId).filter((l) => l.evt === 'limit_hit')).toEqual([
      {
        evt: 'limit_hit',
        matchId,
        userId: 'alice',
        code: 4400,
        reason: 'too_large',
      },
    ])
    expectClean(holes)
  })

  it('halts a match whose deal the engine refuses, and logs the fault by ids only', async () => {
    const matchId = await createTable('alice')
    // A plan the engine refuses: every card the same.
    const broken: TableController = {
      nextHandPlan: (handNo, config) => {
        const plan = new LocalController().nextHandPlan(handNo, config)
        return plan && { ...plan, deck: plan.deck.map(() => 7) }
      },
    }
    await runInDurableObject(stub(matchId), (instance: TableDO) => {
      instance.controller = broken
    })
    const alice = await connect(matchId, 'alice')
    await connect(matchId, 'bob')
    const end = await alice.next((f) => f.t === 'match_end')
    expect(end).toMatchObject({ result: { reason: 'engine_fault' } })
    const fault = events(matchId).find((l) => l.evt === 'error')
    expect(fault).toEqual({
      evt: 'error',
      matchId,
      handNo: 1,
      reason: 'engine_fault',
      detail: 'Invalid deck',
    })
    expectClean([[7, 7]])
  })
})
