// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HandLesson } from './HandLesson'
import { createHandLesson } from '../lib/hand-lesson'

afterEach(cleanup)
const lesson = createHandLesson('equity', 160, 40)
function mount(ready = true) {
  const onExplore = vi.fn()
  const onLesson = vi.fn()
  render(
    <HandLesson
      lesson={lesson}
      ready={ready}
      onExplore={onExplore}
      onLesson={onLesson}
    />,
  )
  return { user: userEvent.setup(), onExplore, onLesson }
}

describe('guided learning', () => {
  it('starts with context, then asks before revealing worked feedback', async () => {
    const { user } = mount()
    expect(screen.getByText(/160 chips in the pot/)).toBeTruthy()
    expect(screen.queryByLabelText('Worked example')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Make a prediction' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Predict step'))
    expect(
      (
        screen.getByRole('button', {
          name: 'Check my reasoning',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(screen.getByText('0/2 checks correct · this decision')).toBeTruthy()
    await user.click(
      screen.getByRole('radio', { name: 'Call ÷ pot before calling' }),
    )
    expect(screen.queryByRole('status')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Check my reasoning' }))
    expect(screen.getByRole('status').textContent).toContain(
      'denominator must include the call',
    )
    expect(screen.getByLabelText('Worked example').textContent).toContain(
      '40 ÷ 200 = 20.0%',
    )
    expect(screen.getByText('0/2 checks correct · this decision')).toBeTruthy()
  })

  it('allows correction, tracks only correct checks and preserves answers between steps', async () => {
    const { user, onLesson } = mount()
    await user.click(screen.getByRole('button', { name: '2 Predict' }))
    await user.click(
      screen.getByRole('radio', { name: 'Call ÷ your remaining stack' }),
    )
    await user.click(screen.getByRole('button', { name: 'Check my reasoning' }))
    await user.click(screen.getByRole('radio', { name: 'Call ÷ (pot + call)' }))
    expect(screen.queryByRole('status')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Check my reasoning' }))
    expect(screen.getByText('1/2 checks correct · this decision')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '4 Apply' }))
    await user.click(
      screen.getByRole('radio', {
        name: 'One result cannot establish the quality of the decision',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Check my reasoning' }))
    expect(screen.getByText('2/2 checks correct · this decision')).toBeTruthy()
    await user.click(
      screen.getByRole('button', { name: 'Read the full lesson' }),
    )
    expect(onLesson).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '2 Predict' }))
    expect(
      (
        screen.getByRole('radio', {
          name: 'Call ÷ (pot + call)',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('1/2 checks correct · this decision')).toBeTruthy()
    expect(
      (
        screen.getByRole('button', {
          name: 'Check my reasoning',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('keeps exploration available without answering a quiz', async () => {
    const { user, onExplore } = mount()
    await user.click(screen.getByRole('button', { name: 'Explore freely' }))
    await user.click(screen.getByRole('button', { name: 'At break-even' }))
    expect(onExplore).toHaveBeenLastCalledWith(0.2)
    expect(
      screen
        .getByRole('button', { name: 'At break-even' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Open model' }))
    expect(onExplore).toHaveBeenLastCalledWith(null)
  })

  it('does not offer a ready experiment while analysis is loading', async () => {
    const { user, onExplore } = mount(false)
    await user.click(screen.getByRole('button', { name: 'Explore freely' }))
    await user.click(screen.getByRole('button', { name: 'At break-even' }))
    expect(onExplore).not.toHaveBeenCalled()
    expect(
      screen.getByText(/ready when visible-card analysis finishes/),
    ).toBeTruthy()
  })
})
