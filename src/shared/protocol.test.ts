// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { lcg } from '../lib/sim'
import { MAX_FRAME, parseClientMsg } from './protocol'

const frame = (v: unknown) => JSON.stringify(v)
const act = {
  t: 'act',
  reqId: 'r-1_a',
  handNo: 3,
  actionIndex: 0,
  action: { type: 'raise', to: 60 },
}

describe('parseClientMsg', () => {
  it('accepts every well-formed message', () => {
    expect(parseClientMsg(frame(act))).toEqual(act)
    for (const type of ['fold', 'check', 'call'])
      expect(parseClientMsg(frame({ ...act, action: { type } }))).toEqual({
        ...act,
        action: { type },
      })
    expect(parseClientMsg(frame({ t: 'resync' }))).toEqual({ t: 'resync' })
    expect(parseClientMsg(frame({ t: 'dequeue' }))).toEqual({ t: 'dequeue' })
    expect(parseClientMsg(frame({ t: 'queue', kind: 'hu-casual' }))).toEqual({
      t: 'queue',
      kind: 'hu-casual',
    })
  })

  it('rejects malformed messages', () => {
    for (const bad of [
      'not json',
      frame(null),
      frame([act]),
      frame({ ...act, extra: 1 }),
      frame({ ...act, handNo: 0 }),
      frame({ ...act, handNo: 1.5 }),
      frame({ ...act, actionIndex: -1 }),
      frame({ ...act, reqId: '' }),
      frame({ ...act, reqId: 'x'.repeat(65) }),
      frame({ ...act, reqId: 'has space' }),
      frame({ ...act, action: { type: 'raise' } }),
      frame({ ...act, action: { type: 'raise', to: 10.5 } }),
      frame({ ...act, action: { type: 'raise', to: '60' } }),
      frame({ ...act, action: { type: 'call', to: 60 } }),
      frame({ ...act, action: { type: 'shove' } }),
      frame({ t: 'resync', x: 1 }),
      frame({ t: 'queue', kind: 'six-max' }),
      frame({ t: 'hello' }),
      frame({ ...act, reqId: 'a'.repeat(MAX_FRAME) }),
    ])
      expect(parseClientMsg(bad), bad.slice(0, 60)).toBeNull()
    expect(parseClientMsg(42)).toBeNull()
    expect(parseClientMsg(' '.repeat(MAX_FRAME + 1))).toBeNull()
  })

  it('never throws on random input and only returns valid shapes', () => {
    const random = lcg(8)
    const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)]
    const value = (depth: number): unknown => {
      const roll = random()
      if (depth > 3 || roll < 0.3)
        return pick([
          0,
          1,
          -1,
          2.5,
          1e21,
          NaN,
          '',
          'act',
          'raise',
          'hu-casual',
          'r1',
          true,
          null,
        ])
      if (roll < 0.5) return Array.from({ length: 3 }, () => value(depth + 1))
      const keys = [
        't',
        'reqId',
        'handNo',
        'actionIndex',
        'action',
        'type',
        'to',
        'kind',
        'x',
      ]
      return Object.fromEntries(
        keys.filter(() => random() < 0.5).map((k) => [k, value(depth + 1)]),
      )
    }
    for (let i = 0; i < 20_000; i++) {
      const raw =
        random() < 0.1
          ? 'x' + JSON.stringify(value(0))
          : JSON.stringify(value(0))
      const msg = parseClientMsg(raw ?? 'undefined')
      if (msg) expect(['act', 'resync', 'queue', 'dequeue']).toContain(msg.t)
    }
  })
})
