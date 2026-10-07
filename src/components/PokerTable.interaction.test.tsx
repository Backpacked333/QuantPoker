// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { guidedHand } from '../lib/poker'
import type { Game } from '../lib/poker'
import { PokerTable } from './PokerTable'

afterEach(cleanup)

function setup({
  game = guidedHand(),
  blocked = false,
  dialogOpen = false,
} = {}) {
  const onAction = vi.fn()
  const onDeal = vi.fn()
  const onToggleAnalysis = vi.fn()
  function Table() {
    const [betAmount, onRaise] = useState(100)
    return (
      <PokerTable
        game={game}
        frame={{ game, phase: 'idle', duration: 0 }}
        busy={blocked}
        paused={false}
        yourTurn={!blocked && game.turn === 0 && !game.result}
        betAmount={betAmount}
        analysis={null}
        onRaise={onRaise}
        onAction={onAction}
        onDeal={onDeal}
        onPause={vi.fn()}
        onSettings={vi.fn()}
        onHistory={vi.fn()}
        sound={false}
        onSound={vi.fn()}
        analysisOpen={false}
        onToggleAnalysis={onToggleAnalysis}
        onExplain={onToggleAnalysis}
        onUnlock={vi.fn()}
        shortcuts
        dialogOpen={dialogOpen}
      />
    )
  }
  render(<Table />)
  return { user: userEvent.setup(), onAction, onDeal, onToggleAnalysis }
}

describe('decision controls', () => {
  it('shows price before the estimate arrives and keeps custom controls secondary', async () => {
    const { user } = setup()
    expect(screen.getByText('20%')).toBeTruthy()
    expect(screen.getByText('Estimating equity…')).toBeTruthy()
    expect(screen.queryByRole('slider')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Custom bet size/ }))
    expect(screen.getByRole('slider', { name: 'Raise size' })).toBeTruthy()
  })

  it('selects a pot fraction without submitting, then raises the displayed total', async () => {
    const { user, onAction } = setup()
    await user.click(screen.getByRole('button', { name: '½ pot' }))
    expect(onAction).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Raise to 140/ }))
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ type: 'raise', to: 140 })
  })

  it('updates the action while typing, clamps bounds, and suppresses shortcuts in the input', async () => {
    const { user, onAction } = setup()
    await user.click(screen.getByRole('button', { name: /Custom bet size/ }))
    const input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '500')
    expect(screen.getByRole('button', { name: /Raise to 500/ })).toBeTruthy()
    await user.keyboard('fcr')
    expect(onAction).not.toHaveBeenCalled()
    await user.clear(input)
    await user.type(input, '1')
    await user.tab()
    expect((input as HTMLInputElement).value).toBe('80')
    await user.clear(input)
    await user.type(input, '999999')
    await user.tab()
    expect((input as HTMLInputElement).value).toBe('1940')
  })

  it('requires confirmation before going all-in and allows cancelling', async () => {
    const { user, onAction } = setup()
    await user.click(screen.getByRole('button', { name: 'All-in' }))
    await user.click(screen.getByRole('button', { name: /All-in 1,940/ }))
    expect(onAction).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onAction).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /All-in 1,940/ }))
    await user.click(screen.getByRole('button', { name: 'Confirm all-in' }))
    expect(onAction).toHaveBeenCalledExactlyOnceWith({
      type: 'raise',
      to: 1940,
    })
  })

  it('confirms effective maximums without incorrectly calling them all-in', async () => {
    const game: Game = { ...guidedHand(), stacks: [1940, 300] }
    const { user, onAction } = setup({ game })
    await user.click(screen.getByRole('button', { name: 'Max' }))
    await user.click(screen.getByRole('button', { name: /Raise to 340/ }))
    expect(screen.getByText('Bet the effective maximum?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Confirm bet' }))
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ type: 'raise', to: 340 })
  })

  it('blocks pointer and keyboard actions while the presentation is busy', async () => {
    const { user, onAction } = setup({ blocked: true })
    await user.click(screen.getByRole('button', { name: /^Call 40/ }))
    await user.keyboard('fcr')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('blocks game shortcuts while the analysis dialog is open', async () => {
    const { user, onAction } = setup({ dialogOpen: true })
    await user.keyboard('fcr')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('keeps decision metrics in the human perspective during the opponent turn', () => {
    setup({ game: { ...guidedHand(), turn: 1 } })
    expect(screen.getByText('20%')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: /^Call 40/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('opens insights without submitting a poker action', async () => {
    const { user, onAction, onToggleAnalysis } = setup()
    await user.click(screen.getByRole('button', { name: 'Explain' }))
    expect(onToggleAnalysis).toHaveBeenCalledOnce()
    expect(onAction).not.toHaveBeenCalled()
  })
})
