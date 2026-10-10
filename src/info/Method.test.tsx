import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import InfoPage from './InfoPages'

describe('the Method page', () => {
  it('states glicko2.v1, τ, the provisional rule, the ±2 bb draw band and the accuracy label', () => {
    render(<InfoPage page="method" />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Method' }),
    ).toBeInTheDocument()
    const rating = screen.getByRole('region', {
      name: 'The rating: Glicko-2',
    })
    expect(rating).toHaveTextContent('glicko2.v1')
    expect(rating).toHaveTextContent('τ = 0.5')
    expect(rating).toHaveTextContent('1500 ± 350')
    expect(rating).toHaveTextContent('One rated match is one rating period')
    expect(rating).toHaveTextContent('every 30 days without a rated match')
    expect(rating).toHaveTextContent('μ′ = μ + φ′² · g(φⱼ) · (s − E)')
    expect(
      screen.getByRole('region', { name: 'Provisional ratings' }),
    ).toHaveTextContent(/under 100 and the player has 20 rated matches/)
    const result = screen.getByRole('region', { name: 'What counts as a win' })
    expect(result).toHaveTextContent(
      'at most 2 big blinds, exactly 2.00 included, is a draw',
    )
    expect(result).toHaveTextContent('win 1, draw 0.5, loss 0')
    const accuracy = screen.getByRole('region', { name: 'Accuracy' })
    expect(accuracy).toHaveTextContent(
      'Accuracy vs. a model opponent, not a solver.',
    )
    expect(accuracy).toHaveTextContent('grade.v1+population.v1')
    expect(accuracy).toHaveTextContent('latest 500 graded decisions')
  })

  it('states the ladder rules and what the numbers do not measure', () => {
    render(<InfoPage page="method" />)
    expect(
      screen.getByRole('region', { name: 'The ladder' }),
    ).toHaveTextContent(
      /not provisional, have played a rated match in the last 30 days, and have abandoned fewer than 10% .*\(exactly 10% is off\)/,
    )
    const not = screen.getByRole('region', {
      name: 'What these numbers do not measure',
    })
    expect(not).toHaveTextContent(/not a solver/)
    expect(not).toHaveTextContent(/wide ± means few matches/)
  })
})
