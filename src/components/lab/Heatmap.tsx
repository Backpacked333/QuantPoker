import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Box, Crosshair } from 'lucide-react'
import {
  decisionBreakEven,
  liveSurfaceValue,
  surfaceRiskRange,
} from '../../lib/finance'
import type { Lens, SurfaceScenario } from '../../lib/finance'
import { m } from 'motion/react'
import { spring } from '../../motion'

const AXES: Record<Lens, { x: string; z: string; value: string }> = {
  equity: {
    x: 'Showdown equity',
    z: 'Capital at risk / pot',
    value: 'Decision EV',
  },
  options: { x: 'Showdown equity', z: 'Cost / pot', value: 'Choice value' },
  insurance: { x: 'Loss probability', z: 'Coverage', value: 'Bad-state net' },
}
const N = 64
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const pct = (v: number) => `${Math.round(v * 100)}%`

type RGB = [number, number, number]
function parseColor(value: string, fallback: RGB): RGB {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i)
  if (!hex) return fallback
  const n = parseInt(hex[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

function livePoint(lens: Lens, scenario: SurfaceScenario) {
  return lens === 'insurance'
    ? { x: scenario.lossProbability, z: scenario.coverageFraction }
    : {
        x: clamp(scenario.equity),
        z: clamp(
          scenario.risk /
            (Math.max(1, scenario.pot) * surfaceRiskRange(scenario)),
        ),
      }
}

export function Heatmap({
  lens,
  scenario,
  markerLabel,
  themeKey,
  onExpand,
}: {
  lens: Lens
  scenario: SurfaceScenario
  markerLabel: string
  themeKey: string
  onExpand: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [probe, setProbe] = useState<{ x: number; z: number } | null>(null)
  const range = surfaceRiskRange(scenario)
  const live = livePoint(lens, scenario)
  const point = probe ?? live
  const value = liveSurfaceValue(lens, point.x, point.z, scenario)
  const chipScale = lens === 'insurance' ? scenario.risk : scenario.pot
  const zLabel = (z: number) =>
    lens === 'insurance' ? pct(z) : `${(z * range).toFixed(2)}×`

  useEffect(() => {
    const element = host.current
    if (!element) return
    if (typeof ResizeObserver === 'undefined') {
      // No observer support: size once from layout.
      const rect = element.getBoundingClientRect()
      setSize({ w: Math.round(rect.width), h: Math.round(rect.height) })
      return
    }
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        w: Math.round(entry.contentRect.width),
        h: Math.round(entry.contentRect.height),
      }),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = canvas.current
    if (!element || !size.w || !size.h) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    element.width = size.w * ratio
    element.height = size.h * ratio
    const ctx = element.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    const styles = getComputedStyle(element)
    const low = parseColor(
      styles.getPropertyValue('--heat-low'),
      [151, 116, 199],
    )
    const mid = parseColor(
      styles.getPropertyValue('--heat-mid'),
      [232, 236, 226],
    )
    const high = parseColor(
      styles.getPropertyValue('--heat-high'),
      [52, 150, 112],
    )
    const line = styles.getPropertyValue('--heat-line').trim() || '#20372e'
    const peak = Math.max(
      1e-9,
      ...[0, 1].flatMap((x) =>
        [0, 1].map((z) => Math.abs(liveSurfaceValue(lens, x, z, scenario))),
      ),
    )
    const cw = size.w / N,
      ch = size.h / N
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const x = (i + 0.5) / N,
          z = (j + 0.5) / N
        const v = liveSurfaceValue(lens, x, z, scenario) / peak
        const [r, g, b] =
          v < 0
            ? mix(mid, low, Math.min(1, -v))
            : mix(mid, high, Math.min(1, v))
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`
        ctx.fillRect(i * cw, size.h - (j + 1) * ch, cw + 0.6, ch + 0.6)
      }
    // Zero frontier: break-even equity for each level of capital at risk.
    if (lens !== 'insurance' && scenario.action !== 'fold') {
      ctx.strokeStyle = line
      ctx.lineWidth = 1.6
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      let started = false
      for (let j = 0; j <= 80; j++) {
        const z = j / 80
        const risk = z * Math.max(1, scenario.pot) * range
        const x = decisionBreakEven({ ...scenario, risk })
        if (x <= 0 || x >= 1) {
          started = false
          continue
        }
        const px = x * size.w,
          py = size.h - z * size.h
        if (started) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
        started = true
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [lens, scenario, size, range, themeKey])

  function inspect(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    setProbe({
      x: clamp((event.clientX - rect.left) / rect.width),
      z: clamp(1 - (event.clientY - rect.top) / rect.height),
    })
  }

  return (
    <div className="heatmap">
      <div className="heatmap-head">
        <span>
          <i className="live-dot" /> {AXES[lens].value} map
        </span>
        <button className="chip-btn" onClick={onExpand}>
          <Box size={13} /> 3D view
        </button>
      </div>
      <div className="heatmap-frame">
        <span className="heat-axis heat-axis-z">
          {AXES[lens].z} · 0–{lens === 'insurance' ? '100%' : `${range}×`}
        </span>
        <div
          ref={host}
          className="heatmap-plot"
          role="img"
          aria-label={`${AXES[lens].value} across ${AXES[lens].x} and ${AXES[lens].z}. The dashed line is break-even. Your hand is at ${pct(live.x)} and ${zLabel(live.z)}.`}
          onPointerMove={inspect}
          onPointerLeave={() => setProbe(null)}
        >
          <canvas ref={canvas} />
          <m.span
            className="heat-marker"
            initial={false}
            animate={{ left: `${live.x * 100}%`, bottom: `${live.z * 100}%` }}
            transition={spring.smooth}
          >
            <i />
          </m.span>
          {probe && (
            <>
              <span
                className="heat-cross-x"
                style={{ left: `${probe.x * 100}%` }}
              />
              <span
                className="heat-cross-z"
                style={{ bottom: `${probe.z * 100}%` }}
              />
            </>
          )}
        </div>
        <span className="heat-axis heat-axis-x">{AXES[lens].x} · 0–100%</span>
      </div>
      <div className="heat-legend">
        <span>
          <i className="legend-swatch low" /> loses chips
        </span>
        {lens !== 'insurance' && (
          <span>
            <i className="legend-swatch dash" /> break-even
          </span>
        )}
        <span>
          <i className="legend-swatch high" /> gains chips
        </span>
        <span>
          <i className="legend-swatch marker" /> {markerLabel}
        </span>
      </div>
      <div className="probe">
        <div className="probe-readout">
          <Crosshair size={13} />
          <span>{probe ? 'Exploring' : 'Your hand'}</span>
          <strong className={value >= 0 ? 'positive' : 'negative'}>
            {value >= 0 ? '+' : '−'}
            {Math.abs(value * chipScale).toFixed(1)} chips
          </strong>
          <em>
            {pct(point.x)} · {zLabel(point.z)}
          </em>
        </div>
        <label>
          <span>{AXES[lens].x}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={point.x}
            onChange={(e) => setProbe({ ...point, x: Number(e.target.value) })}
            aria-label={`Inspect ${AXES[lens].x}`}
          />
        </label>
        <label>
          <span>{AXES[lens].z}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={point.z}
            onChange={(e) => setProbe({ ...point, z: Number(e.target.value) })}
            aria-label={`Inspect ${AXES[lens].z}`}
          />
        </label>
      </div>
    </div>
  )
}
