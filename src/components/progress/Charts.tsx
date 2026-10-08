type Series = { label: string; className: string; values: number[] }

const niceTicks = (min: number, max: number) => {
  const span = max - min || 1
  const step = 10 ** Math.floor(Math.log10(span / 3))
  const unit = [1, 2, 5, 10].map((m) => m * step).find((s) => span / s <= 5)!
  const ticks: number[] = []
  for (let v = Math.ceil(min / unit) * unit; v <= max + 1e-9; v += unit)
    ticks.push(Math.round(v * 1000) / 1000 || 0)
  return ticks
}

export function LineChart({
  series,
  width = 560,
  height = 180,
  label,
  format = (v: number) => v.toLocaleString('en-US'),
}: {
  series: Series[]
  /** viewBox width; match it roughly to the slot so labels stay ~12px. */
  width?: number
  height?: number
  label: string
  format?: (v: number) => string
}) {
  const w = width,
    h = height,
    pad = { l: 46, r: 12, t: 12, b: 24 }
  const all = series.flatMap((s) => s.values)
  const n = Math.max(...series.map((s) => s.values.length))
  if (n < 2) return null
  const min = Math.min(0, ...all),
    max = Math.max(0, ...all)
  const ticks = niceTicks(min, max)
  const lo = Math.min(min, ticks[0]),
    hi = Math.max(max, ticks[ticks.length - 1])
  const x = (i: number) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r)
  const y = (v: number) =>
    pad.t + ((hi - v) / (hi - lo || 1)) * (h - pad.t - pad.b)
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`${label}. ${series
        .map(
          (s) => `${s.label} ends at ${format(s.values[s.values.length - 1])}`,
        )
        .join('; ')}`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            className={t === 0 ? 'zero-line' : 'grid-line'}
            x1={pad.l}
            x2={w - pad.r}
            y1={y(t)}
            y2={y(t)}
          />
          <text
            className="axis-text"
            x={pad.l - 8}
            y={y(t) + 3}
            textAnchor="end"
          >
            {format(t)}
          </text>
        </g>
      ))}
      <text className="axis-text" x={pad.l} y={h - 6}>
        Hand 1
      </text>
      <text className="axis-text" x={w - pad.r} y={h - 6} textAnchor="end">
        Hand {n}
      </text>
      {series.map((s) => (
        <path
          key={s.label}
          className={`series ${s.className}`}
          d={s.values
            .map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`)
            .join(' ')}
        />
      ))}
      {series.map((s) => (
        <circle
          key={`${s.label}-end`}
          className={`series-end ${s.className}`}
          cx={x(s.values.length - 1)}
          cy={y(s.values[s.values.length - 1])}
          r="3.5"
        />
      ))}
    </svg>
  )
}

export function Scatter({ points }: { points: { x: number; y: number }[] }) {
  const size = 230,
    pad = 38
  const s = (v: number) => pad + v * (size - pad * 1.5)
  const yy = (v: number) => size - pad - v * (size - pad * 1.5)
  return (
    <svg
      className="chart scatter"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Your equity reads against the model across ${points.length} decisions. Points above the diagonal are overestimates.`}
    >
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line
            className="grid-line"
            x1={s(0)}
            x2={s(1)}
            y1={yy(v)}
            y2={yy(v)}
          />
          <line
            className="grid-line"
            x1={s(v)}
            x2={s(v)}
            y1={yy(0)}
            y2={yy(1)}
          />
          <text className="axis-text" x={s(v)} y={size - 8} textAnchor="middle">
            {Math.round(v * 100)}%
          </text>
          <text
            className="axis-text"
            x={pad - 6}
            y={yy(v) + 3}
            textAnchor="end"
          >
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      <line className="diagonal" x1={s(0)} y1={yy(0)} x2={s(1)} y2={yy(1)} />
      {points.map((p, i) => (
        <circle key={i} className="dot" cx={s(p.x)} cy={yy(p.y)} r="4" />
      ))}
    </svg>
  )
}
