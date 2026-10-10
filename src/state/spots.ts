import { useCallback, useEffect, useRef, useState } from 'react'
import type { AtlasStyle } from '../lib/atlas'
import type { Game } from '../lib/poker'
import type { SpotAnalysis, SpotRequest } from '../lib/range'
import { spotKey } from '../lib/spotKey'

export { spotKey }

const LIMIT = 120

/** A long-lived analysis worker with a keyed result cache. */
export function useSpots() {
  const worker = useRef<Worker | null>(null)
  const requested = useRef(new Set<string>())
  const [spots, setSpots] = useState<Map<string, SpotAnalysis>>(() => new Map())

  useEffect(() => {
    const instance = new Worker(
      new URL('../lib/equity.worker.ts', import.meta.url),
      { type: 'module' },
    )
    instance.onmessage = (event: MessageEvent<SpotAnalysis>) => {
      const data = event.data
      setSpots((previous) => {
        if (data.stage === 'quick' && previous.get(data.key)?.stage === 'full')
          return previous
        const next = new Map(previous)
        next.delete(data.key)
        next.set(data.key, data)
        while (next.size > LIMIT) next.delete(next.keys().next().value!)
        return next
      })
    }
    worker.current = instance
    const pending = requested.current
    return () => {
      instance.terminate()
      worker.current = null
      pending.clear()
    }
  }, [])

  const request = useCallback((game: Game, style: AtlasStyle) => {
    const key = spotKey(game, style)
    if (!worker.current || requested.current.has(key)) return key
    requested.current.add(key)
    const message: SpotRequest = {
      key,
      hole: game.cards[0],
      board: game.board,
      history: game.history,
      style,
    }
    worker.current.postMessage(message)
    return key
  }, [])

  return { spots, request }
}
