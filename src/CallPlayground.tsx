import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { callEV, breakEvenEquity } from './lib/finance'
import { simulateCalls } from './lib/landingSimulation'
import type { CallSimulation } from './lib/landingSimulation'

const presets = [
  { name: 'A good price', chance: 30, call: 25 },
  { name: 'Too expensive', chance: 15, call: 50 },
  { name: 'On the edge', chance: 20, call: 25 },
] as const

function signed(value: number, decimals = 0) {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

function RunChart({
  result,
  inspect,
  run,
}: {
  result: CallSimulation | null
  inspect: number
  run: number
}) {
  const values = result?.cumulative ?? [0]
  const expected = result?.expectedNet ?? 0
  const low = Math.min(0, ...values, expected)
  const high = Math.max(0, ...values, expected)
  const range = Math.max(100, high - low)
  const x = (i: number) => 35 + i * 4.3
  const y = (value: number) => 184 - ((value - low) / range) * 150
  const path = values
    .map(
      (value, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`,
    )
    .join(' ')
  return (
    <svg
      className="lp-run-chart"
      viewBox="0 0 500 220"
      role="img"
      aria-label={
        result
          ? `Cumulative result of 100 simulated calls: ${signed(result.net)} chips. Expected result: ${signed(expected)} chips. At call ${inspect}: ${signed(values[inspect])} chips.`
          : 'Run the experiment to plot the cumulative result against its expectation.'
      }
    >
      <path
        d="M35 34H465M35 84H465M35 134H465M35 184H465"
        className="lp-run-grid"
      />
      <path d={`M35 ${y(0)}H465`} className="lp-run-zero" />
      <text x="4" y={y(0) + 4}>
        0
      </text>
      <text x="35" y="210">
        CALL 1
      </text>
      <text x="410" y="210">
        CALL 100
      </text>
      {result ? (
        <>
          <path
            d={`M35 ${y(0)}L465 ${y(expected)}`}
            className="lp-run-expected"
          />
          <path key={run} d={path} className="lp-run-actual" pathLength="1" />
          <circle
            cx={x(inspect)}
            cy={y(values[inspect])}
            r="7"
            className="lp-run-marker"
          />
        </>
      ) : (
        <text x="250" y="110" textAnchor="middle" className="lp-chart-empty">
          One decision. One hundred possible outcomes.
        </text>
      )}
    </svg>
  )
}

export default function CallPlayground() {
  const [chance, setChance] = useState(30)
  const [call, setCall] = useState(25)
  const [result, setResult] = useState<CallSimulation | null>(null)
  const [inspect, setInspect] = useState(100)
  const [run, setRun] = useState(0)
  const ev = callEV(chance / 100, 100, call)
  const stale = result && (result.chance !== chance || result.call !== call)
  const simulate = () => {
    setResult(simulateCalls(chance, call))
    setInspect(100)
    setRun((n) => n + 1)
  }

  return (
    <section
      id="experiment"
      className="lp-playground lp-container lp-section lp-reveal"
      aria-labelledby="lp-playground-title"
    >
      <div className="lp-section-heading">
        <div>
          <p className="lp-eyebrow">DON’T JUST READ ABOUT IT. FEEL IT.</p>
          <h2 id="lp-playground-title">
            One hand is luck.
            <br />
            <span>A hundred tell a story.</span>
          </h2>
        </div>
        <p>
          What happens when you make the same call again and again? Change the
          price. Change the probability. Let the outcomes play out.
        </p>
      </div>
      <div className="lp-experiment">
        <div className="lp-experiment-controls">
          <span className="lp-experiment-label">BUILD YOUR EXPERIMENT</span>
          <div
            className="lp-scenarios"
            role="group"
            aria-label="Experiment scenarios"
          >
            {presets.map((preset) => (
              <button
                key={preset.name}
                aria-pressed={chance === preset.chance && call === preset.call}
                onClick={() => {
                  setChance(preset.chance)
                  setCall(preset.call)
                }}
              >
                {preset.name}
              </button>
            ))}
          </div>
          <div className="lp-experiment-input">
            <label htmlFor="lp-run-chance">
              Win chance <span>{chance}%</span>
            </label>
            <input
              id="lp-run-chance"
              type="range"
              min="5"
              max="80"
              value={chance}
              onChange={(event) => setChance(Number(event.target.value))}
            />
          </div>
          <div className="lp-experiment-input">
            <label htmlFor="lp-run-call">
              Cost to call <span>{call} chips</span>
            </label>
            <input
              id="lp-run-call"
              type="range"
              min="5"
              max="80"
              value={call}
              onChange={(event) => setCall(Number(event.target.value))}
            />
          </div>
          <div className="lp-price-breakdown">
            <div>
              <span>Pot before your call</span>
              <strong>100 chips</strong>
            </div>
            <div>
              <span>Break-even win chance</span>
              <strong>{(breakEvenEquity(100, call) * 100).toFixed(1)}%</strong>
            </div>
          </div>
          <div
            className={`lp-experiment-ev${ev < 0 ? ' lp-experiment-negative' : ''}`}
          >
            <span>EXPECTED VALUE / CALL</span>
            <strong>
              {signed(ev, 2)}
              <small> chips</small>
            </strong>
            <p>
              {ev > 0
                ? 'A good price can still lose a hand.'
                : ev < 0
                  ? 'A bad price can still win a hand.'
                  : 'Neither a good nor a bad price. Right at break-even.'}
            </p>
          </div>
          <button
            className="lp-button lp-button-dark lp-run-button"
            onClick={simulate}
          >
            {result ? 'Run another 100 calls' : 'Run 100 calls'}
            {result ? (
              <RotateCcw size={17} aria-hidden="true" />
            ) : (
              <ArrowRight size={17} aria-hidden="true" />
            )}
          </button>
          <p className="lp-experiment-assumptions">
            Independent, simulated calls—not actual poker hands. Win: +100
            chips. Lose: −the call price. No further betting, ties, or rake.
          </p>
        </div>
        <div className="lp-experiment-results">
          <div className="lp-experiment-chart-header">
            <span>THE LONGER VIEW</span>
            <div>
              <span>
                <i /> Actual
              </span>
              <span>
                <i /> Expected
              </span>
            </div>
          </div>
          <RunChart result={result} inspect={inspect} run={run} />
          <div className="lp-outcomes" key={run} aria-hidden="true">
            {Array.from({ length: 100 }, (_, i) => (
              <span
                key={i}
                className={`${result ? (result.outcomes[i] ? 'lp-win' : 'lp-loss') : ''}${result && i + 1 === inspect ? ' lp-inspected' : ''}`}
                style={{ '--lp-cell-delay': `${i * 0.014}s` } as CSSProperties}
                title={
                  result
                    ? `Call ${i + 1}: ${result.outcomes[i] ? 'win' : 'loss'}`
                    : undefined
                }
              />
            ))}
          </div>
          <div className="lp-outcomes-label">
            <span>ONE SQUARE. ONE CALL.</span>
            <span>
              <i /> Win <i /> Loss
            </span>
          </div>
          {result ? (
            <div className="lp-run-inspector">
              <label htmlFor="lp-inspect">
                Inspect call <strong>{inspect}</strong>
              </label>
              <input
                id="lp-inspect"
                type="range"
                min="1"
                max="100"
                value={inspect}
                onChange={(event) => setInspect(Number(event.target.value))}
              />
              <p>
                Call {inspect}:{' '}
                {result.outcomes[inspect - 1]
                  ? '+100 chips'
                  : `−${result.call} chips`}{' '}
                <span>·</span> Running total:{' '}
                <strong>{signed(result.cumulative[inspect])} chips</strong>
              </p>
            </div>
          ) : (
            <p className="lp-run-waiting">
              Set your assumptions, then hit run.
              <br />
              <span>Same decision. Different outcomes. That’s variance.</span>
            </p>
          )}
          <div
            className="lp-run-summary"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {result ? (
              <>
                <div>
                  <span>HANDS WON</span>
                  <strong>
                    {result.wins}
                    <small> / 100</small>
                  </strong>
                </div>
                <div>
                  <span>ACTUAL RESULT</span>
                  <strong>
                    {signed(result.net)}
                    <small> chips</small>
                  </strong>
                </div>
                <div>
                  <span>EXPECTED RESULT</span>
                  <strong>
                    {signed(result.expectedNet)}
                    <small> chips</small>
                  </strong>
                </div>
              </>
            ) : (
              <p>Your results will appear here.</p>
            )}
          </div>
          {result ? (
            <p className="lp-run-context">
              Last run: {result.chance}% win chance, {result.call}-chip call.
              {stale
                ? ' Settings changed—run again to test them.'
                : ' Expected is an average, not a guarantee—even after 100 calls.'}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
