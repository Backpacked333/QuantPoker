import { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  MoveUpRight,
  Pause,
  Play,
  RotateCcw,
  Spade,
} from 'lucide-react'
import './landing.css'
import { callEV } from './lib/finance'
import { motionOff } from './env'
import { useReducedMotion } from './hooks'
import { useLandingMotion } from './landingMotion'
import CallPlayground from './CallPlayground'

const lessons = [
  {
    number: '01',
    poker: 'Pot odds',
    finance: 'Expected payoff',
    text: 'What is a chance to win actually worth?',
    route: 'odds',
  },
  {
    number: '02',
    poker: 'Reading a range',
    finance: 'Updating beliefs',
    text: 'New information. A different decision.',
    route: 'equity',
  },
  {
    number: '03',
    poker: 'Bet sizing',
    finance: 'Risk & reward',
    text: 'A bigger bet is not always a better bet.',
    route: 'fold',
  },
  {
    number: '04',
    poker: 'Variance',
    finance: 'Thinking long-term',
    text: 'Good decisions can have bad outcomes.',
    route: 'variance',
  },
] as const

const questions = [
  [
    'Do I need to know how to play poker?',
    'Not at all. Start with a guided hand against Atlas, our practice opponent. You can learn the rules at your own pace, then reveal the reasoning behind each decision. Already play? Skip the basics and head to the table.',
  ],
  [
    'Is this real-money poker?',
    'No. QuantPoker is a learning experience with play-money chips. There are no deposits, withdrawals, cash prizes, or chips to buy. Online play is for adults aged 18 and over.',
  ],
  [
    'Do I need an account?',
    'You can practice and explore the curriculum without signing up. Practice progress is saved in this browser, so clearing browser data removes it. Playing against other people requires an account; rated play also requires a confirmed email.',
  ],
  [
    'Is Atlas a poker solver?',
    'No. Atlas is a practice opponent with a transparent, simplified strategy. Its decision feedback helps you understand expected value under that model, not memorize a claim of perfect play.',
  ],
  [
    'How does poker connect to finance?',
    'Both involve pricing uncertain outcomes, updating beliefs, and balancing risk against reward. The lessons make those connections concrete—and explain where the analogy stops. This is an introduction to quantitative thinking, not investment advice or a professional qualification.',
  ],
] as const

function Brand() {
  return (
    <a className="lp-brand" href="#home" aria-label="QuantPoker home">
      <span className="lp-brand-mark">
        <Spade size={21} fill="currentColor" aria-hidden="true" />
      </span>
      <span>
        quant<span className="lp-brand-light">poker</span>
        <span className="lp-brand-period">.</span>
      </span>
    </a>
  )
}

function DemoCard({
  rank,
  suit,
  red = false,
}: {
  rank: string
  suit: string
  red?: boolean
}) {
  return (
    <span className={`lp-card${red ? ' lp-card-red' : ''}`}>
      <span>
        {rank}
        <small>{suit}</small>
      </span>
      <b>{suit}</b>
      <span className="lp-card-bottom">{rank}</span>
    </span>
  )
}

function DecisionDemo() {
  const [chance, setChance] = useState(30)
  const [deal, setDeal] = useState(0)
  const ev = callEV(chance / 100, 100, 25)
  const formattedEV = `${ev > 0 ? '+' : ev < 0 ? '−' : ''}${Math.abs(ev).toFixed(1)}`
  const pointX = 34 + ((chance - 10) / 50) * 308
  const pointY = 130 - ((chance - 10) / 50) * 100

  return (
    <div
      className="lp-demo"
      aria-label="Interactive expected value example"
      data-lp-tilt
    >
      <div className="lp-demo-top">
        <span>
          <i /> THE PRACTICE TABLE
        </span>
        <span>PLAY MONEY</span>
      </div>
      <div className="lp-demo-table">
        <div className="lp-opponent">
          <span className="lp-avatar">A</span>
          <span>
            Atlas<small>Your practice partner</small>
          </span>
          <span className="lp-opponent-bet">
            BET <b>25</b>
          </span>
        </div>
        <div
          className="lp-board"
          aria-label="Illustrative board: ace of spades, seven of diamonds, two of spades"
        >
          <div className="lp-pot">
            IN THE POT{' '}
            <b>
              100 <span>chips</span>
            </b>
          </div>
          <div className="lp-cards" aria-hidden="true" key={deal}>
            <DemoCard rank="A" suit="♠" />
            <DemoCard rank="7" suit="♦" red />
            <DemoCard rank="2" suit="♠" />
            <span className="lp-card-slot" />
            <span className="lp-card-slot" />
          </div>
        </div>
        <button
          className="lp-replay-deal"
          onClick={() => setDeal((n) => n + 1)}
          aria-label="Replay card deal"
        >
          <RotateCcw size={12} aria-hidden="true" /> Replay the deal
        </button>
        <div className="lp-your-hand">
          <div
            className="lp-pocket"
            role="img"
            aria-label="Illustrative hand: king and queen of spades"
          >
            <span aria-hidden="true">
              <DemoCard rank="K" suit="♠" />
              <DemoCard rank="Q" suit="♠" />
            </span>
          </div>
          <div>
            <span>YOUR MOVE</span>
            <strong>Would you call 25?</strong>
          </div>
          <ArrowDownRight size={24} aria-hidden="true" />
        </div>
      </div>
      <div className="lp-analysis">
        <div className="lp-analysis-heading">
          <span className="lp-label">
            A LITTLE MATH. A DIFFERENT PERSPECTIVE.
          </span>
          <span className="lp-live-dot" aria-hidden="true" />
        </div>
        <div className="lp-ev-row">
          <div>
            <span className="lp-metric-label">Expected value of a call</span>
            <output
              className={`lp-ev${ev < 0 ? ' lp-ev-negative' : ''}`}
              htmlFor="lp-chance"
              aria-live="polite"
              aria-atomic="true"
            >
              {formattedEV}
              <span> chips</span>
            </output>
          </div>
          <span className="lp-ev-tag">
            {ev > 0 ? (
              <ArrowUpRight size={15} />
            ) : ev < 0 ? (
              <ArrowDownRight size={15} />
            ) : (
              <ArrowRight size={15} />
            )}{' '}
            {ev > 0 ? 'Positive EV' : ev < 0 ? 'Negative EV' : 'Break-even'}
          </span>
        </div>
        <svg
          className="lp-chart"
          viewBox="0 0 376 170"
          role="img"
          aria-label={`Expected value rises with win chance. Break-even is 20 percent. At ${chance} percent, a call has an expected value of ${formattedEV} chips.`}
        >
          <defs>
            <linearGradient id="lp-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#50823b" stopOpacity=".18" />
              <stop offset="100%" stopColor="#50823b" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M34 30H342 M34 70H342 M34 110H342"
            className="lp-chart-grid"
          />
          <path d="M34 130L342 30V140H34Z" fill="url(#lp-chart-fill)" />
          <path d="M95.6 25V140" className="lp-chart-threshold" />
          <path d="M34 130L342 30" className="lp-chart-line" />
          <text x="104" y="39">
            20% break-even
          </text>
          <text x="0" y="114">
            0 EV
          </text>
          <text x="25" y="161">
            10%
          </text>
          <text x="326" y="161">
            60%
          </text>
          <circle cx={pointX} cy={pointY} r="11" fill="#d5eeaa" />
          <circle cx={pointX} cy={pointY} r="5" fill="#28533b" />
        </svg>
        <div className="lp-slider-label">
          <label htmlFor="lp-chance">Your assumed win chance</label>
          <span>{chance}%</span>
        </div>
        <input
          id="lp-chance"
          type="range"
          min="10"
          max="60"
          step="1"
          value={chance}
          onChange={(event) => setChance(Number(event.target.value))}
          aria-describedby="lp-demo-assumptions"
          style={{
            background: `linear-gradient(to right, #355a40 ${((chance - 10) / 50) * 100}%, #dfe3d8 0)`,
          }}
        />
        <div className="lp-demo-hint">
          <span aria-hidden="true">↔</span> Move the slider. See the decision
          change.
        </div>
        <p id="lp-demo-assumptions" className="lp-demo-note">
          Illustrative hand, not calculated card odds. Assumes no more betting,
          no ties, and no rake. EV = win chance × 125 − 25.
        </p>
      </div>
    </div>
  )
}

export default function Landing({ hash }: { hash: string }) {
  const [paused, setPaused] = useState(false)
  const reduced = useReducedMotion()
  const motionEnabled = !paused && !reduced && !motionOff
  const root = useLandingMotion(motionEnabled)
  useEffect(() => {
    const id = hash.slice(1)
    if (!id || id === 'home') window.scrollTo({ top: 0, behavior: 'instant' })
    else
      document
        .getElementById(id)
        ?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [hash])

  return (
    <div
      className={`landing${motionEnabled ? '' : ' lp-motion-paused'}`}
      id="home"
      ref={root}
    >
      <div className="lp-scroll-progress" aria-hidden="true" />
      <a className="lp-skip" href="#landing-main">
        Skip to content
      </a>
      <header className="lp-header lp-container">
        <Brand />
        <nav aria-label="Landing page">
          <a href="#experiment">Try the lab</a>
          <a href="#approach">The approach</a>
          <a href="#inside">What you’ll learn</a>
          <a href="#questions">FAQ</a>
        </nav>
        <div className="lp-header-actions">
          <button
            className="lp-motion-toggle"
            aria-label={paused ? 'Resume animations' : 'Pause animations'}
            aria-pressed={paused || reduced || motionOff}
            disabled={reduced || motionOff}
            onClick={() => setPaused((value) => !value)}
            title={
              reduced || motionOff
                ? 'Reduced motion is enabled'
                : paused
                  ? 'Resume animations'
                  : 'Pause animations'
            }
          >
            {paused || reduced || motionOff ? (
              <Play size={15} aria-hidden="true" />
            ) : (
              <Pause size={15} aria-hidden="true" />
            )}
          </button>
          <a className="lp-header-cta" href="#table">
            Let’s play <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </div>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section className="lp-hero lp-container" aria-labelledby="lp-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">
              <span /> SMALL STAKES. BIG IDEAS.
            </p>
            <h1 id="lp-title">
              <span className="lp-headline-line">
                <span>Play the hand.</span>
              </span>{' '}
              <span className="lp-headline-line">
                <span>See the bigger</span>
              </span>{' '}
              <span className="lp-headline-line lp-headline-accent">
                <span>picture.</span>
              </span>
              <svg viewBox="0 0 82 82" aria-hidden="true">
                <path d="M12 70 70 12M12 12h58v58" />
              </svg>
            </h1>
            <p className="lp-hero-description">
              Poker is just the beginning. Discover probability, risk, and
              better decision-making—one hand at a time.
            </p>
            <div className="lp-hero-actions">
              <a className="lp-button lp-button-dark" href="#table">
                Play a practice hand <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a className="lp-text-link" href="#approach">
                How it works <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="lp-reassurance">
              <Check size={14} aria-hidden="true" /> Free to explore{' '}
              <span>·</span> No account needed <span>·</span> Just play money
            </p>
            <div className="lp-hero-footnote">
              <span className="lp-footnote-line" />
              <p>
                For curious minds.
                <br />
                <strong>Not just poker players.</strong>
              </p>
            </div>
          </div>
          <div className="lp-hero-visual">
            <div className="lp-visual-grid" aria-hidden="true" />
            <div className="lp-example-label">
              <span>01 / A DECISION, REVEALED</span>
              <span>
                TRY IT YOURSELF <ArrowDown size={12} aria-hidden="true" />
              </span>
            </div>
            <DecisionDemo />
          </div>
        </section>

        <div className="lp-principles">
          <div className="lp-container">
            <span>
              LESS GUESSWORK.
              <br />
              <strong>MORE UNDERSTANDING.</strong>
            </span>
            <div className="lp-marquee">
              <p>
                Probability <span aria-hidden="true">↗</span> Expected value{' '}
                <span aria-hidden="true">↗</span> Risk{' '}
                <span aria-hidden="true">↗</span> Better decisions
              </p>
              <p aria-hidden="true">
                Probability <span>↗</span> Expected value <span>↗</span> Risk{' '}
                <span>↗</span> Better decisions <span>↗</span>
              </p>
            </div>
          </div>
        </div>

        <CallPlayground />

        <section
          id="approach"
          className="lp-approach lp-container lp-section lp-reveal"
          aria-labelledby="lp-approach-title"
        >
          <div className="lp-section-heading">
            <div>
              <p className="lp-eyebrow">01 — THE APPROACH</p>
              <h2 id="lp-approach-title">
                Learn by doing.
                <br />
                <span>Then see it differently.</span>
              </h2>
            </div>
            <p>
              No wall of formulas. No lecture before you play. Make a decision,
              unpack it, and take a little more understanding into the next
              hand.
            </p>
          </div>
          <div className="lp-steps">
            <article className="lp-reveal" data-lp-tilt>
              <div className="lp-step-top">
                <span>01</span>
                <div
                  className="lp-step-symbol lp-symbol-play"
                  aria-hidden="true"
                >
                  <span>K♠</span>
                  <span>Q♠</span>
                </div>
              </div>
              <h3>Take a seat.</h3>
              <p>
                Play heads-up against Atlas. Start with a guided hand, make your
                read, and find your rhythm.
              </p>
              <a href="#table">
                Meet your practice partner{' '}
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </article>
            <article className="lp-reveal" data-lp-tilt>
              <div className="lp-step-top">
                <span>02</span>
                <div
                  className="lp-step-symbol lp-symbol-chart"
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <h3>Look beneath the cards.</h3>
              <p>
                Explore the odds, compare expected values, and review the
                decision—not just whether you won.
              </p>
              <a href="#table">
                Open the practice table{' '}
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </article>
            <article className="lp-reveal" data-lp-tilt>
              <div className="lp-step-top">
                <span>03</span>
                <div
                  className="lp-step-symbol lp-symbol-connect"
                  aria-hidden="true"
                >
                  <span>♠</span>
                  <MoveUpRight size={27} />
                  <span>ƒ</span>
                </div>
              </div>
              <h3>Connect the dots.</h3>
              <p>
                Follow the same ideas into markets, options, and risk. Build
                intuition you can take beyond the table.
              </p>
              <a href="#learn/path">
                Explore the curriculum{' '}
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </article>
          </div>
        </section>

        <section
          id="inside"
          className="lp-learning lp-reveal"
          aria-labelledby="lp-learning-title"
        >
          <div className="lp-container lp-learning-grid">
            <div className="lp-learning-copy">
              <p className="lp-eyebrow">02 — BEYOND THE TABLE</p>
              <h2 id="lp-learning-title">
                Same hand.
                <br />A whole new
                <br />
                <span>way to see it.</span>
              </h2>
              <p>
                A poker decision is a small laboratory for uncertainty. Our
                interactive lessons help you carry the insight from one world to
                another.
              </p>
              <a className="lp-button lp-button-lime" href="#learn/path">
                Find your first lesson{' '}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <span className="lp-learning-note">
                Start with the foundations. Follow your curiosity.
              </span>
            </div>
            <div className="lp-lessons">
              <div className="lp-lessons-header">
                <span>AT THE TABLE</span>
                <span>IN THE BIGGER PICTURE</span>
              </div>
              {lessons.map((lesson) => (
                <a
                  key={lesson.number}
                  className="lp-lesson lp-reveal"
                  href={`#learn/module/${lesson.route}`}
                >
                  <span className="lp-lesson-number">{lesson.number}</span>
                  <div>
                    <div className="lp-lesson-titles">
                      <h3>{lesson.poker}</h3>
                      <ArrowRight size={18} aria-hidden="true" />
                      <span>{lesson.finance}</span>
                    </div>
                    <p>{lesson.text}</p>
                  </div>
                  <ArrowUpRight
                    size={19}
                    className="lp-lesson-arrow"
                    aria-hidden="true"
                  />
                </a>
              ))}
              <p className="lp-lessons-note">
                Real connections, honest boundaries. Poker is a starting
                point—not a model of every market.
              </p>
            </div>
          </div>
        </section>

        <section
          className="lp-online lp-container lp-reveal"
          aria-labelledby="lp-online-title"
        >
          <div className="lp-online-icon" aria-hidden="true">
            <Spade size={25} />
            <span>↗</span>
          </div>
          <div>
            <p className="lp-eyebrow">THE OTHER SIDE OF THE TABLE</p>
            <h2 id="lp-online-title">Ready for a human opponent?</h2>
            <p>
              Take your decisions into heads-up online play. Same play-money
              spirit. A different mind across the table.
            </p>
          </div>
          <a className="lp-button lp-button-outline" href="#lobby">
            Play online <ArrowUpRight size={18} aria-hidden="true" />
          </a>
          <span className="lp-online-note">Account required · 18+</span>
        </section>

        <section
          id="questions"
          className="lp-faq lp-container lp-section lp-reveal"
          aria-labelledby="lp-faq-title"
        >
          <div>
            <p className="lp-eyebrow">03 — GOOD QUESTIONS</p>
            <h2 id="lp-faq-title">
              Before you
              <br />
              <span>take a seat.</span>
            </h2>
            <p>A few things worth knowing.</p>
          </div>
          <div className="lp-questions">
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="lp-final lp-container lp-reveal"
          aria-labelledby="lp-final-title"
        >
          <div className="lp-final-decoration" aria-hidden="true">
            <Spade />
            <ArrowUpRight />
          </div>
          <p className="lp-eyebrow">YOUR NEXT GOOD DECISION</p>
          <h2 id="lp-final-title">
            Start with a hand.
            <br />
            <span>Leave with an insight.</span>
          </h2>
          <a className="lp-button lp-button-dark" href="#table">
            Let’s play <ArrowRight size={18} aria-hidden="true" />
          </a>
          <p className="lp-final-note">
            No deposit. No pressure. Just a different way to learn.
          </p>
        </section>
      </main>

      <footer className="lp-footer lp-container">
        <div className="lp-footer-top">
          <Brand />
          <p>A little poker. A bigger perspective.</p>
          <nav aria-label="Footer">
            <a href="#fair-play">Fair play</a>
            <a href="#terms">Terms of play</a>
            <a href="#learn/path">Curriculum</a>
          </nav>
        </div>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} QuantPoker</span>
          <span>Play money only. Not financial advice.</span>
          <span>
            Made for curious minds.{' '}
            <ArrowUpRight size={13} aria-hidden="true" />
          </span>
        </div>
      </footer>
    </div>
  )
}
