import { lazy, Suspense, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  CircleHelp,
  Crosshair,
  Gauge,
  Layers3,
  Lightbulb,
  Maximize2,
  ShieldCheck,
  Sparkles,
  TimerReset,
  TrendingUp,
  Waves,
} from 'lucide-react'
import {
  allInCashout,
  decisionBreakEven,
  decisionEV,
  decisionOutcomes,
  fairPremium,
  kellyFraction,
  payoffStatistics,
} from '../lib/finance'
import type {
  DecisionAction,
  DecisionModel,
  Lens,
  SurfaceScenario,
} from '../lib/finance'
import { cardKey, cardLabel, evaluate, legalActions } from '../lib/poker'
import type {
  Action,
  EquityAnalysis,
  Game,
  NextCardScenario,
} from '../lib/poker'
import { Modal } from './Modal'

const Surface = lazy(() => import('./Surface'))
const format = (value: number) =>
  `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(1)}`
const percent = (value: number) => `${(value * 100).toFixed(1)}%`
const titles: Record<Lens, string> = {
  equity: 'Your decision, as a terrain.',
  options: 'The option to walk away has value.',
  insurance: 'Protection reshapes the downside.',
}

export function FinancePanel({
  game,
  analysis,
  raiseTo,
  lens,
  onLens,
  onLesson,
  playedAction,
  settledResult,
}: {
  game: Game
  analysis: EquityAnalysis | null
  raiseTo: number
  lens: Lens
  onLens: (lens: Lens) => void
  onLesson: (lens: Lens) => void
  playedAction?: Action
  settledResult?: Game['result']
}) {
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [actionChoice, setAction] = useState<DecisionAction>(
    playedAction?.type === 'fold'
      ? 'fold'
      : playedAction?.type === 'raise'
        ? 'raise'
        : 'continue',
  )
  const [foldProbability, setFoldProbability] = useState(0.25)
  const [coverageFraction, setCoverageFraction] = useState(0.75)
  const [nextCard, setNextCard] = useState<{
    key: string
    value: NextCardScenario
  } | null>(null)
  const boardKey = `${game.id}:${[...game.cards[0], ...game.board].map(cardKey).join(',')}`
  const selectedNext = nextCard?.key === boardKey ? nextCard.value : null
  const probabilities = selectedNext ??
    analysis ?? { equity: 0, win: 0, tie: 0, loss: 1 }
  const legal = legalActions(game)
  const heroBet = game.bets[0]
  const call = game.result
    ? 0
    : Math.min(Math.max(0, game.bets[1] - game.bets[0]), game.stacks[0])
  const pot = game.result ? game.invested[0] + game.invested[1] : game.pot
  const equity = probabilities.equity
  const raiseRisk = Math.max(0, raiseTo - heroBet)
  const opponentCall = Math.max(0, raiseTo - game.bets[1])
  const canModelRaise = legal.canRaise && !game.result

  const action =
    actionChoice === 'raise' && !canModelRaise ? 'continue' : actionChoice

  const models: Record<DecisionAction, DecisionModel> = {
    fold: { action: 'fold', pot, risk: 0, opponentCall: 0, foldProbability: 0 },
    continue: {
      action: 'continue',
      pot,
      risk: call,
      opponentCall: 0,
      foldProbability: 0,
    },
    raise: {
      action: 'raise',
      pot,
      risk: raiseRisk,
      opponentCall,
      foldProbability,
    },
  }
  const model = models[action]
  const ev = decisionEV(model, equity)
  const threshold = decisionBreakEven(model)
  const exposure = model.risk
  const lossProbability =
    probabilities.loss *
    (action === 'raise' ? 1 - foldProbability : action === 'fold' ? 0 : 1)
  const coverage = exposure * coverageFraction
  const premium = fairPremium(lossProbability, coverage)
  const unhedgedVolatility = payoffStatistics(
    decisionOutcomes(model, probabilities),
  ).deviation
  const hedgedVolatility = payoffStatistics(
    decisionOutcomes(model, probabilities, coverage),
  ).deviation
  const allIn =
    exposure > 0
      ? allInCashout(equity, exposure, pot + model.opponentCall, 0.01)
      : null
  const fullKelly = allIn
    ? kellyFraction(equity, exposure, pot + model.opponentCall)
    : 0
  const scenario: SurfaceScenario = {
    ...model,
    equity,
    lossProbability,
    coverageFraction,
  }
  const cardsToCome = Math.max(0, 5 - game.board.length)
  const handName =
    game.board.length >= 3
      ? evaluate([...game.cards[0], ...game.board]).name
      : game.cards[0][0].rank === game.cards[0][1].rank
        ? 'Pocket pair'
        : 'Unmade hand'
  const deltaPerPoint =
    action === 'fold'
      ? 0
      : ((pot + model.opponentCall + exposure) *
          (action === 'raise' ? 1 - foldProbability : 1)) /
        100
  const bankrollExposure = exposure / Math.max(1, game.stacks[0])
  const actionLabel =
    action === 'fold'
      ? 'Fold'
      : action === 'raise'
        ? `Raise to ${raiseTo}`
        : call
          ? `Call ${call}`
          : 'Check'
  const graph = (
    <Suspense
      fallback={<div className="graph-loading">Mapping this decision…</div>}
    >
      <Surface
        lens={lens}
        scenario={scenario}
        markerLabel={
          selectedNext
            ? `What if ${cardLabel(selectedNext.card)}?`
            : settledResult
              ? 'Final decision review'
              : 'Your hand now'
        }
      />
    </Suspense>
  )

  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    const keys: Lens[] = ['equity', 'options', 'insurance']
    const index = keys.indexOf(lens)
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % 3
        : event.key === 'ArrowLeft'
          ? (index + 2) % 3
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 2
              : null
    if (next === null) return
    event.preventDefault()
    onLens(keys[next])
    document.getElementById(`tab-${keys[next]}`)?.focus()
  }

  return (
    <aside className="finance-panel" aria-label="Live finance learning panel">
      <div className="panel-eyebrow">
        <span>
          <Sparkles size={15} /> LIVE QUANT LAB
        </span>
        <span className="live-pill">
          <i /> Live hand + explicit scenario assumptions
        </span>
      </div>
      <div className="panel-heading">
        <div>
          <h2>
            See the decision.
            <br />
            Not just the cards.
          </h2>
          <p>Change the action. Stress the assumptions. Read the terrain.</p>
        </div>
        <button
          className="icon-button help-button"
          aria-label="Explain model assumptions"
          onClick={() => setShowAssumptions(!showAssumptions)}
        >
          <CircleHelp size={18} />
        </button>
      </div>

      {settledResult && (
        <div className="decision-review">
          <span className="eyebrow">
            HAND COMPLETE · {format(settledResult.net)} REALIZED CHIPS
          </span>
          <h4>Judge the choice, not the outcome.</h4>
          <p>
            {playedAction
              ? 'This model is frozen at your final decision, using only the cards you knew then. Compare alternative actions without hindsight.'
              : 'This hand ended without another decision. The model is a reference, not an action you can take.'}{' '}
            A single win or loss cannot prove a strategy is good.
          </p>
        </div>
      )}
      <div className="hand-snapshot">
        <div>
          <span>{settledResult ? 'AT YOUR DECISION' : 'NOW'}</span>
          <strong>
            {game.street.toUpperCase()} · {handName}
          </strong>
        </div>
        <div>
          <span>POT</span>
          <strong>{pot} chips</strong>
        </div>
        <div>
          <span>UNCERTAINTY LEFT</span>
          <strong>
            {cardsToCome} card{cardsToCome === 1 ? '' : 's'} to come
          </strong>
        </div>
      </div>

      <div className="decision-simulator">
        <span className="eyebrow">MODEL A DECISION — DOES NOT PLAY IT</span>
        <div className="decision-buttons">
          <button
            className={action === 'fold' ? 'selected' : ''}
            onClick={() => setAction('fold')}
          >
            Fold<small>EV 0</small>
          </button>
          <button
            className={action === 'continue' ? 'selected' : ''}
            onClick={() => setAction('continue')}
          >
            {call ? `Call ${call}` : 'Check'}
            <small>{format(decisionEV(models.continue, equity))} EV</small>
          </button>
          <button
            disabled={!canModelRaise}
            className={action === 'raise' ? 'selected' : ''}
            onClick={() => setAction('raise')}
          >
            Raise {raiseTo}
            <small>
              {canModelRaise
                ? `${format(decisionEV(models.raise, equity))} EV*`
                : 'Unavailable'}
            </small>
          </button>
        </div>
        {action === 'raise' && (
          <div className="model-control">
            <label htmlFor="fold-equity">
              Assumed chance Atlas folds{' '}
              <strong>{Math.round(foldProbability * 100)}%</strong>
            </label>
            <input
              id="fold-equity"
              type="range"
              min="0"
              max="0.8"
              step="0.01"
              value={foldProbability}
              onChange={(event) =>
                setFoldProbability(Number(event.target.value))
              }
            />
            <small>
              *A scenario, not a read on Atlas. Move it to stress-test the
              raise.
            </small>
          </div>
        )}
      </div>

      {selectedNext && (
        <div className="what-if-banner">
          <span>
            <Sparkles size={14} /> What if <b>{cardLabel(selectedNext.card)}</b>{' '}
            comes next? <strong>{percent(equity)}</strong> equity
          </span>
          <button onClick={() => setNextCard(null)}>Back to live hand</button>
        </div>
      )}

      <div
        className="lens-tabs"
        role="tablist"
        aria-label="Quant lens"
        onKeyDown={navigateTabs}
      >
        {(
          [
            ['equity', TrendingUp, 'Decision'],
            ['options', ArrowUpRight, 'Optionality'],
            ['insurance', ShieldCheck, 'Protection'],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            id={`tab-${key}`}
            role="tab"
            aria-selected={lens === key}
            tabIndex={lens === key ? 0 : -1}
            aria-controls="lens-content"
            onClick={() => onLens(key)}
            className={lens === key ? 'selected' : ''}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div id="lens-content" role="tabpanel" aria-labelledby={`tab-${lens}`}>
        <div className="model-title">
          <div>
            <span className="eyebrow">
              {lens === 'equity'
                ? 'PROBABILITY × PAYOFF × BEHAVIOR'
                : lens === 'options'
                  ? 'PREMIUM · STRIKE · VOLATILITY · TIME'
                  : 'PROBABILITY × SEVERITY × COVERAGE'}
            </span>
            <h3>{titles[lens]}</h3>
          </div>
          <button
            className="icon-button"
            aria-label="Expand interactive model"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 size={16} />
          </button>
        </div>
        {graph}

        {lens === 'equity' && (
          <>
            <div className="finance-metrics">
              <div>
                <span>
                  {selectedNext ? 'What-if showdown equity' : 'Showdown equity'}
                </span>
                <strong>{analysis ? percent(equity) : '…'}</strong>
                <small>
                  {analysis
                    ? `${percent(probabilities.win)} win · ${percent(probabilities.tie)} tie`
                    : 'running visible-card simulations'}
                </small>
              </div>
              <div>
                <span>{actionLabel} expected value</span>
                <strong className={ev >= 0 ? 'positive' : 'negative'}>
                  {analysis ? format(ev) : '…'} <em>chips</em>
                </strong>
                <small>break-even {percent(threshold)}</small>
              </div>
            </div>
            <div
              className="outcome-distribution"
              aria-label="Simulated outcome distribution"
            >
              <span
                className="win"
                style={{ width: `${probabilities.win * 100}%` }}
              />
              <span
                className="tie"
                style={{ width: `${probabilities.tie * 100}%` }}
              />
              <span
                className="loss"
                style={{ width: `${probabilities.loss * 100}%` }}
              />
            </div>
            <div className="distribution-key">
              <span>
                <i className="win" />
                Win {percent(probabilities.win)}
              </span>
              <span>
                <i className="tie" />
                Tie {percent(probabilities.tie)}
              </span>
              <span>
                <i className="loss" />
                Lose {percent(probabilities.loss)}
              </span>
            </div>
            <div className="quant-grid">
              <div>
                <Gauge size={16} />
                <span>
                  PRICE OF 1% EQUITY<small>EV sensitivity</small>
                </span>
                <strong>{deltaPerPoint.toFixed(1)} chips</strong>
              </div>
              <div>
                <Waves size={16} />
                <span>
                  NEXT-CARD VOLATILITY<small>dispersion in equity</small>
                </span>
                <strong>
                  {analysis?.nextCardVolatility == null
                    ? cardsToCome
                      ? 'flop pending'
                      : 'settled'
                    : percent(analysis.nextCardVolatility)}
                </strong>
              </div>
              <div>
                <TimerReset size={16} />
                <span>
                  INFORMATION CLOCK<small>public cards left</small>
                </span>
                <strong>{cardsToCome}</strong>
              </div>
              <div>
                <Layers3 size={16} />
                <span>
                  BANKROLL EXPOSED<small>position sizing</small>
                </span>
                <strong>
                  {exposure ? percent(bankrollExposure) : 'no risk'}
                </strong>
              </div>
            </div>
            {analysis?.bestNextCards.length ? (
              <div className="card-sensitivity">
                <div>
                  <span className="eyebrow">NEXT-CARD SENSITIVITY</span>
                  <small>Select a card to reprice every lens.</small>
                </div>
                <div className="sensitivity-row">
                  <span>Best shifts</span>
                  {analysis.bestNextCards.map((item) => (
                    <button
                      key={cardLabel(item.card)}
                      onClick={() =>
                        setNextCard({ key: boardKey, value: item })
                      }
                      aria-label={`Model ${cardLabel(item.card)} as the next card`}
                    >
                      {cardLabel(item.card)} <em>{percent(item.equity)}</em>
                    </button>
                  ))}
                </div>
                <div className="sensitivity-row">
                  <span>Worst shifts</span>
                  {analysis.worstNextCards.map((item) => (
                    <button
                      key={cardLabel(item.card)}
                      onClick={() =>
                        setNextCard({ key: boardKey, value: item })
                      }
                      aria-label={`Model ${cardLabel(item.card)} as the next card`}
                    >
                      {cardLabel(item.card)} <em>{percent(item.equity)}</em>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="insight-card">
              <div className="insight-icon">
                <Lightbulb size={18} />
              </div>
              <div>
                <h4>
                  {action === 'fold'
                    ? 'Folding limits future exposure to zero.'
                    : ev >= 0
                      ? 'The terrain says this scenario has positive average value.'
                      : 'The cost sits above your modeled break-even frontier.'}
                </h4>
                <p>
                  The pulsing point is this hand. Purple is negative EV, green
                  is positive EV, and the zero grid is the frontier. Rotate it,
                  point anywhere, then change your modeled action to watch the
                  economics reprice.
                </p>
              </div>
            </div>
          </>
        )}

        {lens === 'options' && (
          <>
            <div className="option-map">
              <div>
                <span>POKER STATE</span>
                <strong>{percent(equity)} estimated claim probability</strong>
                <small>from only visible cards</small>
              </div>
              <ArrowRight size={17} />
              <div>
                <span>MARKET LENS</span>
                <strong>{exposure} premium-like cost</strong>
                <small>for a claim on the {pot}-chip pot</small>
              </div>
            </div>
            <div className="finance-metrics compact">
              <div>
                <span>Exercise frontier</span>
                <strong>{percent(decisionBreakEven(model))}</strong>
                <small>probability where best-choice EV turns positive</small>
              </div>
              <div>
                <span>Choice value now</span>
                <strong className="positive">{format(Math.max(0, ev))}</strong>
                <small>max(fold EV, {actionLabel.toLowerCase()} EV)</small>
              </div>
            </div>
            <div className="greeks-table">
              <div>
                <span>Δ DELTA-LIKE</span>
                <strong>{deltaPerPoint.toFixed(1)} chips / 1%</strong>
                <p>
                  How fast your decision EV moves when estimated equity moves.
                  This is literal local sensitivity, not an option Greek.
                </p>
              </div>
              <div>
                <span>σ VOLATILITY</span>
                <strong>
                  {analysis?.nextCardVolatility == null
                    ? cardsToCome
                      ? 'Flop pending'
                      : 'No reveal left'
                    : percent(analysis.nextCardVolatility)}
                </strong>
                <p>
                  How widely the next public card can reprice your equity.
                  Markets price distributions, not only averages.
                </p>
              </div>
              <div>
                <span>τ TIME / INFORMATION</span>
                <strong>
                  {cardsToCome} reveal{cardsToCome === 1 ? '' : 's'}
                </strong>
                <p>
                  Poker has a finite information clock. Unlike financial
                  options, you cannot continuously trade the hand.
                </p>
              </div>
              <div>
                <span>Γ CONVEXITY</span>
                <strong>The kink at EV = 0</strong>
                <p>
                  The option to fold clips the modeled decision value at zero
                  before you commit. Once you call, the loss is real.
                </p>
              </div>
            </div>
            <div className="insight-card">
              <div className="insight-icon">
                <Crosshair size={18} />
              </div>
              <div>
                <h4>This is a contingent claim—not a traded call option.</h4>
                <p>
                  Your call pays differently depending on a future state: win,
                  tie, or lose. The 3D surface maps the value of choosing
                  between folding and continuing as equity and price change. It
                  does not pretend poker has a stock price, Black–Scholes
                  dynamics, or continuous hedging.
                </p>
              </div>
            </div>
          </>
        )}

        {lens === 'insurance' && (
          <>
            <div className="model-control coverage-control">
              <label htmlFor="coverage">
                Hypothetical coverage of {actionLabel.toLowerCase()} exposure{' '}
                <strong>{Math.round(coverageFraction * 100)}%</strong>
              </label>
              <input
                id="coverage"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={coverageFraction}
                disabled={!exposure}
                onChange={(event) =>
                  setCoverageFraction(Number(event.target.value))
                }
              />
              <small>
                This overlay teaches risk transfer. No policy is available and
                your poker balance is unchanged.
              </small>
            </div>
            <div className="risk-transfer">
              <div>
                <span>UNHEDGED BAD STATE</span>
                <strong>−{exposure.toFixed(0)}</strong>
                <div className="risk-bar">
                  <i style={{ width: exposure ? '100%' : '0%' }} />
                </div>
              </div>
              <ArrowRight size={18} />
              <div>
                <span>AFTER FAIR PROTECTION</span>
                <strong>
                  −{Math.max(0, exposure - coverage + premium).toFixed(1)}
                </strong>
                <div className="risk-bar protected">
                  <i
                    style={{
                      width: `${exposure ? Math.min(100, ((exposure - coverage + premium) / exposure) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="finance-metrics compact">
              <div>
                <span>Actuarially fair premium</span>
                <strong>
                  {premium.toFixed(1)} <em>chips</em>
                </strong>
                <small>
                  {percent(lossProbability)} loss probability ×{' '}
                  {coverage.toFixed(0)} coverage
                </small>
              </div>
              <div>
                <span>Payoff dispersion</span>
                <strong>{hedgedVolatility.toFixed(1)}</strong>
                <small>down from {unhedgedVolatility.toFixed(1)} chips</small>
              </div>
            </div>
            {allIn && (
              <div className="finance-metrics compact">
                <div>
                  <span>Illustrative all-in cashout</span>
                  <strong>
                    {allIn.cashoutPayout.toFixed(1)} <em>chips paid</em>
                  </strong>
                  <small>
                    1% fee · net EV {format(allIn.cashoutEV)} vs{' '}
                    {format(allIn.showdownEV)} at showdown
                  </small>
                </div>
                <div>
                  <span>Run-twice dispersion</span>
                  <strong>{allIn.runTwiceDeviation.toFixed(1)}</strong>
                  <small>
                    down from {allIn.runOnceDeviation.toFixed(1)} · same EV
                  </small>
                </div>
                <div>
                  <span>Full Kelly ceiling</span>
                  <strong>{percent(fullKelly)}</strong>
                  <small>
                    known, repeatable edge assumption · not a shove target
                  </small>
                </div>
              </div>
            )}
            <div className="insight-card">
              <div className="insight-icon">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h4>Cashout protection resembles insurance—not a CDS price.</h4>
                <p>
                  The hypothetical policy transfers {coverage.toFixed(0)} chips
                  in the losing state and charges its expected payout up front.
                  That contingent-payment shape also appears in credit default
                  swaps. Cashing out instead sells the whole pot claim,
                  including its upside. A real CDS adds a reference entity,
                  default timing, recovery, discounting, collateral, and
                  counterparty risk; none is modeled here.
                </p>
              </div>
            </div>
          </>
        )}

        <button
          className="assumptions-toggle"
          aria-expanded={showAssumptions}
          onClick={() => setShowAssumptions(!showAssumptions)}
        >
          <CircleHelp size={13} /> Model notes, uncertainty & limits{' '}
          <ChevronDown size={14} className={showAssumptions ? 'rotated' : ''} />
        </button>
        {showAssumptions && (
          <div className="assumptions">
            <p>
              Equity comes from 2,000 uniformly random legal opponent hands and
              runouts using only your cards and the public board. Ties count as
              half. The worst-case approximate 95% sampling margin is ±2.2
              percentage points; opponent-range error can be much larger.
            </p>
            <p>
              Call EV assumes no later betting or rake. Raise EV adds an
              explicit, adjustable fold-probability scenario and assumes Atlas
              calls the rest; it is not an inferred read. Next-card sensitivity
              conditions on each legal single next card with smaller
              simulations, so those figures are directional and noisier.
            </p>
            <p>
              Optionality and insurance are structural analogies grounded in
              this hand’s pot, price, equity, and exposure. They are not market
              prices, tradable products, measured asset correlations, or
              financial advice.
            </p>
            <p>
              The all-in preview treats the selected exposure as terminal,
              compresses ties into showdown equity, assumes a 1% cashout fee,
              and treats two half-pot runouts as independent. Its Kelly ceiling
              assumes the same known edge and payoff repeat indefinitely. Real
              poker offers, shared-deck boards, estimation error, and changing
              opponents violate those assumptions.
            </p>
          </div>
        )}
        <button className="lesson-link" onClick={() => onLesson(lens)}>
          <span>
            <BookOpen size={16} /> Learn the concept behind this lens
          </span>
          <ArrowRight size={17} />
        </button>
        <div
          className="curriculum-connections"
          aria-label="Related curriculum modules"
        >
          <strong>Take this hand further</strong>
          {lens === 'equity' ? (
            <>
              <a href="#learn/module/odds/learn">
                Pot odds → expected payoff <ArrowRight size={14} />
              </a>
              <a href="#learn/module/outs/learn">
                Outs → possible future states <ArrowRight size={14} />
              </a>
              <a href="#learn/module/equity/learn">
                Equity → probability weights <ArrowRight size={14} />
              </a>
            </>
          ) : lens === 'options' ? (
            <>
              <a href="#learn/module/fold/learn">
                Fold equity → response trees <ArrowRight size={14} />
              </a>
              <a href="#learn/module/pricing/learn">
                Expected value → risk-neutral pricing <ArrowRight size={14} />
              </a>
              <a href="#learn/module/replication/learn">
                Replication → delta & parity <ArrowRight size={14} />
              </a>
            </>
          ) : (
            <>
              <a href="#learn/module/variance/learn">
                Variance → implied volatility <ArrowRight size={14} />
              </a>
              <a href="#learn/module/replication/learn">
                Hedging → payoff replication <ArrowRight size={14} />
              </a>
              <a href="#learn/module/risk/learn">
                All-in risk → cashout, Kelly & CDS <ArrowRight size={14} />
              </a>
            </>
          )}
          <small>
            Your hand pauses while you learn. These are teaching connections,
            not pricing equivalences.
          </small>
        </div>
        <div className="panel-footnote">
          <ArrowDownRight size={12} /> One hand. Three professional ways to
          frame uncertainty.
        </div>
      </div>
      {expanded && (
        <Modal title={titles[lens]} onClose={() => setExpanded(false)} wide>
          <div className="expanded-surface">{graph}</div>
          <p className="modal-note">
            Drag to rotate, point at scenarios, and change the action controls
            behind the model. The pulsing point is your live hand; the zero
            plane separates value from cost.
          </p>
        </Modal>
      )}
    </aside>
  )
}
