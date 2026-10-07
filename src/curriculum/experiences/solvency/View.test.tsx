import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LearningSession } from '../../core/session'
import {
  createExperimentController,
  useExperimentController,
} from '../../core/experiments'
import {
  MemoryStorage,
  fixedClock,
  attemptFor,
} from '../../core/__fixtures__/testing'
import { CurriculumRegistry } from '../../core/registry'
import { validateCase, evaluateCase } from '../../core/assessment'
import { CasePlayer } from '../../components/CasePlayer'
import { LEARNING_KEY } from '../../core/persistence'
import { solvencyManifest } from './manifest'
import { solvencyFragments } from './cases'
import View from './View'
import { defaultInputs, solvencyModel, type SolvencyOutput } from './model'
import type { ModelResult, Prediction } from '../../core/types'

function Harness({ session }: { session: LearningSession }) {
  const controller = useExperimentController({
    manifest: solvencyManifest,
    session,
    mode: 'explore',
    caseId: 'solvency-component-test',
    seed: 42,
  })
  return (
    <div className="curriculum-workspace">
      <View controller={controller} evidence={session} />
    </div>
  )
}
const prediction: Prediction = {
  actionId: 'Fund claims',
  direction: 'increase',
  confidencePercent: 60,
  numericEstimate: 0.02,
  rationale: 'A common shock can outweigh a positive margin.',
}
async function commit() {
  await userEvent.type(
    screen.getByLabelText(/Prediction rationale/),
    prediction.rationale,
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Commit prediction' }),
  )
}
describe('solvency interaction and evidence boundaries', () => {
  it('requires a prediction in exploration too; displays exact outcomes, ledger and ungraded reflection', async () => {
    const storage = new MemoryStorage(),
      session = new LearningSession(storage, fixedClock)
    render(<Harness session={session} />)
    expect(
      screen.getByRole('button', {
        name: 'Calculate exact funded distribution',
      }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('table', { name: 'Funding and risk metrics' }),
    ).not.toBeInTheDocument()
    for (const name of [
      'Policy count N (policies)',
      'External capital K (currency)',
      'Common-event mixture weight rho (fraction)',
    ])
      expect(
        screen.getByRole('spinbutton', { name }),
      ).toHaveAccessibleDescription()
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Policy count N (policies)' }),
      { target: { value: '0' } },
    )
    expect(screen.getByRole('alert')).toHaveTextContent('1 to 500')
    expect(session.store.attempts).toHaveLength(0)
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Policy count N (policies)' }),
      { target: { value: '100' } },
    )
    await commit()
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Calculate exact funded distribution',
      }),
    )
    const metrics = screen.getByRole('table', {
      name: 'Funding and risk metrics',
    })
    expect(
      within(metrics).getByRole('row', {
        name: 'Expected promised claims 1000',
      }),
    ).toBeInTheDocument()
    expect(
      within(metrics).getByRole('row', {
        name: 'Expected promised underwriting margin (before capital/default) 200',
      }),
    ).toBeInTheDocument()
    const ledger = screen.getByRole('table', {
      name: 'Inspected realized-state ledger',
    })
    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: 'Inspect stipulated realized claim count (claims)',
      }),
      { target: { value: '20' } },
    )
    expect(
      within(ledger).getByRole('row', { name: 'Promised claims 2000' }),
    ).toBeInTheDocument()
    expect(
      within(ledger).getByRole('row', { name: 'Actual payments 1700' }),
    ).toBeInTheDocument()
    expect(
      within(ledger).getByRole('row', { name: 'Unpaid claims 300' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(
      screen.getByRole('table', {
        name: 'Claims versus available funding — equivalent values',
      }),
    ).toBeInTheDocument()
    await userEvent.type(
      screen.getByLabelText(/Reflection \(ungraded/),
      'More capital funds the common-event state; more customers alone does not.',
    )
    const id = session.store.attempts[0].id
    expect(session.store.attempts[0].reflection).toContain('More capital')
    await userEvent.click(
      screen.getByRole('button', { name: 'Archive this exploration' }),
    )
    expect(session.store.attempts.find((a) => a.id === id)?.phase).toBe(
      'archived',
    )
    expect(session.store.receipts).toHaveLength(0)
    expect(storage.writes.every((key) => key === LEARNING_KEY)).toBe(true)
    const decoded = JSON.parse(session.export('json'))
    expect(JSON.stringify(decoded)).toContain('solvency-v1')
  })
  it('exposes assistance before showing hints; fourth hint records a solution and cannot be erased', async () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock)
    const exposeHint = vi.spyOn(session, 'exposeHint'),
      exposeSolution = vi.spyOn(session, 'exposeSolution')
    render(<Harness session={session} />)
    await commit()
    expect(
      screen.queryByText(/Name what arrives before settlement/),
    ).not.toBeInTheDocument()
    for (let k = 1; k <= 4; k++) {
      await userEvent.click(
        screen.getByRole('button', { name: /Show next solvency hint/ }),
      )
      expect(exposeHint).toHaveBeenLastCalledWith(
        session.store.attempts[0].id,
        `solvency-method-${k}`,
      )
      expect(session.store.attempts[0].assistance.hintIds).toHaveLength(k)
    }
    expect(exposeSolution).toHaveBeenCalledOnce()
    expect(screen.getByText(/Worked method:/)).toBeInTheDocument()
    expect(session.store.attempts[0].assistance.solutionViewed).toBe(true)
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Calculate exact funded distribution',
      }),
    )
    expect(session.store.attempts[0].assistance.hintIds).toHaveLength(4)
  })
  it('archives immutable predictions and inputs when parameters change; new results belong to a new draft', async () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock)
    render(<Harness session={session} />)
    await commit()
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Calculate exact funded distribution',
      }),
    )
    const original = structuredClone(session.store.attempts[0])
    fireEvent.change(
      screen.getByRole('slider', {
        name: 'Common-event mixture weight rho slider (fraction)',
      }),
      { target: { value: '1' } },
    )
    expect(
      screen.queryByRole('table', { name: 'Funding and risk metrics' }),
    ).not.toBeInTheDocument()
    const child = session.store.attempts.find(
      (a) => a.parentAttemptId === original.id,
    )!
    expect(child.phase).toBe('draft')
    expect(child.prediction).toBeUndefined()
    expect(
      session.store.attempts.find((a) => a.id === original.id)?.inputs,
    ).toEqual(original.inputs)
    expect(
      session.store.attempts.find((a) => a.id === original.id)?.prediction,
    ).toEqual(original.prediction)
    await commit()
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Calculate exact funded distribution',
      }),
    )
    expect(
      screen.getByRole('row', { name: /Expected unpaid claims.*830/ }),
    ).toBeInTheDocument()
  })
  it('surfaces cancellation and rejects a late result for changed inputs', async () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock)
    const controller = createExperimentController({
      manifest: solvencyManifest,
      session,
      caseId: 'solvency-cancel',
      seed: 42,
    })
    controller.commitPrediction(prediction)
    let resolve!: (result: ModelResult<SolvencyOutput>) => void
    const pending = controller.runWith(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    const view = render(<View controller={controller} evidence={session} />)
    expect(
      screen.getByRole('button', { name: 'Cancel calculation' }),
    ).toBeEnabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel calculation' }),
    )
    view.rerender(<View controller={controller} evidence={session} />)
    expect(controller.phase).toBe('prediction_committed')
    expect(screen.getByRole('status')).toHaveTextContent(/Canceled/)
    controller.requestInputChange({ ...defaultInputs, rho: 1 })
    const id = controller.attempt.id
    await act(async () => {
      resolve(solvencyModel(defaultInputs))
      await pending
    })
    expect(controller.attempt.id).toBe(id)
    expect(controller.result).toBeNull()
    expect(controller.inputs.rho).toBe(1)
  })
})
describe('solvency fragments and lazy frozen interface', () => {
  it('transactionally installs the real banks, completes F07 only, and retains shared boundaries', async () => {
    const registry = new CurriculumRegistry()
    registry.registerSources(solvencyManifest.sources)
    solvencyManifest.cases.forEach((fragment) =>
      registry.installFragment(fragment),
    )
    registry.registerExperience({
      id: 'solvency',
      title: solvencyManifest.title,
      version: solvencyManifest.version,
      passedGate: true,
      load: () => import('./Entry'),
    })
    expect(() => registry.assertIntegrity()).not.toThrow()
    expect(registry.units.get('f07')?.availability).toBe('available')
    expect(registry.units.get('f10')?.availability).not.toBe('available')
    expect(registry.units.get('f07')?.transferCaseIds).toHaveLength(3)
    expect(registry.units.get('f07')?.reviewCaseIds).toHaveLength(3)
    expect((await solvencyManifest.loadView()).default).toBe(View)
    for (const fragment of solvencyFragments)
      for (const c of fragment.cases) {
        expect(c.id.startsWith(fragment.slotId)).toBe(true)
        expect(validateCase(c)).toEqual([])
        expect(c.questions.every((q) => q.hints.length === 4)).toBe(true)
        const evaluation = evaluateCase(
          c,
          attemptFor(c),
          [],
          [],
          undefined,
          fixedClock,
          [],
        )
        expect(evaluation.passed).toBe(true)
        const failed = evaluateCase(
          c,
          attemptFor(c, { answers: {} }),
          [],
          [],
          undefined,
          fixedClock,
          [],
        )
        expect(failed.passed).toBe(false)
        expect(failed.criticalFailures.length).toBeGreaterThan(0)
      }
  })
  it('real F10 case captures prediction, grades structured funding items and saves ungraded prose immutably', async () => {
    const c = solvencyFragments[2].cases[0],
      session = new LearningSession(new MemoryStorage(), fixedClock)
    render(<CasePlayer caseRecord={c} session={session} />)
    expect(
      screen.queryByRole('button', { name: 'Submit structured answers' }),
    ).not.toBeInTheDocument()
    await commit()
    for (const q of c.questions) {
      if (q.kind === 'numeric')
        fireEvent.change(
          screen.getByLabelText(
            `${q.prompt} (${q.units}; tolerance ±${q.tolerance})`,
          ),
          { target: { value: String(q.expected) } },
        )
      if (q.kind === 'choice') {
        const field = screen.getByRole('group', { name: q.prompt })
        await userEvent.click(
          within(field).getByRole('radio', {
            name: q.options.find((o) => o.id === q.expected)!.label,
          }),
        )
      }
    }
    await userEvent.type(
      screen.getByLabelText(/Written defense/),
      'Not keyword scored; capital funds the full promise.',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit structured answers' }),
    )
    const attempt = session.store.attempts[0]
    expect(attempt.evaluation?.passed).toBe(true)
    expect(attempt.evaluation?.eligible).toBe(true)
    expect(session.store.receipts).toHaveLength(1)
    expect(attempt.reflection).toContain('Not keyword scored')
    expect(() =>
      session.recordAttempt({ ...attempt, inputs: { changed: true } }),
    ).toThrow(/immutable/)
  })
})
