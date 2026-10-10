// The Method page (#method, P1-16): how the rating, the ladder and accuracy
// are computed, with their versions. Every number comes from the module
// that applies it, so the page cannot drift from the code.
import { GRADE_LIMITS } from '../lib/grading'
import { GRADE_VERSION } from '../lib/grader'
import { ACCURACY_LABEL } from '../net/accuracy'
import {
  DEFAULT,
  IDLE_PERIOD_MS,
  MAX_RD,
  SCALE,
  SCORE,
  TAU,
  VERSION,
} from '../rating/glicko2'
import {
  ACTIVE_DAYS,
  DRAW_BAND_BB,
  MAX_ABANDONMENT,
  PROVISIONAL_MATCHES,
  PROVISIONAL_RD,
} from '../rating/rules'
import { Section } from './Section'

const IDLE_DAYS = IDLE_PERIOD_MS / 86_400_000
const pct = (share: number) => `${Math.round(share * 100)}%`
/** Accuracy reaches 0 at this share of the pot given up (src/lib/grading.ts). */
const ZERO_AT = 0.5

export function Method() {
  return (
    <article className="page info-page">
      <header className="page-head">
        <h1>Method</h1>
        <p>
          How the rating, the ladder and accuracy are computed, and what they do
          not measure. Rated play is heads-up only for now; each format will
          have its own rating, never merged.
        </p>
      </header>

      <Section id="m-rating" title="The rating: Glicko-2">
        <p>
          Ratings use Glicko-2 (Mark Glickman, “Example of the Glicko-2
          system”), version <code>{VERSION}</code>. Every rating is shown with
          its rating deviation, the ±: how sure the number is. A new player
          starts at {DEFAULT.rating} ± {DEFAULT.rd} with volatility{' '}
          {DEFAULT.sigma}, and the system constant is τ = {TAU}.
        </p>
        <ul>
          <li>
            <b>One rated match is one rating period.</b> Each player is rated
            against the opponent’s rating and RD from before the match, so the
            number moves after every match and every update can be reproduced
            from that match alone.
          </li>
          <li>
            <b>Inactivity widens the ±.</b> For every {IDLE_DAYS} days without a
            rated match, RD grows by one period of volatility, up to {MAX_RD}.
            The rating itself does not decay.
          </li>
        </ul>
        <p>
          On Glicko-2’s scale (μ = (rating − {DEFAULT.rating}) / {SCALE}, φ = RD
          / {SCALE}), against an opponent j with score s:
        </p>
        <pre className="info-formula">
          {[
            'g(φⱼ) = 1 / √(1 + 3φⱼ² / π²)',
            'E = 1 / (1 + exp(−g(φⱼ)(μ − μⱼ)))',
            'v = 1 / (g(φⱼ)² · E · (1 − E))',
            'Δ = v · g(φⱼ) · (s − E)',
            'σ′ solves Glickman’s volatility equation (Illinois method, ε = 10⁻⁶)',
            'φ* = √(φ² + σ′²)',
            'φ′ = 1 / √(1/φ*² + 1/v)',
            'μ′ = μ + φ′² · g(φⱼ) · (s − E)',
          ].join('\n')}
        </pre>
        <p>
          The implementation reproduces Glickman’s published worked example to
          the digits he prints.
        </p>
      </Section>

      <Section id="m-result" title="What counts as a win">
        <ul>
          <li>
            A rated match is 40 heads-up hands with a fresh deck every hand. The
            result is luck-adjusted: every pot that went all-in before the river
            is settled at each player’s equity instead of by the cards that
            came.
          </li>
          <li>
            A luck-adjusted lead of at most {DRAW_BAND_BB} big blinds, exactly{' '}
            {DRAW_BAND_BB}.00 included, is a draw.
          </li>
          <li>
            Scores: win {SCORE.win}, draw {SCORE.draw}, loss {SCORE.loss}. A
            forfeit (three missed decisions in a row) or an abandonment is a
            loss. A match both players leave is void and unrated, and counts as
            abandoned for both.
          </li>
        </ul>
      </Section>

      <Section id="m-provisional" title="Provisional ratings">
        <p>
          A rating is provisional until its ± is under {PROVISIONAL_RD}{' '}
          <b>and</b> the player has {PROVISIONAL_MATCHES} rated matches,
          whichever comes later. Provisional players see how many matches they
          have to go.
        </p>
      </Section>

      <Section id="m-ladder" title="The ladder">
        <ul>
          <li>
            It lists players by rating who are not provisional, have played a
            rated match in the last {ACTIVE_DAYS} days, and have abandoned fewer
            than {pct(MAX_ABANDONMENT)} of their rated matches (exactly{' '}
            {pct(MAX_ABANDONMENT)} is off).
          </li>
          <li>
            “All time” shows each player’s matches and the rating change over{' '}
            {ACTIVE_DAYS} days. “This month” lists players with a rated match
            this calendar month (UTC), with that month’s matches and change.
          </li>
          <li>Win rate counts wins only; draws are neither.</li>
        </ul>
      </Section>

      <Section id="m-accuracy" title="Accuracy">
        <p>
          <b>{ACCURACY_LABEL}</b> Every decision in a finished rated match,
          including those the clock made, is compared with the best action
          against a model of how people play (version{' '}
          <code>{GRADE_VERSION}</code>).
        </p>
        <ul>
          <li>
            A decision scores 100 for the best action, falling linearly to 0 at{' '}
            {pct(ZERO_AT)} of the pot given up in expected value: accuracy =
            max(0, 100 − 200 × EV given up ÷ pot).
          </li>
          <li>
            A player’s accuracy is the plain average over their latest 500
            graded decisions, in the order the hands were played.
          </li>
          <li>
            Grades by EV given up as a share of the pot:{' '}
            {GRADE_LIMITS.map(([grade, limit], i) =>
              limit === Infinity
                ? `${grade} above ${pct(GRADE_LIMITS[i - 1][1])}`
                : `${grade} up to ${pct(limit)}`,
            ).join(', ')}
            .
          </li>
        </ul>
      </Section>

      <Section id="m-not" title="What these numbers do not measure">
        <ul>
          <li>
            Accuracy is not distance from game-theory-optimal play. The model
            opponent is an average human population, not a solver.
          </li>
          <li>
            A rating measures results against the opponents met here, at play
            money. A wide ± means few matches: read the number with it.
          </li>
          <li>
            Collusion, more than one account and real-time assistance are not
            detected yet; see <a href="#fair-play">Fair play</a>.
          </li>
          <li>
            There is no combined score yet; rating and accuracy are shown side
            by side.
          </li>
        </ul>
      </Section>

      <Section id="m-versions" title="Versions">
        <dl className="info-versions">
          <dt>Rating</dt>
          <dd>
            <code>{VERSION}</code>, τ {TAU}, one match per period
          </dd>
          <dt>Accuracy</dt>
          <dd>
            <code>{GRADE_VERSION}</code>, latest 500 decisions
          </dd>
          <dt>Draw band</dt>
          <dd>±{DRAW_BAND_BB} bb, luck-adjusted</dd>
          <dt>Provisional</dt>
          <dd>
            RD under {PROVISIONAL_RD} and {PROVISIONAL_MATCHES} matches
          </dd>
        </dl>
      </Section>
    </article>
  )
}
