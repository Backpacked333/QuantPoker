// Small motion hooks for the landing page. Each respects reduced motion and
// works without the browser APIs it prefers (jsdom has no
// IntersectionObserver), so content is never hidden by a missing feature.
import { useEffect, useRef, useState } from 'react'

const reducedMotion = () =>
  document.documentElement.classList.contains('no-motion') ||
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Counts from 0 up to `target` over `ms`, easing out; jumps when reduced. */
export function useCountUp(target: number, ms = 1100, delay = 0) {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0))
  useEffect(() => {
    if (reducedMotion() || typeof requestAnimationFrame === 'undefined') {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now() + delay
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / ms))
      setValue(Math.round(target * (1 - (1 - t) ** 3)))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, delay])
  return value
}

/**
 * Adds `is-in` to the element once it scrolls into view (CSS does the
 * animation). Without IntersectionObserver, or with reduced motion, it is
 * shown at once.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reducedMotion() || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in')
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            el.classList.add('is-in')
            observer.disconnect()
          }
      },
      { threshold: 0.18 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return ref
}

/** Pointer-follow tilt: sets --rx/--ry on the element (CSS rotates it). */
export function tilt(event: React.PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse' || reducedMotion()) return
  const el = event.currentTarget
  const box = el.getBoundingClientRect()
  const x = (event.clientX - box.left) / box.width - 0.5
  const y = (event.clientY - box.top) / box.height - 0.5
  el.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`)
  el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`)
}
export function untilt(event: React.PointerEvent<HTMLElement>) {
  event.currentTarget.style.removeProperty('--rx')
  event.currentTarget.style.removeProperty('--ry')
}
