import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Term } from './Term'

describe('Term', () => {
  it('describes the word for assistive tech and pins on tap until Escape', async () => {
    const user = userEvent.setup()
    render(
      <p>
        Your <Term k="equity">equity</Term>
      </p>,
    )
    const word = screen.getByRole('button', { name: 'equity' })
    expect(word).toHaveAccessibleDescription(/share of the pot/)
    await user.click(word)
    expect(word).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(word).toHaveAttribute('aria-expanded', 'false')
  })
})
