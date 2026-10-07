import { lazy, Suspense, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  CircleHelp,
  Lightbulb,
  Maximize2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import {
  breakEvenEquity,
  callEV,
  fairPremium,
  insuranceProfit,
  optionProfit,
} from '../lib/finance'
import type { Lens } from '../lib/finance'
import type { Game } from '../lib/poker'
import { Modal } from './Modal'

const Surface = lazy(() => import('./Surface'))
const format = (value: number) =>
  `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(1)}`
const titles = {
  equity: 'The value of a decision.',
  options: 'Pay a little. Keep the upside.',
  insurance: 'Trade uncertainty for a cost.',
}

function PayoffLine({ values, label }: { values: number[]; label: string }) {
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values)
  const y = (value: number) => 60 - ((value - min) / (max - min || 1)) * 49
  const points = values
    .map((v, i) => `${8 + (i / (values.length - 1)) * 340},${y(v)}`)
    .join(' ')
  return (
    <svg
      className="payoff-line"
      viewBox="0 0 356 70"
      role="img"
      aria-label={label}
    >
      <line
        x1="8"
        x2="348"
        y1={y(0)}
        y2={y(0)}
        stroke="#b8c5bc"
        strokeDasharray="3 4"
      />
      <polyline
        points={points}
        fill="none"
        stroke="#28765e"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function FinancePanel({
  game,
  equity,
  lens,
  onLens,
  onLesson,
}: {
  game: Game
  equity: number | null
  lens: Lens
  onLens: (lens: Lens) => void
  onLesson: (lens: Lens) => void
}) {
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [price, setPrice] = useState(120)
  const [coverage, setCoverage] = useState(100)
  const [scenarioLoss, setScenarioLoss] = useState(120)
  const call = Math.min(
    Math.max(0, game.bets[1] - game.bets[0]),
    game.stacks[0],
  )
  const ended = Boolean(game.result)
  const pot = ended ? game.invested[0] + game.invested[1] : game.pot
  const e = equity ?? 0
  const ev = callEV(e, pot, call)
  const threshold = breakEvenEquity(pot, call)
  const insurancePremium = fairPremium(0.2, coverage)
  const point =
    lens === 'equity'
      ? equity === null
        ? null
        : { x: equity, z: pot > 0 ? call / pot / 2 : 0 }
      : lens === 'options'
        ? { x: price / 200, z: 100 / 160 }
        : { x: scenarioLoss / 200, z: coverage / 200 }
  const graph = (
    <Suspense
      fallback={<div className="graph-loading">Building your model…</div>}
    >
      <Surface lens={lens} point={point} />
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
          <Sparkles size={15} /> THE FINANCE LENS
        </span>
        <span className="live-pill">
          <i />{' '}
          {lens === 'equity' ? 'Live with your hand' : 'Interactive sandbox'}
        </span>
      </div>
      <div className="panel-heading">
        <div>
          <h2>
            A little poker.
            <br />A bigger perspective.
          </h2>
          <p>The same mathematics. A new way to see it.</p>
        </div>
        <button
          className="icon-button help-button"
          aria-label="Explain model assumptions"
          onClick={() => setShowAssumptions(!showAssumptions)}
        >
          <CircleHelp size={18} />
        </button>
      </div>
      <div
        className="lens-tabs"
        role="tablist"
        aria-label="Finance lens"
        onKeyDown={navigateTabs}
      >
        <button
          id="tab-equity"
          role="tab"
          aria-selected={lens === 'equity'}
          tabIndex={lens === 'equity' ? 0 : -1}
          aria-controls="lens-content"
          onClick={() => onLens('equity')}
          className={lens === 'equity' ? 'selected' : ''}
        >
          <TrendingUp size={15} /> Expected value
        </button>
        <button
          id="tab-options"
          role="tab"
          aria-selected={lens === 'options'}
          tabIndex={lens === 'options' ? 0 : -1}
          aria-controls="lens-content"
          onClick={() => onLens('options')}
          className={lens === 'options' ? 'selected' : ''}
        >
          <ArrowUpRight size={15} /> Options
        </button>
        <button
          id="tab-insurance"
          role="tab"
          aria-selected={lens === 'insurance'}
          tabIndex={lens === 'insurance' ? 0 : -1}
          aria-controls="lens-content"
          onClick={() => onLens('insurance')}
          className={lens === 'insurance' ? 'selected' : ''}
        >
          <ShieldCheck size={15} /> Insurance
        </button>
      </div>
      <div id="lens-content" role="tabpanel" aria-labelledby={`tab-${lens}`}>
        <div className="model-title">
          <div>
            <span className="eyebrow">
              {lens === 'equity'
                ? 'PROBABILITY × PAYOFF'
                : lens === 'options'
                  ? 'ASYMMETRIC PAYOFFS'
                  : 'THE PRICE OF PROTECTION'}
            </span>
            <h3>{titles[lens]}</h3>
          </div>
          <button
            className="icon-button"
            aria-label="Expand 3D model"
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
                <span>Est. showdown equity</span>
                <strong>
                  {equity === null ? '…' : `${(e * 100).toFixed(1)}%`}
                </strong>
                <small>vs. a random hand</small>
              </div>
              <div>
                <span>
                  {ended
                    ? 'Hand result'
                    : call
                      ? 'Call expected value'
                      : 'Check-down pot share'}
                </span>
                <strong
                  className={
                    ended
                      ? game.result!.net >= 0
                        ? 'positive'
                        : 'negative'
                      : ev >= 0
                        ? 'positive'
                        : 'negative'
                  }
                >
                  {ended
                    ? format(game.result!.net)
                    : equity === null
                      ? '…'
                      : format(ev)}
                  <em> chips</em>
                </strong>
                <small>
                  {ended
                    ? 'Realized, not expected'
                    : call
                      ? 'If no more bets follow'
                      : 'Not guaranteed profit'}
                </small>
              </div>
            </div>
            <div className="insight-card">
              <div className="insight-icon">
                <Lightbulb size={18} />
              </div>
              <div>
                <h4>
                  {ended
                    ? 'Good decisions ≠ guaranteed wins.'
                    : call
                      ? 'You’re buying a chance, not a win.'
                      : 'Checking keeps your options open.'}
                </h4>
                <p>
                  {ended ? (
                    'A single result is noisy. Expected value describes an average across many repetitions—not what the next hand will do.'
                  ) : call ? (
                    <>
                      Calling costs <b>{call}</b> to compete for{' '}
                      <b>{pot + call}</b>. You need{' '}
                      <b>{(threshold * 100).toFixed(1)}%</b> equity to break
                      even if there’s no more betting.{' '}
                      {equity !== null
                        ? `Your random-opponent estimate is ${e >= threshold ? 'above' : 'below'} that hurdle.`
                        : ''}
                    </>
                  ) : (
                    'There is no bet to match. You can see what happens next for free—or bet to build the pot and put pressure on your opponent.'
                  )}
                </p>
              </div>
            </div>
            <div className="formula">
              <span>{call ? 'EV(call)' : 'Expected pot share'}</span>
              <code>
                {equity === null
                  ? 'Estimating…'
                  : `${e.toFixed(3)} × ${pot}${call ? ` − ${(1 - e).toFixed(3)} × ${call}` : ''} ≈ ${format(ev)}`}
              </code>
            </div>
          </>
        )}
        {lens === 'options' && (
          <>
            <div className="analogy-caption">
              <span className="outline-tag">ILLUSTRATIVE MARKET</span>
              <p>
                A call option buys the right—not the obligation—to buy an asset
                at a fixed price. Your downside is the premium.
              </p>
            </div>
            <div className="slider-label">
              <label htmlFor="asset-price">Asset price at expiration</label>
              <strong>{price}</strong>
            </div>
            <input
              id="asset-price"
              type="range"
              min="40"
              max="180"
              step="1"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
            <PayoffLine
              values={Array.from({ length: 29 }, (_, i) =>
                optionProfit(40 + i * 5, 100, 10),
              )}
              label="Call option expiration profit: flat at minus 10 below strike 100, increasing one for one above strike. Break-even at 110."
            />
            <div className="finance-metrics compact">
              <div>
                <span>Strike / premium</span>
                <strong>
                  100 <em>/ 10</em>
                </strong>
              </div>
              <div>
                <span>Net option profit</span>
                <strong
                  className={
                    optionProfit(price, 100, 10) >= 0 ? 'positive' : 'negative'
                  }
                >
                  {format(optionProfit(price, 100, 10))}
                </strong>
              </div>
            </div>
            <div className="insight-card">
              <div className="insight-icon">
                <ArrowUpRight size={18} />
              </div>
              <div>
                <h4>A poker call is not a call option.</h4>
                <p>
                  Both involve paying now for uncertain upside. But poker has no
                  traded underlying asset or strike price, and later bets can
                  add costs. This chart teaches payoff shape, not poker-based
                  option pricing.
                </p>
              </div>
            </div>
            <div className="formula">
              <span>Profit</span>
              <code>max({price} − 100, 0) − 10</code>
            </div>
          </>
        )}
        {lens === 'insurance' && (
          <>
            <div className="analogy-caption">
              <span className="outline-tag">HYPOTHETICAL PROTECTION</span>
              <p>
                What if you could pay to soften a bad outcome? Explore a
                capped-loss policy. This does not change your poker balance.
              </p>
            </div>
            <div className="slider-label">
              <label htmlFor="coverage">Coverage limit</label>
              <strong>{coverage} chips</strong>
            </div>
            <input
              id="coverage"
              type="range"
              min="0"
              max="200"
              step="10"
              value={coverage}
              onChange={(e) => setCoverage(Number(e.target.value))}
            />
            <div className="slider-label">
              <label htmlFor="scenario-loss">Loss in this scenario</label>
              <strong>{scenarioLoss} chips</strong>
            </div>
            <input
              id="scenario-loss"
              type="range"
              min="0"
              max="200"
              step="10"
              value={scenarioLoss}
              onChange={(e) => setScenarioLoss(Number(e.target.value))}
            />
            <div className="finance-metrics compact">
              <div>
                <span>Fair premium*</span>
                <strong>
                  {insurancePremium.toFixed(0)} <em>chips</em>
                </strong>
              </div>
              <div>
                <span>Net after protection</span>
                <strong className="negative">
                  {format(
                    insuranceProfit(scenarioLoss, coverage, insurancePremium),
                  )}
                </strong>
              </div>
            </div>
            <div className="insight-card">
              <div className="insight-icon">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h4>Less downside. Not free value.</h4>
                <p>
                  *Assume a 20% chance of a 200-chip loss, otherwise no loss. A
                  fair premium equals expected payout: 20% × coverage. Real
                  insurers also charge for expenses, risk, and profit. The 3D
                  model uses these same assumptions.
                </p>
              </div>
            </div>
            <div className="formula">
              <span>Net outcome</span>
              <code>
                −{scenarioLoss} + min({scenarioLoss}, {coverage}) −{' '}
                {insurancePremium}
              </code>
            </div>
          </>
        )}
        <button
          className="assumptions-toggle"
          aria-expanded={showAssumptions}
          onClick={() => setShowAssumptions(!showAssumptions)}
        >
          <CircleHelp size={13} /> Model notes & assumptions{' '}
          <ChevronDown size={14} className={showAssumptions ? 'rotated' : ''} />
        </button>
        {showAssumptions && (
          <div className="assumptions">
            <p>
              Equity uses 2,000 Monte Carlo runouts against uniformly random
              legal opponent cards, splitting ties. Typical 95% sampling error
              is at most about ±2.2 percentage points. It does not read Atlas’s
              cards or infer its range from bets.
            </p>
            <p>
              Call EV assumes no future bets, no rake, and no fold equity. The
              3D EV surface is normalized by the current pot: p − (1 − p) ×
              call/pot. Options show expiration payoff, not Black–Scholes value.
              Models illustrate shared risk concepts, not measured asset
              correlations or investment advice.
            </p>
          </div>
        )}
        <button className="lesson-link" onClick={() => onLesson(lens)}>
          <span>
            <BookOpen size={16} /> Take the 2-minute lesson
          </span>
          <ArrowRight size={17} />
        </button>
        <div className="panel-footnote">
          <ArrowDownRight size={12} /> Understand the decision. Not just the
          outcome.
        </div>
      </div>
      {expanded && (
        <Modal title={titles[lens]} onClose={() => setExpanded(false)} wide>
          <div className="expanded-surface">{graph}</div>
          <p className="modal-note">
            Drag to rotate. Exact formulas and model assumptions are shown in
            the Finance Lens. This is a payoff surface, not a prediction of
            market prices.
          </p>
        </Modal>
      )}
    </aside>
  )
}
