import { estimateEquity, legalActions } from './poker'
import type { Action, Game } from './poker'

export type AtlasStyle = 'tight' | 'balanced' | 'aggressive'
export type StyleParams = {
  label: string
  description: string
  /** Extra equity Atlas wants above the price before continuing. */
  foldMargin: number
  /** Share of weak hands Atlas still defends against a bet. */
  stickiness: number
  valueThreshold: number
  valueFrequency: number
  bluffFrequency: number
  /** Bet sizes as fractions of the pot. */
  sizes: number[]
}

export const STYLES: Record<AtlasStyle, StyleParams> = {
  tight: {
    label: 'Tight',
    description: 'Folds marginal hands, rarely bluffs, bets smaller.',
    foldMargin: 0.08,
    stickiness: 0.1,
    valueThreshold: 0.68,
    valueFrequency: 0.6,
    bluffFrequency: 0.03,
    sizes: [0.5, 0.66],
  },
  balanced: {
    label: 'Balanced',
    description: 'Prices most decisions honestly, with occasional bluffs.',
    foldMargin: 0.04,
    stickiness: 0.15,
    valueThreshold: 0.65,
    valueFrequency: 0.65,
    bluffFrequency: 0.07,
    sizes: [0.33, 0.55, 0.75],
  },
  aggressive: {
    label: 'Aggressive',
    description: 'Defends wide, bluffs often, and bets big.',
    foldMargin: 0,
    stickiness: 0.22,
    valueThreshold: 0.58,
    valueFrequency: 0.75,
    bluffFrequency: 0.14,
    sizes: [0.66, 1],
  },
}

export type PolicyContext = { toCall: number; pot: number; canRaise: boolean }
export type PolicyMix = { fold: number; passive: number; raise: number }

const potOdds = ({ toCall, pot }: PolicyContext) =>
  toCall ? toCall / (pot + toCall) : 0

/**
 * Weak hands are defended less as the price rises: fully against bets up to
 * about half pot, not at all against large overbets. Without this, huge
 * shoves would be exploitably profitable against Atlas.
 */
export const defendRate = (style: AtlasStyle, odds: number) =>
  STYLES[style].stickiness * Math.max(0, Math.min(1, (0.45 - odds) / 0.25))

// Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf).
function normalCdf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2))
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-(x * x) / 2)
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2
}
const below = (value: number, threshold: number, sigma: number) =>
  sigma > 0 ? normalCdf((threshold - value) / sigma) : value < threshold ? 1 : 0

/**
 * Probability of each kind of action for a hand with the given equity
 * estimate. `sigma` smooths the thresholds to account for Atlas's own
 * sampling noise when the policy is used to infer its range.
 */
export function policy(
  equity: number,
  context: PolicyContext,
  style: AtlasStyle,
  sigma = 0,
): PolicyMix {
  const p = STYLES[style]
  const weak = context.toCall
    ? below(equity, potOdds(context) + p.foldMargin, sigma)
    : 0
  const strong = 1 - below(equity, p.valueThreshold, sigma)
  const raiseRegion = context.canRaise
    ? p.bluffFrequency +
      strong * (Math.max(p.valueFrequency, p.bluffFrequency) - p.bluffFrequency)
    : 0
  const defend = defendRate(style, potOdds(context))
  const raiseWhenWeak = context.canRaise
    ? Math.min(p.bluffFrequency, defend)
    : 0
  const fold = weak * (1 - defend)
  const raise = weak * raiseWhenWeak + (1 - weak) * raiseRegion
  return { fold, raise, passive: Math.max(0, 1 - fold - raise) }
}

export type AtlasDecision = {
  action: Action
  equity: number
  odds: number
  kind: 'fold' | 'defend' | 'call' | 'check' | 'trap' | 'value' | 'bluff'
  explanation: string
}

const pct = (value: number) => `${Math.round(value * 100)}%`

export function atlasDecision(
  game: Game,
  style: AtlasStyle = 'balanced',
  random = Math.random,
): AtlasDecision {
  const p = STYLES[style]
  const legal = legalActions(game)
  // Atlas only sees its own cards and the public board.
  const equity = estimateEquity(game.cards[1], game.board, 250, random)
  const context = {
    toCall: legal.toCall,
    pot: game.pot,
    canRaise: legal.canRaise,
  }
  const odds = potOdds(context)
  const roll = random()
  const weak = legal.toCall > 0 && equity < odds + p.foldMargin
  if (weak && roll > defendRate(style, odds))
    return {
      action: { type: 'fold' },
      equity,
      odds,
      kind: 'fold',
      explanation: `Folded. About ${pct(equity)} equity against a random hand, below the ${pct(odds)} the price required${p.foldMargin ? ' plus my safety margin' : ''}.`,
    }
  const strong = equity > p.valueThreshold
  if (
    legal.canRaise &&
    ((strong && roll < p.valueFrequency) || roll < p.bluffFrequency)
  ) {
    const currentBet = Math.max(...game.bets)
    const size = p.sizes[Math.floor(random() * p.sizes.length)]
    const to = Math.min(
      legal.maxRaiseTo,
      Math.max(
        legal.minRaiseTo,
        currentBet + Math.round((game.pot * size) / 10) * 10,
      ),
    )
    const verb = currentBet ? 'Raised to' : 'Bet'
    return {
      action: { type: 'raise', to },
      equity,
      odds,
      kind: strong ? 'value' : 'bluff',
      explanation: strong
        ? `${verb} ${to} for value. About ${pct(equity)} equity is strong enough to build the pot.`
        : `${verb} ${to} with only about ${pct(equity)} equity. An occasional bluff keeps me unpredictable.`,
    }
  }
  if (legal.canCheck)
    return {
      action: { type: 'check' },
      equity,
      odds,
      kind: strong ? 'trap' : 'check',
      explanation: strong
        ? `Checked a strong hand (about ${pct(equity)}) to stay unpredictable.`
        : `Checked. About ${pct(equity)} equity, so no reason to build the pot.`,
    }
  return {
    action: { type: 'call' },
    equity,
    odds,
    kind: weak ? 'defend' : 'call',
    explanation: weak
      ? `Called ${legal.toCall} light. About ${pct(equity)} is under the ${pct(odds)} price, but I defend sometimes so I can't be pushed around.`
      : `Called ${legal.toCall}. About ${pct(equity)} equity clears the ${pct(odds)} break-even.`,
  }
}

export const botAction = (
  game: Game,
  random = Math.random,
  style: AtlasStyle = 'balanced',
): Action => atlasDecision(game, style, random).action
