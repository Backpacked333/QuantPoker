import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LearningSession } from '../../core/session'
import {
  useExperimentController,
  type RunController,
} from '../../core/experiments'
import type { EvidenceCallbacks } from '../../core/types'
import { fixedClock, MemoryStorage } from '../../core/__fixtures__/testing'
import { contractManifest } from './manifest'
import type { ContractInputs, ContractOutput } from './model'
import View from './View'
import Entry from './Entry'

function setup() {
  const storage = new MemoryStorage(),
    session = new LearningSession(storage, fixedClock)
  let controller: RunController<ContractInputs, ContractOutput>
  const evidence: EvidenceCallbacks = {
    recordAttempt: session.recordAttempt,
    exposeHint: vi.fn((id, hint) => {
      expect(
        screen.queryByText(
          'Identify loss, deductible, limit and premium separately.',
        ),
      ).not.toBeInTheDocument()
      session.exposeHint(id, hint)
    }),
    exposeSolution: vi.fn((id) => {
      expect(
        screen.queryByText(/This explanation is assisted learning/),
      ).not.toBeInTheDocument()
      session.exposeSolution(id)
    }),
  }
  function Harness() {
    controller = useExperimentController({
      manifest: contractManifest,
      session,
      mode: 'assess',
      caseId: 'contracts-ui-test',
      seed: 42,
    })
    return <View controller={controller} evidence={evidence} />
  }
  const mounted = render(<Harness />)
  return {
    storage,
    session,
    evidence,
    mounted,
    get controller() {
      return controller!
    },
  }
}
function predict() {
  fireEvent.change(screen.getByLabelText(/Prediction rationale/), {
    target: {
      value:
        'I expect the deductible to attach before payment saturates; premium enters each profit state once.',
    },
  })
  fireEvent.change(screen.getByLabelText(/Numeric estimate/), {
    target: { value: '40' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Commit prediction' }))
}
async function settle() {
  predict()
  fireEvent.click(screen.getByRole('button', { name: 'Settle contract' }))
  await waitFor(() =>
    expect(
      screen.getByRole('table', { name: 'Selected settlement ledger' }),
    ).toBeInTheDocument(),
  )
}
describe('contracts view with frozen root controller', () => {
  it('requires prediction before reveal, shows exact ledgers and graph tables, and stores ungraded reflection', async () => {
    const h = setup()
    expect(
      screen.getByRole('button', { name: 'Settle contract' }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('table', { name: 'Selected settlement ledger' }),
    ).not.toBeInTheDocument()
    await settle()
    expect(h.controller.attempt.prediction?.numericEstimate).toBe(40)
    const selected = within(
      screen.getByRole('table', { name: 'Selected settlement ledger' }),
    )
    expect(selected.getAllByText('40')).toHaveLength(2)
    expect(selected.getByText('65')).toBeInTheDocument()
    expect(selected.getByText('-25')).toBeInTheDocument()
    expect(
      screen.getByRole('table', {
        name: 'Piecewise protection payment — equivalent values',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('table', {
        name: 'Retained downside loss — equivalent values',
      }),
    ).toBeInTheDocument()
    expect(
      within(
        screen.getByRole('table', {
          name: 'Physical expectations, not market prices',
        }),
      ).getAllByText('-17'),
    ).toHaveLength(2)
    fireEvent.change(screen.getByLabelText(/What changed in your prediction/), {
      target: {
        value:
          'A limit is not a cap on my total loss. This is ungraded reflection.',
      },
    })
    expect(h.controller.phase).toBe('reflected')
    expect(h.controller.attempt.evaluation).toBeUndefined()
    fireEvent.click(
      screen.getByRole('button', { name: 'Archive this experiment' }),
    )
    expect(h.controller.phase).toBe('archived')
    expect(h.session.store.receipts).toHaveLength(0)
    expect(
      h.storage.writes.every((key) => key === 'quantpoker.learning.v2'),
    ).toBe(true)
  })
  it('records hints/solutions before display and links parameter changes without rewriting evidence', async () => {
    const h = setup()
    predict()
    const before = h.controller.attempt
    fireEvent.click(
      screen.getByRole('button', { name: 'Show next hint (0/4)' }),
    )
    expect(h.evidence.exposeHint).toHaveBeenCalledWith(
      before.id,
      'contracts-layer-hint-1',
    )
    expect(
      screen.getByText(
        'Identify loss, deductible, limit and premium separately.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Show payoff explanation' }),
    )
    expect(h.evidence.exposeSolution).toHaveBeenCalledWith(before.id)
    fireEvent.change(screen.getByLabelText('Selected loss (loss units)'), {
      target: { value: '250' },
    })
    expect(h.controller.phase).toBe('draft')
    expect(h.controller.attempt.parentAttemptId).toBe(before.id)
    expect(h.controller.result).toBeNull()
    expect(h.controller.attempt.prediction).toBeUndefined()
    const prior = h.session.store.attempts.find((a) => a.id === before.id)!
    expect(prior.inputs).toEqual(before.inputs)
    expect(prior.prediction).toEqual(before.prediction)
    expect(prior.assistance).toEqual({
      hintIds: ['contracts-layer-hint-1'],
      solutionViewed: true,
    })
    expect(Object.isFrozen(h.controller.inputs)).toBe(true)
    expect(
      screen.queryByText(
        'Identify loss, deductible, limit and premium separately.',
      ),
    ).not.toBeInTheDocument()
  })
  it('rejects unnormalized distribution edits, allows zero probability and applies states atomically', () => {
    const h = setup()
    const original = h.controller.inputs
    fireEvent.change(
      screen.getByLabelText('State 1 probability (physical probability)'),
      { target: { value: '.4' } },
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/sum to 1|total 1/)
    expect(
      screen.getByRole('button', { name: 'Apply distribution' }),
    ).toBeDisabled()
    expect(h.controller.inputs).toEqual(original)
    fireEvent.change(
      screen.getByLabelText('State 2 probability (physical probability)'),
      { target: { value: '.4' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply distribution' }))
    expect(
      h.controller.inputs.mode === 'layer' &&
        h.controller.inputs.states.map((s) => s.probability),
    ).toEqual([0.4, 0.4, 0.2])
    fireEvent.click(
      screen.getByRole('button', { name: 'Add zero-probability state' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply distribution' }))
    expect(
      h.controller.inputs.mode === 'layer' && h.controller.inputs.states,
    ).toHaveLength(4)
    expect(
      screen.getByLabelText('State 4 probability (physical probability)'),
    ).toHaveValue(0)
    fireEvent.click(
      screen.getByRole('button', { name: 'Restore loss-layer defaults' }),
    )
    expect(
      screen.getByLabelText('State 1 probability (physical probability)'),
    ).toHaveValue(0.5)
    expect(
      screen.queryByLabelText('State 4 probability (physical probability)'),
    ).not.toBeInTheDocument()
  })
  it('keeps invalid typed values visible and numeric/slider values synchronized', () => {
    const h = setup()
    fireEvent.change(screen.getByLabelText('Selected loss (loss units)'), {
      target: { value: '-1' },
    })
    expect(screen.getByLabelText('Selected loss (loss units)')).toHaveValue(-1)
    expect(screen.getByLabelText('Selected loss (loss units)')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(
      h.controller.inputs.mode === 'layer' && h.controller.inputs.loss,
    ).toBe(90)
    fireEvent.change(
      screen.getByLabelText('Selected loss slider (loss units)'),
      { target: { value: '250' } },
    )
    expect(screen.getByLabelText('Selected loss (loss units)')).toHaveValue(250)
  })
  it('settles the genuine asset fixture and its capped boundary with unavailable expectations', async () => {
    const h = setup()
    fireEvent.change(screen.getByLabelText('Contract mode'), {
      target: { value: 'asset' },
    })
    await settle()
    const rows = within(
      screen.getByRole('table', { name: 'Protective-put reference table' }),
    )
    expect(rows.getByText('Terminal 60').closest('tr')).toHaveTextContent('-13')
    expect(rows.getByText('Terminal 90').closest('tr')).toHaveTextContent('-13')
    expect(rows.getByText('Terminal 100').closest('tr')).toHaveTextContent('-3')
    expect(rows.getByText('Terminal 120').closest('tr')).toHaveTextContent('17')
    expect(screen.getByText(/Expected values: unavailable/)).toBeInTheDocument()
    expect(
      screen.getByRole('table', {
        name: 'Combined asset profit after premium — equivalent values',
      }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Cap protection payment'))
    fireEvent.change(screen.getByLabelText('Protection cap (currency units)'), {
      target: { value: '0' },
    })
    await settle()
    expect(
      h.controller.result?.ok &&
        h.controller.result.value.selected.actualPayment,
    ).toBe(0)
    expect(
      h.controller.result?.ok && h.controller.result.value.lowerPutStrike,
    ).toBe(90)
  })
  it('chooses wording before reveal and demonstrates the0 versus60 promises', async () => {
    const h = setup()
    fireEvent.change(screen.getByLabelText('Contract mode'), {
      target: { value: 'wording' },
    })
    fireEvent.change(
      screen.getByLabelText('Wording selected before settlement'),
      { target: { value: 'aggregate' } },
    )
    await settle()
    expect(
      h.controller.result?.ok &&
        h.controller.result.value.selected.actualPayment,
    ).toBe(60)
    expect(
      screen.getByRole('table', { name: 'Contract wording comparison' }),
    ).toBeInTheDocument()
    expect(
      h.controller.result?.ok &&
        h.controller.result.value.states.map((s) => s.actualPayment),
    ).toEqual([0, 60])
  })
  it('reuses the supplied root session through the lazy Entry instead of creating another store', async () => {
    const storage = new MemoryStorage(),
      session = new LearningSession(storage, fixedClock)
    const a = render(<Entry session={session} />)
    await screen.findByRole('heading', {
      name: 'Build the promise, then inspect who pays',
    })
    predict()
    const id = session.store.attempts.find((x) => x.prediction)!.id
    a.unmount()
    render(<Entry session={session} />)
    await screen.findByRole('heading', { name: 'Your immutable prediction' })
    expect(session.store.attempts.find((x) => x.prediction)!.id).toBe(id)
    expect(
      screen.getByRole('button', { name: 'Settle contract' }),
    ).toBeEnabled()
  })
  it('cancels without accepting a late result for a changed term snapshot', async () => {
    const h = setup()
    predict()
    let complete: (
      x: ReturnType<typeof contractManifest.model>,
    ) => void = () => {}
    let pending: Promise<void>
    act(() => {
      pending = h.controller.runWith(
        () =>
          new Promise((resolve) => {
            complete = resolve
          }),
      )
    })
    const old = h.controller.inputs
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
    fireEvent.change(
      screen.getByLabelText('One-time premium (currency units)'),
      { target: { value: '20' } },
    )
    await act(async () => {
      complete(contractManifest.model(old))
      await pending!
    })
    expect(h.controller.phase).toBe('draft')
    expect(h.controller.result).toBeNull()
    expect(h.controller.inputs.premium).toBe(20)
    expect(
      screen.queryByRole('table', { name: 'Selected settlement ledger' }),
    ).not.toBeInTheDocument()
  })
})
