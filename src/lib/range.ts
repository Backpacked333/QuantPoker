// Spot analysis for the hero's decision. Everything here uses only what the
// hero can legitimately know: their own cards, the public board, Atlas's
// public actions, and Atlas's published strategy. Atlas's hidden cards are
// never an input.
import { policy } from './atlas'
import type { AtlasStyle } from './atlas'
import type { Card, HistoryEntry } from './poker'
import { drawTail, liveIds, score, toId } from './sim'

export const COMBOS = 1326
export const COMBO_A = new Uint8Array(COMBOS)
export const COMBO_B = new Uint8Array(COMBOS)
const INDEX = new Int16Array(52 * 52).fill(-1)
{
  let k = 0
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++) {
      COMBO_A[k] = a
      COMBO_B[k] = b
      INDEX[a * 52 + b] = INDEX[b * 52 + a] = k
      k++
    }
}
export const comboIndex = (a: number, b: number) => INDEX[a * 52 + b]

/** 13×13 grid cell (row-major, A first): pairs on the diagonal, suited above. */
export function gridCell(a: number, b: number) {
  const ra = (a >> 2) + 2,
    rb = (b >> 2) + 2
  const hi = Math.max(ra, rb),
    lo = Math.min(ra, rb)
  const suited = (a & 3) === (b & 3)
  return suited || hi === lo
    ? (14 - hi) * 13 + (14 - lo)
    : (14 - lo) * 13 + (14 - hi)
}

export type SpotRequest = {
  key: string
  hole: Card[]
  board: Card[]
  history: HistoryEntry[]
  style: AtlasStyle
}
export type RangeStep = {
  label: string
  /** Shares of Atlas's range that are strong / medium / weak on this board. */
  buckets: [number, number, number]
}
export type NextCardData = {
  id: number
  range: [number, number]
  uniform: [number, number]
}
export type QuickSpot = {
  key: string
  stage: 'quick'
  quick: { win: number; tie: number }
}
export type FullSpot = {
  key: string
  stage: 'full'
  quick: { win: number; tie: number }
  /** Posterior probability of each combo (sums to 1; 0 when impossible). */
  weights: Float32Array
  /** Atlas's own equity estimate vs a random hand on the current board. */
  atlasEquity: Float32Array
  /** Hero showdown win / tie frequency against each combo. */
  heroWin: Float32Array
  heroTie: Float32Array
  next: NextCardData[]
  steps: RangeStep[]
}
export type SpotAnalysis = QuickSpot | FullSpot

/** Smoothing for Atlas's own equity-estimate noise when inverting its policy. */
export const POLICY_SIGMA = 0.03

const cacheLimit = 24
function remember<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value)
  if (cache.size > cacheLimit) cache.delete(cache.keys().next().value!)
  return value
}

// ---- Atlas's equity against a random hand, per combo ----------------------

let preflopClasses: Float32Array | null = null
function preflopClassEquity(random: () => number) {
  if (preflopClasses) return preflopClasses
  const table = new Float32Array(169).fill(NaN)
  const hand = new Array<number>(7)
  const villain = new Array<number>(7)
  for (let k = 0; k < COMBOS; k++) {
    const cell = gridCell(COMBO_A[k], COMBO_B[k])
    if (!Number.isNaN(table[cell])) continue
    const pool = liveIds([COMBO_A[k], COMBO_B[k]])
    let points = 0
    const trials = 360
    for (let t = 0; t < trials; t++) {
      const start = drawTail(pool, 7, random)
      hand[0] = COMBO_A[k]
      hand[1] = COMBO_B[k]
      villain[0] = pool[start]
      villain[1] = pool[start + 1]
      for (let i = 0; i < 5; i++)
        hand[2 + i] = villain[2 + i] = pool[start + 2 + i]
      const h = score(hand, 7),
        v = score(villain, 7)
      points += h > v ? 1 : h === v ? 0.5 : 0
    }
    table[cell] = points / trials
  }
  return (preflopClasses = table)
}

const atlasCache = new Map<string, Float32Array>()
export function atlasEquityTable(board: number[], random: () => number) {
  const key = board.join(',')
  const cached = atlasCache.get(key)
  if (cached) return cached
  const table = new Float32Array(COMBOS).fill(NaN)
  const dead = new Set(board)
  if (!board.length) {
    const classes = preflopClassEquity(random)
    for (let k = 0; k < COMBOS; k++)
      table[k] = classes[gridCell(COMBO_A[k], COMBO_B[k])]
    return remember(atlasCache, key, table)
  }
  const missing = 5 - board.length
  const hand = new Array<number>(7)
  const villain = new Array<number>(7)
  for (let i = 0; i < board.length; i++) hand[2 + i] = villain[2 + i] = board[i]
  const trials = 80
  for (let k = 0; k < COMBOS; k++) {
    const a = COMBO_A[k],
      b = COMBO_B[k]
    if (dead.has(a) || dead.has(b)) continue
    const pool = liveIds([...board, a, b])
    hand[0] = a
    hand[1] = b
    let points = 0
    for (let t = 0; t < trials; t++) {
      const start = drawTail(pool, 2 + missing, random)
      villain[0] = pool[start]
      villain[1] = pool[start + 1]
      for (let i = 0; i < missing; i++)
        hand[2 + board.length + i] = villain[2 + board.length + i] =
          pool[start + 2 + i]
      const h = score(hand, 7),
        v = score(villain, 7)
      points += h > v ? 1 : h === v ? 0.5 : 0
    }
    table[k] = points / trials
  }
  return remember(atlasCache, key, table)
}

// ---- The hero's showdown result against each specific combo --------------

const heroCache = new Map<string, [Float32Array, Float32Array]>()
export function heroTables(
  hole: number[],
  board: number[],
  random: () => number,
): [Float32Array, Float32Array] {
  const key = `${hole.join(',')}|${board.join(',')}`
  const cached = heroCache.get(key)
  if (cached) return cached
  const win = new Float32Array(COMBOS).fill(NaN)
  const tie = new Float32Array(COMBOS).fill(NaN)
  const dead = new Set([...hole, ...board])
  const hero = new Array<number>(7)
  const villain = new Array<number>(7)
  hero[0] = hole[0]
  hero[1] = hole[1]
  for (let i = 0; i < board.length; i++) hero[2 + i] = villain[2 + i] = board[i]
  const missing = 5 - board.length
  const live = liveIds(dead)
  const exactRiver =
    missing === 1
      ? live.map((r) => {
          hero[6] = r
          return score(hero, 7)
        })
      : null
  const heroRiver = missing === 0 ? score(hero, 7) : 0
  const trials = missing === 2 ? 80 : 24
  for (let k = 0; k < COMBOS; k++) {
    const a = COMBO_A[k],
      b = COMBO_B[k]
    if (dead.has(a) || dead.has(b)) continue
    villain[0] = a
    villain[1] = b
    let w = 0,
      t = 0,
      n = 0
    if (missing === 0) {
      const v = score(villain, 7)
      w = heroRiver > v ? 1 : 0
      t = heroRiver === v ? 1 : 0
      n = 1
    } else if (exactRiver) {
      for (let i = 0; i < live.length; i++) {
        const r = live[i]
        if (r === a || r === b) continue
        villain[6] = r
        const v = score(villain, 7)
        if (exactRiver[i] > v) w++
        else if (exactRiver[i] === v) t++
        n++
      }
    } else {
      const pool = live.filter((id) => id !== a && id !== b)
      for (let s = 0; s < trials; s++) {
        const start = drawTail(pool, missing, random)
        for (let i = 0; i < missing; i++)
          hero[2 + board.length + i] = villain[2 + board.length + i] =
            pool[start + i]
        const h = score(hero, 7),
          v = score(villain, 7)
        if (h > v) w++
        else if (h === v) t++
        n++
      }
    }
    win[k] = w / n
    tie[k] = t / n
  }
  return remember(heroCache, key, [win, tie])
}

// ---- Atlas's range: Bayesian update from its public actions ---------------

const bucketsOf = (weights: Float32Array, equity: Float32Array) => {
  let strong = 0,
    medium = 0,
    weak = 0
  for (let k = 0; k < COMBOS; k++) {
    const w = weights[k]
    if (!w || Number.isNaN(equity[k])) continue
    if (equity[k] >= 0.65) strong += w
    else if (equity[k] >= 0.4) medium += w
    else weak += w
  }
  const total = strong + medium + weak || 1
  return [strong / total, medium / total, weak / total] as [
    number,
    number,
    number,
  ]
}

const streetName = (entry: HistoryEntry) =>
  entry.street === 'preflop' ? 'pre-flop' : entry.street
export const describeAtlasAction = (entry: HistoryEntry) =>
  entry.action === 'raise'
    ? `${entry.toCall ? 'Raised' : 'Bet'} ${entry.amount} ${streetName(entry)}`
    : entry.action === 'call'
      ? `Called ${entry.amount} ${streetName(entry)}`
      : `Checked ${streetName(entry)}`

export function rangeWeights(
  hole: number[],
  board: number[],
  history: HistoryEntry[],
  style: AtlasStyle,
  random: () => number,
) {
  const weights = new Float32Array(COMBOS)
  const dead = new Set([...hole, ...board])
  for (let k = 0; k < COMBOS; k++)
    weights[k] = dead.has(COMBO_A[k]) || dead.has(COMBO_B[k]) ? 0 : 1
  const current = atlasEquityTable(board, random)
  const steps: RangeStep[] = [
    { label: 'Any two cards', buckets: bucketsOf(weights, current) },
  ]
  for (const entry of history) {
    if (entry.player !== 1 || entry.action === 'fold') continue
    const table = atlasEquityTable(board.slice(0, entry.boardCount), random)
    const context = {
      toCall: entry.toCall,
      pot: entry.pot,
      canRaise: entry.canRaise,
    }
    for (let k = 0; k < COMBOS; k++) {
      if (!weights[k]) continue
      const mix = policy(table[k], context, style, POLICY_SIGMA)
      weights[k] *= entry.action === 'raise' ? mix.raise : mix.passive
    }
    steps.push({
      label: describeAtlasAction(entry),
      buckets: bucketsOf(weights, current),
    })
  }
  let total = 0
  for (let k = 0; k < COMBOS; k++) total += weights[k]
  if (total > 0) for (let k = 0; k < COMBOS; k++) weights[k] /= total
  return { weights, steps, atlasEquity: current }
}

// ---- Next public card --------------------------------------------------------

function nextCards(
  hole: number[],
  board: number[],
  weights: Float32Array,
  random: () => number,
): NextCardData[] {
  if (board.length < 3 || board.length > 4) return []
  const dead = new Set([...hole, ...board])
  const live = liveIds(dead)
  const hero = new Array<number>(7)
  const villain = new Array<number>(7)
  hero[0] = hole[0]
  hero[1] = hole[1]
  for (let i = 0; i < board.length; i++) hero[2 + i] = villain[2 + i] = board[i]
  const xSlot = 2 + board.length
  const eligible: number[] = []
  const cumulative: number[] = []
  return live.map((x) => {
    hero[xSlot] = villain[xSlot] = x
    eligible.length = 0
    cumulative.length = 0
    let total = 0
    for (let k = 0; k < COMBOS; k++) {
      const a = COMBO_A[k],
        b = COMBO_B[k]
      if (a === x || b === x || dead.has(a) || dead.has(b)) continue
      eligible.push(k)
      total += weights[k]
      cumulative.push(total)
    }
    const result = (k: number, river: number) => {
      villain[0] = COMBO_A[k]
      villain[1] = COMBO_B[k]
      if (board.length === 3) hero[6] = villain[6] = river
      const h = score(hero, 7),
        v = score(villain, 7)
      return h > v ? 1 : h === v ? 0.5 : 0
    }
    if (board.length === 4) {
      // River: exact over every combo.
      let rw = 0,
        rt = 0,
        uw = 0,
        ut = 0
      const heroScore = score(hero, 7)
      for (const k of eligible) {
        villain[0] = COMBO_A[k]
        villain[1] = COMBO_B[k]
        const v = score(villain, 7)
        const w = total > 0 ? weights[k] / total : 0
        if (heroScore > v) {
          rw += w
          uw++
        } else if (heroScore === v) {
          rt += w
          ut++
        }
      }
      return {
        id: x,
        range: [rw, rt],
        uniform: [uw / eligible.length, ut / eligible.length],
      }
    }
    // Turn card on the flop: sample the river and the opponent combo.
    const trials = 160
    const pick = (uniform: boolean) => {
      if (uniform || total <= 0)
        return eligible[Math.floor(random() * eligible.length)]
      const target = random() * total
      let lo = 0,
        hi = cumulative.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (cumulative[mid] < target) lo = mid + 1
        else hi = mid
      }
      return eligible[lo]
    }
    const tally = (uniform: boolean): [number, number] => {
      let w = 0,
        t = 0
      for (let s = 0; s < trials; s++) {
        const k = pick(uniform)
        let river: number
        do river = live[Math.floor(random() * live.length)]
        while (river === x || river === COMBO_A[k] || river === COMBO_B[k])
        const r = result(k, river)
        if (r === 1) w++
        else if (r === 0.5) t++
      }
      return [w / trials, t / trials]
    }
    return { id: x, range: tally(false), uniform: tally(true) }
  })
}

// ---- Entry points ------------------------------------------------------------

export function quickOutcome(
  hole: Card[],
  board: Card[],
  random: () => number,
  trials = 600,
) {
  const holeIds = hole.map(toId)
  const boardIds = board.map(toId)
  const pool = liveIds([...holeIds, ...boardIds])
  const missing = 5 - boardIds.length
  const hero = new Array<number>(7)
  const villain = new Array<number>(7)
  hero[0] = holeIds[0]
  hero[1] = holeIds[1]
  for (let i = 0; i < boardIds.length; i++)
    hero[2 + i] = villain[2 + i] = boardIds[i]
  let win = 0,
    tie = 0
  for (let t = 0; t < trials; t++) {
    const start = drawTail(pool, 2 + missing, random)
    villain[0] = pool[start]
    villain[1] = pool[start + 1]
    for (let i = 0; i < missing; i++)
      hero[2 + boardIds.length + i] = villain[2 + boardIds.length + i] =
        pool[start + 2 + i]
    const h = score(hero, 7),
      v = score(villain, 7)
    if (h > v) win++
    else if (h === v) tie++
  }
  return { win: win / trials, tie: tie / trials }
}

export function analyzeSpot(
  request: SpotRequest,
  random: () => number = Math.random,
): FullSpot {
  const hole = request.hole.map(toId)
  const board = request.board.map(toId)
  const { weights, steps, atlasEquity } = rangeWeights(
    hole,
    board,
    request.history,
    request.style,
    random,
  )
  const [heroWin, heroTie] = heroTables(hole, board, random)
  let win = 0,
    tie = 0,
    n = 0
  for (let k = 0; k < COMBOS; k++)
    if (!Number.isNaN(heroWin[k])) {
      win += heroWin[k]
      tie += heroTie[k]
      n++
    }
  return {
    key: request.key,
    stage: 'full',
    quick: { win: win / n, tie: tie / n },
    weights,
    atlasEquity,
    heroWin,
    heroTie,
    steps,
    next: nextCards(hole, board, weights, random),
  }
}
