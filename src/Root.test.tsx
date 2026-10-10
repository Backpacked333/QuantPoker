import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Root from './Root'
import { rememberAuthReturn, restoreAuthReturn } from './lib/authReturn'

const appLoad = vi.hoisted(() => vi.fn())
vi.mock('./App', () => {
  appLoad()
  return { default: () => <div>Existing QuantPoker app</div> }
})
vi.mock('./Landing', () => ({ default: () => <h1>QuantPoker landing</h1> }))

function navigate(hash: string) {
  act(() => {
    window.history.replaceState(null, '', `/${hash}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

describe('root navigation', () => {
  it('does not load the trainer when visiting the homepage', () => {
    render(<Root />)
    expect(screen.getByRole('heading')).toHaveTextContent('QuantPoker landing')
    expect(appLoad).not.toHaveBeenCalled()
  })

  it.each([
    '#home',
    '#landing-main',
    '#approach',
    '#inside',
    '#questions',
    '#experiment',
  ])('keeps %s inside the landing page', (hash) => {
    navigate(hash)
    render(<Root />)
    expect(screen.getByRole('heading')).toHaveTextContent('QuantPoker landing')
  })

  it.each([
    '#table',
    '#learn/path',
    '#progress',
    '#lobby',
    '#lobby/find',
    '#play/33333333-3333-4333-8333-333333333333',
    '#fair-play',
    '#terms',
  ])('preserves the existing %s deep link', async (hash) => {
    navigate(hash)
    render(<Root />)
    expect(await screen.findByText('Existing QuantPoker app')).toBeVisible()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('switches between the homepage and the app on hash changes', async () => {
    render(<Root />)
    navigate('#table')
    expect(await screen.findByText('Existing QuantPoker app')).toBeVisible()
    navigate('#home')
    expect(screen.getByRole('heading')).toHaveTextContent('QuantPoker landing')
    navigate('#learn/path')
    expect(await screen.findByText('Existing QuantPoker app')).toBeVisible()
  })

  it('opens the online app after a remembered authentication return', async () => {
    rememberAuthReturn('#lobby')
    window.history.replaceState(null, '', '/?code=return-code')
    restoreAuthReturn()
    render(<Root />)
    expect(await screen.findByText('Existing QuantPoker app')).toBeVisible()
    expect(window.location.hash).toBe('#lobby')
  })
})
