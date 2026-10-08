import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, PointerEvent, Ref } from 'react'
import { ChevronUp } from 'lucide-react'
import { animate, m, useMotionValue } from 'motion/react'
import type { AnimationPlaybackControlsWithThen } from 'motion/react'
import { spring } from '../motion'

type Snap = 'peek' | 'half' | 'full'
const FULL = 0.88
const HALF = 0.52
/** Seconds of release velocity projected forward when choosing a snap. */
const THROW = 0.18

/**
 * The phone lab sheet. Tap the handle to open or close it, or drag it between
 * peek, half and full; a flick carries it in the direction thrown.
 */
export function LabSheet({
  open,
  onOpenChange,
  summary,
  haptics,
  sheetRef,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: ReactNode
  haptics: boolean
  sheetRef?: Ref<HTMLDivElement>
  children: ReactNode
}) {
  const handle = useRef<HTMLButtonElement>(null)
  const height = useMotionValue(58)
  const [snap, setSnap] = useState<Snap>(open ? 'half' : 'peek')
  const [bodyShown, setBodyShown] = useState(open)
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const motion = useRef<AnimationPlaybackControlsWithThen | null>(null)
  const glide = (to: Snap) => {
    motion.current?.stop()
    motion.current = animate(height, target(to), spring.smooth)
    return motion.current
  }

  const target = (s: Snap) =>
    s === 'peek'
      ? (handle.current?.offsetHeight ?? 58)
      : window.innerHeight * (s === 'full' ? FULL : HALF)

  // Follow the parent's open state (deal closes it, review opens it).
  useLayoutEffect(() => {
    setSnap((s) => (open ? (s === 'peek' ? 'half' : s) : 'peek'))
  }, [open])

  useEffect(() => {
    if (snap !== 'peek') setBodyShown(true)
    const controls = glide(snap)
    controls.then(() => {
      if (snap === 'peek' && !drag.current) setBodyShown(false)
    })
    return () => controls.stop()
    // `target` reads layout; re-running on snap changes is what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap])

  useEffect(() => {
    const onResize = () => {
      if (!drag.current) height.set(target(snap))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap])

  const settle = (next: Snap) => {
    if (haptics && next !== snap) navigator.vibrate?.(8)
    setSnap(next)
    if ((next !== 'peek') !== open) onOpenChange(next !== 'peek')
    else if (next === snap) glide(next)
  }

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    // Grabbing the sheet mid-glide takes over from the running animation.
    motion.current?.stop()
    drag.current = { y: event.clientY, h: height.get(), moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const dy = d.y - event.clientY
    if (!d.moved && Math.abs(dy) < 6) return
    d.moved = true
    setBodyShown(true)
    const min = target('peek')
    const max = target('full')
    const raw = d.h + dy
    // Rubber-band past either end.
    const h =
      raw > max
        ? max + (raw - max) * 0.2
        : raw < min
          ? min - (min - raw) * 0.2
          : raw
    height.set(h)
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    suppressClick.current = true
    const projected = height.get() + height.getVelocity() * THROW
    const snaps: Snap[] = ['peek', 'half', 'full']
    const next = snaps.reduce((best, s) =>
      Math.abs(target(s) - projected) < Math.abs(target(best) - projected)
        ? s
        : best,
    )
    settle(next)
  }

  return (
    <m.div
      className={`sheet ${open ? 'open' : ''}`}
      ref={sheetRef}
      style={{ height }}
    >
      <button
        ref={handle}
        className="sheet-handle"
        aria-expanded={open}
        aria-controls="sheet-body"
        data-tour="lab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          settle(open ? 'peek' : 'half')
        }}
      >
        <span className="grabber" />
        {summary}
        <ChevronUp size={16} className={open ? 'rotated' : ''} />
      </button>
      <div id="sheet-body" className="sheet-body" hidden={!bodyShown}>
        {children}
      </div>
    </m.div>
  )
}
