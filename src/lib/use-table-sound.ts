import { useCallback, useEffect, useRef } from 'react'
import type { TableFrame } from './table-presentation'

export function useTableSound(
  frame: TableFrame,
  enabled: boolean,
  paused: boolean,
) {
  const context = useRef<AudioContext | null>(null)
  const last = useRef('')
  const unlock = useCallback(() => {
    try {
      context.current ??= new AudioContext()
      if (context.current.state === 'suspended')
        void context.current.resume().catch(() => {})
    } catch {
      /* Audio is an optional enhancement. */
    }
  }, [])
  useEffect(() => {
    const key = `${frame.game.id}:${frame.game.log.length}:${frame.game.board.length}:${frame.phase}`
    if (last.current === key || frame.phase === 'idle') return
    last.current = key
    const audio = context.current
    if (!enabled || paused || !audio || audio.state !== 'running') return
    const now = audio.currentTime
    function tone(
      frequency: number,
      start: number,
      duration: number,
      volume: number,
    ) {
      const oscillator = audio!.createOscillator(),
        gain = audio!.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 0.7,
        start + duration,
      )
      gain.gain.setValueAtTime(volume, start)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(gain).connect(audio!.destination)
      oscillator.start(start)
      oscillator.stop(start + duration)
    }
    if (frame.phase === 'settle' && frame.game.result?.winner === 0) {
      ;[440, 554, 659].forEach((note, i) =>
        tone(note, now + i * 0.075, 0.28, 0.025),
      )
    } else if (frame.phase === 'bet' && frame.amount) {
      ;[1100, 1400, 900].forEach((note, i) =>
        tone(note, now + i * 0.035, 0.055, 0.018),
      )
    } else if (['street', 'deal', 'reveal'].includes(frame.phase)) {
      const buffer = audio.createBuffer(
        1,
        Math.round(audio.sampleRate * 0.07),
        audio.sampleRate,
      )
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++)
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
      const source = audio.createBufferSource(),
        filter = audio.createBiquadFilter(),
        gain = audio.createGain()
      source.buffer = buffer
      filter.type = 'lowpass'
      filter.frequency.value = 2800
      gain.gain.value = 0.035
      source.connect(filter).connect(gain).connect(audio.destination)
      source.start()
    } else if (frame.phase === 'bet') tone(320, now, 0.09, 0.02)
  }, [frame, enabled, paused])
  useEffect(
    () => () => {
      void context.current?.close().catch(() => {})
      context.current = null
    },
    [],
  )
  return unlock
}
