// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { gradeDecision } from '../lib/grading'
import { guidedHand, legalActions } from '../lib/poker'
import { analyzeSpot } from '../lib/range'
import { lcg } from '../lib/sim'
import { ActionBar } from './table/ActionBar'
import type { ActionMath, GuessProps } from './table/ActionBar'
import { HandReview } from './review/HandReview'
import type { HeroDecision } from '../state/trainer'
import { act } from '../lib/poker'

afterEach(cleanup)

const game = guidedHand()
const legal = legalActions(game)
const math: ActionMath = {
  revealed: false,
  ready: true,
  equity: 0.6,
  breakEven: 0.2,
  callEV: 78,
  raiseEV: 94,
  foldProbability: 0.06,
  bestKind: 'raise',
}
const guess = (patch: Partial<GuessProps> = {}): GuessProps => ({
  show: true,
  value: 0.5,
  locked: null,
  onChange: vi.fn(),
  onLock: vi.fn(),
  onSkip: vi.fn(),
  ...patch,
})
const bar = (overrides: Partial<Parameters<typeof ActionBar>[0]> = {}) =>
  render(
    <ActionBar
      game={game}
      legal={legal}
      yourTurn
      heroTurn
      paused={false}
      raiseTo={140}
      presets={[{ label: '½ pot', key: '1', to: 140, ev: 94 }]}
      math={math}
      guess={guess()}
      shortcuts
      onRaiseTo={vi.fn()}
      onAct={vi.fn()}
      onDeal={vi.fn()}
      onReview={vi.fn()}
      {...overrides}
    />,
  )

describe('action bar', () => {
  it('hides the math until the read is locked in', () => {
    const lock = vi.fn()
    bar({ guess: guess({ onLock: lock }) })
    expect(screen.getByText(/Your read first/)).toBeTruthy()
    expect(screen.queryByText('+78 EV')).toBeNull()
    expect(screen.queryByText('Model’s pick')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Lock in/ }))
    expect(lock).toHaveBeenCalled()
  })
  it('reveals equity, EV and preset values once revealed', () => {
    bar({
      math: { ...math, revealed: true },
      guess: guess({ locked: { guess: 0.55, actual: 0.6 } }),
    })
    expect(screen.getByText('+78 EV')).toBeTruthy()
    expect(screen.getAllByText('60%')).toHaveLength(2)
    expect(screen.getByText('+94')).toBeTruthy()
    expect(screen.getByText('Sharp read')).toBeTruthy()
  })
  it('reports which action was chosen', () => {
    const onAct = vi.fn()
    bar({ onAct })
    fireEvent.click(screen.getByRole('button', { name: /Call 40/ }))
    fireEvent.click(screen.getByRole('button', { name: /Raise to 140/ }))
    expect(onAct.mock.calls).toEqual([['continue'], ['raise']])
  })
  it('offers the next hand after a result', () => {
    const onDeal = vi.fn()
    const done = act(game, { type: 'fold' })
    bar({ game: done, onDeal })
    expect(screen.getByText(/One outcome is a data point/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Deal next hand/ }))
    expect(onDeal).toHaveBeenCalled()
  })
})

describe('hand review', () => {
  it('grades the decision and reveals Atlas’s notes', () => {
    const spot = analyzeSpot(
      {
        key: 'k',
        hole: game.cards[0],
        board: game.board,
        history: game.history,
        style: 'balanced',
      },
      lcg(4),
    )
    const decision: HeroDecision = {
      snapshot: game,
      action: { type: 'fold' },
      key: 'k',
      handClass: 'Flush draw',
      guess: 0.4,
    }
    const grade = gradeDecision(game, decision.action, spot, 'balanced')
    render(
      <HandReview
        game={act(game, { type: 'fold' })}
        decisions={[decision]}
        grades={[grade]}
        selected={0}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getAllByText(grade.grade).length).toBeGreaterThan(0)
    expect(screen.getByText(/gave up/)).toBeTruthy()
    expect(screen.getByText(/Your read was 40%/)).toBeTruthy()
    expect(screen.getByText(/one-third-pot bet/)).toBeTruthy()
  })
})
