// The shot clock, time bank and forfeit, and the deck commitment each hand
// carries. Time is moved with `elapse`, never waited for.
import { describe, expect, it } from 'vitest'
import { verifyDeal, fromBase64 } from '../../src/engine/deck'
import { legalActions } from '../../src/engine/hand'
import type { ServerMsg, SeatView } from '../../src/shared/protocol'
import { DEFAULT_CONFIG, NEXT_HAND_MS } from '../src/table'
import {
  connect,
  createTable,
  elapse,
  freezeClock,
  isState,
  peek,
} from './helpers'
import type { Client } from './helpers'

const { decisionMs, bankMs } = DEFAULT_CONFIG

async function seatBoth(handsTotal?: number) {
  const matchId = await createTable('alice', handsTotal)
  await freezeClock(matchId)
  const alice = await connect(matchId, 'alice')
  const bob = await connect(matchId, 'bob')
  await alice.next(isState(1))
  await bob.next(isState(1))
  return {
    matchId,
    alice,
    bob,
    seats: { 0: alice, 1: bob } as Record<number, Client>,
  }
}

const lastView = (c: Client) => {
  for (let i = c.frames.length - 1; i >= 0; i--) {
    const f = c.frames[i]
    if ((f.t === 'state' || f.t === 'welcome') && f.view) return f.view
  }
  throw new Error('no view')
}

async function move(
  c: Client,
  view: SeatView,
  action = 'call' as 'call' | 'check' | 'fold',
) {
  const from = c.frames.length
  c.send({
    t: 'act',
    reqId: `m${view.handNo}-${view.actions.length}`,
    handNo: view.handNo,
    actionIndex: view.actions.length,
    action: { type: action },
  })
  await c.next(isState(view.handNo, view.actions.length + 1), from)
}

describe('the shot clock', () => {
  it('shows both seats the deadline: decision time plus the bank', async () => {
    const { alice, bob } = await seatBoth()
    for (const c of [alice, bob]) {
      const f = [...c.frames].reverse().find((x) => x.t === 'state')!
      if (f.t !== 'state') throw new Error()
      expect(f.view!.clock).toEqual({
        deadline: f.serverNow + decisionMs + bankMs,
        bankMs,
      })
    }
  })

  it('folds for a player who runs out, spending their whole bank', async () => {
    const { matchId, alice, seats } = await seatBoth()
    const actor = (await peek(matchId)).hand!.toAct!
    // A moment before the deadline nothing happens.
    expect(await elapse(matchId, decisionMs + bankMs - 1)).toBe(true)
    expect((await peek(matchId)).hand!.actions).toHaveLength(0)

    const from = seats[actor].frames.length
    await elapse(matchId, 1)
    // Heads-up the button acts first, facing the big blind: no check, so fold.
    const after = await seats[actor].next(isState(1, 1), from)
    if (after.t !== 'state') throw new Error()
    expect(after.view!.actions[0].action).toEqual({ type: 'fold' })
    expect(after.table.players[actor].consecutiveTimeouts).toBe(1)
    const ended = await alice.next((f) => f.t === 'hand_end')
    if (ended.t !== 'hand_end') throw new Error()
    expect(ended.record.actions[0]).toMatchObject({
      source: 'timeout',
      decisionMs: decisionMs + bankMs,
    })

    // Next hand: the bank is gone, so the clock is the decision time alone.
    await elapse(matchId, NEXT_HAND_MS)
    const hand2 = await seats[actor].next(isState(2))
    if (hand2.t !== 'state' && hand2.t !== 'welcome') throw new Error()
    const toAct = hand2.view!.toAct
    const bank = hand2.view!.clock!.bankMs
    expect(bank).toBe(toAct === actor ? 0 : bankMs)
  })

  it('checks rather than folds when checking is free', async () => {
    const { matchId, seats } = await seatBoth()
    const sb = (await peek(matchId)).hand!.toAct!
    await move(seats[sb], lastView(seats[sb]), 'call')
    const bb = 1 - sb
    const from = seats[bb].frames.length
    await elapse(matchId, decisionMs + bankMs)
    const f = await seats[bb].next(isState(1, 2), from)
    if (f.t !== 'state') throw new Error()
    expect(f.view!.actions[1]).toMatchObject({
      seat: bb,
      action: { type: 'check' },
    })
    expect(f.view!.street).toBe('flop')
  })

  it('spends only the time past the decision allowance from the bank', async () => {
    const { matchId, seats } = await seatBoth()
    const actor = (await peek(matchId)).hand!.toAct!
    await elapse(matchId, decisionMs + 15_000)
    await move(seats[actor], lastView(seats[actor]), 'call')
    // The other seat's clock now runs from a full allowance and full bank.
    const other = lastView(seats[1 - actor])
    expect(other.clock!.bankMs).toBe(bankMs)
    // A stale alarm for the old decision does nothing to the new one.
    await elapse(matchId, decisionMs + bankMs - 1)
    expect((await peek(matchId)).hand!.actions).toHaveLength(1)

    // Back to the first player later in the hand: 15 s of bank used. The
    // big blind closes pre-flop and acts first on the flop.
    await move(seats[1 - actor], lastView(seats[1 - actor]), 'check')
    await move(seats[1 - actor], lastView(seats[1 - actor]), 'check')
    const again = lastView(seats[actor])
    expect(again.toAct).toBe(actor)
    expect(again.clock!.bankMs).toBe(bankMs - 15_000)
  })

  it('applies exactly one move when a click and the deadline arrive together', async () => {
    const { matchId, seats } = await seatBoth()
    const actor = (await peek(matchId)).hand!.toAct!
    const view = lastView(seats[actor])
    // The click is in flight while the deadline fires.
    seats[actor].send({
      t: 'act',
      reqId: 'race',
      handNo: 1,
      actionIndex: 0,
      action: { type: 'call' },
    })
    await elapse(matchId, decisionMs + bankMs)
    await seats[actor].next(isState(1, 1))
    await new Promise((r) => setTimeout(r, 50))
    const { hand } = await peek(matchId)
    expect(hand!.actions.filter((a) => a.seat === actor)).toHaveLength(1)
    expect(view.actions).toHaveLength(0)
  })

  it('ends the match as a forfeit after three missed decisions in a row', async () => {
    const { matchId, alice, bob } = await seatBoth()
    // Alice is gone; Bob plays every decision of his own.
    for (
      let i = 0;
      i < 30 && !alice.frames.some((f) => f.t === 'match_end');
      i++
    ) {
      const { hand, match } = await peek(matchId)
      if (match.status !== 'playing') break
      if (!hand || hand.street === 'showdown') {
        await elapse(matchId, NEXT_HAND_MS)
        continue
      }
      if (hand.toAct === 1) {
        const legal = legalActions(hand)
        await move(bob, lastView(bob), legal.canCheck ? 'check' : 'call')
      } else await elapse(matchId, decisionMs + bankMs)
    }
    const end = await bob.next((f) => f.t === 'match_end')
    expect(end).toMatchObject({ result: { reason: 'forfeit', forfeit: 0 } })
    const { match } = await peek(matchId)
    expect(match.status).toBe('finished')
    // Nothing is left to fire.
    expect(await elapse(matchId, 10 * 60_000)).toBe(false)
  })
})

describe('the deck commitment', () => {
  it('commits before the cards, then reveals only the board and shown hands', async () => {
    const { matchId, alice, bob, seats } = await seatBoth()
    const start = alice.frames.findIndex((f) => f.t === 'hand_start')
    const firstCards = alice.frames.findIndex(
      (f) => (f.t === 'state' || f.t === 'welcome') && f.view?.handNo === 1,
    )
    expect(start).toBeGreaterThanOrEqual(0)
    expect(start).toBeLessThan(firstCards)
    const hs = alice.frames[start]
    if (hs.t !== 'hand_start') throw new Error()
    expect(hs.commitment).toMatch(/^[0-9a-f]{64}$/)
    expect(lastView(bob).commitment).toBe(hs.commitment)

    // Play to showdown with calls and checks.
    for (let guard = 0; guard < 20; guard++) {
      const { hand } = await peek(matchId)
      if (hand!.street === 'showdown') break
      const c = seats[hand!.toAct!]
      await move(
        c,
        lastView(c),
        legalActions(hand!).canCheck ? 'check' : 'call',
      )
    }
    for (const c of [alice, bob]) {
      const end = await c.next((f) => f.t === 'hand_end')
      const reveal = await c.next((f) => f.t === 'reveal')
      if (end.t !== 'hand_end' || reveal.t !== 'reveal') throw new Error()
      expect(end.record.commitment).toBe(hs.commitment)
      expect(reveal.slots).toHaveLength(9) // 5 board + 2 × 2 shown
      expect(
        await verifyDeal(
          hs.commitment,
          fromBase64(reveal.leaves),
          reveal.slots,
          end.record,
        ),
      ).toBe(true)
      expect(JSON.stringify(end)).not.toContain('"deck"')
    }
  })

  it('reveals nothing of a hand folded before the flop', async () => {
    const { matchId, alice, seats } = await seatBoth()
    const actor = (await peek(matchId)).hand!.toAct!
    const folder = (await peek(matchId)).hand!.players[actor].cards!
    await move(seats[actor], lastView(seats[actor]), 'fold')
    const reveal = await alice.next((f) => f.t === 'reveal')
    if (reveal.t !== 'reveal') throw new Error()
    expect(reveal.slots).toEqual([])
    // Neither seat ever gets the folded cards in a record or reveal.
    const other = seats[1 - actor]
    const end = await other.next((f) => f.t === 'hand_end')
    expect(end.t === 'hand_end' && end.record.shown).toEqual([])
    for (const f of other.frames.filter(
      (x) => x.t === 'reveal' || x.t === 'hand_end',
    ))
      for (const card of folder)
        expect(
          (f as ServerMsg & { slots?: { card: number }[] }).slots?.some(
            (s) => s.card === card,
          ) ?? false,
        ).toBe(false)
  })

  it('re-sends the finished hand to a player who rejoins before the next', async () => {
    const { matchId, seats } = await seatBoth()
    const actor = (await peek(matchId)).hand!.toAct!
    await move(seats[actor], lastView(seats[actor]), 'fold')
    const name = actor === 0 ? 'alice' : 'bob'
    const back = await connect(matchId, name)
    await back.next((f) => f.t === 'welcome')
    const end = await back.next((f) => f.t === 'hand_end')
    await back.next((f) => f.t === 'reveal')
    expect(end.t === 'hand_end' && end.handNo).toBe(1)
  })
})
