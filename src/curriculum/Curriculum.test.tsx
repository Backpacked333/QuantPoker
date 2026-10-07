import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './Curriculum'
import { modules } from './curriculum'
import { Lab } from './components/Labs'
import { Checkpoint } from './components/Checkpoint'
import { LEARNING_KEY as STORAGE_KEY } from './core/persistence'

function navigate(hash: string) {
  act(() => {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

describe('learning workspace', () => {
  it('shows honest initial progress and filters modules', async () => {
    const user = userEvent.setup()
    navigate('#learn/core')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'A better way to think about risk.',
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0')
    expect(
      screen.getByRole('link', { name: /Start your learning path/ }),
    ).toHaveAttribute('href', '#learn/module/odds/learn')
    await user.click(screen.getByRole('button', { name: 'Foundations' }))
    expect(
      screen.getByRole('heading', { name: 'Count the possible futures' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'The value of a response' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /All modules/ }))
    expect(
      screen.getByRole('heading', { name: 'The value of a response' }),
    ).toBeInTheDocument()
  })

  it('supports direct lesson links, recommended prerequisites and section navigation', () => {
    navigate('#learn/module/pricing/learn')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Good bets. Fair prices.',
    )
    expect(screen.getByText(/Recommended first/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pot odds' })).toHaveAttribute(
      'href',
      '#learn/module/odds/learn',
    )
    navigate('#learn/module/pricing/lab')
    expect(
      screen.getByRole('heading', { name: 'A forecast is not a price' }),
    ).toBeInTheDocument()
    navigate('#learn/module/pricing/check')
    expect(
      screen.getByRole('heading', { name: 'Think it through.' }),
    ).toBeInTheDocument()
  })

  it('searches concept mappings, exposes boundaries, and clears empty results', async () => {
    const user = userEvent.setup()
    navigate('#learn/connections')
    render(<App />)
    await user.type(
      screen.getByRole('textbox', { name: 'Search concepts' }),
      'delta',
    )
    expect(
      screen.getByRole('heading', { name: 'Delta hedging & put-call parity' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Pot odds' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByText('Where the analogy stops'))
    expect(
      screen.getByText(
        /Poker hands generally cannot be dynamically replicated/,
      ),
    ).toBeVisible()
    await user.clear(screen.getByRole('textbox', { name: 'Search concepts' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Search concepts' }),
      'no-such-concept',
    )
    expect(
      screen.getByRole('heading', { name: 'No connections found' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(
      screen.getByRole('heading', { name: 'Pot odds' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Risk & hedging' }))
    expect(
      screen.getByRole('heading', { name: 'All-in cashouts & bankroll' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Variance' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Pot odds' }),
    ).not.toBeInTheDocument()
  })

  it('saves notes across views and reloads, cancels reset, then confirms deletion', async () => {
    const user = userEvent.setup()
    navigate('#learn/module/odds/learn')
    const view = render(<App />)
    await user.type(
      screen.getByRole('textbox', { name: 'Your field notes' }),
      'Count the call in the final pot.',
    )
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).legacy.notes.odds,
    ).toBe('Count the call in the final pot.')
    navigate('#learn/notebook')
    expect(
      screen.getByRole('textbox', {
        name: 'Notes for The price of a decision',
      }),
    ).toHaveValue('Count the call in the final pot.')
    view.unmount()
    render(<App />)
    expect(
      screen.getByRole('textbox', {
        name: 'Notes for The price of a decision',
      }),
    ).toHaveValue('Count the call in the final pot.')
    await user.click(
      screen.getByRole('button', { name: 'Reset local learning data' }),
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.getByRole('textbox', {
        name: 'Notes for The price of a decision',
      }),
    ).not.toHaveValue('')
    await user.click(
      screen.getByRole('button', { name: 'Reset local learning data' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Delete my local learning data' }),
    )
    expect(
      screen.getByRole('textbox', {
        name: 'Notes for The price of a decision',
      }),
    ).toHaveValue('')
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).legacy.completed,
    ).toEqual([])
  })

  it('survives unavailable storage and warns without blocking notes', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Unavailable')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Unavailable')
    })
    navigate('#learn/module/odds/learn')
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Browser storage is unavailable',
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Your field notes' }),
      'In-memory notes',
    )
    expect(
      screen.getByRole('textbox', { name: 'Your field notes' }),
    ).toHaveValue('In-memory notes')
  })

  it('persists mastery only after both correct answers, then recommends the next module', async () => {
    const user = userEvent.setup()
    navigate('#learn/module/odds/check')
    const view = render(<App />)
    expect(
      screen.getByRole('button', { name: /Check my understanding/ }),
    ).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: '25%' }))
    await user.click(
      screen.getByRole('radio', {
        name: 'Its probability-weighted incremental profit is positive.',
      }),
    )
    await user.click(
      screen.getByRole('button', { name: /Check my understanding/ }),
    )
    expect(screen.getByRole('status')).toHaveTextContent('Connection made.')
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '1')
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).legacy.completed,
    ).toEqual(['odds'])
    view.unmount()
    navigate('#learn/core')
    render(<App />)
    expect(
      screen.getByRole('link', { name: /Continue learning/ }),
    ).toHaveAttribute('href', '#learn/module/outs/learn')
  })

  it('keeps mobile navigation operable and closes it on selection', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(
      screen.getByRole('button', { name: 'Open navigation' }),
    ).toHaveAttribute('aria-expanded', 'true')
    await user.click(
      within(
        screen.getByRole('navigation', { name: 'Curriculum navigation' }),
      ).getByRole('link', { name: 'Concept atlas' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        '96-family concept atlas',
      ),
    )
    expect(
      screen.getByRole('button', { name: 'Open navigation' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('falls back safely for malformed or unknown routes', () => {
    navigate('#learn/module/unknown/unknown')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'The price of a decision',
    )
    navigate('#bad-route')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Foundations for defensible decisions',
    )
  })

  it('exports a Markdown notebook with progress and notes', async () => {
    const user = userEvent.setup()
    const create = vi.fn().mockReturnValue('blob:notes')
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    navigate('#learn/notebook')
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Export notes' }))
    expect(create).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
  })
})

describe('mastery feedback', () => {
  it('does not award completion for a failed attempt and supports retry', async () => {
    const user = userEvent.setup()
    const complete = vi.fn()
    render(
      <Checkpoint
        module={modules[0]}
        completed={false}
        onComplete={complete}
        onNext={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('radio', { name: '20%' }))
    await user.click(screen.getByRole('radio', { name: 'It is risk-free.' }))
    await user.click(
      screen.getByRole('button', { name: /Check my understanding/ }),
    )
    expect(complete).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('0 of 2 correct')
    expect(screen.getByRole('radio', { name: '20%' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      screen.getByRole('button', { name: /Check my understanding/ }),
    ).toBeDisabled()
    expect(screen.getByRole('radio', { name: '20%' })).not.toBeChecked()
  })
})

describe('live model controls', () => {
  it.each(modules.map((module) => [module.id] as const))(
    'renders lab %s with assumptions and labeled sliders',
    (id) => {
      render(<Lab id={id} />)
      expect(screen.getByText('Model assumptions')).toBeInTheDocument()
      expect(screen.getAllByRole('slider').length).toBeGreaterThan(0)
      for (const slider of screen.getAllByRole('slider'))
        expect(slider).toHaveAccessibleName()
      expect(
        screen.getByRole('button', { name: 'Reset inputs' }),
      ).toBeInTheDocument()
    },
  )

  it('recalculates pot odds and resets the experiment', async () => {
    const user = userEvent.setup()
    render(<Lab id="odds" />)
    expect(screen.getByText('+12.50')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: /Your equity/ }), {
      target: { value: '0' },
    })
    expect(screen.getByText('-25.00')).toBeInTheDocument()
    expect(screen.getByText('Folding has higher EV')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset inputs' }))
    expect(screen.getByText('+12.50')).toBeInTheDocument()
  })

  it('does not confuse physical forecasts with risk-neutral prices', () => {
    render(<Lab id="pricing" />)
    expect(screen.getByText('11.90')).toBeInTheDocument()
    expect(screen.getByText('10.00')).toBeInTheDocument()
    fireEvent.change(
      screen.getByRole('slider', { name: /Physical up probability/ }),
      { target: { value: '100' } },
    )
    expect(screen.getByText('11.90')).toBeInTheDocument()
    expect(screen.getByText('20.00')).toBeInTheDocument()
  })

  it('keeps equity probability mass within 100%', () => {
    render(<Lab id="equity" />)
    fireEvent.change(screen.getByRole('slider', { name: /Win probability/ }), {
      target: { value: '100' },
    })
    expect(screen.getByRole('slider', { name: /Tie probability/ })).toHaveValue(
      '0',
    )
    expect(screen.getByText('100.0%')).toBeInTheDocument()
  })

  it('prices an all-in cashout and removes repeated risk at zero Kelly', () => {
    render(<Lab id="risk" />)
    const cashout = screen.getByText('Take cashout · EV').parentElement!
    expect(within(cashout).getByText('+8.90')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Cashout fee' }), {
      target: { value: '5' },
    })
    expect(within(cashout).getByText('+4.50')).toBeInTheDocument()
    fireEvent.change(
      screen.getByRole('slider', { name: 'Fraction of full Kelly' }),
      { target: { value: '0' } },
    )
    const ruin = screen.getByText('100-bet ruin probability').parentElement!
    expect(within(ruin).getByText('0.0%')).toBeInTheDocument()
    const expected = screen.getByText('Expected final bankroll').parentElement!
    expect(within(expected).getByText('1,000.00')).toBeInTheDocument()
  })
})
