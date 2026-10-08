import { useEffect, useLayoutEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'

export type TourStep = { target: string; title: string; body: string }
type Placement = { top: number } | { bottom: number }

const CARD_HEIGHT = 230

/** Spotlight walkthrough over elements marked with data-tour attributes. */
export function Tour({
  steps,
  onDone,
}: {
  steps: TourStep[]
  onDone: () => void
}) {
  const available = steps.filter((s) =>
    document.querySelector(`[data-tour="${s.target}"]`),
  )
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [placement, setPlacement] = useState<Placement>({ bottom: 16 })
  const step = available[index]

  useLayoutEffect(() => {
    if (!step) return
    const element = document.querySelector<HTMLElement>(
      `[data-tour="${step.target}"]`,
    )
    if (!element) return
    element.scrollIntoView({
      block: 'center',
      behavior: 'instant' as ScrollBehavior,
    })
    const initial = element.getBoundingClientRect()
    // Chosen once per step so the card never jumps while the page scrolls:
    // below the target if it fits, else above, else pinned to the bottom.
    // Phones always pin to the bottom, like a sheet.
    setPlacement(
      window.innerWidth < 700
        ? { bottom: 16 }
        : window.innerHeight - initial.bottom - 16 >= CARD_HEIGHT
          ? { top: initial.bottom + 16 }
          : initial.top - 16 >= CARD_HEIGHT
            ? { bottom: window.innerHeight - initial.top + 16 }
            : { bottom: 16 },
    )
    const update = () => setRect(element.getBoundingClientRect())
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [step])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onDone])

  if (!step || !rect) return null
  const pad = 8
  const cardWidth = Math.min(340, window.innerWidth - 32)
  const left = Math.max(
    16,
    Math.min(
      window.innerWidth - cardWidth - 16,
      rect.left + rect.width / 2 - cardWidth / 2,
    ),
  )
  const last = index === available.length - 1
  return (
    <div
      className="tour"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <div
        className="tour-spot"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }}
      />
      <div
        className="tour-card"
        style={{ left, width: cardWidth, ...placement }}
      >
        <span className="label">
          Step {index + 1} of {available.length}
        </span>
        <h3 id="tour-title">{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="btn btn-quiet" onClick={onDone}>
            Skip tour
          </button>
          <button
            className="btn btn-primary"
            autoFocus
            onClick={() => (last ? onDone() : setIndex(index + 1))}
          >
            {last ? 'Start playing' : 'Next'} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
