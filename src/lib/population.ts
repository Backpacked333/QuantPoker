// How a typical heads-up human plays, as the opponent model for grading
// humans (rating-and-leaderboard §Accuracy: "a generic population range model:
// position-aware preflop ranges and a simple postflop continuation policy").
// Deliberately simple and documented: not a solver, and not Atlas.
//
// Every number below is an assumption until real rated hands exist; none is
// fitted to data yet. `.10x/decisions/sde/accuracy.md` lists what the model
// misjudges and how each number will be refitted from real hands. Changing
// any of them changes grades, so it bumps POPULATION_VERSION.
import { below, policyWith } from './atlas'
import type { PolicyContext, PolicyMix, StyleParams } from './atlas'

/** Stored with every grade; bump it whenever a number below changes. */
export const POPULATION_VERSION = 'population.v1'

/** Where the opponent sits, from public information only. */
export type Seat = {
  preflop: boolean
  /** The big blind: last to act pre-flop, first after the flop. */
  bigBlind: boolean
  /** Raises already made on this street before this decision. */
  raises: number
}

/**
 * Pre-flop ranges as shares of all starting hands, strongest first by
 * equity against a random hand (combo-weighted). Heads-up at 100 bb.
 */
export const PREFLOP = {
  // Button (small blind) first in. Equilibrium play enters with the large
  // majority of buttons, mostly by raising; human heads-up players are
  // usually described as limping more and folding a little more than that.
  // Assumption: 80% played, as 50% raises and 30% limps; 20% folded.
  openRaise: 0.5,
  openLimp: 0.3,
  // Big blind after a limp: raises the top 25% and checks the rest (nobody
  // folds a free check). Assumption: humans punish limps less often than
  // equilibrium does.
  isoRaise: 0.25,
  // Big blind facing an open raise. Equilibrium defends roughly two thirds
  // of hands against a small open; human big blinds over-fold. Assumption:
  // 55% defended, as 10% 3-bets and 45% calls; 45% folded.
  threeBet: 0.1,
  defendCall: 0.45,
} as const

/**
 * Range edges are not sharp: a hand 3% of all hands either side of a cut
 * is played some of the time. Assumption; also keeps every combo possible,
 * so one surprising action never empties the range.
 */
export const PREFLOP_SIGMA = 0.03

/**
 * After the flop, and in re-raised pots pre-flop: Atlas's policy shape
 * (fold under the price, value-bet strong hands, bluff a little) with
 * human-typical parameters. Equity is against a random hand, as Atlas's.
 */
export const POSTFLOP: StyleParams = {
  label: 'Population',
  description: 'A typical human: calls a lot, bluffs little.',
  // Calls at the price, with no safety margin (Atlas balanced asks for 4
  // points more): calling too much is the most reported human tendency.
  foldMargin: 0,
  // Weak hands still defended against small bets (floats and peels), at
  // the higher end of Atlas's styles (balanced 0.15, aggressive 0.22).
  stickiness: 0.2,
  // Bets for value from 70% equity against a random hand (Atlas balanced
  // 0.65): humans value-bet thinner hands less often.
  valueThreshold: 0.7,
  // Bets 60% of value hands and checks the rest: some passivity and slow
  // play.
  valueFrequency: 0.6,
  // Under-bluffs: 5% of the time (Atlas balanced 7%).
  bluffFrequency: 0.05,
  // Not used by grading (the policy only says raise or not); kept so the
  // parameters are a complete StyleParams.
  sizes: [0.5, 0.75],
}

/**
 * Raise with the top `raise` share of hands and play the top `play` share;
 * a hand that would raise but cannot just plays.
 */
function tiers(
  percentile: number,
  raise: number,
  play: number,
  canRaise: boolean,
): PolicyMix {
  const raises = canRaise ? 1 - below(percentile, 1 - raise, PREFLOP_SIGMA) : 0
  const plays = play >= 1 ? 1 : 1 - below(percentile, 1 - play, PREFLOP_SIGMA)
  return {
    raise: raises,
    passive: Math.max(0, plays - raises),
    fold: 1 - plays,
  }
}

/**
 * Probability of each kind of action for a hand. `equity` is against a
 * random hand on the current board; `percentile` is the hand's pre-flop
 * strength among all starting hands (0 weakest, 1 strongest), used only in
 * the three common pre-flop spots.
 */
export function populationPolicy(
  equity: number,
  percentile: number,
  context: PolicyContext,
  seat: Seat,
  sigma = 0,
): PolicyMix {
  if (seat.preflop && seat.raises === 0 && !seat.bigBlind && context.toCall)
    return tiers(
      percentile,
      PREFLOP.openRaise,
      PREFLOP.openRaise + PREFLOP.openLimp,
      context.canRaise,
    )
  if (seat.preflop && seat.raises === 0 && seat.bigBlind)
    return tiers(percentile, PREFLOP.isoRaise, 1, context.canRaise)
  if (seat.preflop && seat.raises === 1 && seat.bigBlind)
    return tiers(
      percentile,
      PREFLOP.threeBet,
      PREFLOP.threeBet + PREFLOP.defendCall,
      context.canRaise,
    )
  return policyWith(POSTFLOP, equity, context, sigma)
}
