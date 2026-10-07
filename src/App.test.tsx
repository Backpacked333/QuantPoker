// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import { botAction } from './lib/poker'
import type { User } from '@supabase/supabase-js'
import { CloudContext } from './lib/cloud-context'
import { CloudStore } from './lib/cloud-store'
import { SessionApp } from './components/CloudProvider'
import { STORAGE_KEY } from './lib/storage'

vi.mock('./components/FinancePanel', () => ({
  FinancePanel: () => <input aria-label="Model note" defaultValue="" />,
}))
vi.mock('./lib/poker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/poker')>()),
  botAction: vi.fn(() => ({ type: 'check' })),
}))

let wideLayout = false
const layoutListeners = new Set<() => void>()
function resize(wide: boolean) {
  act(() => {
    wideLayout = wide
    layoutListeners.forEach((listener) => listener())
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  localStorage.clear()
  wideLayout = false
  layoutListeners.clear()
  vi.stubGlobal(
    'Worker',
    class {
      postMessage() {}
      terminate() {}
    },
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query === '(min-width: 1100px)' && wideLayout
      },
      addEventListener: (_: string, listener: () => void) => {
        if (query === '(min-width: 1100px)') layoutListeners.add(listener)
      },
      removeEventListener: (_: string, listener: () => void) => {
        layoutListeners.delete(listener)
      },
    })),
  )
  // JSDOM has no top layer; these tests cover React state, not browser focus.
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '')
  })
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

describe('account-scoped table state', () => {
  it('restores cloud progress without overwriting guest history and accepts a later remote refresh', () => {
    const guest = { hands: [], lessons: ['insurance'] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guest))
    const store = new CloudStore(null)
    let state = {
      ...store.snapshot(),
      scope: 'alice',
      user: { id: 'alice' } as User,
    }
    state.cache.progress = { hands: [], lessons: ['equity', 'options'] }
    vi.spyOn(store, 'snapshot').mockImplementation(() => state)
    vi.spyOn(store, 'writeProgress').mockImplementation(() => {})
    vi.spyOn(store, 'writeSettings').mockImplementation(() => {})
    const view = render(
      <CloudContext.Provider value={{ store, state }}>
        <SessionApp />
      </CloudContext.Provider>,
    )
    expect(document.querySelector('.qp-count')?.textContent).toBe('2/3')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(guest)
    state = {
      ...state,
      cache: {
        ...state.cache,
        progress: { hands: [], lessons: ['equity', 'options', 'insurance'] },
      },
    }
    view.rerender(
      <CloudContext.Provider value={{ store, state }}>
        <SessionApp />
      </CloudContext.Provider>,
    )
    expect(document.querySelector('.qp-count')?.textContent).toBe('3/3')
    state = {
      ...state,
      scope: 'bob',
      user: { id: 'bob' } as User,
      cache: { ...state.cache, progress: { hands: [], lessons: [] } },
    }
    view.rerender(
      <CloudContext.Provider value={{ store, state }}>
        <SessionApp />
      </CloudContext.Provider>,
    )
    expect(document.querySelector('.qp-count')?.textContent).toBe('0/3')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(guest)
  })
})

describe('small-screen hand insights', () => {
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

describe('docked quant education', () => {
  beforeEach(() => {
    wideLayout = true
  })

  it('starts visible without opening a modal or blocking decisions and Atlas', () => {
    render(<App />)
    const panel = screen.getByRole('dialog', { name: 'Analysis and coach' })
    expect(panel.hasAttribute('aria-modal')).toBe(false)
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled()
    expect(screen.getByText('Live with this hand')).toBeTruthy()
    tick(900)
    fireEvent.click(screen.getByRole('button', { name: /^Call 40/ }))
    tick(500)
    expect(
      document.querySelector('.pt-stage')?.getAttribute('aria-label'),
    ).toBe('Hand 1, turn')
    tick(700)
    tick(1400)
    expect(botAction).toHaveBeenCalledOnce()
    expect(panel.hasAttribute('open')).toBe(true)
  })

  it('lets Explain focus the visible panel rather than closing it', () => {
    render(<App />)
    tick(900)
    const panel = screen.getByRole('dialog', { name: 'Analysis and coach' })
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }))
    expect(panel.hasAttribute('open')).toBe(true)
    expect(document.activeElement).toBe(panel)
    closeAnalysis()
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }))
    expect(panel.hasAttribute('open')).toBe(true)
    expect(document.activeElement).toBe(panel)
  })

  it('preserves model state when hiding and reopening the dock', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Model note'), {
      target: { value: 'Compare my raise' },
    })
    closeAnalysis()
    expect(screen.queryByRole('dialog')).toBeNull()
    openAnalysis()
    expect(
      (screen.getByLabelText('Model note') as HTMLInputElement).value,
    ).toBe('Compare my raise')
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled()
  })

  it('keeps the explicit pause independent from dock visibility', () => {
    render(<App />)
    tick(900)
    fireEvent.click(screen.getByRole('button', { name: /^Call 40/ }))
    tick(500)
    tick(700)
    fireEvent.click(screen.getByRole('button', { name: 'Pause hand' }))
    closeAnalysis()
    openAnalysis()
    tick(10000)
    expect(botAction).not.toHaveBeenCalled()
    expect(screen.getByText('Game paused · Take your time')).toBeTruthy()
  })

  it('keeps one mounted model across desktop and mobile with separate visibility preferences', () => {
    render(<App />)
    const model = screen.getByLabelText('Model note') as HTMLInputElement
    fireEvent.change(model, { target: { value: 'My scenario' } })
    resize(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    openAnalysis()
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce()
    resize(true)
    expect(screen.getByRole('dialog').hasAttribute('aria-modal')).toBe(false)
    expect(screen.getByLabelText('Model note')).toBe(model)
    expect(model.value).toBe('My scenario')
    closeAnalysis()
    resize(false)
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    closeAnalysis()
    resize(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('pauses in the mobile drawer and resumes when it becomes a desktop dock', () => {
    wideLayout = false
    render(<App />)
    tick(900)
    fireEvent.click(screen.getByRole('button', { name: /^Call 40/ }))
    openAnalysis()
    tick(10000)
    expect(
      document.querySelector('.pt-stage')?.getAttribute('aria-label'),
    ).toBe('Hand 1, flop')
    resize(true)
    tick(500)
    expect(
      document.querySelector('.pt-stage')?.getAttribute('aria-label'),
    ).toBe('Hand 1, turn')
    tick(700)
    tick(1400)
    expect(botAction).toHaveBeenCalledOnce()
  })
})
