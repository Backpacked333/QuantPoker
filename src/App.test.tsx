import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY as TABLE_KEY } from './lib/storage'
import { STORAGE_KEY as LEARNING_KEY } from './curriculum/lib/progress'
import * as poker from './lib/poker'

vi.mock('./components/Surface', () => ({
  default: () => <div data-testid="surface">Interactive terrain</div>,
}))

beforeEach(() => {
  vi.stubGlobal(
    'Worker',
    class {
      onmessage?: (event: unknown) => void
      postMessage({ key }: { key: string }) {
        this.onmessage?.({
          data: {
            key,
            analysis: {
              equity: 0.42,
              win: 0.41,
              tie: 0.02,
              loss: 0.57,
              improve: 0.3,
              nextCardVolatility: 0.1,
              bestNextCards: [],
              worstNextCards: [],
            },
          },
        })
      }
      terminate() {}
    },
  )
})

afterEach(() => vi.useRealTimers())

function navigate(hash: string) {
  act(() => {
    window.history.pushState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

describe('table and curriculum integration', () => {
  it('opens a related lesson with only visible cards and returns to the same hand', async () => {
    const user = userEvent.setup()
    render(<App />)
    const table = screen.getByRole('region', { name: 'Poker table' })
    const hand = table.textContent
    await user.click(
      screen.getByRole('link', { name: /Pot odds → expected payoff/ }),
    )
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'The price of a decision',
    )
    expect(
      screen.queryByRole('region', { name: 'Poker table' }),
    ).not.toBeInTheDocument()
    const bridge = screen.getByRole('region', { name: 'Your table connection' })
    expect(bridge).toHaveTextContent('YOUR HAND IS PAUSED')
    expect(bridge).toHaveTextContent('42.0%')
    expect(bridge).toHaveTextContent('Break-even equity')
    expect(bridge).not.toHaveTextContent('Atlas cards')
    await user.click(screen.getByRole('link', { name: /Return to this hand/ }))
    expect(
      (await screen.findByRole('region', { name: 'Poker table' })).textContent,
    ).toBe(hand)
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('suspends the pending bot turn during study and resumes it on return', async () => {
    const bot = vi.spyOn(poker, 'botAction').mockReturnValue({ type: 'fold' })
    render(<App />)
    navigate('#learn/path')
    await screen.findByRole('heading', {
      name: /A better way to think about risk/,
    })
    navigate('#table')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: /Raise to/ }))
    expect(screen.getByText('Atlas is thinking')).toBeInTheDocument()
    navigate('#learn/module/fold/learn')
    await act(async () => {})
    expect(
      screen.getByRole('region', { name: 'Your table connection' }),
    ).toHaveTextContent('Atlas is paused too')
    act(() => vi.advanceTimersByTime(5000))
    expect(bot).not.toHaveBeenCalled()
    expect(
      screen.getByRole('region', { name: 'Your table connection' }),
    ).toHaveTextContent('Atlas is paused too')
    navigate('#table')
    expect(screen.getByText('Atlas is thinking')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1100))
    expect(bot).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Atlas is thinking')).not.toBeInTheDocument()
  })

  it('preserves manually paused state and notebook contents across round trips', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Pause hand' }))
    navigate('#learn/notebook')
    const notes = await screen.findByRole('textbox', {
      name: 'Notes for The price of a decision',
    })
    await user.type(notes, 'Price the decision, not the outcome.')
    navigate('#table')
    expect(screen.getByText('Table paused')).toBeInTheDocument()
    navigate('#learn/notebook')
    expect(
      await screen.findByRole('textbox', {
        name: 'Notes for The price of a decision',
      }),
    ).toHaveValue('Price the decision, not the outcome.')
  })

  it('keeps legacy lessons and history separate when curriculum data is reset', async () => {
    const user = userEvent.setup()
    const legacy = {
      hands: [{ id: 'prior:1', hand: 1, net: 25, result: 'Won', guided: true }],
      lessons: ['equity'],
    }
    localStorage.setItem(TABLE_KEY, JSON.stringify(legacy))
    localStorage.setItem(
      LEARNING_KEY,
      JSON.stringify({
        version: 1,
        completed: ['odds'],
        notes: { odds: 'Original' },
      }),
    )
    navigate('#learn/notebook')
    render(<App />)
    await user.click(
      await screen.findByRole('button', { name: 'Reset local learning data' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Delete my local learning data' }),
    )
    expect(JSON.parse(localStorage.getItem(TABLE_KEY)!)).toEqual(legacy)
    expect(JSON.parse(localStorage.getItem(LEARNING_KEY)!).completed).toEqual(
      [],
    )
    navigate('#table')
    await user.click(
      screen.getByRole('button', {
        name: 'Learn the concept behind this lens',
      }),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('retains in-memory learning notes across table navigation when storage is blocked', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    navigate('#learn/notebook')
    render(<App />)
    const notes = await screen.findByRole('textbox', {
      name: 'Notes for The price of a decision',
    })
    await user.type(notes, 'Keep this in memory')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Browser storage is unavailable',
    )
    navigate('#table')
    navigate('#learn/notebook')
    expect(
      await screen.findByRole('textbox', {
        name: 'Notes for The price of a decision',
      }),
    ).toHaveValue('Keep this in memory')
  })

  it('provides working module links from all three finance lenses', async () => {
    const user = userEvent.setup()
    render(<App />)
    const expected = [
      ['Decision', ['odds', 'outs', 'equity']],
      ['Optionality', ['fold', 'pricing', 'replication']],
      ['Protection', ['variance', 'replication', 'risk']],
    ] as const
    for (const [lens, ids] of expected) {
      await user.click(screen.getByRole('tab', { name: lens }))
      const links = within(
        screen.getByLabelText('Related curriculum modules'),
      ).getAllByRole('link')
      expect(links.map((link) => link.getAttribute('href'))).toEqual(
        ids.map((id) => `#learn/module/${id}/learn`),
      )
      if (lens === 'Protection') {
        expect(
          screen.getByText('Illustrative all-in cashout'),
        ).toBeInTheDocument()
        expect(screen.getByText('Run-twice dispersion')).toBeInTheDocument()
        expect(screen.getByText('Full Kelly ceiling')).toBeInTheDocument()
        expect(
          screen.getByText(/resembles insurance—not a CDS price/),
        ).toBeInTheDocument()
      }
    }
  })

  it('handles a curriculum deep link, hash navigation, and completed-hand return without resetting the game', async () => {
    const user = userEvent.setup()
    navigate('#learn/module/replication/lab')
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Build the same payoff twice',
    )
    await user.click(screen.getByRole('button', { name: 'Play & learn' }))
    await user.click(
      await screen.findByRole('button', { name: /Fold.*Step away/ }),
    )
    expect(
      screen.getByRole('button', { name: /Deal next hand/ }),
    ).toBeInTheDocument()
    navigate('#learn/map')
    expect(
      await screen.findByRole('region', { name: 'Your table connection' }),
    ).toHaveTextContent('YOUR COMPLETED HAND')
    navigate('#table')
    expect(
      screen.getByRole('button', { name: /Deal next hand/ }),
    ).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(TABLE_KEY)!).hands).toHaveLength(1)
  })
})
