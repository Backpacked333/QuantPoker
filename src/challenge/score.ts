// Scoring a challenge hand from its pre-scored tree (L-4, L-6). Pure lookups,
// shared by the landing page and the Worker (worker/src/score.ts), so the
// server re-scores a submitted line in microseconds and nobody can post a
// score their moves did not earn. Nothing here may import the analysis
// modules: the trees were priced offline by src/challenge/build.ts.
import type { Grade } from '../lib/grading'

/** `f` fold, `c` check or call, `r<to>` bet or raise to `to`. */
export type ActionCode = string

export type AtlasStep = { code: ActionCode; note: string }

export type ChallengeOption = {
  code: ActionCode
  label: string
  ev: number
  grade: Grade
  /** 0–100, the trainer's per-decision accuracy (src/lib/grading.ts). */
  accuracy: number
  best: boolean
  /** Atlas's replies before the hero's next decision or the end of the hand. */
  atlas: AtlasStep[]
  /** Index of the hero's next decision, or null when the hand is over. */
  next: number | null
}

export type ChallengeNode = {
  street: 'preflop' | 'flop' | 'turn' | 'river'
  pot: number
  toCall: number
  /** The hero's equity against Atlas's modeled range at this decision. */
  equity: number
  options: ChallengeOption[]
}

export type ChallengeTree = { id: string; ver: number; nodes: ChallengeNode[] }
export type ChallengeTrees = { grader: string; hands: ChallengeTree[] }

export type ScoredDecision = {
  node: number
  chosen: ChallengeOption
  best: ChallengeOption
}
export type PathScore = { accuracy: number; decisions: ScoredDecision[] }

export const MAX_PATH = 24

/**
 * Scores a complete line through `tree`. Returns null when the line is not
 * in the tree or stops before the hand ends.
 */
export function scorePath(
  tree: ChallengeTree,
  path: readonly ActionCode[],
): PathScore | null {
  if (!path.length || path.length > MAX_PATH) return null
  const decisions: ScoredDecision[] = []
  let at: number | null = 0
  for (const code of path) {
    if (at === null) return null
    const node: ChallengeNode | undefined = tree.nodes[at]
    const chosen: ChallengeOption | undefined = node?.options.find(
      (o) => o.code === code,
    )
    if (!node || !chosen) return null
    decisions.push({
      node: at,
      chosen,
      best: node.options.find((o) => o.best) ?? chosen,
    })
    at = chosen.next
  }
  if (at !== null) return null
  const mean =
    decisions.reduce((sum, d) => sum + d.chosen.accuracy, 0) / decisions.length
  return { accuracy: Math.round(mean), decisions }
}

/**
 * How sharply the model players prefer better options: each picks an option
 * with weight exp(-share of the pot given up / TEMPERATURE), read from the
 * option's graded accuracy (100 − 200 × share). A noisy but sensible player
 * who rarely gives up big pots. Raw EVs are not used: an ungraded overbet's
 * EV is biased upward (src/lib/grading.ts), so a shove would dominate.
 */
export const TEMPERATURE = 0.15

/**
 * The accuracy distribution of model players over the whole tree, as counts
 * per integer score 0–100 summing to 1. The percentile basis until a hand has
 * enough real scores (`basis: 'model'`).
 */
export function modelHistogram(tree: ChallengeTree): number[] {
  const histogram = new Array<number>(101).fill(0)
  const walk = (at: number, weight: number, sum: number, count: number) => {
    const node = tree.nodes[at]
    const raw = node.options.map((o) =>
      Math.exp(-(100 - o.accuracy) / (200 * TEMPERATURE)),
    )
    const total = raw.reduce((a, b) => a + b, 0)
    node.options.forEach((option, i) => {
      const w = (weight * raw[i]) / total
      if (w < 1e-9) return
      const s = sum + option.accuracy
      if (option.next === null) histogram[Math.round(s / (count + 1))] += w
      else walk(option.next, w, s, count + 1)
    })
  }
  walk(0, 1, 0, 0)
  return histogram
}

/** Share of the distribution strictly below `score`, plus half the ties. */
export function percentileOf(histogram: readonly number[], score: number) {
  const total = histogram.reduce((a, b) => a + b, 0)
  if (!total) return null
  let below = 0
  for (let i = 0; i < score; i++) below += histogram[i]
  return Math.round((100 * (below + histogram[score] / 2)) / total)
}
