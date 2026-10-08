import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Game } from '../lib/poker'
import { useRunout } from './runout'

const game = (board: number, result?: Partial<Game['result']>) =>
  ({
    id: 1,
    board: Array.from({ length: board }, () => ({ rank: 2, suit: 's' })),
    result: result as Game['result'],
  }) as unknown as Game

afterEach(() => vi.useRealTimers())

describe('useRunout', () => {
  it('reveals an all-in board flop, turn, then river and settles', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ g }) => useRunout(g), {
      initialProps: { g: game(0) },
    })
    expect(result.current).toEqual({ visible: 0, revealing: false })
    rerender({ g: game(5, { showdown: true } as never) })
    expect(result.current).toEqual({ visible: 0, revealing: true })
    act(() => vi.advanceTimersByTime(900))
    expect(result.current.visible).toBe(3)
    act(() => vi.advanceTimersByTime(900))
    expect(result.current.visible).toBe(4)
    act(() => vi.advanceTimersByTime(900))
    expect(result.current.visible).toBe(4)
    act(() => vi.advanceTimersByTime(500))
    expect(result.current).toEqual({ visible: 5, revealing: true })
    act(() => vi.advanceTimersByTime(900))
    expect(result.current).toEqual({ visible: 5, revealing: false })
  })

  it('shows the board at once when the hand ends without a runout', () => {
    const { result, rerender } = renderHook(({ g }) => useRunout(g), {
      initialProps: { g: game(5) },
    })
    rerender({ g: game(5, { showdown: true } as never) })
    expect(result.current).toEqual({ visible: 5, revealing: false })
  })
})
