import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSyncExternalStore } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RunController } from '../../core/experiments'
import { LearningSession } from '../../core/session'
import { MemoryStorage, fixedClock } from '../../core/__fixtures__/testing'
import type { EvidenceCallbacks, ExperimentController } from '../../core/types'
import { calibrationManifest } from './manifest'
import type { CalibrationInputs, CalibrationOutput } from './model'
import View from './View'
import Entry from './Entry'

type Controller = ExperimentController<CalibrationInputs, CalibrationOutput>
function Harness({
  controller,
  evidence,
}: {
  controller: Controller
  evidence: EvidenceCallbacks
}) {
  useSyncExternalStore(
    controller.subscribe,
    controller.getRevision,
    controller.getRevision,
  )
  return (
    <div className="curriculum-workspace">
      <View controller={controller} evidence={evidence} />
    </div>
  )
}
function setup(mode: 'explore' | 'assess' = 'explore') {
  const storage = new MemoryStorage(),
    session = new LearningSession(storage, fixedClock)
  const options = {
    manifest: calibrationManifest,
    session,
    mode,
    caseId: 'calibration-ui-test',
    seed: 42,
    clock: fixedClock,
  }
  const controller = new RunController(options)
  return { storage, session, controller, options }
}
function predict() {
  fireEvent.change(screen.getByLabelText(/Prediction rationale/), {
    target: {
      value:
        'A public group below the payoff threshold should decline; Brier is not money.',
    },
  })
  fireEvent.change(screen.getByLabelText('Predicted action'), {
    target: { value: 'Continue group 2 only' },
  })
  fireEvent.change(screen.getByLabelText('Predicted direction'), {
    target: { value: 'increase' },
  })
  fireEvent.change(screen.getByLabelText(/Numeric estimate/), {
    target: { value: '6.25' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Commit prediction' }))
}
async function run() {
  fireEvent.click(screen.getByRole('button', { name: /Run exact population/ }))
  await screen.findByRole('table', {
    name: 'Forecast quality versus policy value',
  })
}
describe('CAL-03 frozen lazy calibration manifest', () => {
  it('exposes the frozen typed contract, lazy View and only scoped versioned records', async () => {
    expect(Object.isFrozen(calibrationManifest)).toBe(true)
    expect(Object.isFrozen(calibrationManifest.cases[0].cases)).toBe(true)
    expect(calibrationManifest.version).toBe('calibration-model-v1')
    expect(calibrationManifest.unitIds).toEqual(['f05'])
    expect((await calibrationManifest.loadView()).default).toBe(View)
    const encoded = calibrationManifest.encodeInputs(
      calibrationManifest.defaultInputs,
    )
    expect(calibrationManifest.decodeInputs(encoded).ok).toBe(true)
  })
})
describe('CAL-02 meaningful accessible experiment lifecycle (jsdom, not browser proof)', () => {
  it.each(['explore', 'assess'] as const)(
    'requires prediction before revealing results in %s mode',
    async (mode) => {
      const { controller, session } = setup(mode)
      render(<Harness controller={controller} evidence={session} />)
      expect(
        screen.getByRole('button', { name: /Run exact population/ }),
      ).toBeDisabled()
      expect(
        screen.queryByRole('table', {
          name: 'Forecast quality versus policy value',
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('spinbutton', {
          name: /Group 1 true success probability/,
        }),
      ).toHaveAccessibleDescription(/0–1.*increment 0.01/)
      expect(
        screen.getByRole('slider', { name: /Net gain on success slider/ }),
      ).toBeInTheDocument()
      predict()
      const locked = controller.attempt.prediction
      expect(
        screen.queryByRole('button', { name: 'Commit prediction' }),
      ).not.toBeInTheDocument()
      await run()
      const table = screen.getByRole('table', {
        name: 'Forecast quality versus policy value',
      })
      expect(
        within(table).getByRole('cell', { name: '0.22749999999999998' }),
      ).toBeInTheDocument()
      expect(
        within(table).getByRole('cell', { name: '0.165' }),
      ).toBeInTheDocument()
      expect(
        within(table).getByRole('cell', { name: '18.75' }),
      ).toBeInTheDocument()
      expect(
        within(table).getByRole('cell', { name: '25' }),
      ).toBeInTheDocument()
      expect(controller.attempt.prediction).toEqual(locked)
      expect(
        screen.getByRole('table', {
          name: 'Population reliability, not sample validation — equivalent values',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('table', {
          name: 'Subgroup expected policy contributions — equivalent values',
        }),
      ).toBeInTheDocument()
      expect(screen.getAllByRole('img')).toHaveLength(2)
      for (const img of screen.getAllByRole('img'))
        expect(img).toHaveAccessibleDescription(
          /Horizontal:.*vertical:.*Undefined branches/,
        )
      expect(session.store.receipts).toHaveLength(0)
    },
  )
  it('records ungraded reflection and archives without editing inputs or granting learning credit', async () => {
    const { controller, session } = setup()
    render(<Harness controller={controller} evidence={session} />)
    predict()
    await run()
    const before = controller.attempt
    fireEvent.change(screen.getByLabelText(/Reflection \(ungraded/), {
      target: {
        value:
          'At cost5 both groups continue; data costs would consume value, not change calibration.',
      },
    })
    expect(controller.phase).toBe('reflected')
    expect(controller.attempt.inputs).toEqual(before.inputs)
    expect(controller.attempt.prediction).toEqual(before.prediction)
    fireEvent.click(
      screen.getByRole('button', { name: 'Archive this experiment' }),
    )
    expect(controller.phase).toBe('archived')
    const saved = session.store.attempts.find((a) => a.id === before.id)!
    expect(saved.reflection).toContain('cost5')
    expect(saved.evaluation).toBeUndefined()
    expect(session.store.receipts).toHaveLength(0)
    expect(session.export('markdown')).toContain('cost5')
  })
  it('preserves the last valid input and blocks invalid blank text; valid result edits create linked drafts', async () => {
    const { controller, session } = setup()
    render(<Harness controller={controller} evidence={session} />)
    const control = screen.getByRole('spinbutton', {
      name: /Group 1 true success probability/,
    })
    fireEvent.change(control, { target: { value: '2' } })
    expect(control).toHaveAttribute('aria-invalid', 'true')
    expect(controller.inputs.group1Probability).toBe(0.1)
    fireEvent.change(control, { target: { value: '.1' } })
    predict()
    fireEvent.change(control, { target: { value: '' } })
    fireEvent.click(
      screen.getByRole('button', { name: /Run exact population/ }),
    )
    expect(screen.getByText(/Correct invalid control text/)).toBeInTheDocument()
    expect(controller.phase).toBe('prediction_committed')
    fireEvent.change(control, { target: { value: '.1' } })
    await run()
    const previous = controller.attempt
    fireEvent.change(control, { target: { value: '.3' } })
    expect(controller.phase).toBe('draft')
    expect(controller.attempt.parentAttemptId).toBe(previous.id)
    expect(controller.result).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Commit prediction' }),
    ).toBeInTheDocument()
    const saved = session.store.attempts.find((a) => a.id === previous.id)!
    expect(saved.inputs).toEqual(previous.inputs)
    expect(saved.prediction).toEqual(previous.prediction)
    expect(saved.resultSummary).toEqual(previous.resultSummary)
  })
  it('tracks each progressive hint and full solution before reveal and retains assistance with reflection', async () => {
    const { controller, session } = setup()
    const evidence: EvidenceCallbacks = {
      recordAttempt: session.recordAttempt,
      exposeHint: vi.fn((id, hint) => {
        expect(
          screen.queryByText(hintsText[Number(hint.at(-1)) - 1]),
        ).not.toBeInTheDocument()
        session.exposeHint(id, hint)
      }),
      exposeSolution: vi.fn((id) => {
        expect(
          screen.queryByLabelText('Recorded full model explanation'),
        ).not.toBeInTheDocument()
        session.exposeSolution(id)
      }),
    }
    render(<Harness controller={controller} evidence={evidence} />)
    expect(
      screen.getByRole('button', { name: 'Show next hint (0/4)' }),
    ).toBeDisabled()
    predict()
    for (let i = 0; i < 4; i++)
      fireEvent.click(
        screen.getByRole('button', { name: `Show next hint (${i}/4)` }),
      )
    expect(evidence.exposeHint).toHaveBeenCalledTimes(4)
    expect(
      screen.getByRole('button', { name: 'Show next hint (4/4)' }),
    ).toBeDisabled()
    await run()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Show model explanation (solution assistance)',
      }),
    )
    expect(evidence.exposeSolution).toHaveBeenCalledWith(controller.attempt.id)
    expect(
      screen.getByLabelText('Recorded full model explanation'),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Reflection \(ungraded/), {
      target: { value: 'I used all four hints.' },
    })
    expect(controller.attempt.assistance).toEqual({
      hintIds: [
        'calibration-hint-1',
        'calibration-hint-2',
        'calibration-hint-3',
        'calibration-hint-4',
      ],
      solutionViewed: true,
    })
  })
  it('does not reveal assistance if its evidence callback fails', () => {
    const { controller } = setup()
    const evidence: EvidenceCallbacks = {
      recordAttempt: vi.fn(),
      exposeHint: () => {
        throw new Error('failed')
      },
      exposeSolution: vi.fn(),
    }
    render(<Harness controller={controller} evidence={evidence} />)
    predict()
    fireEvent.click(
      screen.getByRole('button', { name: 'Show next hint (0/4)' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('hint was not revealed')
    expect(screen.queryByText(hintsText[0])).not.toBeInTheDocument()
  })
  it('renders zero-weight conditional frequencies as unavailable, never a false zero', async () => {
    const { controller, session } = setup()
    render(<Harness controller={controller} evidence={session} />)
    fireEvent.change(
      screen.getByRole('slider', { name: /Group 1 population weight slider/ }),
      { target: { value: '0' } },
    )
    predict()
    await run()
    const groupTable = screen.getByRole('table', {
      name: 'Public subgroup forecasts, decisions and true cash flows',
    })
    expect(
      within(groupTable).getByRole('cell', { name: 'zero-weight' }),
    ).toBeInTheDocument()
    expect(
      within(groupTable).getByRole('cell', { name: 'Unavailable' }),
    ).toBeInTheDocument()
    const chartTable = screen.getByRole('table', {
      name: 'Population reliability, not sample validation — equivalent values',
    })
    expect(
      within(chartTable).getByRole('cell', { name: 'Unavailable' }),
    ).toBeInTheDocument()
  })
  it('supports keyboard commitment, reload replay and linked reset', async () => {
    const { controller, session, storage, options } = setup()
    const view = render(<Harness controller={controller} evidence={session} />)
    const user = userEvent.setup()
    fireEvent.change(screen.getByLabelText(/Prediction rationale/), {
      target: { value: 'The subgroup label may alter actions.' },
    })
    screen.getByRole('button', { name: 'Commit prediction' }).focus()
    await user.keyboard('{Enter}')
    expect(controller.phase).toBe('prediction_committed')
    await run()
    view.unmount()
    const reloadedSession = new LearningSession(storage, fixedClock)
    const restored = new RunController({ ...options, session: reloadedSession })
    expect(restored.result?.ok).toBe(true)
    expect(restored.attempt.prediction).toEqual(controller.attempt.prediction)
    render(<Harness controller={restored} evidence={reloadedSession} />)
    expect(
      screen.getByRole('table', {
        name: 'Forecast quality versus policy value',
      }),
    ).toBeInTheDocument()
    const prior = restored.attempt
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset controls to defaults' }),
    )
    expect(restored.phase).toBe('draft')
    expect(restored.attempt.parentAttemptId).toBe(prior.id)
  })
  it('lazy root-session Entry reuses its draft without touching table progress or auto-running', async () => {
    const storage = new MemoryStorage()
    storage.values.set('quantpoker.progress.v1', 'preserved-hand-state')
    const session = new LearningSession(storage, fixedClock)
    const view = render(
      <div className="curriculum-workspace">
        <Entry session={session} />
      </div>,
    )
    await screen.findByRole('heading', {
      name: 'Forecast quality and decision value',
    })
    predict()
    await run()
    view.unmount()
    render(
      <div className="curriculum-workspace">
        <Entry session={session} />
      </div>,
    )
    await screen.findByRole('table', {
      name: 'Forecast quality versus policy value',
    })
    expect(storage.values.get('quantpoker.progress.v1')).toBe(
      'preserved-hand-state',
    )
    expect(storage.writes).not.toContain('quantpoker.progress.v1')
    expect(session.store.receipts).toHaveLength(0)
  })
  it('cancelled async runs cannot publish after the linked controls change', async () => {
    const { controller, session } = setup()
    render(<Harness controller={controller} evidence={session} />)
    predict()
    let resolve!: (value: ReturnType<typeof calibrationManifest.model>) => void
    let running!: Promise<void>
    act(() => {
      running = controller.runWith(
        () =>
          new Promise((r) => {
            resolve = r
          }),
      )
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
    act(() => {
      controller.requestInputChange({ ...controller.inputs, loss: 5 })
    })
    await act(async () => {
      resolve(calibrationManifest.model(calibrationManifest.defaultInputs))
      await running
    })
    expect(controller.phase).toBe('draft')
    expect(controller.result).toBeNull()
    expect(
      screen.queryByRole('table', {
        name: 'Forecast quality versus policy value',
      }),
    ).not.toBeInTheDocument()
  })
  it('disables unsupported historical replay until a linked current-version draft exists', () => {
    const { session, options } = setup()
    const old = new RunController({
      ...options,
      manifest: { ...calibrationManifest, version: 'prior-calibration-v0' },
    })
    old.commitPrediction({
      actionId: 'not-sure',
      confidencePercent: null,
      rationale: 'Historical prediction.',
    })
    const restored = new RunController(options)
    render(<Harness controller={restored} evidence={session} />)
    expect(
      screen.getByRole('button', { name: /Run exact population/ }),
    ).toBeDisabled()
    expect(
      screen.getByText(
        /Historical model, input or generator version is unsupported/,
      ),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset controls to defaults' }),
    )
    expect(restored.phase).toBe('draft')
    expect(restored.attempt.modelVersion).toBe(calibrationManifest.version)
    expect(restored.attempt.parentAttemptId).toBe(old.attempt.id)
  })
})
const hintsText = [
  'Separate the outcome probability, the forecast selecting an action, and the cash-flow ledger. Decline pays zero.',
  'Pool with p̄ = w p₁ + (1−w) p₂. An informed forecast instead reports each public group probability.',
  'Threshold = loss / (gain+loss). Expected Brier = p(1−q)²+(1−p)q². Evaluate selected actions with true p, not the forecast q.',
  'For each group, the continued action’s true expected net payoff is p×gain−(1−p)×loss; multiply by group weight only when selected. Compare the two weighted totals, not the Brier difference.',
]
