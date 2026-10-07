// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import { botAction } from './lib/poker'

vi.mock('./components/FinancePanel', () => ({
  FinancePanel: () => <input aria-label="Model note" defaultValue="" />,
}))
vi.mock('./lib/poker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/poker')>()),
  botAction: vi.fn(() => ({ type: 'check' })),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  localStorage.clear()
  vi.stubGlobal(
    'Worker',
    class {
      postMessage() {}
      terminate() {}
    },
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  // JSDOM has no top layer; these tests cover React state, not browser focus.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const openAnalysis = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Show analysis' }))
const closeAnalysis = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Close analysis' }))

describe('on-demand hand insights', () => {
  it('starts closed, preserves the mounted model, and handles native cancellation', () => {
    render(<App />)
    expect(screen.queryByRole('dialog')).toBeNull()
    openAnalysis()
    const dialog = screen.getByRole('dialog', { name: 'Analysis and coach' })
    fireEvent.change(screen.getByLabelText('Model note'), {
      target: { value: 'My scenario' },
    })
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
    openAnalysis()
    expect(
      (screen.getByLabelText('Model note') as HTMLInputElement).value,
    ).toBe('My scenario')
  })

  it('freezes the displayed street mid-sequence until insights close', () => {
    render(<App />)
    tick(900)
    fireEvent.click(screen.getByRole('button', { name: /^Call 40/ }))
    expect(document.querySelector('.pt-phase-bet')).toBeTruthy()
    openAnalysis()
    tick(10000)
    expect(
      document.querySelector('.pt-stage')?.getAttribute('aria-label'),
    ).toBe('Hand 1, flop')
    expect(botAction).not.toHaveBeenCalled()
    closeAnalysis()
    tick(500)
    expect(
      document.querySelector('.pt-stage')?.getAttribute('aria-label'),
    ).toBe('Hand 1, turn')
  })

  it('suspends the bot at an idle street and resumes after closing insights', () => {
    render(<App />)
    tick(900)
    fireEvent.click(screen.getByRole('button', { name: /^Call 40/ }))
    tick(500)
    tick(700)
    expect(document.querySelector('.pt-phase-idle')).toBeTruthy()
    openAnalysis()
    tick(10000)
    expect(botAction).not.toHaveBeenCalled()
    closeAnalysis()
    tick(1400)
    expect(botAction).toHaveBeenCalledOnce()
  })
})
