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
import {
  createExperimentController,
  useExperimentController,
} from '../../core/experiments'
import { fixedClock, MemoryStorage } from '../../core/__fixtures__/testing'
import { LearningSession } from '../../core/session'
import { LEARNING_KEY } from '../../core/persistence'
import type { EvidenceCallbacks, ModelResult } from '../../core/types'
import { selectionManifest } from './manifest'
import {
  defaultInputs,
  defaultParameters,
  selectionExperimentModel,
  type SelectionOutput,
} from './model'
import { selectionCases } from './cases'
import SelectionView from './View'
import Entry from './Entry'

function options(session: LearningSession) {
  return {
    manifest: selectionManifest,
    session,
    caseId: 'selection-component-test',
    mode: 'explore' as const,
    seed: 42,
  }
}
function Harness({
  session,
  evidence = session,
}: {
  session: LearningSession
  evidence?: EvidenceCallbacks
}) {
  const controller = useExperimentController(options(session))
  return (
    <div className="curriculum-workspace">
      <SelectionView controller={controller} evidence={evidence} />
    </div>
  )
}
function setup() {
  const storage = new MemoryStorage(),
    session = new LearningSession(storage, fixedClock)
  const controller = createExperimentController(options(session))
  const view = render(<Harness session={session} />)
  return { storage, session, controller, view, user: userEvent.setup() }
}
async function predict(
  user: ReturnType<typeof userEvent.setup>,
  scope: Pick<typeof screen, 'getByRole'> = screen,
) {
  await user.type(
    scope.getByRole('textbox', { name: /Prediction rationale/ }),
    'Recording could depend on the outcome; equal rates would change the inference.',
  )
  fireEvent.change(
    scope.getByRole('spinbutton', { name: /Numeric estimate/ }),
    { target: { value: '20' } },
  )
  await user.click(scope.getByRole('button', { name: 'Commit prediction' }))
}
async function reveal(user: ReturnType<typeof userEvent.setup>) {
  await predict(user)
  await user.click(
    screen.getByRole('button', { name: 'Reveal synthetic population' }),
  )
  await screen.findByRole('table', { name: 'Expected recording flow by class' })
}
describe('selection observed-only → reveal → experiment → reflection', () => {
  it('never exposes target truth in DOM, hints, feedback or saved input before commitment and reveal', async () => {
    const { user, controller, session } = setup()
    expect(
      screen.getByRole('button', { name: 'Reveal synthetic population' }),
    ).toBeDisabled()
    expect(
      screen.queryByText(/300|700|1000|30\.0000%|10\.0000%|60\.0000%/),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('spinbutton', { name: /Target bluff/ }),
    ).not.toBeInTheDocument()
    for (let i = 0; i < 4; i++)
      await user.click(
        screen.getByRole('button', { name: /Next observation hint/ }),
      )
    expect(
      screen.queryByText(/30\.0000%|300 bets|population has/),
    ).not.toBeInTheDocument()
    const saved = session.store.attempts.find(
      (a) => a.id === controller.attempt.id,
    )!
    expect(saved.inputs).toEqual(defaultInputs)
    expect(saved.resultSummary).toBeUndefined()
    expect(saved.evaluation).toBeUndefined()
    expect(saved.assistance).toMatchObject({
      hintIds: [0, 1, 2, 3].map((i) => `selection:observation:${i}`),
      solutionViewed: true,
    })
    await predict(user)
    expect(controller.attempt.prediction?.numericEstimate).toBe(20)
    expect(controller.phase).toBe('prediction_committed')
    expect(controller.attempt.inputs).toEqual(defaultInputs)
    expect(
      screen.queryByRole('table', { name: 'Expected recording flow by class' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Reveal synthetic population' }),
    )
    const table = await screen.findByRole('table', {
      name: 'Expected recording flow by class',
    })
    expect(within(table).getByRole('cell', { name: '270' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: '280' })).toBeInTheDocument()
    expect(controller.attempt.inputs).toEqual(defaultInputs)
    expect(controller.attempt.resultSummary).toMatchObject({
      populationBluffs: 300,
      populationValues: 700,
      observedBluffs: 30,
      observedValues: 420,
    })
  })
  it('requires known-rate assumptions, preserves immutable prediction/result and saves ungraded reflection', async () => {
    const { user, controller, session, storage } = setup()
    await reveal(user)
    const initialId = controller.attempt.id
    const frozenPrediction = controller.attempt.prediction
    const shares = screen.getByRole('table', {
      name: 'Target versus recorded versus corrected shares',
    })
    expect(
      within(shares).getByRole('cell', { name: '6.6667%' }),
    ).toBeInTheDocument()
    expect(
      within(shares).getByRole('cell', { name: 'Unavailable' }),
    ).toBeInTheDocument()
    const meters = screen.getAllByRole('meter')
    expect(meters).toHaveLength(2)
    expect(meters[0]).toHaveAttribute(
      'aria-valuetext',
      '30.0000% of the population',
    )
    await user.type(
      screen.getByRole('textbox', { name: /Reflection \(ungraded\)/ }),
      'The observation filter selected value bets more often; this is not causal evidence.',
    )
    expect(controller.phase).toBe('reflected')
    await user.click(
      screen.getByRole('button', { name: 'Explore with disclosed controls' }),
    )
    expect(controller.attempt.parentAttemptId).toBe(initialId)
    expect(controller.phase).toBe('draft')
    await user.click(
      screen.getByRole('checkbox', { name: /Use these observation rates/ }),
    )
    await predict(user)
    await user.click(
      screen.getByRole('button', { name: 'Run disclosed experiment' }),
    )
    await waitFor(() => expect(controller.phase).toBe('results_ready'))
    expect(controller.result).toMatchObject({
      ok: true,
      value: { correctedShare: 0.3, correctionStatus: 'available' },
    })
    const archived = session.store.attempts.find((a) => a.id === initialId)!
    expect(archived).toMatchObject({
      inputs: defaultInputs,
      phase: 'archived',
      prediction: frozenPrediction,
      reflection: expect.stringContaining('not causal'),
    })
    expect(archived.resultSummary).toMatchObject({ correctedShare: null })
    expect(session.store.receipts).toHaveLength(0)
    expect(new Set(storage.writes)).toEqual(new Set([LEARNING_KEY]))
    expect(storage.removals).not.toContain('quantpoker.progress.v1')
  })
  it('keeps invalid drafts visible and valid controls create linked expected-count experiments', async () => {
    const { user, controller, session } = setup()
    await reveal(user)
    await user.click(
      screen.getByRole('button', { name: 'Explore with disclosed controls' }),
    )
    const draftId = controller.attempt.id
    const size = screen.getByRole('spinbutton', {
      name: 'Population size (bets)',
    })
    fireEvent.change(size, { target: { value: '10001' } })
    expect(size).toHaveAttribute('aria-invalid', 'true')
    expect(size).toHaveValue(10001)
    expect(size).toHaveAccessibleDescription(/Use a value from 100 to 10000/)
    expect(controller.inputs).toMatchObject({
      parameters: { populationSize: 1000 },
    })
    expect(controller.attempt.id).toBe(draftId)
    fireEvent.change(size, { target: { value: '100.5' } })
    expect(screen.getByRole('alert')).toHaveTextContent('increments of 1')
    fireEvent.change(size, { target: { value: '101' } })
    expect(size).toHaveAttribute('aria-invalid', 'false')
    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: 'Target bluff prevalence (probability fraction)',
      }),
      { target: { value: '0.23' } },
    )
    fireEvent.change(
      screen.getByRole('slider', {
        name: 'Bluff recording probability slider (probability fraction)',
      }),
      { target: { value: '0.17' } },
    )
    await predict(user)
    await user.click(
      screen.getByRole('button', { name: 'Run disclosed experiment' }),
    )
    await waitFor(() => expect(controller.phase).toBe('results_ready'))
    expect(controller.result).toMatchObject({
      ok: true,
      value: {
        populationBluffs: 23.23,
        observedBluffs: expect.closeTo(3.9491, 10),
      },
    })
    const committedId = controller.attempt.id
    fireEvent.change(size, { target: { value: '200' } })
    expect(controller.attempt.parentAttemptId).toBe(committedId)
    expect(
      session.store.attempts.find((a) => a.id === committedId)?.inputs,
    ).toMatchObject({ parameters: { populationSize: 101 } })
    await user.click(
      screen.getByRole('button', { name: /Reset disclosed controls/ }),
    )
    expect(controller.inputs).toEqual({
      kind: 'disclosed',
      parameters: defaultParameters,
    })
  })
  it('shows all-unobserved and zero-rate boundaries visibly unavailable, not as zero-rate bars', async () => {
    const { user, controller } = setup()
    await reveal(user)
    await user.click(
      screen.getByRole('button', { name: 'Explore with disclosed controls' }),
    )
    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: 'Bluff recording probability (probability fraction)',
      }),
      { target: { value: '0' } },
    )
    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: 'Value-bet recording probability (probability fraction)',
      }),
      { target: { value: '0' } },
    )
    await user.click(
      screen.getByRole('checkbox', { name: /Use these observation rates/ }),
    )
    await predict(user)
    await user.click(
      screen.getByRole('button', { name: 'Run disclosed experiment' }),
    )
    await waitFor(() =>
      expect(controller.result).toMatchObject({
        ok: true,
        value: {
          observedShare: null,
          correctedShare: null,
          correctionStatus: 'not-identifiable',
        },
      }),
    )
    expect(screen.getByText(/No observed outcomes/)).toBeInTheDocument()
    expect(
      screen.getByText(/at least one class has zero recording/),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('meter')).toHaveLength(1)
    expect(
      within(
        screen.getByRole('table', {
          name: 'Target versus recorded versus corrected shares',
        }),
      ).getAllByRole('cell', { name: 'Unavailable' }),
    ).toHaveLength(2)
  })
  it('tracks progressive assistance through callbacks and restores root-session disclosure/reflection across remounts', async () => {
    const storage = new MemoryStorage(),
      session = new LearningSession(storage, fixedClock)
    const evidence = {
      recordAttempt: vi.fn(session.recordAttempt),
      exposeHint: vi.fn(session.exposeHint),
      exposeSolution: vi.fn(session.exposeSolution),
    }
    const view = render(<Harness session={session} evidence={evidence} />)
    const user = userEvent.setup()
    for (let i = 0; i < 4; i++)
      await user.click(
        screen.getByRole('button', { name: /Next observation hint/ }),
      )
    expect(evidence.exposeHint).toHaveBeenCalledTimes(4)
    expect(evidence.exposeSolution).toHaveBeenCalledTimes(1)
    await reveal(user)
    await user.type(
      screen.getByRole('textbox', { name: /Reflection \(ungraded\)/ }),
      'Saved root reflection',
    )
    view.unmount()
    const reloadedSession = new LearningSession(storage, fixedClock)
    render(<Harness session={reloadedSession} />)
    expect(
      screen.getByRole('table', { name: 'Expected recording flow by class' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /Reflection \(ungraded\)/ }),
    ).toHaveValue('Saved root reflection')
    expect(
      screen.getByRole('button', { name: /Next observation hint/ }),
    ).toBeDisabled()
  })
  it('cancels runs and rejects stale results after valid parameter changes without rewriting commitments', async () => {
    const { user, controller, session } = setup()
    await predict(user)
    const id = controller.attempt.id
    let resolve!: (result: ModelResult<SelectionOutput>) => void
    let running!: Promise<void>
    act(() => {
      running = controller.runWith(
        () =>
          new Promise((r) => {
            resolve = r
          }),
      )
    })
    expect(
      screen.getByRole('button', { name: 'Cancel run' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel run' }))
    expect(controller.phase).toBe('prediction_committed')
    expect(controller.attempt.inputs).toEqual(defaultInputs)
    act(() =>
      controller.requestInputChange({
        kind: 'disclosed',
        parameters: { ...defaultParameters, bluffPrevalence: 0.8 },
      }),
    )
    await act(async () => {
      resolve(selectionExperimentModel(defaultInputs))
      await running
    })
    expect(controller.result).toBeNull()
    expect(controller.phase).toBe('draft')
    expect(controller.attempt.parentAttemptId).toBe(id)
    expect(session.store.attempts.find((a) => a.id === id)?.inputs).toEqual(
      defaultInputs,
    )
  })
  it('runs finance transfers through the shared CasePlayer with immutable evidence and separate review variants', async () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock),
      user = userEvent.setup()
    render(
      <div className="curriculum-workspace">
        <Entry session={session} />
      </div>,
    )
    const region = screen.getByRole('region', {
      name: 'Selection finance transfer and review',
    })
    const c = selectionCases[0]
    await predict(user, within(region))
    for (const q of c.questions) {
      if (q.kind === 'numeric')
        fireEvent.change(
          within(region).getByRole('spinbutton', {
            name: /Using both known positive/,
          }),
          { target: { value: String(q.expected) } },
        )
      if (q.kind === 'choice')
        await user.click(
          within(region).getByRole('radio', {
            name: q.options.find((o) => o.id === q.expected)!.label,
          }),
        )
    }
    await user.click(
      within(region).getByRole('button', { name: 'Submit structured answers' }),
    )
    expect(within(region).getByRole('status')).toHaveTextContent(
      '100/100; eligible unaided evidence',
    )
    const submitted = session.store.attempts.find((a) => a.caseId === c.id)!
    expect(submitted.evaluation?.eligible).toBe(true)
    expect(session.store.receipts).toHaveLength(1)
    expect(() =>
      session.recordAttempt({
        ...submitted,
        reflection: 'rewrite submitted evidence',
      }),
    ).toThrow('immutable')
    await user.selectOptions(
      within(region).getByRole('combobox', { name: 'Choose a selection case' }),
      selectionCases[3].id,
    )
    expect(
      within(region).getByRole('heading', {
        level: 3,
        name: selectionCases[3].title,
      }),
    ).toBeInTheDocument()
    expect(
      within(region).getByRole('button', { name: 'Commit prediction' }),
    ).toBeInTheDocument()
  })
})
