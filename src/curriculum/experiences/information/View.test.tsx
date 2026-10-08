import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LearningSession } from '../../core/session'
import {
  createExperimentController,
  useExperimentController,
} from '../../core/experiments'
import { fixedClock, MemoryStorage } from '../../core/__fixtures__/testing'
import { CasePlayer } from '../../components/CasePlayer'
import { informationManifest } from './manifest'
import { informationFragments } from './cases'
import InformationEntry from './Entry'
import InformationView from './View'
import { encodeResult, informationModel } from './model'

function Harness({
  session,
  mode = 'explore',
}: {
  session: LearningSession
  mode?: 'explore' | 'assess'
}) {
  const controller = useExperimentController({
    manifest: informationManifest,
    session,
    mode,
    caseId: 'information-view-test',
    seed: 1,
  })
  return <InformationView controller={controller} evidence={session} />
}
async function commit() {
  const user = userEvent.setup()
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Predicted action' }),
    'Take only after positive',
  )
  fireEvent.change(
    screen.getByRole('spinbutton', { name: /Numeric estimate/ }),
    { target: { value: '8' } },
  )
  await user.type(
    screen.getByRole('textbox', { name: /Prediction rationale/ }),
    'I expect positive to change the action and a maximum fee of8.',
  )
  await user.click(screen.getByRole('button', { name: 'Commit prediction' }))
  return user
}
async function run() {
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Run information experiment' }))
  return screen.findByRole('table', { name: 'Research decision values' })
}
describe('information laboratory controls and immutable lifecycle', () => {
  it('uses the root session Entry and real lazy View contract', async () => {
    expect((await informationManifest.loadView()).default).toBe(InformationView)
    render(
      <InformationEntry
        session={new LearningSession(new MemoryStorage(), fixedClock)}
      />,
    )
    expect(
      await screen.findByRole('heading', {
        name: 'Price the next piece of information',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Run information experiment' }),
    ).toBeDisabled()
  })
  it('commits before reveal in assessment mode and records expected results/reflection, not correctness', async () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock)
    render(<Harness session={session} mode="assess" />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Run information experiment' }),
    ).toBeDisabled()
    await commit()
    const prediction = structuredClone(session.store.attempts[0].prediction)
    await run()
    expect(
      within(
        screen.getByRole('row', { name: /Best no-signal value V0/ }),
      ).getByRole('cell'),
    ).toHaveTextContent('12.5')
    expect(
      within(
        screen.getByRole('row', { name: /Value before fee Vsig/ }),
      ).getByRole('cell'),
    ).toHaveTextContent('20.5')
    expect(
      screen.getByRole('region', { name: 'Accessible signal decision tree' }),
    ).toHaveTextContent('pay 0 currency units now')
    expect(
      screen.getByRole('table', { name: 'Purchased-research state ledger' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No project has been realized or sampled/),
    ).toBeInTheDocument()
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Experiment reflection (ungraded)' }),
      {
        target: {
          value:
            'Profit is expected. A public report may change offered terms.',
        },
      },
    )
    expect(session.store.attempts[0].reflection).toContain('Profit is expected')
    expect(session.store.attempts[0].prediction).toEqual(prediction)
    expect(session.store.attempts[0].evaluation).toBeUndefined()
    expect(session.store.receipts).toEqual([])
  })
  it('labels numeric ranges, retains invalid drafts and handles equivalent slider input', () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock)
    render(<Harness session={session} />)
    const numeric = screen.getByRole('spinbutton', {
      name: 'Prior success probability p (probability fraction)',
    })
    expect(numeric).toHaveAccessibleDescription(
      '0–1 probability fraction; increment 0.01',
    )
    fireEvent.change(numeric, { target: { value: '1.1' } })
    expect(numeric).toHaveAttribute('aria-invalid', 'true')
    expect(numeric).toHaveValue(1.1)
    expect(session.store.attempts).toHaveLength(0)
    fireEvent.change(numeric, { target: { value: '' } })
    expect(numeric).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(
      screen.getByRole('slider', {
        name: 'Prior success probability p slider (probability fraction)',
      }),
      { target: { value: '.4' } },
    )
    expect(numeric).toHaveValue(0.4)
    expect(session.store.attempts[0].inputs).toMatchObject({ prior: 0.4 })
  })
  it('changing a committed fee archives the old prediction and results and starts a linked draft', async () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock)
    render(<Harness session={session} />)
    await commit()
    await run()
    const old = structuredClone(session.store.attempts[0])
    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: 'Research fee k (currency units)',
      }),
      { target: { value: '9' } },
    )
    const prior = session.store.attempts.find((a) => a.id === old.id)!
    const next = session.store.attempts.find(
      (a) => a.parentAttemptId === old.id,
    )!
    expect(prior.phase).toBe('archived')
    expect(prior.prediction).toEqual(old.prediction)
    expect(prior.inputs).toEqual(old.inputs)
    expect(prior.resultSummary).toEqual(old.resultSummary)
    expect(next.phase).toBe('draft')
    expect(next.prediction).toBeUndefined()
    expect(next.inputs).toMatchObject({ fee: 9 })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /Prediction rationale/ }),
    ).toHaveValue('')
    await commit()
    await run()
    expect(
      screen.getByRole('row', { name: /Net value of buying/ }),
    ).toHaveTextContent('11.5')
    expect(
      screen.getByRole('row', { name: /Purchase decision/ }),
    ).toHaveTextContent('Do not buy')
    expect(
      screen.getByRole('row', { name: /negative \/ failure/ }),
    ).toHaveTextContent('-9')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Reset to defaults/ }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', {
        name: 'Research fee k (currency units)',
      }),
    ).toHaveValue(0)
    expect(
      session.store.attempts.filter((a) => a.phase === 'archived'),
    ).toHaveLength(2)
  })
  it('captures progressive assistance before display and restores draft, results and hints after reload', async () => {
    const storage = new MemoryStorage(),
      session = new LearningSession(storage, fixedClock)
    let view = render(<Harness session={session} />)
    fireEvent.change(
      screen.getByRole('textbox', { name: /Prediction rationale/ }),
      { target: { value: 'Uncommitted reasoning is retained.' } },
    )
    view.unmount()
    view = render(
      <Harness session={new LearningSession(storage, fixedClock)} />,
    )
    expect(
      screen.getByRole('textbox', { name: /Prediction rationale/ }),
    ).toHaveValue('Uncommitted reasoning is retained.')
    fireEvent.change(
      screen.getByRole('textbox', { name: /Prediction rationale/ }),
      { target: { value: '' } },
    )
    await commit()
    const user = userEvent.setup()
    for (let n = 1; n <= 4; n++)
      await user.click(
        screen.getByRole('button', {
          name: `Show next experiment hint (${n - 1}/4)`,
        }),
      )
    expect(
      screen.getByRole('button', { name: 'Show next experiment hint (4/4)' }),
    ).toBeDisabled()
    await run()
    await user.click(
      screen.getByRole('button', { name: /Show worked explanation/ }),
    )
    view.unmount()
    const reloaded = new LearningSession(storage, fixedClock)
    render(<Harness session={reloaded} />)
    expect(
      screen.getByRole('table', { name: 'Research decision values' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Show next experiment hint (4/4)' }),
    ).toBeDisabled()
    expect(
      screen.getByText(/Worked explanation: take when posterior/),
    ).toBeInTheDocument()
    expect(reloaded.store.attempts[0].assistance).toEqual({
      hintIds: [1, 2, 3, 4].map((n) => `information-hint-${n}`),
      solutionViewed: true,
    })
    expect(reloaded.store.attempts[0].evaluation).toBeUndefined()
  })
  it('reveals inverted labels, same-action zero EVSI and unavailable branches accessibly', async () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock)
    render(<Harness session={session} />)
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Perfectly inverted signal' }),
    )
    await commit()
    await run()
    expect(
      screen.getByRole('row', { name: /Maximum affordable fee \/ EVSI/ }),
    ).toHaveTextContent('17.5')
    expect(
      within(
        screen.getByRole('table', {
          name: 'Signal branches and conditional actions',
        }),
      ).getByRole('row', { name: /^positive reachable/ }),
    ).toHaveTextContent('decline')
    await user.click(
      screen.getByRole('button', { name: 'Same action after both signals' }),
    )
    await commit()
    await run()
    expect(
      within(
        screen.getByRole('row', { name: /Maximum affordable fee \/ EVSI/ }),
      ).getByRole('cell'),
    ).toHaveTextContent('0')
    await user.click(
      screen.getByRole('button', { name: 'Unreachable negative branch' }),
    )
    await commit()
    await run()
    expect(
      screen.getByRole('row', { name: /^negative unreachable/ }),
    ).toHaveTextContent('Unavailable')
    expect(
      screen.getByRole('region', { name: 'Accessible signal decision tree' }),
    ).toHaveTextContent(
      'posterior and conditional action value are unavailable',
    )
    expect(
      screen
        .getAllByRole('region', { name: /scrollable table/ })
        .every((region) => region.tabIndex === 0),
    ).toBe(true)
  })
  it('uses controller cancellation/stale protection with the real information codecs', async () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock)
    const c = createExperimentController({
      manifest: informationManifest,
      session,
      mode: 'assess',
      caseId: 'info-late-output',
      seed: 1,
    })
    c.commitPrediction({
      actionId: 'take-positive',
      confidencePercent: null,
      rationale: 'Predict before reveal.',
    })
    let release:
      | ((value: ReturnType<typeof informationModel>) => void)
      | undefined
    const old = c.attempt
    const deferred = c.runWith(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    c.requestInputChange({ ...c.inputs, fee: 9 })
    const next = c.attempt
    const originalResult = informationModel(old.inputs)
    release!(originalResult)
    await deferred
    expect(c.phase).toBe('draft')
    expect(c.result).toBeNull()
    expect(c.attempt.id).toBe(next.id)
    expect(c.attempt.parentAttemptId).toBe(old.id)
    c.commitPrediction({
      confidencePercent: null,
      rationale: 'Fee9 may not justify buying.',
    })
    await c.run()
    if (!c.result?.ok) throw new Error('Expected valid result')
    expect(encodeResult(c.result.value).purchaseNet).toBeCloseTo(11.5, 12)
  })
})

describe('shared structured assessment for the information transfer bank', () => {
  it('records critical numerical and limitation errors even with a persuasive ungraded reflection', async () => {
    const caseRecord = informationFragments[2].cases[0]
    const session = new LearningSession(new MemoryStorage(), fixedClock),
      user = userEvent.setup()
    render(<CasePlayer caseRecord={caseRecord} session={session} />)
    await user.type(
      screen.getByRole('textbox', { name: /Prediction rationale/ }),
      'I expect research to improve the decision.',
    )
    await user.click(screen.getByRole('button', { name: 'Commit prediction' }))
    for (const q of caseRecord.questions) {
      if (q.kind === 'numeric')
        fireEvent.change(
          screen.getByRole('spinbutton', {
            name: new RegExp(q.prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
          }),
          {
            target: {
              value: String(q.id === 'failure-ledger' ? 0 : q.expected),
            },
          },
        )
      else if (q.kind === 'choice')
        await user.click(
          within(screen.getByRole('group', { name: q.prompt })).getByRole(
            'radio',
            { name: q.options.find((o) => o.id === q.expected)!.label },
          ),
        )
    }
    fireEvent.change(screen.getByRole('textbox', { name: /Written defense/ }), {
      target: {
        value:
          'Perfect information posterior finance profit success mastery: persuasive words do not erase the wrong fee ledger.',
      },
    })
    await user.click(
      screen.getByRole('button', { name: 'Submit structured answers' }),
    )
    expect(session.store.receipts[0].criticalPassed).toBe(false)
    expect(session.store.receipts[0].eligible).toBe(false)
    expect(session.store.attempts[0].evaluation?.criticalFailures).toContain(
      'failure-ledger',
    )
    expect(session.store.reviewSchedule.f10).toBeUndefined()
  })
  it('can earn unaided evidence through the shared player; hints make a correct new variant practice-only', async () => {
    const session = new LearningSession(new MemoryStorage(), fixedClock)
    const user = userEvent.setup()
    for (const [index, caseRecord] of informationFragments[0].cases
      .filter((c) => c.mode === 'transfer')
      .slice(0, 2)
      .entries()) {
      const view = render(
        <CasePlayer caseRecord={caseRecord} session={session} />,
      )
      await user.type(
        screen.getByRole('textbox', { name: /Prediction rationale/ }),
        'I will compare research improvement to its fee.',
      )
      await user.click(
        screen.getByRole('button', { name: 'Commit prediction' }),
      )
      if (index === 1)
        await user.click(
          screen.getByRole('button', {
            name: /Show next hint for branch-probability/,
          }),
        )
      for (const q of caseRecord.questions) {
        if (q.kind === 'numeric')
          fireEvent.change(
            screen.getByRole('spinbutton', {
              name: new RegExp(q.prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
            }),
            { target: { value: String(q.expected) } },
          )
        else if (q.kind === 'choice')
          await user.click(
            within(screen.getByRole('group', { name: q.prompt })).getByRole(
              'radio',
              { name: q.options.find((o) => o.id === q.expected)!.label },
            ),
          )
      }
      await user.click(
        screen.getByRole('button', { name: 'Submit structured answers' }),
      )
      const receipt = session.store.receipts.find(
        (r) => r.caseId === caseRecord.id,
      )!
      expect(receipt.passed).toBe(true)
      expect(receipt.eligible).toBe(index === 0)
      view.unmount()
    }
  })
})
