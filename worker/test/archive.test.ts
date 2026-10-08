// The outbox to Postgres: what a finished match sends, in what order, and
// what happens while Supabase is down. Supabase is a stubbed fetch here; the
// SQL side of the same payloads is tested in supabase/tests.
import {
  abortAllDurableObjects,
  env,
  runInDurableObject,
} from 'cloudflare:test'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { dealSlots, fromBase64, verifyDeal } from '../../src/engine/deck'
import type { HandRecordV1 } from '../../src/shared/protocol'
import { START_WITHIN_MS } from '../src/lobby'
import { NEXT_HAND_MS, OUTBOX_SAFETY_MS } from '../src/table'
import type { Outbox, TableDO } from '../src/table'
import {
  connect,
  createTable,
  elapse,
  freezeClock,
  isState,
  lobby,
  peek,
  stub,
} from './helpers'
import type { Client } from './helpers'

const ALICE = 'a11ce000-0000-4000-8000-000000000001'
const BOB = 'b0b00000-0000-4000-8000-000000000002'
const NAMES: Record<string, string> = { [ALICE]: 'alice', [BOB]: 'bob' }

type Call = { rpc: string; p: Record<string, unknown> }
let calls: Call[] = []
let failing = false

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
        expect(new Headers(init?.headers).get('apikey')).toBe('sb_secret_test')
        if (failing) return new Response('down', { status: 503 })
        calls.push({
          rpc: url.pathname.slice('/rest/v1/rpc/'.length),
          p: JSON.parse(String(init!.body)).p,
        })
        return new Response(null, { status: 204 })
      }
      return new Response('not stubbed', { status: 599 })
    },
  )
})
afterAll(() => vi.unstubAllGlobals())
beforeEach(() => {
  calls = []
  failing = false
})

async function until(test: () => boolean) {
  for (let i = 0; i < 400 && !test(); i++)
    await new Promise((r) => setTimeout(r, 5))
  if (!test()) throw new Error('timed out')
}

async function table(handsTotal: number) {
  const matchId = await createTable(ALICE, handsTotal)
  await freezeClock(matchId)
  const alice = await connect(matchId, ALICE)
  const bob = await connect(matchId, BOB)
  await alice.next(isState(1))
  return { matchId, seats: { 0: alice, 1: bob } as Record<number, Client> }
}

/** The player to act folds. */
async function foldHand(matchId: string, seats: Record<number, Client>) {
  const { hand } = await peek(matchId)
  const c = seats[hand!.toAct!]
  const from = c.frames.length
  c.send({
    t: 'act',
    reqId: `f${hand!.config.handNo}`,
    handNo: hand!.config.handNo,
    actionIndex: 0,
    action: { type: 'fold' },
  })
  await c.next(isState(hand!.config.handNo, 1), from)
}

const outbox = (matchId: string) =>
  runInDurableObject(stub(matchId), async (instance: TableDO) => {
    const state = (instance as unknown as { ctx: DurableObjectState }).ctx
    return [...(await state.storage.list<Outbox>({ prefix: 'outbox:' }))]
  })

describe('the archive', () => {
  it('records the match, each hand, then the result, in that order', async () => {
    const { matchId, seats } = await table(2)
    await foldHand(matchId, seats)
    await until(() => calls.length === 2)
    await elapse(matchId, NEXT_HAND_MS)
    await seats[0].next(isState(2))
    await foldHand(matchId, seats)
    await until(() => calls.length === 3)
    await elapse(matchId, NEXT_HAND_MS) // no hand 3: the match ends
    await until(() => calls.length === 4)

    expect(calls.map((c) => c.rpc)).toEqual([
      'record_match',
      'record_hand',
      'record_hand',
      'record_match',
    ])
    expect(calls[0].p).toMatchObject({
      id: matchId,
      kind: 'hu-casual',
      players: [
        { seat: 0, userId: ALICE },
        { seat: 1, userId: BOB },
      ],
    })
    expect(calls[0].p.result).toBeUndefined()

    const hand = calls[1].p as Record<string, unknown> & {
      record: HandRecordV1
      deck: number[]
      holes: Record<number, number[]>
      holesByUser: { userId: string; cards: number[] }[]
      netByUser: Record<string, number>
      reveal: { slot: number; card: number; salt: string }[]
    }
    expect(hand.id).toBe(`${matchId}:1`)
    // The audit copy has every hole card; the public record has none of a
    // folded hand.
    const holes = dealSlots(hand.record.config).holes
    for (const seat of [0, 1])
      expect(hand.holes[seat]).toEqual(holes[seat].map((s) => hand.deck[s]))
    expect(hand.holesByUser.map((h) => h.userId).sort()).toEqual(
      [ALICE, BOB].sort(),
    )
    expect(hand.record.shown).toEqual([])
    expect(JSON.stringify(hand.record)).not.toContain('"deck"')
    expect(Object.values(hand.netByUser).reduce((a, b) => a + b)).toBe(0)
    expect(
      await verifyDeal(
        hand.commitment as string,
        fromBase64(hand.leaves as string),
        hand.reveal,
        hand.record,
      ),
    ).toBe(true)

    const end = calls[3].p
    expect(end.result).toMatchObject({ reason: 'complete' })
    expect(end.timeouts).toEqual({ 0: 0, 1: 0 })
    expect(await outbox(matchId)).toEqual([])
  })

  it('keeps calls queued in order while Supabase is down, then catches up', async () => {
    failing = true
    const { matchId, seats } = await table(5)
    await foldHand(matchId, seats)
    // The match call failed, so the hand behind it was never tried.
    let queued: [string, Outbox][] = []
    for (let i = 0; i < 400 && !(queued[0]?.[1].attempts >= 1); i++) {
      queued = await outbox(matchId)
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(queued.map(([key]) => key)).toEqual([
      'outbox:0000:match',
      'outbox:0001:hand',
    ])
    expect(queued[0][1].attempts).toBeGreaterThanOrEqual(1)
    expect(queued[1][1].attempts).toBe(0)
    expect(calls).toEqual([])

    // Play is not held up by the archive.
    await elapse(matchId, NEXT_HAND_MS)
    await seats[0].next(isState(2))

    failing = false
    // Past the retry, short of the next turn clock.
    expect(await elapse(matchId, 10_000)).toBe(true)
    await until(() => calls.length === 2)
    expect(calls.map((c) => c.rpc)).toEqual(['record_match', 'record_hand'])
    queued = await outbox(matchId)
    expect(queued).toEqual([])
  })

  it('still delivers a queued call when the table restarts before sending', async () => {
    const { matchId, seats } = await table(5)
    await until(() => calls.length === 1) // the match row
    // Lose the immediate send, then lose the object itself.
    await runInDurableObject(stub(matchId), (instance: TableDO) => {
      instance.flushOutbox = async () => {}
    })
    await foldHand(matchId, seats)
    expect((await outbox(matchId)).map(([key]) => key)).toEqual([
      'outbox:0001:hand',
    ])
    await abortAllDurableObjects()
    await freezeClock(matchId) // the fresh object starts on the real clock
    expect(calls).toHaveLength(1)
    // The fallback deadline was written with the call, so it survives.
    expect(await elapse(matchId, OUTBOX_SAFETY_MS)).toBe(true)
    await until(() => calls.length === 2)
    expect(calls[1].rpc).toBe('record_hand')
    expect(await outbox(matchId)).toEqual([])
  })

  it('records a no-show as a void match naming the absent seat', async () => {
    const [la, lb] = [await lobby(ALICE), await lobby(BOB)]
    la.send({ t: 'queue', kind: 'hu-casual' })
    await la.next((f) => f.t === 'queued')
    lb.send({ t: 'queue', kind: 'hu-casual' })
    const m = await la.next((f) => f.t === 'matched')
    const matchId = m.t === 'matched' ? m.matchId : ''
    await connect(matchId, ALICE)
    await freezeClock(matchId)
    await elapse(matchId, START_WITHIN_MS)
    await until(() => calls.length === 1)
    expect(calls[0]).toMatchObject({
      rpc: 'record_match',
      p: {
        id: matchId,
        players: [
          { seat: 0, userId: ALICE },
          { seat: 1, userId: BOB },
        ],
        result: { reason: 'no_show', noShow: [1] },
      },
    })
  })

  it('archives nothing for local dev accounts', async () => {
    const matchId = await createTable('carol', 1)
    const carol = await connect(matchId, 'carol')
    const dave = await connect(matchId, 'dave')
    await carol.next(isState(1))
    await foldHand(matchId, { 0: carol, 1: dave })
    await carol.next((f) => f.t === 'reveal')
    expect(await outbox(matchId)).toEqual([])
    expect(calls).toEqual([])
  })
})
