import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'motion/react'

/** A number that glides to new values, writing text directly (no re-renders). */
export function AnimatedNumber({
  value,
  format = (v: number) => Math.round(v).toLocaleString('en-US'),
  duration = 0.5,
  className,
}: {
  value: number
  format?: (value: number) => string
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const current = useRef(value)
  const reduced = useReducedMotion()
  const formatRef = useRef(format)
  formatRef.current = format
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reduced) {
      current.current = value
      node.textContent = formatRef.current(value)
      return
    }
    const controls = animate(current.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        current.current = latest
        node.textContent = formatRef.current(latest)
      },
    })
    return () => controls.stop()
  }, [value, duration, reduced])
  return (
    <span ref={ref} className={className}>
      {format(current.current)}
    </span>
  )
}
