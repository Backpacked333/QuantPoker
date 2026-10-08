import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import type { RunController } from '../../core/experiments'
import type { LearningSession } from '../../core/session'
import { attemptFor } from '../../core/__fixtures__/testing'
import { backtestCases } from './cases'
import { backtestManifest } from './manifest'
import { protocolFor, preregister } from './protocol'
import { LoopbackWorker, prediction, testController } from './testing'
import type { BacktestInputs, BacktestOutput } from './model'
import View from './View'
import Entry from './Entry'

const workers: LoopbackWorker[] = []
class BrowserWorkerMock extends LoopbackWorker {
  constructor() {
    super()
    workers.push(this)
  }
}
function Harness({
  c,
  session,
}: {
  c: RunController<BacktestInputs, BacktestOutput>
  session: LearningSession
}) {
  useSyncExternalStore(c.subscribe, c.getRevision, c.getRevision)
  return <View key={c.attempt.id} controller={c} evidence={session} />
}
afterEach(() => {
  vi.unstubAllGlobals()
  workers.splice(0)
})
async function runToResults(c: RunController<BacktestInputs, BacktestOutput>) {
  fireEvent.click(
    screen.getByRole('button', { name: 'Run development search' }),
  )
  await screen.findByRole('table', { name: 'Complete development leaderboard' })
  expect(
    screen.queryByRole('table', { name: 'Primary held-out evaluation' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Reveal primary held-out evaluation' }),
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Freeze selected candidate and full protocol',
    }),
  )
  expect(protocolFor(c).stage).toBe('candidate_frozen')
  fireEvent.click(
    screen.getByRole('button', { name: 'Reveal primary held-out evaluation' }),
  )
  await screen.findByRole('table', { name: 'Primary held-out evaluation' })
}
describe('accessible backtest controls and immutable learning interaction (jsdom, not browser)', () => {
  it('supports numeric controls, rejects invalid edits, registers prediction then freezes/reveals/results/reflection', async () => {
    vi.stubGlobal('Worker', BrowserWorkerMock)
    const { c, session } = testController()
    render(<Harness c={c} session={session} />)
    expect(
      screen.getByRole('spinbutton', {
        name: 'Candidate policies (candidates)',
      }),
    ).toHaveValue(20)
    expect(
      screen.getByRole('slider', {
        name: 'Candidate policies slider (candidates)',
      }),
    ).toHaveValue('20')
    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: 'Candidate policies (candidates)',
      }),
      { target: { value: '2.5' } },
    )
    expect(c.inputs.candidateCount).toBe(20)
    expect(
      screen.getByRole('spinbutton', {
        name: 'Candidate policies (candidates)',
      }),
    ).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(
      screen.getByRole('slider', {
        name: 'Candidate policies slider (candidates)',
      }),
      { target: { value: '3' } },
    )
    expect(c.inputs.candidateCount).toBe(3)
    fireEvent.change(
      screen.getByLabelText('Preregistered hypothesis (ungraded)'),
      { target: { value: 'The independent null mean remains zero.' } },
    )
    fireEvent.change(
      screen.getByLabelText('Falsification condition (ungraded)'),
      { target: { value: 'A net interval crossing zero fails the claim.' } },
    )
    fireEvent.change(screen.getByLabelText(/Prediction rationale/), {
      target: { value: prediction.rationale },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Commit prediction' }))
    expect(c.phase).toBe('prediction_committed')
    const original = c.attempt
    expect(
      screen.getByRole('spinbutton', {
        name: 'Cost per observation (outcome units)',
      }),
    ).toBeDisabled()
    await runToResults(c)
    const table = screen.getByRole('table', {
      name: 'Primary held-out evaluation',
    })
    expect(
      within(table).getByText('95% Wilson win-proportion interval'),
    ).toBeInTheDocument()
    expect(
      within(
        screen.getByRole('table', { name: 'Complete development leaderboard' }),
      ).getAllByRole('row'),
    ).toHaveLength(4)
    expect(c.attempt.prediction).toEqual(original.prediction)
    expect(workers).toHaveLength(2)
    expect(workers.every((w) => w.terminated === 1)).toBe(true)
    fireEvent.change(screen.getByLabelText(/Research reflection/), {
      target: { value: 'This net realization does not prove skill.' },
    })
    expect(protocolFor(c).stage).toBe('research_reflection')
    expect(c.attempt.evaluation).toBeUndefined()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Start a linked new experiment (retain research history)',
      }),
    )
    expect(c.phase).toBe('draft')
    expect(c.attempt.parentAttemptId).toBe(original.id)
    expect(
      session.store.attempts.find((a) => a.id === original.id)?.resultSummary,
    ).toBeDefined()
    expect(protocolFor(c).history.totalSearches).toBe(3)
    expect(
      screen.getByRole('button', { name: 'Commit prediction' }),
    ).toBeInTheDocument()
  })
  it('requires preregistration text, and preserves committed prediction after cancel/unmount', async () => {
    vi.stubGlobal('Worker', BrowserWorkerMock)
    const { c, session } = testController()
    const rendered = render(<Harness c={c} session={session} />)
    fireEvent.change(screen.getByLabelText(/Prediction rationale/), {
      target: { value: prediction.rationale },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Commit prediction' }))
    expect(c.phase).toBe('draft')
    expect(screen.getByRole('alert')).toHaveTextContent('hypothesis')
    act(() =>
      preregister(c, 'Null mean.', 'Interval crossing zero.', prediction),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Run development search' }),
    )
    await screen.findByRole('table', {
      name: 'Complete development leaderboard',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel research' }))
    expect(c.phase).toBe('prediction_committed')
    expect(c.attempt.prediction).toEqual(prediction)
    expect(
      screen.getByRole('button', { name: 'Resume preserved research' }),
    ).toBeEnabled()
    rendered.unmount()
  })
  it('assessment mode submits structured case answers with assistance tracked before feedback', async () => {
    vi.stubGlobal('Worker', BrowserWorkerMock)
    const { c, session } = testController(true)
    act(() => preregister(c, 'Null mean.', 'Bound crossing zero.', prediction))
    render(<Harness c={c} session={session} />)
    await runToResults(c)
    const answers = attemptFor(backtestCases[0]).answers
    for (const q of backtestCases[0].questions) {
      if (q.kind === 'numeric' || q.kind === 'choice')
        fireEvent.change(
          screen.getByLabelText(
            new RegExp(q.prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
          ),
          { target: { value: answers[q.id] } },
        )
      else {
        const field = screen.getByRole('group', { name: q.prompt })
        within(field)
          .getAllByRole('combobox')
          .forEach((select, k) =>
            fireEvent.change(select, {
              target: { value: (answers[q.id] as string[])[k] },
            }),
          )
      }
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Reveal hint 1: freeze-order' }),
    )
    expect(
      session.store.attempts.find((a) => a.id === c.attempt.id)?.assistance
        .hintIds,
    ).toContain(`${backtestCases[0].id}:freeze-order:1`)
    fireEvent.click(
      screen.getByRole('button', { name: 'Submit structured reasoning' }),
    )
    expect(c.attempt.evaluation?.passed).toBe(true)
    expect(c.attempt.evaluation?.eligible).toBe(false)
    expect(c.attempt.evaluation?.unaided).toBe(false)
    expect(
      screen.getByRole('button', { name: 'Submit structured reasoning' }),
    ).toBeDisabled()
  })
  it('lazy manifest View and root-supplied Entry compile; switching learning modes cancels active research', async () => {
    vi.stubGlobal('Worker', BrowserWorkerMock)
    expect((await backtestManifest.loadView()).default).toBe(View)
    const { session } = testController()
    render(<Entry session={session} />)
    expect(
      screen.getByRole('combobox', { name: 'Backtest learning mode' }),
    ).toBeInTheDocument()
    await screen.findByLabelText('Preregistered hypothesis (ungraded)')
    fireEvent.change(
      screen.getByLabelText('Preregistered hypothesis (ungraded)'),
      { target: { value: 'Null mean.' } },
    )
    fireEvent.change(
      screen.getByLabelText('Falsification condition (ungraded)'),
      { target: { value: 'Crossing zero.' } },
    )
    fireEvent.change(screen.getByLabelText(/Prediction rationale/), {
      target: { value: prediction.rationale },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Commit prediction' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Run development search' }),
    )
    await screen.findByRole('table', {
      name: 'Complete development leaderboard',
    })
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Backtest learning mode' }),
      { target: { value: backtestCases[0].id } },
    )
    await waitFor(() =>
      expect(
        [...session.runtimes.values()].every(
          (c) => !('phase' in c) || c.phase !== 'running',
        ),
      ).toBe(true),
    )
    expect(
      screen.getByRole('heading', { name: backtestCases[0].title }),
    ).toBeInTheDocument()
  })
})
