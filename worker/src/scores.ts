// The landing page's server side (architect: landing-and-onboarding §2): one
// SQLite Durable Object that re-scores challenge lines, keeps the percentile
// histograms and the "players who made this call" counts, counts the funnel,
// and holds score claims in an outbox until Postgres takes them.
//
//   histogram    (hand, ver, bucket) → n       bucket = accuracy 0–100
//   node_counts  (hand, ver, node, action) → n
//   events       (day, name, vid)               kept EVENT_DAYS days
//   receipts     id → hand, ver, accuracy, at, claimed_by   kept RECEIPT_DAYS
//   outbox       seq → call, attempts, next_at
//
// Every write is one transaction and lands before the reply (principle 3);
// Postgres is reached only from the alarm (principle 6).
import { DurableObject } from 'cloudflare:workers'
import { FUNNEL_EVENTS, FUNNEL_STEPS } from '../../src/challenge/events'
import type { FunnelEvent } from '../../src/challenge/events'
import {
  modelHistogram,
  percentileOf,
  scorePath,
} from '../../src/challenge/score'
import type { ActionCode, ChallengeTree } from '../../src/challenge/score'
import { treeFor } from '../../src/challenge/trees'
import { now } from './clock'
import { outboxBackoff } from './deadlines'
import type { WorkerEnv } from './env'
import { describeError, logEvent } from './log'
import { archive, refusedForData } from './supabase'
import type { ArchiveCall } from './supabase'

/** Real scores a hand needs before its percentile is against players. */
export const PLAYER_BASIS = 200
/** Visits a decision needs before "x% of players chose this" is shown. */
export const CROWD_MIN = 50
export const EVENT_DAYS = 30
/** Receipts back claims and shared challenge links (/c/<receipt>). */
export const RECEIPT_DAYS = 30
const DAY_MS = 86_400_000
/** Housekeeping runs at least this often while anything is stored. */
const SWEEP_MS = 6 * 3_600_000

export type ScoreResult = {
  accuracy: number
  percentile: number
  basis: 'players' | 'model'
  /** Per decision, the share of players who chose the same (null: too few). */
  crowd: (number | null)[]
  receipt: string
}
export type SharedScore = {
  hand: string
  ver: number
  accuracy: number
  percentile: number
  basis: ScoreResult['basis']
}
export type ClaimResult = 'ok' | 'unknown' | 'taken'
export type FunnelDay = {
  day: string
  counts: Partial<Record<FunnelEvent, number>>
  /** Each main-path step against the one before it, 0–1. */
  rates: Partial<Record<FunnelEvent, number>>
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function scoreStub(env: WorkerEnv) {
  return env.SCORES.get(env.SCORES.idFromName('global'), {
    locationHint: 'enam',
  })
}

/** 128 random bits, hex. Only an id: what it proves stays in storage. */
function receiptId() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const models = new Map<string, number[]>()
const modelFor = (tree: ChallengeTree) => {
  const key = `${tree.id}:${tree.ver}`
  let histogram = models.get(key)
  if (!histogram) models.set(key, (histogram = modelHistogram(tree)))
  return histogram
}

export class ScoreDO extends DurableObject<WorkerEnv> {
  /** The object's clock; tests move it. */
  clock: () => number = now
  private sql: SqlStorage

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS histogram (
        hand TEXT, ver INTEGER, bucket INTEGER, n INTEGER NOT NULL,
        PRIMARY KEY (hand, ver, bucket));
      CREATE TABLE IF NOT EXISTS node_counts (
        hand TEXT, ver INTEGER, node INTEGER, action TEXT, n INTEGER NOT NULL,
        PRIMARY KEY (hand, ver, node, action));
      CREATE TABLE IF NOT EXISTS events (
        day TEXT, name TEXT, vid TEXT, PRIMARY KEY (day, name, vid));
      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY, hand TEXT NOT NULL, ver INTEGER NOT NULL,
        accuracy INTEGER NOT NULL, at INTEGER NOT NULL, claimed_by TEXT);
      CREATE TABLE IF NOT EXISTS outbox (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, call TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL);
    `)
  }

  /** Re-scores a line and records it. Null when the line is not in the tree. */
  async score(
    hand: string,
    ver: number,
    path: ActionCode[],
  ): Promise<ScoreResult | null> {
    const tree = treeFor(hand, ver)
    const scored = tree && scorePath(tree, path)
    if (!tree || !scored) return null
    const receipt = receiptId()
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO histogram (hand, ver, bucket, n) VALUES (?, ?, ?, 1)
         ON CONFLICT DO UPDATE SET n = n + 1`,
        hand,
        ver,
        scored.accuracy,
      )
      for (const d of scored.decisions)
        this.sql.exec(
          `INSERT INTO node_counts (hand, ver, node, action, n) VALUES (?, ?, ?, ?, 1)
           ON CONFLICT DO UPDATE SET n = n + 1`,
          hand,
          ver,
          d.node,
          d.chosen.code,
        )
      this.sql.exec(
        `INSERT INTO receipts (id, hand, ver, accuracy, at) VALUES (?, ?, ?, ?, ?)`,
        receipt,
        hand,
        ver,
        scored.accuracy,
        this.clock(),
      )
    })
    await this.keepSweeping()

    const ranked = this.rank(tree, scored.accuracy)
    const crowd = scored.decisions.map((d) => {
      let visits = 0
      let same = 0
      for (const row of this.sql.exec<{ action: string; n: number }>(
        `SELECT action, n FROM node_counts WHERE hand = ? AND ver = ? AND node = ?`,
        hand,
        ver,
        d.node,
      )) {
        visits += row.n
        if (row.action === d.chosen.code) same = row.n
      }
      return visits >= CROWD_MIN
        ? Math.round((100 * same) / visits) / 100
        : null
    })
    return { accuracy: scored.accuracy, ...ranked, crowd, receipt }
  }

  /** Where `accuracy` stands on `tree`: real players from PLAYER_BASIS on. */
  private rank(tree: ChallengeTree, accuracy: number) {
    const real = new Array<number>(101).fill(0)
    let total = 0
    for (const row of this.sql.exec<{ bucket: number; n: number }>(
      `SELECT bucket, n FROM histogram WHERE hand = ? AND ver = ?`,
      tree.id,
      tree.ver,
    )) {
      real[row.bucket] = row.n
      total += row.n
    }
    const players = total >= PLAYER_BASIS
    return {
      percentile: percentileOf(players ? real : modelFor(tree), accuracy)!,
      basis: (players ? 'players' : 'model') as ScoreResult['basis'],
    }
  }

  /**
   * A shared score (/c/<receipt>): the hand and how it ranks now. Null when
   * the receipt is unknown or has expired.
   */
  shared(receipt: string): SharedScore | null {
    const row = this.sql
      .exec<{
        hand: string
        ver: number
        accuracy: number
      }>(`SELECT hand, ver, accuracy FROM receipts WHERE id = ?`, receipt)
      .toArray()[0]
    const tree = row && treeFor(row.hand, row.ver)
    if (!row || !tree) return null
    return {
      hand: row.hand,
      ver: row.ver,
      accuracy: row.accuracy,
      ...this.rank(tree, row.accuracy),
    }
  }

  /** Counts a funnel event once per visitor per UTC day. */
  async event(name: FunnelEvent, vid: string) {
    this.sql.exec(
      `INSERT OR IGNORE INTO events (day, name, vid) VALUES (?, ?, ?)`,
      day(this.clock()),
      name,
      vid,
    )
    await this.keepSweeping()
  }

  /**
   * Attaches a receipt's score to an account, once. The first account wins;
   * the same account claiming again is fine (a retried request).
   */
  async claim(receipt: string, userId: string): Promise<ClaimResult> {
    const row = this.sql
      .exec<{
        hand: string
        ver: number
        accuracy: number
        at: number
        claimed_by: string | null
      }>(
        `SELECT hand, ver, accuracy, at, claimed_by FROM receipts WHERE id = ?`,
        receipt,
      )
      .toArray()[0]
    if (!row) return 'unknown'
    if (row.claimed_by) return row.claimed_by === userId ? 'ok' : 'taken'
    const call: ArchiveCall = {
      rpc: 'record_challenge_claim',
      body: {
        userId,
        hand: row.hand,
        ver: row.ver,
        accuracy: row.accuracy,
        receipt,
        playedAt: new Date(row.at).toISOString(),
      },
    }
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `UPDATE receipts SET claimed_by = ? WHERE id = ?`,
        userId,
        receipt,
      )
      this.sql.exec(
        `INSERT INTO outbox (call, next_at) VALUES (?, ?)`,
        JSON.stringify(call),
        this.clock(),
      )
    })
    await this.ctx.storage.setAlarm(this.clock())
    return 'ok'
  }

  /** Per-day counts and step rates for the last EVENT_DAYS days. */
  funnel(): FunnelDay[] {
    const days = new Map<string, FunnelDay>()
    for (const row of this.sql.exec<{ day: string; name: string; n: number }>(
      `SELECT day, name, count(*) AS n FROM events GROUP BY day, name ORDER BY day DESC`,
    )) {
      const entry = days.get(row.day) ?? { day: row.day, counts: {}, rates: {} }
      if ((FUNNEL_EVENTS as readonly string[]).includes(row.name))
        entry.counts[row.name as FunnelEvent] = row.n
      days.set(row.day, entry)
    }
    for (const entry of days.values())
      FUNNEL_STEPS.forEach((step, i) => {
        const before = i ? entry.counts[FUNNEL_STEPS[i - 1]] : undefined
        const count = entry.counts[step]
        if (before && count !== undefined)
          entry.rates[step] = Math.round((100 * count) / before) / 100
      })
    return [...days.values()]
  }

  /** Drains due outbox calls, then expires old events and receipts. */
  async alarm() {
    const t = this.clock()
    const due = this.sql
      .exec<{
        seq: number
        call: string
        attempts: number
      }>(
        `SELECT seq, call, attempts FROM outbox WHERE next_at <= ? ORDER BY seq LIMIT 20`,
        t,
      )
      .toArray()
    for (const row of due) {
      const call = JSON.parse(row.call) as ArchiveCall
      const outcome = await archive(this.env, call)
      if (outcome.ok) this.sql.exec(`DELETE FROM outbox WHERE seq = ?`, row.seq)
      else if (refusedForData(outcome)) {
        // No retry can change a refusal for the data: drop it, loudly.
        logEvent('error', {
          reason: 'claim_refused',
          rpc: call.rpc,
          code: outcome.status,
          detail: outcome.code,
        })
        this.sql.exec(`DELETE FROM outbox WHERE seq = ?`, row.seq)
      } else
        this.sql.exec(
          `UPDATE outbox SET attempts = ?, next_at = ? WHERE seq = ?`,
          row.attempts + 1,
          t + outboxBackoff(row.attempts + 1),
          row.seq,
        )
    }
    try {
      this.sql.exec(
        `DELETE FROM events WHERE day < ?`,
        day(t - EVENT_DAYS * DAY_MS),
      )
      // A claim carries its own copy of the score into the outbox, so a
      // receipt is only needed for RECEIPT_DAYS, claimed or not.
      this.sql.exec(
        `DELETE FROM receipts WHERE at < ?`,
        t - RECEIPT_DAYS * DAY_MS,
      )
    } catch (error) {
      logEvent('error', { reason: 'score_sweep', detail: describeError(error) })
    }
    const next = this.sql
      .exec<{ at: number | null }>(`SELECT min(next_at) AS at FROM outbox`)
      .one().at
    await this.ctx.storage.setAlarm(Math.min(next ?? Infinity, t + SWEEP_MS))
  }

  /** Arms the sweep if nothing is armed (alarms never throw away work). */
  private async keepSweeping() {
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(this.clock() + SWEEP_MS)
  }
}
