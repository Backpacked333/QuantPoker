import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { STYLES } from '../../lib/atlas'
import type { AtlasStyle } from '../../lib/atlas'
import {
  breakEvenEquity,
  callEV,
  fairPremium,
  optionProfit,
} from '../../lib/finance'
import { gridLabel } from '../../lib/model'
import { preflopRangeAfter } from '../../lib/range'
import { lcg } from '../../lib/sim'

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const signed = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}`

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="w-slider">
      <span>
        {label} <b>{format(value)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Widget({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="widget">
      <span className="label">Try it · {title}</span>
      {children}
    </div>
  )
}

export function EVWidget() {
  const [pot, setPot] = useState(160)
  const [call, setCall] = useState(40)
  const [equity, setEquity] = useState(0.3)
  const ev = callEV(equity, pot, call)
  const need = breakEvenEquity(pot, call)
  return (
    <Widget title="expected value of a call">
      <Slider
        label="Pot"
        value={pot}
        min={20}
        max={400}
        step={10}
        onChange={setPot}
      />
      <Slider
        label="Cost to call"
        value={call}
        min={0}
        max={300}
        step={10}
        onChange={setCall}
      />
      <Slider
        label="Your equity"
        value={equity}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={setEquity}
      />
      <div className="w-result">
        <div>
          <span className="label">EV of calling</span>
          <strong className={ev >= 0 ? 'positive' : 'negative'}>
            {signed(ev)} chips
          </strong>
        </div>
        <div>
          <span className="label">Break-even equity</span>
          <strong>{pct(need)}</strong>
        </div>
      </div>
      <p className="w-formula">
        {equity.toFixed(2)} × {pot} − {(1 - equity).toFixed(2)} × {call} ={' '}
        {signed(ev)}
      </p>
    </Widget>
  )
}

export function OutsWidget() {
  const [outs, setOuts] = useState(9)
  const [toCome, setToCome] = useState<1 | 2>(2)
  const unseen = toCome === 2 ? 47 : 46
  const exact =
    toCome === 1
      ? outs / unseen
      : 1 - ((unseen - outs) * (unseen - outs - 1)) / (unseen * (unseen - 1))
  const rule = Math.min(1, (outs * (toCome === 2 ? 4 : 2)) / 100)
  return (
    <Widget title="outs to equity">
      <Slider label="Outs" value={outs} min={1} max={20} onChange={setOuts} />
      <div className="w-toggle" role="group" aria-label="Cards to come">
        {([2, 1] as const).map((n) => (
          <button
            key={n}
            className={toCome === n ? 'on' : ''}
            aria-pressed={toCome === n}
            onClick={() => setToCome(n)}
          >
            {n === 2
              ? 'On the flop (2 cards to come)'
              : 'On the turn (1 card to come)'}
          </button>
        ))}
      </div>
      <div className="w-result">
        <div>
          <span className="label">Exact chance to hit</span>
          <strong>{pct(exact)}</strong>
        </div>
        <div>
          <span className="label">Rule of {toCome === 2 ? 4 : 2}</span>
          <strong>{pct(rule)}</strong>
        </div>
      </div>
      <p className="w-formula">
        {toCome === 1
          ? `${outs} ÷ ${unseen} unseen cards`
          : `1 − (${unseen - outs}/${unseen} × ${unseen - outs - 1}/${unseen - 1})`}
      </p>
    </Widget>
  )
}

export function VarianceWidget() {
  const [hands, setHands] = useState(100)
  const [seed, setSeed] = useState(1)
  const equity = 0.22,
    pot = 160,
    call = 40
  const ev = callEV(equity, pot, call)
  const paths = useMemo(() => {
    const random = lcg(seed * 7919 + hands)
    return Array.from({ length: 6 }, () => {
      let total = 0
      const line = [0]
      for (let i = 0; i < hands; i++) {
        total += random() < equity ? pot : -call
        line.push(total)
      }
      return line
    })
  }, [hands, seed])
  const all = paths.flat()
  const lo = Math.min(0, ...all),
    hi = Math.max(ev * hands, ...all)
  const w = 520,
    h = 170
  const x = (i: number) => 8 + (i / hands) * (w - 16)
  const y = (v: number) => 8 + ((hi - v) / (hi - lo || 1)) * (h - 16)
  const losing = paths.filter((p) => p[p.length - 1] < 0).length
  return (
    <Widget title="the same +EV call, repeated">
      <p className="w-copy">
        Call 40 into 160 with 22% equity: a small edge of +{ev.toFixed(1)} chips
        every time. Six players make that exact call {hands} times.
      </p>
      <div className="w-toggle" role="group" aria-label="Number of hands">
        {[10, 100, 1000].map((n) => (
          <button
            key={n}
            className={hands === n ? 'on' : ''}
            aria-pressed={hands === n}
            onClick={() => setHands(n)}
          >
            {n} hands
          </button>
        ))}
        <button
          onClick={() => setSeed(seed + 1)}
          aria-label="Run the simulation again"
        >
          <RefreshCw size={13} /> Again
        </button>
      </div>
      <svg
        className="chart"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${losing} of 6 simulated players are behind after ${hands} hands despite a positive expected value.`}
      >
        <line className="zero-line" x1={8} x2={w - 8} y1={y(0)} y2={y(0)} />
        <line
          className="ev-line"
          x1={x(0)}
          y1={y(0)}
          x2={x(hands)}
          y2={y(ev * hands)}
        />
        {paths.map((p, i) => (
          <path
            key={i}
            className="sim-path"
            d={p
              .filter(
                (_, j) =>
                  hands <= 200 ||
                  j % Math.ceil(hands / 200) === 0 ||
                  j === hands,
              )
              .map(
                (v, j, arr) =>
                  `${j ? 'L' : 'M'}${x((j / (arr.length - 1)) * hands)},${y(v)}`,
              )
              .join(' ')}
          />
        ))}
      </svg>
      <p className="w-formula">
        {losing} of 6 are behind after {hands} hands. The dashed line is the
        expectation.
      </p>
    </Widget>
  )
}

export function RangeWidget() {
  const [style, setStyle] = useState<AtlasStyle>('balanced')
  const grids = useMemo(
    () => ({
      raise: preflopRangeAfter('raise', style),
      passive: preflopRangeAfter('passive', style),
    }),
    [style],
  )
  const grid = (weights: number[], title: string) => (
    <div>
      <span className="label">{title}</span>
      <div className="range-grid mini">
        {weights.map((w, i) => (
          <span
            key={i}
            className={`range-cell ${i % 14 === 0 ? 'pair' : ''}`}
            style={{ '--w': w.toFixed(3) } as CSSProperties}
            title={gridLabel(i)}
          />
        ))}
      </div>
    </div>
  )
  return (
    <Widget title="how an action reshapes a range">
      <div className="w-toggle" role="group" aria-label="Atlas style">
        {(Object.keys(STYLES) as AtlasStyle[]).map((key) => (
          <button
            key={key}
            className={style === key ? 'on' : ''}
            aria-pressed={style === key}
            onClick={() => setStyle(key)}
          >
            {STYLES[key].label}
          </button>
        ))}
      </div>
      <div className="w-grids">
        {grid(grids.raise, 'Hands that open with a raise')}
        {grid(grids.passive, 'Hands that just call or check')}
      </div>
      <p className="w-formula">
        Darker cells are more likely. Strong hands raise more often; bluffs keep
        the raising range from being pure strength.
      </p>
    </Widget>
  )
}

export function OptionWidget() {
  const [price, setPrice] = useState(130)
  const [premium, setPremium] = useState(10)
  const strike = 100
  const w = 520,
    h = 150
  const xs = Array.from({ length: 61 }, (_, i) => 50 + i * 2)
  const lo = -premium - 5,
    hi = 100 - premium + 5
  const x = (v: number) => 10 + ((v - 50) / 120) * (w - 20)
  const y = (v: number) => 8 + ((hi - v) / (hi - lo)) * (h - 16)
  const profit = optionProfit(price, strike, premium)
  return (
    <Widget title="a call option at expiration">
      <Slider
        label="Price at expiration"
        value={price}
        min={50}
        max={170}
        onChange={setPrice}
      />
      <Slider
        label="Premium paid"
        value={premium}
        min={0}
        max={30}
        onChange={setPremium}
      />
      <svg
        className="chart"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Payoff ${signed(profit)} at price ${price} with strike ${strike} and premium ${premium}.`}
      >
        <line className="zero-line" x1={10} x2={w - 10} y1={y(0)} y2={y(0)} />
        <line
          className="grid-line"
          x1={x(strike)}
          x2={x(strike)}
          y1={8}
          y2={h - 8}
        />
        <path
          className="series actual"
          d={xs
            .map(
              (v, i) =>
                `${i ? 'L' : 'M'}${x(v)},${y(optionProfit(v, strike, premium))}`,
            )
            .join(' ')}
        />
        <circle
          className="series-end actual"
          cx={x(price)}
          cy={y(profit)}
          r="5"
        />
        <text className="axis-text" x={x(strike) + 4} y={16}>
          strike 100
        </text>
      </svg>
      <div className="w-result">
        <div>
          <span className="label">Net profit</span>
          <strong className={profit >= 0 ? 'positive' : 'negative'}>
            {signed(profit)}
          </strong>
        </div>
        <div>
          <span className="label">Break-even price</span>
          <strong>{strike + premium}</strong>
        </div>
      </div>
    </Widget>
  )
}

export function InsuranceWidget() {
  const [probability, setProbability] = useState(0.2)
  const [coverage, setCoverage] = useState(200)
  const loss = 200
  const premium = fairPremium(probability, coverage)
  const bad = -loss + coverage - premium
  const good = -premium
  const mean = probability * bad + (1 - probability) * good
  const spread = Math.sqrt(
    probability * (bad - mean) ** 2 + (1 - probability) * (good - mean) ** 2,
  )
  const scale = loss + 40
  const bar = (v: number, label: string) => (
    <div className="ins-row">
      <span>{label}</span>
      <span className="ins-track">
        <i
          style={{ width: `${(Math.abs(v) / scale) * 100}%` }}
          className={v < 0 ? 'neg' : 'pos'}
        />
      </span>
      <b>{v.toFixed(0)}</b>
    </div>
  )
  return (
    <Widget title="fair insurance on a 200-chip loss">
      <Slider
        label="Chance of the loss"
        value={probability}
        min={0.01}
        max={0.6}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={setProbability}
      />
      <Slider
        label="Coverage"
        value={coverage}
        min={0}
        max={200}
        step={10}
        onChange={setCoverage}
      />
      {bar(-loss, 'Bad state, no cover')}
      {bar(bad, 'Bad state, insured')}
      {bar(good, 'Good state, insured')}
      <div className="w-result">
        <div>
          <span className="label">Fair premium</span>
          <strong>{premium.toFixed(1)}</strong>
        </div>
        <div>
          <span className="label">Expected result</span>
          <strong>{mean.toFixed(1)}</strong>
        </div>
        <div>
          <span className="label">Spread</span>
          <strong>{spread.toFixed(1)}</strong>
        </div>
      </div>
      <p className="w-formula">
        The expected result stays at −{(probability * loss).toFixed(0)} whatever
        the coverage. Only the spread moves.
      </p>
    </Widget>
  )
}
