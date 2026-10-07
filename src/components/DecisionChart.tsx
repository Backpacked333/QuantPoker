import { lazy, Suspense, useId } from 'react'
import type { PointerEvent } from 'react'
import {
  Box,
  ChartNoAxesCombined,
  MessageCircle,
  RotateCcw,
} from 'lucide-react'
import {
  decisionBreakEven,
  decisionEV,
  liveSurfaceValue,
  surfaceRiskRange,
} from '../lib/finance'
import type { Lens, SurfaceScenario } from '../lib/finance'

const Surface = lazy(() => import('./Surface'))
export type Probe = { x: number; z: number }
const signed = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`
export function DecisionChart({
  lens,
  scenario,
  probe,
  onProbe,
  view,
  onView,
  markerLabel,
  onAsk,
}: {
  lens: Lens
  scenario: SurfaceScenario
  probe: Probe | null
  onProbe: (point: Probe | null) => void
  view: 'payoff' | 'terrain'
  onView: (view: 'payoff' | 'terrain') => void
  markerLabel: string
  onAsk: (question: string) => void
}) {
  const id = useId().replaceAll(':', '')
  const scale = lens === 'insurance' ? scenario.risk : scenario.pot
  const range = surfaceRiskRange(scenario)
  const actual = {
    x: lens === 'insurance' ? scenario.lossProbability : scenario.equity,
    z:
      lens === 'insurance'
        ? scenario.coverageFraction
        : scenario.risk / (Math.max(1, scenario.pot) * range),
  }
  const selected = probe ?? actual
  const sameExposure = Math.abs(selected.z - actual.z) < 0.000001
  const valueAt = (x: number, z = selected.z) =>
    liveSurfaceValue(lens, x, z, scenario) * scale
  const samples = Array.from({ length: 101 }, (_, i) => ({
    x: i / 100,
    y: valueAt(i / 100),
  }))
  const actualValue = valueAt(actual.x, actual.z)
  const lower = Math.min(0, ...samples.map((p) => p.y))
  const upper = Math.max(1, ...samples.map((p) => p.y))
  const padding = (upper - lower) * 0.17
  const min = lower - padding,
    max = upper + padding
  const px = (x: number) => 62 + x * 622
  const py = (y: number) => 284 - ((y - min) / (max - min)) * 248
  const line = samples
    .map((p, i) => `${i ? 'L' : 'M'}${px(p.x)},${py(p.y)}`)
    .join(' ')
  const area = `${line} L${px(1)},${py(0)} L${px(0)},${py(0)} Z`
  const threshold = decisionBreakEven({
    ...scenario,
    risk: selected.z * Math.max(1, scenario.pot) * range,
  })
  const hasFrontier =
    Math.abs(
      decisionEV(
        { ...scenario, risk: selected.z * Math.max(1, scenario.pot) * range },
        threshold,
      ),
    ) < 0.000001
  const yTitle =
    lens === 'insurance'
      ? 'NET CHIPS IN THE LOSING STATE'
      : lens === 'options'
        ? 'VALUE OF THE CHOICE · CHIPS'
        : 'AVERAGE GAIN / LOSS · CHIPS'
  const pointValue = valueAt(selected.x)
  function inspect(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(
      0,
      Math.min(
        1,
        (((event.clientX - rect.left) / rect.width) * 720 - 62) / 622,
      ),
    )
    onProbe({ x, z: selected.z })
  }
  return (
    <section className="decision-chart" aria-label="Interactive decision model">
      <div className="chart-topline">
        <span>THE SHAPE OF THIS DECISION</span>
        <div aria-label="Graph view">
          <button
            aria-pressed={view === 'payoff'}
            onClick={() => onView('payoff')}
          >
            <ChartNoAxesCombined size={14} /> Payoff
          </button>
          <button
            aria-pressed={view === 'terrain'}
            onClick={() => onView('terrain')}
          >
            <Box size={14} /> 3D terrain
          </button>
        </div>
      </div>
      {view === 'terrain' ? (
        <Suspense
          fallback={
            <div className="graph-loading">Loading the decision terrain…</div>
          }
        >
          <Surface
            lens={lens}
            scenario={scenario}
            markerLabel={markerLabel}
            inspection={probe}
            onInspect={onProbe}
          />
        </Suspense>
      ) : (
        <>
          <div className="plot-heading">
            <span>{yTitle}</span>
            <span>
              {lens === 'insurance'
                ? `${Math.round(selected.z * 100)}% coverage`
                : `${(selected.z * Math.max(1, scenario.pot) * range).toFixed(0)} chips at risk`}
            </span>
          </div>
          <svg
            className="payoff-plot"
            viewBox="0 0 720 336"
            role="slider"
            tabIndex={0}
            aria-label={
              lens === 'insurance'
                ? 'Explore loss probability on the payoff graph'
                : 'Explore showdown equity on the payoff graph'
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(selected.x * 100)}
            aria-valuetext={`${Math.round(selected.x * 100)} percent; ${pointValue.toFixed(1)} modeled chips`}
            onPointerMove={inspect}
            onPointerDown={inspect}
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return
              event.preventDefault()
              onProbe({
                x:
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 1
                      : Math.max(
                          0,
                          Math.min(
                            1,
                            selected.x +
                              (event.key === 'ArrowRight' ? 0.01 : -0.01),
                          ),
                        ),
                z: selected.z,
              })
            }}
          >
            <defs>
              <linearGradient id={`${id}-gain`} x1="0" y1="0" x2="0" y2="1">
                <stop
                  stopColor="var(--learn-positive, #287657)"
                  stopOpacity=".22"
                />
                <stop
                  offset="1"
                  stopColor="var(--learn-positive, #287657)"
                  stopOpacity=".02"
                />
              </linearGradient>
              <clipPath id={`${id}-negative`}>
                <rect x="60" y={py(0)} width="630" height="300" />
              </clipPath>
              <clipPath id={`${id}-positive`}>
                <rect x="60" y="0" width="630" height={py(0)} />
              </clipPath>
            </defs>
            {Array.from(
              { length: 5 },
              (_, i) => min + ((max - min) * i) / 4,
            ).map((value) => (
              <g key={value}>
                <line
                  x1="62"
                  x2="684"
                  y1={py(value)}
                  y2={py(value)}
                  className="plot-grid"
                />
                <text
                  x="51"
                  y={py(value) + 4}
                  textAnchor="end"
                  className="plot-tick"
                >
                  {Math.round(value)}
                </text>
              </g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((value) => (
              <g key={value}>
                <line
                  x1={px(value)}
                  x2={px(value)}
                  y1="36"
                  y2="284"
                  className="plot-grid vertical"
                />
                <text
                  x={px(value)}
                  y="307"
                  textAnchor="middle"
                  className="plot-tick"
                >
                  {value * 100}%
                </text>
              </g>
            ))}
            <path
              d={area}
              fill={`url(#${id}-gain)`}
              clipPath={`url(#${id}-positive)`}
            />
            <path
              d={area}
              fill="var(--learn-negative, #b53860)"
              opacity=".2"
              clipPath={`url(#${id}-negative)`}
            />
            <line
              x1="62"
              x2="684"
              y1={py(0)}
              y2={py(0)}
              className="zero-frontier"
            />
            <text x="688" y={py(0) - 7} textAnchor="end" className="zero-label">
              {lens === 'insurance' ? 'ZERO · NO NET LOSS' : 'ZERO · NO EDGE'}
            </text>
            <path d={line} className="payoff-curve" />
            <path
              d={line}
              className="payoff-curve negative"
              clipPath={`url(#${id}-negative)`}
            />
            {lens !== 'insurance' &&
              scenario.action !== 'fold' &&
              hasFrontier && (
                <g>
                  <line
                    x1={px(threshold)}
                    x2={px(threshold)}
                    y1="39"
                    y2="284"
                    className="break-even-line"
                  />
                  <text
                    x={Math.max(105, Math.min(620, px(threshold)))}
                    y="24"
                    textAnchor="middle"
                    className="break-even-label"
                  >
                    BREAK-EVEN {(threshold * 100).toFixed(1)}%
                  </text>
                </g>
              )}
            {sameExposure && (
              <g>
                <circle
                  className="live-point-halo"
                  cx={px(actual.x)}
                  cy={py(actualValue)}
                  r="13"
                />
                <circle
                  className="live-point"
                  cx={px(actual.x)}
                  cy={py(actualValue)}
                  r="6"
                />
                <text
                  x={Math.max(103, Math.min(615, px(actual.x)))}
                  y={py(actualValue) - 21}
                  textAnchor="middle"
                  className="live-point-label"
                >
                  {markerLabel.toUpperCase()}
                </text>
              </g>
            )}
            {probe && (
              <g>
                <line
                  className="probe-line"
                  x1={px(probe.x)}
                  x2={px(probe.x)}
                  y1="36"
                  y2="284"
                />
                <circle
                  cx={px(probe.x)}
                  cy={py(pointValue)}
                  r="6"
                  className="probe-point"
                />
              </g>
            )}
            <text x="374" y="330" textAnchor="middle" className="plot-axis">
              {lens === 'insurance' ? 'CHANCE OF A LOSS' : 'SHOWDOWN EQUITY'}
            </text>
          </svg>
          <div className="plot-legend">
            {sameExposure && (
              <span>
                <i className="live-key" />
                Your hand
              </span>
            )}
            <span>
              <i className="probe-key" />
              What-if point
            </span>
            <span>Move across the graph · or use arrow keys</span>
          </div>
          {!sameExposure && (
            <p className="off-slice-note">
              Your hand is off this slice: {(actual.z * 100).toFixed(0)}%
              exposure · {signed(actualValue)} chips. The curve uses{' '}
              {(selected.z * 100).toFixed(0)}% exposure.
            </p>
          )}
        </>
      )}
      <div className="point-explanation">
        <div>
          <span>
            {probe
              ? 'THIS IS A WHAT-IF, NOT YOUR ACTUAL ODDS'
              : 'YOUR CURRENT SCENARIO'}
          </span>
          <p>
            At{' '}
            <b>
              {(selected.x * 100).toFixed(1)}%{' '}
              {lens === 'insurance' ? 'loss probability' : 'equity'}
            </b>
            ,{' '}
            {lens === 'insurance'
              ? 'the losing state leaves you with'
              : lens === 'options'
                ? 'the modeled choice is worth'
                : 'the modeled average is'}{' '}
            <strong className={pointValue < 0 ? 'negative' : 'positive'}>
              {signed(pointValue)} chips
            </strong>
            .
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Return graph to actual hand"
          onClick={() => onProbe(null)}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <button
        className="discuss-point"
        onClick={() =>
          onAsk(
            'Explain the point I am inspecting on the graph. What does it mean, and how is it different from my actual hand?',
          )
        }
      >
        <MessageCircle size={14} /> Discuss this point with the coach
      </button>
    </section>
  )
}
