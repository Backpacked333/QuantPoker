import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Landing from './Landing'
import { parseLearningRoute } from './curriculum/core/routes'

describe('landing page', () => {
  it('introduces the product with working practice, learning, online and legal links', () => {
    render(<Landing hash="" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Play the hand. See the bigger picture.',
    )
    expect(
      screen.getByRole('link', { name: 'Play a practice hand' }),
    ).toHaveAttribute('href', '#table')
    expect(
      screen.getByRole('link', { name: 'Find your first lesson' }),
    ).toHaveAttribute('href', '#learn/path')
    expect(screen.getByRole('link', { name: 'Play online' })).toHaveAttribute(
      'href',
      '#lobby',
    )
    const footer = screen.getByRole('navigation', { name: 'Footer' })
    expect(
      within(footer).getByRole('link', { name: 'Fair play' }),
    ).toHaveAttribute('href', '#fair-play')
    expect(
      within(footer).getByRole('link', { name: 'Terms of play' }),
    ).toHaveAttribute('href', '#terms')
  })

  it.each([
    [10, '−12.5 chips', 'Negative EV'],
    [20, '0.0 chips', 'Break-even'],
    [30, '+12.5 chips', 'Positive EV'],
    [60, '+50.0 chips', 'Positive EV'],
  ])(
    'prices the example at a %i percent assumed win chance',
    (chance, result, verdict) => {
      render(<Landing hash="" />)
      fireEvent.change(
        screen.getByRole('slider', { name: 'Your assumed win chance' }),
        { target: { value: chance } },
      )
      expect(screen.getAllByRole('status')[0]).toHaveTextContent(result)
      expect(screen.getByText(verdict, { exact: true })).toBeVisible()
      expect(
        screen.getByRole('img', { name: /Expected value rises/ }),
      ).toHaveAccessibleName(new RegExp(`At ${chance} percent`))
      expect(
        screen.getByText(/Illustrative hand, not calculated card odds/),
      ).toBeVisible()
    },
  )

  it('only links to supported curriculum modules', () => {
    render(<Landing hash="" />)
    const links = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('#learn/module/'))
    expect(links).toHaveLength(4)
    for (const link of links) {
      const href = link.getAttribute('href')!
      expect(parseLearningRoute(href)).toMatchObject({
        kind: 'module',
        id: href.split('/')[2],
      })
    }
  })

  it('opens native FAQs and discloses product boundaries', async () => {
    const user = userEvent.setup()
    render(<Landing hash="" />)
    const question = screen.getByText('Is this real-money poker?')
    await user.click(question)
    expect(question.closest('details')).toHaveAttribute('open')
    expect(screen.getByText(/There are no deposits, withdrawals/)).toBeVisible()
    await user.click(question)
    expect(question.closest('details')).not.toHaveAttribute('open')
  })

  it('restores a landing section on direct navigation', () => {
    const scrollIntoView = vi.fn()
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    try {
      const { rerender } = render(<Landing hash="#inside" />)
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'start',
        behavior: 'instant',
      })
      rerender(<Landing hash="#home" />)
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: 'instant',
      })
    } finally {
      HTMLElement.prototype.scrollIntoView = original
    }
  })

  it('lets visitors pause animations and replay the card deal', async () => {
    const user = userEvent.setup()
    const { container } = render(<Landing hash="" />)
    await user.click(screen.getByRole('button', { name: 'Pause animations' }))
    expect(container.firstChild).toHaveClass('lp-motion-paused')
    await user.click(screen.getByRole('button', { name: 'Resume animations' }))
    expect(container.firstChild).not.toHaveClass('lp-motion-paused')
    const cards = container.querySelector('.lp-cards')
    await user.click(screen.getByRole('button', { name: 'Replay card deal' }))
    expect(container.querySelector('.lp-cards')).not.toBe(cards)
  })
})
