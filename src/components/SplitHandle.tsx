import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import { animate, useReducedMotionConfig } from 'motion/react'
import { spring } from '../motion'

export const DEFAULT_SPLIT = 0.54
/** Narrowest the table and the lab may get, in CSS pixels. */
const MIN_TABLE = 520
const MIN_LAB = 360
const HANDLE = 26

/** Write the split straight to the grid, skipping React for smooth drags. */
function applySplit(el: HTMLElement | null, split: number) {
  // Whole-number shares: if one column hits its minimum, the other's share
  // stays at least 1fr and still fills the leftover width.
  el?.style.setProperty('--split-a', `${split * 100}fr`)
  el?.style.setProperty('--split-b', `${(1 - split) * 100}fr`)
}

function bounds(el: HTMLElement) {
  const style = getComputedStyle(el)
  const width =
    el.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight) -
    HANDLE
  return {
    width,
    min: Math.min(0.5, MIN_TABLE / width),
    max: Math.max(0.5, 1 - MIN_LAB / width),
  }
}

/**
 * The bar between the table and the lab. Drag it to share the width, double
 * click (or Enter) to spring back to the default, and use the arrow keys,
 * Home and End from the keyboard.
 */
export function SplitHandle({
  target,
  value,
  onCommit,
}: {
  target: RefObject<HTMLElement | null>
  value: number
  onCommit: (split: number) => void
}) {
  const reduced = useReducedMotionConfig()
  const live = useRef(value)
  const drag = useRef<{ x: number; start: number; width: number } | null>(null)
  const frame = useRef(0)
  const glide = useRef<ReturnType<typeof animate> | null>(null)
  const [dragging, setDragging] = useState(false)
  const [now, setNow] = useState(value)

  useEffect(() => {
    if (drag.current) return
    live.current = value
    setNow(value)
  }, [value])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const set = (split: number) => {
    live.current = split
    applySplit(target.current, split)
  }
  const clamp = (split: number) => {
    const el = target.current
    if (!el) return split
    const { min, max } = bounds(el)
    return Math.min(max, Math.max(min, split))
  }
  const settle = (split: number) => {
    setNow(split)
    onCommit(Math.round(split * 1000) / 1000)
  }
  const springTo = (to: number) => {
    glide.current?.stop()
    const from = live.current
    if (reduced) {
      set(to)
      settle(to)
      return
    }
    glide.current = animate(from, to, {
      ...spring.smooth,
      onUpdate: set,
      onComplete: () => settle(to),
    })
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const el = target.current
    if (event.button !== 0 || !el) return
    glide.current?.stop()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      x: event.clientX,
      start: live.current,
      width: bounds(el).width,
    }
    setDragging(true)
    document.documentElement.classList.add('resizing')
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const x = event.clientX
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() =>
      set(clamp(d.start + (x - d.x) / d.width)),
    )
  }
  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    cancelAnimationFrame(frame.current)
    setDragging(false)
    document.documentElement.classList.remove('resizing')
    settle(live.current)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.08 : 0.02
    const next =
      event.key === 'ArrowLeft'
        ? live.current - step
        : event.key === 'ArrowRight'
          ? live.current + step
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 1
              : event.key === 'Enter'
                ? DEFAULT_SPLIT
                : null
    if (next === null) return
    event.preventDefault()
    springTo(clamp(next))
  }

  return (
    <div
      className={`split-handle ${dragging ? 'dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the table and the lab. Double-click or press Enter to reset."
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(now * 100)}
      aria-valuetext={`Table ${Math.round(now * 100)}%, lab ${Math.round((1 - now) * 100)}%`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => springTo(clamp(DEFAULT_SPLIT))}
      onKeyDown={onKeyDown}
    >
      <span className="split-grip" aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}
