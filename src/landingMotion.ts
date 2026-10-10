import { useEffect, useRef } from 'react'

export function useLandingMotion(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root || !enabled) return
    let observer: IntersectionObserver | undefined
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            entry.target.classList.add('lp-revealed')
            observer?.unobserve(entry.target)
          }
        },
        { threshold: 0.12 },
      )
      root
        .querySelectorAll('.lp-reveal')
        .forEach((element) => observer?.observe(element))
      root.classList.add('lp-motion-ready')
    }

    let frame = 0
    let active: HTMLElement | null = null
    const reset = () => {
      if (!active) return
      active.style.setProperty('--lp-rx', '0deg')
      active.style.setProperty('--lp-ry', '0deg')
      active.style.setProperty('--lp-mx', '0px')
      active.style.setProperty('--lp-my', '0px')
      active = null
    }
    const pointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-lp-tilt], .lp-button')
          : null
      if (target !== active) reset()
      if (!target) return
      active = target
      const box = target.getBoundingClientRect()
      const x = (event.clientX - box.left) / box.width - 0.5
      const y = (event.clientY - box.top) / box.height - 0.5
      target.style.setProperty('--lp-rx', `${-y * 7}deg`)
      target.style.setProperty('--lp-ry', `${x * 7}deg`)
      target.style.setProperty('--lp-mx', `${x * 7}px`)
      target.style.setProperty('--lp-my', `${y * 7}px`)
      target.style.setProperty('--lp-light-x', `${(x + 0.5) * 100}%`)
      target.style.setProperty('--lp-light-y', `${(y + 0.5) * 100}%`)
    }
    const update = () => {
      frame = 0
      const distance =
        document.documentElement.scrollHeight - window.innerHeight
      root.style.setProperty(
        '--lp-progress',
        String(
          distance > 0
            ? Math.min(1, Math.max(0, window.scrollY / distance))
            : 0,
        ),
      )
      root.style.setProperty(
        '--lp-scroll',
        `${Math.min(90, window.scrollY * 0.12)}px`,
      )
    }
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    root.addEventListener('pointermove', pointer)
    root.addEventListener('pointerleave', reset)
    window.addEventListener('scroll', scroll, { passive: true })
    window.addEventListener('resize', scroll)
    return () => {
      observer?.disconnect()
      root.classList.remove('lp-motion-ready')
      root.removeEventListener('pointermove', pointer)
      root.removeEventListener('pointerleave', reset)
      window.removeEventListener('scroll', scroll)
      window.removeEventListener('resize', scroll)
      cancelAnimationFrame(frame)
      reset()
    }
  }, [enabled])

  return ref
}
