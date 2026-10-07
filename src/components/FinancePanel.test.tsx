// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FinancePanel } from './FinancePanel'
import { guidedHand } from '../lib/poker'
import type { EquityAnalysis } from '../lib/poker'

vi.mock('./Coach', () => ({ Coach: () => <div>Coach available</div> }))
const analysis: EquityAnalysis = {
  equity: 0.6,
  win: 0.58,
  tie: 0.04,
  loss: 0.38,
  improve: 0.2,
  nextCardVolatility: 0.1,
  bestNextCards: [],
  worstNextCards: [],
}
const game = guidedHand()
const props = {
  game,
  analysis,
  raiseTo: 100,
  lens: 'equity' as const,
  onLens: vi.fn(),
  onLesson: vi.fn(),
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
})

describe('learning and live-model integration', () => {
  it('keeps practice answers during estimation and sizing changes, but resets them for a new price or board', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FinancePanel {...props} />)
    await user.click(screen.getByRole('button', { name: 'Make a prediction' }))
    await user.click(screen.getByRole('radio', { name: 'Call ÷ (pot + call)' }))
    await user.click(screen.getByRole('button', { name: 'Check my reasoning' }))
    rerender(
      <FinancePanel
        {...props}
        raiseTo={160}
        analysis={{ ...analysis, equity: 0.62 }}
      />,
    )
    expect(screen.getByText('1/2 checks correct · this decision')).toBeTruthy()
    rerender(<FinancePanel {...props} game={{ ...game, pot: game.pot + 20 }} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Make a prediction' }),
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Make a prediction' }))
    rerender(
      <FinancePanel
        {...props}
        game={{
          ...game,
          street: 'turn',
          board: [...game.board, { rank: 2, suit: 'c' }],
        }}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Make a prediction' }),
    ).toBeTruthy()
  })

  it('resets practice when switching lenses without removing the graph or coach', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FinancePanel {...props} />)
    await user.click(screen.getByRole('button', { name: 'Make a prediction' }))
    rerender(<FinancePanel {...props} lens="options" />)
    expect(
      screen.getByRole('heading', { name: 'The right to say no has value.' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Make a prediction' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('slider', {
        name: 'Explore showdown equity on the payoff graph',
      }),
    ).toBeTruthy()
    expect(screen.getByText('Coach available')).toBeTruthy()
  })

  it('returns a raise experiment to the call baseline and plots the actual zero-EV frontier without changing the game', async () => {
    const user = userEvent.setup()
    const before = JSON.stringify(game)
    const { container } = render(<FinancePanel {...props} />)
    await user.click(screen.getByText('Experiment controls'))
    await user.click(screen.getByRole('button', { name: /^Raise 100/ }))
    await user.click(screen.getByRole('button', { name: 'Explore freely' }))
    await user.click(screen.getByRole('button', { name: 'At break-even' }))
    const slider = screen.getByRole('slider', {
      name: 'Explore showdown equity on the payoff graph',
    })
    expect(slider.getAttribute('aria-valuenow')).toBe('20')
    expect(document.activeElement).toBe(
      screen.getByRole('region', { name: 'Interactive workspace' }),
    )
    expect(slider.getAttribute('aria-valuetext')).toBe(
      '20 percent; 0.0 modeled chips',
    )
    expect(
      container.querySelector('.decision-buttons button.selected')?.textContent,
    ).toMatch(/^Call 40/)
    expect(JSON.stringify(game)).toBe(before)
    await user.click(
      screen.getByRole('button', { name: 'Return to learning steps' }),
    )
    expect(document.activeElement).toBe(screen.getByLabelText('Guided lesson'))
  })

  it('plots insurance practice assumptions separately from live probabilities', async () => {
    const user = userEvent.setup()
    render(<FinancePanel {...props} lens="insurance" />)
    await user.click(screen.getByRole('button', { name: 'Explore freely' }))
    await user.click(screen.getByRole('button', { name: '25% chance of loss' }))
    const slider = screen.getByRole('slider', {
      name: 'Explore loss probability on the payoff graph',
    })
    expect(slider.getAttribute('aria-valuetext')).toBe(
      '25 percent; -17.5 modeled chips',
    )
    expect(
      within(
        screen.getByRole('region', { name: 'Hand-linked lesson' }),
      ).getByText(/not overall expected value/),
    ).toBeTruthy()
  })
})
