import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CallPlayground from './CallPlayground'

describe('call playground', () => {
  it('lets visitors select scenarios and set custom assumptions', async () => {
    const user = userEvent.setup()
    render(<CallPlayground />)
    const scenario = screen.getByRole('button', { name: 'Too expensive' })
    await user.click(scenario)
    expect(scenario).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('slider', { name: /Win chance/ })).toHaveValue('15')
    expect(screen.getByRole('slider', { name: /Cost to call/ })).toHaveValue(
      '50',
    )
    expect(screen.getByText('−27.50')).toBeVisible()
    fireEvent.change(screen.getByRole('slider', { name: /Win chance/ }), {
      target: { value: '40' },
    })
    expect(scenario).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('+10.00')).toBeVisible()
  })

  it('reports a random sample, allows inspecting it, and labels stale assumptions', async () => {
    const user = userEvent.setup()
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9)
    try {
      render(<CallPlayground />)
      await user.click(screen.getByRole('button', { name: 'Run 100 calls' }))
      const summary = screen.getByRole('status')
      expect(summary).toHaveTextContent('0 / 100')
      expect(summary).toHaveTextContent('−2,500 chips')
      expect(summary).toHaveTextContent('+1,250 chips')
      fireEvent.change(screen.getByRole('slider', { name: /Inspect call/ }), {
        target: { value: '1' },
      })
      expect(screen.getByRole('img')).toHaveAccessibleName(
        /At call 1: −25 chips/,
      )
      await user.click(screen.getByRole('button', { name: 'Too expensive' }))
      expect(screen.getByText(/Settings changed/)).toBeVisible()
      expect(within(summary).getByText('−2,500')).toBeVisible()
      await user.click(
        screen.getByRole('button', { name: 'Run another 100 calls' }),
      )
      expect(summary).toHaveTextContent('−5,000 chips')
      expect(summary).toHaveTextContent('−2,750 chips')
      expect(screen.queryByText(/Settings changed/)).not.toBeInTheDocument()
    } finally {
      random.mockRestore()
    }
  })
})
