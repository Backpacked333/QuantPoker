import { useId, useState } from 'react'
import type { ExperienceViewProps } from '../../core/types'
import { NumericControl } from '../../components/NumericControl'
import { PredictionForm } from '../../components/PredictionForm'
import { DataTable } from '../../components/DataTable'
import { SeriesChart } from '../../components/SeriesChart'
import {
  defaults,
  decodeInputs,
  type ContractInputs,
  type ContractOutput,
  type Settlement,
} from './model'
import './styles.css'

type Props = ExperienceViewProps<ContractInputs, ContractOutput>
type Layer = Extract<ContractInputs, { mode: 'layer' }>
const modeLabels = {
  layer: 'Loss-layer builder',
  asset: 'Genuine asset protection',
  wording: 'Contract wording challenge',
}
const hints = {
  layer: [
    'Identify loss, deductible, limit and premium separately.',
    'Payment starts above the deductible; the cap is on payment, not loss.',
    'Apply min(max(L−d,0),M); retained loss=L−payment.',
    'Buyer cost=retained loss+premium; seller profit=premium−payment. Weight each state payment by its physical probability.',
  ],
  asset: [
    'Keep the purchase cost separate from terminal price.',
    'Strike K=S0−deductible. The put pays only below strike.',
    'For a cap subtract the put at max(K−cap,0); a zero cap pays zero.',
    'Stock profit=St−S0; combined profit=stock profit+put payment−premium. This is not a market price calculation.',
  ],
  wording: [
    'Read whether the contract applies to each event or the period.',
    'Per occurrence: apply deductible and limit to each loss, then add.',
    'Aggregate: add losses first; apply deductible and limit once.',
    'Two losses80 with deductible100 and a large limit pay0 per occurrence but60 in aggregate. One premium is paid under either wording.',
  ],
}
function Ledger({
  rows,
  caption,
  summary,
}: {
  rows: readonly Settlement[]
  caption: string
  summary: string
}) {
  return (
    <DataTable
      caption={caption}
      summary={summary}
      columns={[
        'State / contract basis',
        'Loss (units)',
        'Physical probability',
        'Promised payment',
        'Actual payment',
        'Unpaid promise',
        'Retained loss',
        'Premium',
        'Buyer total cost',
        'Buyer profit',
        'Seller profit',
        'Stock profit',
        'Terminal asset price',
      ]}
      rows={rows.map((r) => [
        r.label,
        r.loss,
        r.probability,
        r.promisedPayment,
        r.actualPayment,
        r.unpaidAmount,
        r.retainedLoss,
        r.premium,
        r.buyerTotalCost,
        r.buyerProfit,
        r.sellerProfit,
        r.stockProfit,
        r.terminalPrice,
      ])}
    />
  )
}
function DistributionEditor({
  inputs,
  onApply,
}: {
  inputs: Layer
  onApply: (next: Layer) => void
}) {
  const [states, setStates] = useState(inputs.states)
  const id = useId(),
    total = states.reduce((sum, s) => sum + s.probability, 0)
  const decoded = decodeInputs({ ...inputs, states })
  const changed = JSON.stringify(states) !== JSON.stringify(inputs.states)
  return (
    <fieldset
      className="qp-contracts-distribution"
      aria-invalid={!decoded.ok}
      aria-describedby={`${id}-note${decoded.ok ? '' : ` ${id}-errors`}`}
    >
      <legend>
        Physical loss distribution — 2–5 mutually exclusive states
      </legend>
      <p id={`${id}-note`}>
        Edit rows, then apply the complete distribution. Zero-probability states
        are allowed. Probabilities are never silently normalized. Pending edits
        do not change the experiment.
      </p>
      {states.map((s, j) => (
        <div key={j} className="qp-contracts-state">
          <NumericControl
            name={`states.${j}.loss`}
            label={`State ${j + 1} loss`}
            units="loss units"
            min={0}
            max={1000}
            step="any"
            slider={false}
            value={s.loss}
            onChange={(loss) =>
              setStates(states.map((v, k) => (k === j ? { ...v, loss } : v)))
            }
          />
          <NumericControl
            name={`states.${j}.probability`}
            label={`State ${j + 1} probability`}
            units="physical probability"
            min={0}
            max={1}
            step="any"
            slider={false}
            value={s.probability}
            onChange={(probability) =>
              setStates(
                states.map((v, k) => (k === j ? { ...v, probability } : v)),
              )
            }
          />
          <button
            type="button"
            disabled={states.length <= 2}
            onClick={() => setStates(states.filter((_, k) => k !== j))}
          >
            Remove state {j + 1}
          </button>
        </div>
      ))}
      <p role="status">
        Probability total: {Number(total.toFixed(12))}.{' '}
        {changed
          ? 'Pending edits; apply before running these states.'
          : 'These states are applied.'}
      </p>
      {!decoded.ok ? (
        <p role="alert" id={`${id}-errors`}>
          {decoded.errors.map((e) => e.message).join(' ')}
        </p>
      ) : null}
      <div className="qp-contracts-actions">
        <button
          type="button"
          disabled={states.length >= 5}
          onClick={() => setStates([...states, { loss: 0, probability: 0 }])}
        >
          Add zero-probability state
        </button>
        <button
          type="button"
          disabled={!decoded.ok || !changed}
          onClick={() => onApply({ ...inputs, states })}
        >
          Apply distribution
        </button>
      </div>
    </fieldset>
  )
}
function Results({ result }: { result: ContractOutput }) {
  return (
    <section aria-label="Contract results">
      <h2>Inspect who pays</h2>
      <p>
        All monetary values are currency units at one settlement date. These are
        exact modeled states, not sampled outcomes or correctness scores.
      </p>
      <Ledger
        rows={[result.selected]}
        caption="Selected settlement ledger"
        summary="Fully funded assumption: promise = actual payment + unpaid; unpaid = 0. Buyer and seller profits sum to the original loss, or to stock profit in asset mode."
      />
      <Ledger
        rows={result.states}
        caption={
          result.mode === 'wording'
            ? 'Contract wording comparison'
            : result.mode === 'asset'
              ? 'Protective-put reference table'
              : 'Loss distribution settlement ledger'
        }
        summary={
          result.mode === 'asset'
            ? 'Reference terminal prices60/90/100/120 under your current purchase price, deductible, cap and premium. The separately selected terminal price is above. Retained downside plus premium is a cost measure, not signed combined asset profit.'
            : result.mode === 'wording'
              ? 'Each row is an alternative contract, not a probability state. Per occurrence resets both deductible and limit per event; aggregate applies both once. Premium is charged once under either basis.'
              : 'Loss states are physical-probability weighted. The selected loss is independent of this distribution.'
        }
      />
      <DataTable
        caption="Terms and boundaries"
        summary="Attachment and exhaustion are loss units; strikes are terminal asset price units. A cap above strike cannot be reached with nonnegative terminal prices."
        columns={['Quantity', 'Value (units)']}
        rows={[
          ['Loss attachment (deductible)', result.attachment],
          ['Loss exhaustion (deductible + limit/cap)', result.exhaustion],
          ['Put strike K', result.putStrike],
          ['Lower put strike max(K−cap,0)', result.lowerPutStrike],
          ['User-specified premium', result.selected.premium],
        ]}
      />
      {result.expected ? (
        <DataTable
          caption="Physical expectations, not market prices"
          summary="Expected loss and expected payout are separate from the user-specified premium. Loading/discount is premium minus physical expected payment; negative values indicate a discount, not guaranteed seller losses in every state."
          columns={['Quantity', 'Value (currency units)']}
          rows={[
            ['Expected loss', result.expected.loss],
            [
              'Expected promised / actual payout (fully funded)',
              result.expected.payout,
            ],
            ['User-specified premium', result.selected.premium],
            ['Loading (+) / discount (−)', result.expected.loading],
            ['Expected buyer total cost', result.expected.buyerCost],
            [
              'Expected seller underwriting profit',
              result.expected.sellerProfit,
            ],
          ]}
        />
      ) : (
        <p>
          Expected values: unavailable — no probability distribution is
          specified for these scenario rows.
        </p>
      )}
      {result.mode !== 'wording' ? (
        <>
          <SeriesChart
            title="Piecewise protection payment"
            summary={
              result.mode === 'layer'
                ? 'Payment is the first positive-part component minus the second. Two kinks: deductible attachment and deductible + limit exhaustion. The loss profile may extend to an exhaustion beyond the selected loss range.'
                : 'Put payment is max(K−St,0) minus a lower-strike put when capped. Nonnegative terminal prices bound the maximum reachable loss.'
            }
            xLabel={result.mode === 'layer' ? 'Loss' : 'Terminal asset price'}
            xUnits="currency units"
            yLabel="Contract payment / component"
            yUnits="currency units"
            series={[
              {
                name:
                  result.mode === 'layer'
                    ? 'First component max(L−d,0)'
                    : 'Long put max(K−St,0)',
                points: result.profile.map((p) => ({
                  x: p.x,
                  y: p.firstComponent,
                })),
              },
              {
                name:
                  result.mode === 'layer'
                    ? 'Subtracted component max(L−d−M,0)'
                    : 'Subtracted lower-strike put (zero if uncapped)',
                points: result.profile.map((p) => ({
                  x: p.x,
                  y: p.secondComponent,
                })),
              },
              {
                name: 'Actual protection payment (difference)',
                points: result.profile.map((p) => ({ x: p.x, y: p.payment })),
              },
            ]}
          />
          <SeriesChart
            title="Retained downside loss"
            summary="Original downside loss minus actual payment, excluding premium; this is not total cost or asset profit."
            xLabel={result.mode === 'layer' ? 'Loss' : 'Terminal asset price'}
            xUnits="currency units"
            yLabel="Retained loss"
            yUnits="currency units"
            series={[
              {
                name: 'Retained loss',
                points: result.profile.map((p) => ({ x: p.x, y: p.retained })),
              },
            ]}
          />
          {result.mode === 'asset' ? (
            <SeriesChart
              title="Combined asset profit after premium"
              summary="Stock profit plus protection payment minus the supplied premium. Full uncapped protection creates a downside profit floor; capped protection may not."
              xLabel="Terminal asset price"
              xUnits="currency units"
              yLabel="Combined profit"
              yUnits="currency units"
              series={[
                {
                  name: 'Stock + protection − premium profit',
                  points: result.profile.map((p) => ({
                    x: p.x,
                    y: p.buyerProfit,
                  })),
                },
              ]}
            />
          ) : null}
        </>
      ) : null}
    </section>
  )
}
function Attempt({ controller, evidence }: Props) {
  const i = controller.inputs,
    id = useId()
  const [hintCount, setHintCount] = useState(
      () =>
        controller.attempt.assistance.hintIds.filter((h) =>
          h.startsWith(`contracts-${i.mode}-hint-`),
        ).length,
    ),
    [solution, setSolution] = useState(
      controller.attempt.assistance.solutionViewed,
    )
  const change = (next: ContractInputs) => controller.requestInputChange(next)
  const control = (
    name: string,
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (n: number) => void,
    units = 'currency units',
  ) => (
    <NumericControl
      name={name}
      label={label}
      value={value}
      min={min}
      max={max}
      step="any"
      slider={min < max}
      units={units}
      onChange={onChange}
    />
  )
  const result = controller.result?.ok ? controller.result.value : null
  const canReflect = ['results_ready', 'reflected'].includes(controller.phase)
  const hasPrediction = !!controller.attempt.prediction
  return (
    <>
      <label htmlFor={`${id}-mode`}>Contract mode</label>
      <select
        id={`${id}-mode`}
        value={i.mode}
        onChange={(e) =>
          change(defaults[e.target.value as ContractInputs['mode']])
        }
      >
        {Object.entries(modeLabels).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <p>
        Changing a valid term after commitment archives the prior prediction and
        starts a linked experiment. No result is carried into the new draft.
      </p>
      <div className="qp-contracts-controls">
        {i.mode === 'layer'
          ? control(
              'loss',
              'Selected loss',
              i.loss,
              0,
              1000,
              (loss) => change({ ...i, loss }),
              'loss units',
            )
          : null}
        {i.mode === 'asset' ? (
          <>
            {control(
              'initialPrice',
              'Asset purchase price S0',
              i.initialPrice,
              Math.max(0.01, i.deductible),
              1000,
              (initialPrice) => change({ ...i, initialPrice }),
            )}
            {control(
              'terminalPrice',
              'Terminal asset price St',
              i.terminalPrice,
              0,
              2000,
              (terminalPrice) => change({ ...i, terminalPrice }),
            )}
          </>
        ) : null}
        {i.mode === 'wording' ? (
          <>
            {control(
              'loss1',
              'Occurrence 1 loss',
              i.losses[0],
              0,
              1000,
              (loss) => change({ ...i, losses: [loss, i.losses[1]] }),
              'loss units',
            )}
            {control(
              'loss2',
              'Occurrence 2 loss',
              i.losses[1],
              0,
              1000,
              (loss) => change({ ...i, losses: [i.losses[0], loss] }),
              'loss units',
            )}
          </>
        ) : null}
        {control(
          'deductible',
          'Deductible',
          i.deductible,
          0,
          i.mode === 'asset' ? i.initialPrice : 1000,
          (deductible) => change({ ...i, deductible }),
          'loss units',
        )}
        {i.mode !== 'asset'
          ? control('limit', 'Payment limit', i.limit, 0, 1000, (limit) =>
              change({ ...i, limit }),
            )
          : null}
        {control('premium', 'One-time premium', i.premium, 0, 200, (premium) =>
          change({ ...i, premium }),
        )}
      </div>
      {i.mode === 'asset' ? (
        <>
          <label htmlFor={`${id}-cap`}>
            <input
              id={`${id}-cap`}
              type="checkbox"
              checked={i.cap !== null}
              onChange={(e) =>
                change({ ...i, cap: e.target.checked ? 30 : null })
              }
            />{' '}
            Cap protection payment
          </label>
          {i.cap !== null
            ? control('cap', 'Protection cap', i.cap, 0, 1000, (cap) =>
                change({ ...i, cap }),
              )
            : null}
          <p>
            Separate finance model: one purchased asset plus put protection.
            Strike K=S0−deductible. Capped protection subtracts a put at
            max(K−cap,0). No interest, dividends or early exercise. The premium
            is supplied, not a Black–Scholes quote. Use the existing
            pricing/replication lab to derive a price under tradability
            assumptions.
          </p>
        </>
      ) : null}
      {i.mode === 'wording' ? (
        <>
          <label htmlFor={`${id}-basis`}>
            Wording selected before settlement
          </label>
          <select
            id={`${id}-basis`}
            value={i.basis}
            onChange={(e) =>
              change({
                ...i,
                basis: e.target.value as 'per-occurrence' | 'aggregate',
              })
            }
          >
            <option value="per-occurrence">
              Deductible and limit apply per occurrence
            </option>
            <option value="aggregate">
              Deductible and limit apply once to aggregate
            </option>
          </select>
        </>
      ) : null}
      {i.mode === 'layer' ? (
        <DistributionEditor
          key={JSON.stringify(i.states)}
          inputs={i}
          onApply={change}
        />
      ) : null}
      {controller.phase === 'draft' ? (
        <PredictionForm
          actions={['Keep exposure', 'Buy protection', 'Change wording']}
          question={
            i.mode === 'wording'
              ? 'Predict both basis payments and which promise better protects these losses. Explain why.'
              : 'Predict the selected payment and buyer cost/profit. Which term changes your choice?'
          }
          onCommit={(p) => controller.commitPrediction(p)}
        />
      ) : null}
      {hasPrediction ? (
        <section aria-label="Committed prediction">
          <h2>Your immutable prediction</h2>
          <p>
            Action: {controller.attempt.prediction!.actionId}; estimate:{' '}
            {controller.attempt.prediction!.numericEstimate ?? 'Not supplied'};
            confidence:{' '}
            {controller.attempt.prediction!.confidencePercent ?? 'Not sure'}.
          </p>
          <p>{controller.attempt.prediction!.rationale}</p>
        </section>
      ) : null}
      <div className="qp-contracts-actions">
        <button
          type="button"
          disabled={controller.phase !== 'prediction_committed'}
          onClick={() => void controller.run()}
        >
          Settle contract
        </button>
        <button
          type="button"
          disabled={controller.phase !== 'running'}
          onClick={() => controller.cancel()}
        >
          Cancel run
        </button>
        <button type="button" onClick={() => controller.resetControls()}>
          Restore loss-layer defaults
        </button>
        <button
          type="button"
          disabled={controller.phase === 'draft'}
          onClick={() => change({ ...i })}
        >
          New linked prediction with these terms
        </button>
      </div>
      <p role="status">
        Phase: {controller.phase}.{' '}
        {controller.status ||
          (hasPrediction
            ? 'Prediction committed; settle to reveal modeled states.'
            : 'Commit a prediction before settlement.')}
      </p>
      {controller.result && !controller.result.ok ? (
        <p role="alert">
          {controller.result.errors.map((e) => e.message).join(' ')}
        </p>
      ) : null}
      <section aria-label="Progressive assistance">
        <h2>Hints and explanation</h2>
        <p>
          Assistance is recorded before display and cannot be removed from this
          attempt. This explorer does not award mastery; use the foundation’s
          authored transfer and delayed-review cases.
        </p>
        <button
          type="button"
          disabled={
            !hasPrediction || hintCount >= 4 || controller.phase === 'archived'
          }
          onClick={() => {
            evidence.exposeHint(
              controller.attempt.id,
              `contracts-${i.mode}-hint-${hintCount + 1}`,
            )
            setHintCount(hintCount + 1)
          }}
        >
          Show next hint ({hintCount}/4)
        </button>
        <ol>
          {hints[i.mode].slice(0, hintCount).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
        <button
          type="button"
          disabled={
            !hasPrediction || solution || controller.phase === 'archived'
          }
          onClick={() => {
            evidence.exposeSolution(controller.attempt.id)
            setSolution(true)
          }}
        >
          Show payoff explanation
        </button>
        {solution ? (
          <p>
            {hints[i.mode][3]} In the layer default, loss90 pays40, retains50
            and costs65 with premium15; seller profit is−25. This explanation is
            assisted learning, not an unaided pass.
          </p>
        ) : null}
      </section>
      {result ? <Results result={result} /> : null}
      {canReflect ? (
        <section>
          <h2>Reflection, not a prose score</h2>
          <label htmlFor={`${id}-reflection`}>
            What changed in your prediction? What wording, premium or funding
            assumption would reverse your choice? (ungraded)
          </label>
          <textarea
            id={`${id}-reflection`}
            maxLength={2000}
            value={controller.attempt.reflection ?? ''}
            onChange={(e) => controller.reflect(e.target.value)}
          />
          <p>
            Your text is retained without keyword grading. A favorable modeled
            state is not evidence of mastery.
          </p>
          <button type="button" onClick={() => controller.archive()}>
            Archive this experiment
          </button>
        </section>
      ) : null}
    </>
  )
}
export default function ContractsView(props: Props) {
  return (
    <section className="qp-contracts-lab">
      <h1>Build the promise, then inspect who pays</h1>
      <p>
        Added teaching contracts and a separate asset example. Predict → settle
        exact states → inspect ledgers → reflect. Premiums and probabilities are
        your model inputs, not empirical market facts.
      </p>
      <p>
        <strong>Funding assumption:</strong> every promise in this laboratory is
        fully funded, so actual payment equals promised payment and unpaid
        amount is zero. The F09 cases separately challenge that assumption. No
        coinsurance, exclusions or default coverage is implied.
      </p>
      <Attempt key={props.controller.attempt.id} {...props} />
    </section>
  )
}
