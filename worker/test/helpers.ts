import { env, SELF } from 'cloudflare:test'
import type { HandState } from '../../src/engine/types'
import type { ClientMsg, ServerMsg } from '../../src/shared/protocol'
import type { InitBody, TableDO } from '../src/table'

export const ORIGIN = 'https://quantpoker.test'
export const token = (user: string) => `dev.${user}.test`

export function stub(matchId: string) {
  return env.TABLE.get(env.TABLE.idFromName(matchId))
}

/** A table created directly, so tests can choose a short match. */
export async function createTable(creator: string, handsTotal?: number) {
  const matchId = crypto.randomUUID()
  const body: InitBody = {
    matchId,
    creator: { userId: creator, username: creator },
    handsTotal,
  }
  const response = await stub(matchId).fetch('https://table/init', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (response.status !== 201) throw new Error(`init ${response.status}`)
  return matchId
}

export type Client = {
  ws: WebSocket
  frames: ServerMsg[]
  closed: { code: number } | null
  send(msg: ClientMsg): void
  /** Resolves with the first frame (from `from` on) matching `test`. */
  next(test: (f: ServerMsg) => boolean, from?: number): Promise<ServerMsg>
}

export async function connect(matchId: string, user: string): Promise<Client> {
  const response = await SELF.fetch(`${ORIGIN}/ws/table/${matchId}`, {
    headers: {
      Upgrade: 'websocket',
      'Sec-WebSocket-Protocol': `qp.v1, bearer.${token(user)}`,
    },
  })
  if (response.status !== 101)
    throw new Error(`upgrade ${response.status}: ${await response.text()}`)
  const ws = response.webSocket!
  const client: Client = {
    ws,
    frames: [],
    closed: null,
    send: (msg) => ws.send(JSON.stringify(msg)),
    async next(test, from = 0) {
      for (let i = 0; i < 400; i++) {
        const found = client.frames.slice(from).find(test)
        if (found) return found
        await new Promise((r) => setTimeout(r, 5))
      }
      throw new Error(`no matching frame among ${client.frames.length}`)
    },
  }
  ws.addEventListener('message', (e) => {
    client.frames.push(JSON.parse(e.data as string) as ServerMsg)
  })
  ws.addEventListener('close', (e) => {
    client.closed = { code: e.code }
  })
  ws.accept()
  return client
}

/** The table's real state, for checking what clients were (not) told. */
export async function peek(matchId: string) {
  const { runInDurableObject } = await import('cloudflare:test')
  return runInDurableObject(stub(matchId), (instance: TableDO) => {
    const t = instance as unknown as {
      hand: HandState | null
      match: { status: string; handNo: number; net: Record<number, number> }
    }
    return { hand: t.hand, match: t.match }
  })
}

export const isState = (handNo: number, actions?: number) => (f: ServerMsg) =>
  (f.t === 'state' || f.t === 'welcome') &&
  f.view?.handNo === handNo &&
  (actions === undefined || f.view.actions.length === actions)

/** Moves the table's clock `ms` forward, then fires its alarm. */
export async function elapse(matchId: string, ms: number) {
  const { runInDurableObject, runDurableObjectAlarm } = await import(
    'cloudflare:test'
  )
  await runInDurableObject(stub(matchId), (instance: TableDO) => {
    const base = instance.clock
    instance.clock = () => base() + ms
  })
  return runDurableObjectAlarm(stub(matchId))
}

/** Stops the table's clock, so only `elapse` moves it. */
export async function freezeClock(matchId: string, at = 1_800_000_000_000) {
  const { runInDurableObject } = await import('cloudflare:test')
  await runInDurableObject(stub(matchId), (instance: TableDO) => {
    instance.clock = () => at
  })
}
