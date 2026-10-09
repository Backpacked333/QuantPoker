// The one lobby: who is waiting for a heads-up match, which table each
// account is at, and how often two accounts were paired today. Everything
// is in storage, so hibernation or eviction never loses a waiting player.
//
//   queue:<userId>          { userId, username, since }  (connected + asked)
//   active:<userId>         matchId                      (one table each)
//   pairs:<day>:<a>:<b>     times paired that UTC day    (limit 2)
import { DurableObject } from 'cloudflare:workers'
import { parseClientMsg, PROTOCOL } from '../../src/shared/protocol'
import type { ErrorCode, LobbyMsg } from '../../src/shared/protocol'
import { now } from './clock'
import type { WorkerEnv } from './env'
import { CLOSE_RATE_LIMITED, FrameBudget } from './limits'
import type { InitBody, Liveness } from './table'

/** The same two accounts meet at most this often per UTC day. */
export const PAIRS_PER_DAY = 2
/** Both players must open a paired table within this time. */
export const START_WITHIN_MS = 30_000

type Waiting = { userId: string; username: string; since: number }
type Attachment = { userId: string; username: string }

const OPEN = 1
const json = (body: unknown, status = 200) => Response.json(body, { status })
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const pairKey = (d: string, a: string, b: string) =>
  `pairs:${d}:${[a, b].sort().join(':')}`

export function tableStub(env: WorkerEnv, matchId: string) {
  // One region at launch; the hint only matters when the object is created.
  return env.TABLE.get(env.TABLE.idFromName(matchId), { locationHint: 'enam' })
}

export function lobbyStub(env: WorkerEnv) {
  return env.LOBBY.get(env.LOBBY.idFromName('global'), {
    locationHint: 'enam',
  })
}

export class LobbyDO extends DurableObject<WorkerEnv> {
  private seq = 0
  /** The lobby's clock; tests move it. */
  clock: () => number = now
  /** Every player shares this object: each socket gets a frame budget. */
  private budget = new FrameBudget(() => this.clock())

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    )
    void ctx.blockConcurrencyWhile(async () => {
      this.seq = ((await ctx.storage.get('seq')) as number | undefined) ?? 0
      // The queue is exactly "connected and asked to play": rows whose
      // socket did not survive a restart go.
      const connected = new Set(this.sockets().map((ws) => this.who(ws).userId))
      const queued = await ctx.storage.list<Waiting>({ prefix: 'queue:' })
      const gone = [...queued.values()]
        .filter((w) => !connected.has(w.userId))
        .map((w) => `queue:${w.userId}`)
      if (gone.length) await ctx.storage.delete(gone)
    })
  }

  // ---- Sockets ---------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get('x-user-id')
    const username = request.headers.get('x-username')
    if (new URL(request.url).pathname !== '/connect')
      return json({ error: 'not found' }, 404)
    if (!userId || !username) return json({ error: 'unauthorized' }, 401)
    // One lobby socket per account: a second tab replaces the first.
    for (const old of this.ctx.getWebSockets(userId))
      old.close(4001, 'replaced')
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server, [userId])
    server.serializeAttachment({ userId, username } satisfies Attachment)
    await this.presence()
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': PROTOCOL },
    })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Frames still in flight from a socket we already closed do nothing.
    if (ws.readyState !== OPEN) return
    if (!this.budget.spend(ws)) {
      ws.close(CLOSE_RATE_LIMITED, 'Too many messages')
      return this.leave(ws)
    }
    const msg = typeof message === 'string' ? parseClientMsg(message) : null
    if (msg?.t === 'queue') return this.enqueue(ws)
    if (msg?.t === 'dequeue') {
      await this.ctx.storage.delete(`queue:${this.who(ws).userId}`)
      return this.presence()
    }
    this.reject(ws, 'illegal', 'Not a lobby message')
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code === 1005 ? 1000 : code, reason)
    } catch {
      // Already closed.
    }
    await this.leave(ws)
  }

  async webSocketError(ws: WebSocket) {
    await this.leave(ws)
  }

  /** A closed socket takes its queue row with it (unless a newer tab is open). */
  private async leave(ws: WebSocket) {
    const { userId } = this.who(ws)
    if (!this.sockets(ws).some((s) => this.who(s).userId === userId))
      await this.ctx.storage.delete(`queue:${userId}`)
    await this.presence(ws)
  }

  // ---- Queue -------------------------------------------------------------------

  private async enqueue(ws: WebSocket) {
    const { userId, username } = this.who(ws)
    // Already at a table: go back to it instead of starting another.
    const active = await this.liveActive(userId)
    if (active) {
      await this.ctx.storage.delete(`queue:${userId}`)
      this.send(ws, { t: 'matched', matchId: active, resumed: true })
      return this.presence()
    }
    const key = `queue:${userId}`
    if (!(await this.ctx.storage.get(key)))
      await this.ctx.storage.put(key, {
        userId,
        username,
        since: this.clock(),
      } satisfies Waiting)
    await this.pairUp()
    await this.presence()
  }

  /** Oldest first: each waiting player meets the oldest one they still may. */
  private async pairUp() {
    const today = day(this.clock())
    const waiting = [
      ...(await this.ctx.storage.list<Waiting>({ prefix: 'queue:' })).values(),
    ].sort((a, b) => a.since - b.since)
    const taken = new Set<string>()
    for (const [i, a] of waiting.entries()) {
      if (taken.has(a.userId)) continue
      for (const b of waiting.slice(i + 1)) {
        if (taken.has(b.userId)) continue
        const key = pairKey(today, a.userId, b.userId)
        const count = ((await this.ctx.storage.get(key)) as number) ?? 0
        if (count >= PAIRS_PER_DAY) continue
        if (await this.startMatch(a, b, key, count)) {
          taken.add(a.userId)
          taken.add(b.userId)
        }
        break
      }
    }
    // Yesterday's pair counts are no longer needed.
    const old = await this.ctx.storage.list({
      prefix: 'pairs:',
      end: `pairs:${today}`,
    })
    if (old.size) await this.ctx.storage.delete([...old.keys()])
  }

  private async startMatch(
    a: Waiting,
    b: Waiting,
    pairs: string,
    count: number,
  ) {
    const matchId = crypto.randomUUID()
    const body: InitBody = {
      matchId,
      creator: { userId: a.userId, username: a.username },
      opponent: { userId: b.userId, username: b.username },
      startWithinMs: START_WITHIN_MS,
    }
    const created = await tableStub(this.env, matchId).fetch(
      'https://table/init',
      { method: 'POST', body: JSON.stringify(body) },
    )
    if (!created.ok) {
      console.error('lobby: table init failed', created.status)
      return false
    }
    await this.ctx.storage.put({
      [`active:${a.userId}`]: matchId,
      [`active:${b.userId}`]: matchId,
      [pairs]: count + 1,
    })
    await this.ctx.storage.delete([`queue:${a.userId}`, `queue:${b.userId}`])
    for (const ws of this.sockets()) {
      const { userId } = this.who(ws)
      if (userId === a.userId || userId === b.userId)
        this.send(ws, { t: 'matched', matchId })
    }
    return true
  }

  // ---- One active table per account (RPC from the Worker and tables) ---------

  /**
   * Records that `userId` is at `matchId`, unless they are playing at
   * another table: then that table's id comes back and nothing changes.
   */
  async claim(userId: string, matchId: string): Promise<string | null> {
    const active = await this.liveActive(userId, matchId)
    if (active && active !== matchId) return active
    await this.ctx.storage.put(`active:${userId}`, matchId)
    return null
  }

  /** Called by a table when its match ends. */
  async release(userIds: string[], matchId: string) {
    for (const userId of userIds)
      if ((await this.ctx.storage.get(`active:${userId}`)) === matchId)
        await this.ctx.storage.delete(`active:${userId}`)
  }

  /** The table this account should be at, if any. */
  async activeFor(userId: string) {
    return this.liveActive(userId)
  }

  /**
   * The recorded table, checked with the table itself: a finished table, or
   * an invite nobody has opened, does not hold anyone. A release that never
   * arrived therefore cannot lock an account out.
   */
  private async liveActive(userId: string, unless?: string) {
    const matchId = (await this.ctx.storage.get(`active:${userId}`)) as
      | string
      | undefined
    if (!matchId) return null
    if (matchId === unless) return matchId
    const state: Liveness = await tableStub(this.env, matchId).liveness()
    if (state === 'playing' || state === 'starting') return matchId
    await this.ctx.storage.delete(`active:${userId}`)
    return null
  }

  // ---- Frames --------------------------------------------------------------------

  private async presence(gone?: WebSocket) {
    const sockets = this.sockets(gone)
    const queue = [
      ...(await this.ctx.storage.list<Waiting>({ prefix: 'queue:' })).values(),
    ].sort((a, b) => a.since - b.since)
    const online = new Set(sockets.map((ws) => this.who(ws).userId)).size
    this.seq++
    await this.ctx.storage.put('seq', this.seq)
    for (const ws of sockets) {
      const { userId } = this.who(ws)
      const at = queue.findIndex((w) => w.userId === userId)
      if (at >= 0)
        this.send(ws, { t: 'queued', position: at + 1, since: queue[at].since })
      this.send(ws, { t: 'presence', online, queued: queue.length })
    }
  }

  private sockets(exclude?: WebSocket) {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== exclude && ws.readyState === OPEN)
  }

  private who(ws: WebSocket) {
    return ws.deserializeAttachment() as Attachment
  }

  private send(ws: WebSocket, msg: DistributiveOmit<LobbyMsg, 'seq'>) {
    try {
      ws.send(JSON.stringify({ ...msg, seq: this.seq }))
    } catch {
      // Closed meanwhile; webSocketClose follows.
    }
  }

  private reject(ws: WebSocket, code: ErrorCode, message: string) {
    this.send(ws, { t: 'error', code, message })
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never
