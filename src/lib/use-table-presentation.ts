import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Game } from './poker'
import { tableFrames } from './table-presentation'
import type { TableFrame } from './table-presentation'

const query = '(prefers-reduced-motion: reduce)'
const subscribe = (listener: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export function useTablePresentation(
  engine: Game,
  paused: boolean,
  fast: boolean,
) {
  const reduced = useReducedMotion()
  const previous = useRef(engine)
  const [queue, setQueue] = useState<TableFrame[]>([])
  const [display, setDisplay] = useState<TableFrame>({
    game: engine,
    phase: 'deal',
    duration: 850,
  })
  useEffect(() => {
    if (previous.current === engine) return
    const frames = tableFrames(previous.current, engine)
    previous.current = engine
    setDisplay(frames[0])
    setQueue(frames.slice(1))
  }, [engine])
  useEffect(() => {
    if (paused || display.phase === 'idle') return
    const timer = window.setTimeout(
      () => {
        if (queue.length) {
          setDisplay(queue[0])
          setQueue(queue.slice(1))
        } else setDisplay({ game: engine, phase: 'idle', duration: 0 })
      },
      reduced ? 60 : fast ? display.duration * 0.4 : display.duration,
    )
    return () => window.clearTimeout(timer)
  }, [display, queue, engine, paused, fast, reduced])
  return {
    ...display,
    busy: display.phase !== 'idle' || display.game !== engine,
  }
}
