// The landing page's 3D canvas. It loads the stage (and three.js) lazily,
// shows a lit poster while it loads, and reports the stage once it runs, or
// a failure, so the page can fall back to the 2D table.
import { useEffect, useRef } from 'react'
import type { Stage } from './stage'

export function StageCanvas({
  onReady,
  onFail,
}: {
  onReady: (stage: Stage) => void
  onFail: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let live = true
    let stage: Stage | null = null
    let observer: ResizeObserver | null = null
    import('./stage')
      .then(({ Stage }) => {
        if (!live || !canvas.current) return
        const reduced = window.matchMedia?.(
          '(prefers-reduced-motion: reduce)',
        ).matches
        try {
          stage = new Stage(canvas.current, {
            onFail,
            reducedMotion: !!reduced,
          })
        } catch {
          onFail()
          return
        }
        observer = new ResizeObserver(() => stage?.resize())
        observer.observe(canvas.current)
        stage.intro()
        onReady(stage)
      })
      .catch(() => live && onFail())
    return () => {
      live = false
      observer?.disconnect()
      stage?.dispose()
    }
    // Mounted once per page: the callbacks are stable in Landing.
  }, [onReady, onFail])
  return <canvas className="stage-canvas" ref={canvas} aria-hidden />
}
