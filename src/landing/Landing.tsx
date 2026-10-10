// The landing page (L-1, L-2, L-9): the challenge hand is the hero, then a
// short case for why the score means something. Lazy-loaded; first-time
// visitors start fetching it in parallel with the first paint (App.tsx).
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Award,
  BrainCircuit,
  ChartNoAxesCombined,
  Coins,
  Lock,
  Scale,
  Sigma,
  Target,
} from 'lucide-react'
import { CHALLENGE_HANDS } from '../challenge/hands'
import { markLanded } from '../lib/landing'
import { hashString } from '../lib/random'
import { track, visitorId } from '../lib/track'
import { ChallengeHand } from './ChallengeHand'
import { GRADE_BANDS } from './why'
import type { FinishedChallenge } from './ChallengeHand'
import { ScoreCard } from './ScoreCard'
import './landing.css'

/** Each visitor starts on their own hand, so a spoiler helps nobody much. */
const firstHand = () => hashString(visitorId()) % CHALLENGE_HANDS.length
const SHARE_HASH = /^#c\/([0-9a-f]{32})$/

/** A friend's shared score (L-13), from GET /api/challenge/shared/<receipt>. */
export type Rival = {
  hand: string
  ver: number
  accuracy: number
  percentile: number
  basis: 'players' | 'model'
}

export default function Landing() {
  const [index, setIndex] = useState(firstHand)
  const [round, setRound] = useState(1)
  const [finished, setFinished] = useState<FinishedChallenge | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  // Opened from a friend's link: play their hand, with their score to beat.
  const [link] = useState(
    () => window.location.hash.match(SHARE_HASH)?.[1] ?? null,
  )
  const [rival, setRival] = useState<Rival | 'loading' | 'missing' | null>(
    link ? 'loading' : null,
  )

  useEffect(() => track('landing_view'), [])
  useEffect(() => {
    if (!link) return
    track('challenge_link_open')
    let live = true
    fetch(`/api/challenge/shared/${link}`)
      .then((r) => (r.ok ? (r.json() as Promise<Rival>) : null))
      .catch(() => null)
      .then((found) => {
        if (!live) return
        const at = found
          ? CHALLENGE_HANDS.findIndex(
              (h) => h.id === found.hand && h.ver === found.ver,
            )
          : -1
        if (!found || at < 0) return setRival('missing')
        setIndex(at)
        setRival(found)
      })
    return () => {
      live = false
    }
  }, [link])
  const against =
    rival && typeof rival === 'object' && finished?.spec.id === rival.hand
      ? rival
      : null

  const onDone = useCallback((result: FinishedChallenge) => {
    markLanded()
    setFinished(result)
  }, [])
  const again = () => {
    setFinished(null)
    setIndex((i) => i + 1)
    setRound((r) => r + 1)
  }
  const toTop = () => {
    stage.current?.scrollIntoView({ block: 'center' })
    stage.current?.querySelector<HTMLButtonElement>('button:enabled')?.focus()
  }

  return (
    <div className="landing">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-pitch">
          <p className="landing-kicker">
            <span className="landing-pulse" aria-hidden /> Heads-up hold'em ·
            graded like chess · play money
          </p>
          <h1 id="landing-title">
            Most people misprice this hand. <em>Do you?</em>
          </h1>
          <p className="landing-lede">
            Play one hand against Atlas. Every decision is graded against the
            math, not the result, and you see where you rank. No account needed.
          </p>
          <dl className="landing-ticker">
            <div>
              <dt>Time</dt>
              <dd>~60 s</dd>
            </div>
            <div>
              <dt>Options priced</dt>
              <dd>All</dd>
            </div>
            <div>
              <dt>Luck in your score</dt>
              <dd>0%</dd>
            </div>
          </dl>
          {rival && typeof rival === 'object' && (
            <p className="landing-rival" role="status">
              A friend scored <b>{rival.accuracy}/100</b> on this hand. Beat it.
            </p>
          )}
          {rival === 'missing' && (
            <p className="landing-rival" role="status">
              That challenge link has expired, so here is a fresh hand.
            </p>
          )}
          <a className="landing-skip" href="#table" onClick={markLanded}>
            Skip to free practice <ArrowRight size={14} />
          </a>
        </div>
        <div className="landing-stage" ref={stage}>
          {rival === 'loading' ? (
            <p className="landing-loading" role="status">
              Dealing your friend's hand…
            </p>
          ) : finished ? (
            <ScoreCard
              finished={finished}
              rival={against}
              onSave={() => {
                window.location.hash = '#welcome/onboard'
              }}
              onAgain={again}
            />
          ) : (
            <ChallengeHand
              key={round}
              index={index}
              round={round}
              onDone={onDone}
            />
          )}
        </div>
      </section>

      <section className="landing-band" aria-labelledby="graded-title">
        <div className="landing-copy">
          <h2 id="graded-title">Graded the way an engine grades chess</h2>
          <p>
            At each decision the model prices every option against Atlas's
            likely hands: fold, call, and each bet size. Your grade is how much
            expected value you gave up, as a share of the pot.
          </p>
        </div>
        <ul className="landing-grades">
          {GRADE_BANDS.map(([grade, band]) => (
            <li key={grade}>
              <span className={`grade grade-${grade.toLowerCase()}`}>
                {grade}
              </span>
              <span>{band}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-band" aria-labelledby="luck-title">
        <div className="landing-copy">
          <h2 id="luck-title">Luck is noise. Decisions are signal.</h2>
          <p>
            A river card can hand a bad call the pot. Your score never sees it:
            the result of the hand and the quality of your decisions are
            reported apart, the same way a desk separates P&amp;L from process.
          </p>
        </div>
        <div className="landing-split" aria-hidden>
          <div>
            <span>The cards</span>
            <i className="is-noise" />
          </div>
          <div>
            <span>Your decisions</span>
            <i className="is-signal" />
          </div>
        </div>
      </section>

      <section className="landing-band" aria-labelledby="skills-title">
        <div className="landing-copy">
          <h2 id="skills-title">The skills trading interviews test</h2>
          <p>Poker is a fast loop for the same instincts, with feedback.</p>
        </div>
        <ul className="landing-skills">
          <li>
            <Sigma size={18} />
            <strong>Expected value</strong>
            <span>Price every option, not just the one you like.</span>
          </li>
          <li>
            <Scale size={18} />
            <strong>Pricing</strong>
            <span>Pot odds against equity, under a clock.</span>
          </li>
          <li>
            <Coins size={18} />
            <strong>Sizing</strong>
            <span>How much to put at risk, and why.</span>
          </li>
          <li>
            <Target size={18} />
            <strong>Calibration</strong>
            <span>Guess your equity first; see how close you were.</span>
          </li>
        </ul>
      </section>

      <section className="landing-band" aria-labelledby="rated-title">
        <div className="landing-copy">
          <h2 id="rated-title">Then play people, and get rated</h2>
          <p>
            Rated heads-up matches against real players, with the lab switched
            off. A Glicko-2 rating with its uncertainty, an accuracy number from
            your graded decisions, a public profile and a ladder. Verify your
            school email and you play for your school.
          </p>
          <p className="landing-links">
            <a href="#ladder">See the ladder</a>
            <a href="#method">How ratings work</a>
          </p>
        </div>
        <ul className="landing-skills">
          <li>
            <ChartNoAxesCombined size={18} />
            <strong>Rating ± deviation</strong>
            <span>Luck-adjusted results, never raw chips.</span>
          </li>
          <li>
            <BrainCircuit size={18} />
            <strong>Accuracy</strong>
            <span>The mean grade of your latest decisions.</span>
          </li>
          <li>
            <Award size={18} />
            <strong>School badge</strong>
            <span>From a confirmed school email. Optional.</span>
          </li>
        </ul>
      </section>

      <section
        className="landing-band landing-trust"
        aria-labelledby="fair-title"
      >
        <div className="landing-copy">
          <h2 id="fair-title">Fair by construction</h2>
          <p>
            Play money only: no deposits, no withdrawals, no prizes. Online
            decks are committed before the deal, and your browser checks every
            card it is shown against that commitment.
          </p>
          <p className="landing-links">
            <a href="#fair-play">
              <Lock size={13} /> Fair play
            </a>
            <a href="#terms">Terms</a>
          </p>
        </div>
      </section>

      <section className="landing-final" aria-labelledby="final-title">
        <h2 id="final-title">One hand. Sixty seconds. Where do you rank?</h2>
        <button className="btn btn-accent btn-lg" onClick={toTop}>
          Play the hand <ArrowRight size={16} />
        </button>
      </section>
    </div>
  )
}
