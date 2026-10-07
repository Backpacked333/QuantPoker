import {
  lazy,
  Suspense,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from 'react'
import { evidenceState } from '../core/assessment'
import { atlas, registry } from '../core/registry'
import { routes, type LearningRoute } from '../core/routes'
import type { LearningSession } from '../core/session'
import {
  unitSteps,
  type ExperienceEntryProps,
  type FoundationUnit,
  type Question,
  type UnitStep,
} from '../core/types'
import { pathways } from '../content/pathways'
import { connectionLabels } from '../content/foundations'
import { CasePlayer } from './CasePlayer'
import { PredictionForm } from './PredictionForm'

function Retrieval({ question: q }: { question: Question }) {
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  return (
    <section>
      <h3>Retrieve before studying</h3>
      <p>{q.prompt}</p>
      {q.kind === 'choice' ? (
        <label>
          Retrieval response
          <select value={answer} onChange={(e) => setAnswer(e.target.value)}>
            <option value="">Choose an answer</option>
            {q.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button className="button secondary" onClick={() => setRevealed(true)}>
        Check retrieval (practice only)
      </button>
      {revealed ? (
        <p role="status">
          {answer === q.expected ? 'Supported. ' : 'Revisit the setup. '}
          {q.rationale} Retrieval is not demonstration evidence.
        </p>
      ) : null}
    </section>
  )
}
function CaseSelector({
  ids,
  session,
}: {
  ids: readonly string[]
  session: LearningSession
}) {
  const fresh = ids.find(
    (id) =>
      !session.store.exposedVariants.includes(
        `${id}@${registry.cases.get(id)!.contentVersion}`,
      ) &&
      !session.store.receipts.some((r) => r.caseId === id) &&
      !session.store.attempts.some(
        (a) =>
          a.caseId === id &&
          (a.submittedAt ||
            a.assistance.solutionViewed ||
            a.assistance.hintIds.length),
      ),
  )
  const [selected, setSelected] = useState(fresh ?? ids[0])
  if (!selected)
    return <p>Case bank pending integration; no evidence can be earned here.</p>
  return (
    <>
      <label>
        Case variant
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {ids.map((id) => (
            <option key={id} value={id}>
              {registry.cases.get(id)?.title}
            </option>
          ))}
        </select>
      </label>
      {!fresh ? (
        <p>
          No fresh variants remain in this bank. Revisit for assisted practice,
          not new unaided evidence.
        </p>
      ) : null}
      <CasePlayer
        key={selected}
        caseRecord={registry.cases.get(selected)!}
        session={session}
      />
    </>
  )
}
function UnitLesson({
  unit: u,
  step,
  session,
}: {
  unit: FoundationUnit
  step: UnitStep
  session: LearningSession
}) {
  const l = u.lesson
  const experimentKey = `lesson-experiment:${u.id}`
  const prediction = session.store.drafts[experimentKey]?.attempt
  return (
    <>
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            FOUNDATION {u.id.toUpperCase()} · {u.availability}
          </div>
          <h1 tabIndex={-1}>{u.title}</h1>
          <p>{u.question}</p>
        </div>
      </header>
      <p>
        Evidence:{' '}
        {evidenceState(
          session.store,
          u.id,
          u.contentVersion,
          u.rubricVersion,
          session.clock,
        )}
        . Prior/core completion is separate.
      </p>
      <p>
        Recommended prerequisites:{' '}
        {u.prerequisites.length
          ? u.prerequisites.map((id) => (
              <a key={id} href={routes.unit(id)}>
                {id.toUpperCase()}{' '}
              </a>
            ))
          : 'none'}
        ; recommendations are not locks.
      </p>
      {!l || u.availability !== 'available' ? (
        <section>
          <h2>Partial — required cases are not integrated</h2>
          <p>This is a unit shell, not a shipped lesson or assessment.</p>
          <ul>
            {u.fragmentSlots.map((s) => (
              <li key={s.id}>
                {s.id}: {s.purpose} Owner {s.owner}; {s.minTransfer} transfer
                and{s.minReview} review variants.
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <nav className="qp-step-nav" aria-label="Seven lesson steps">
            {unitSteps.map((s) => (
              <a
                key={s}
                aria-current={s === step ? 'step' : undefined}
                href={routes.unit(u.id, s)}
              >
                {s}
              </a>
            ))}
          </nav>
          <section className="qp-lesson-step">
            <h2>{step}</h2>
            {step === 'brief' ? (
              <>
                {l.brief.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                <Retrieval key={u.id} question={l.retrieval} />
              </>
            ) : null}
            {step === 'predict' ? (
              <>
                <p>{l.predictionQuestion}</p>
                <p>
                  Prediction is recorded per case before structured questions
                  appear. Work through practice first or proceed to a fresh
                  transfer.
                </p>
                <a className="button" href={routes.unit(u.id, 'practice')}>
                  Make a practice prediction
                </a>
              </>
            ) : null}
            {step === 'worked' ? (
              <>
                {l.worked.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {u.workedCaseIds.map((id) => {
                  const c = registry.cases.get(id)!
                  return (
                    <article className="qp-case" key={id}>
                      <h3>{c.title}</h3>
                      <p>{connectionLabels[c.connection]}</p>
                      <p>{c.objective}</p>
                      <ul>
                        {c.information.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                      <ol>
                        {c.workedSolution.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ol>
                      <p>{c.assumptions.join(' ')}</p>
                      <p>Decision-changing assumption: {c.decisionReversal}</p>
                    </article>
                  )
                })}
              </>
            ) : null}
            {step === 'practice' ? (
              <>
                {l.practice.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                <p>
                  Partial scaffold: list purchase cash flow first, then fill the
                  still-uncomputed settlement, expectation or denominator. Hints
                  reveal progressively and label assistance.
                </p>
                <CaseSelector ids={u.practiceCaseIds} session={session} />
              </>
            ) : null}
            {step === 'experiment' ? (
              <>
                <h3>{l.experiment.question}</h3>
                {l.experiment.instructions.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {!prediction?.committedAt ? (
                  <PredictionForm
                    initial={prediction?.prediction}
                    actions={['Test the stated model', 'Withhold judgment']}
                    question={l.predictionQuestion}
                    onCommit={(p) => {
                      const a = {
                        id: crypto.randomUUID(),
                        unitId: u.id,
                        caseId: experimentKey,
                        contentVersion: u.contentVersion,
                        rubricVersion: u.rubricVersion,
                        modelVersion: 'legacy-guided-v1',
                        mode: 'explore' as const,
                        createdAt: session.clock().toISOString(),
                        committedAt: session.clock().toISOString(),
                        inputs: { legacyId: l.experiment.legacyId ?? null },
                        prediction: p,
                        answers: {},
                        assistance: { hintIds: [], solutionViewed: false },
                        phase: 'prediction_committed' as const,
                      }
                      session.recordAttempt(a)
                      session.update((store) => ({
                        ...store,
                        drafts: {
                          ...store.drafts,
                          [experimentKey]: { attempt: a, protocol: {} },
                        },
                      }))
                    }}
                  />
                ) : (
                  <p>
                    Committed: {prediction.prediction?.direction}; estimate{' '}
                    {prediction.prediction?.numericEstimate ?? 'not supplied'}.{' '}
                    {prediction.prediction?.rationale}
                  </p>
                )}
                {l.experiment.legacyId ? (
                  <a
                    className="button"
                    href={routes.module(l.experiment.legacyId, 'lab')}
                  >
                    Open the existing synthetic lab
                  </a>
                ) : (
                  <p>Required specialist experiment pending.</p>
                )}
                <label>
                  Experiment reflection (ungraded,2,000-character limit)
                  <textarea
                    maxLength={2000}
                    value={session.store.unitNotes[u.id] ?? ''}
                    onChange={(e) =>
                      session.update((store) => ({
                        ...store,
                        unitNotes: {
                          ...store.unitNotes,
                          [u.id]: e.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <p>
                  Use the model’s displayed inputs; these controls do not
                  execute a legal action in the paused live hand. This guided
                  experiment never grants correctness or mastery from realized
                  winnings.
                </p>
              </>
            ) : null}
            {step === 'transfer' || step === 'review' ? (
              <>
                {l[step].map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {step === 'review' ? (
                  <p>
                    Device-clock reminder:{' '}
                    {session.store.reviewSchedule[u.id]?.dueAt ??
                      'Demonstrate a fresh transfer first; early cases are practice.'}
                  </p>
                ) : null}
                <CaseSelector
                  key={`${u.id}:${step}`}
                  ids={
                    step === 'transfer' ? u.transferCaseIds : u.reviewCaseIds
                  }
                  session={session}
                />
              </>
            ) : null}
          </section>
          <p>
            <strong>Limitation:</strong> {l.limitation}
          </p>
          <p>
            <strong>Decision reversal:</strong> {l.decisionReversal}
          </p>
        </>
      )}
      <details>
        <summary>Sources and provenance</summary>
        {u.sources.map((r, i) => (
          <p key={i}>
            {registry.sources.has(r.sourceId) ? (
              <a
                href={registry.sources.get(r.sourceId)!.url}
                target="_blank"
                rel="noreferrer"
              >
                {registry.sources.get(r.sourceId)!.title}
              </a>
            ) : (
              r.sourceId
            )}
            : {r.claim} ({r.locator}; {r.verification}). Business examples are
            original hypothetical contracts, not actual market or legal claims.
          </p>
        ))}
      </details>
    </>
  )
}
const lazyExperiences = new Map<
  string,
  LazyExoticComponent<ComponentType<ExperienceEntryProps>>
>()
function RegisteredExperience({
  id,
  session,
}: {
  id: string
  session: LearningSession
}) {
  const registration = registry.experiences.get(id as never)
  if (!registration?.passedGate)
    return (
      <>
        <h1 tabIndex={-1}>Laboratory pending integration</h1>
        <p>{id} is planned, not a runnable or completed laboratory.</p>
      </>
    )
  if (!lazyExperiences.has(id)) lazyExperiences.set(id, lazy(registration.load))
  const View = lazyExperiences.get(id)!
  return (
    <Suspense fallback={<p role="status">Loading laboratory…</p>}>
      <View session={session} />
    </Suspense>
  )
}
export function FoundationWorkspace({
  route,
  session,
}: {
  route: LearningRoute
  session: LearningSession
}) {
  const [query, setQuery] = useState('')
  if (route.kind === 'unit')
    return (
      <UnitLesson
        key={route.id}
        unit={registry.units.get(route.id)!}
        step={route.step}
        session={session}
      />
    )
  if (route.kind === 'lab')
    return <RegisteredExperience id={route.id} session={session} />
  if (route.kind === 'not-found')
    return (
      <>
        <h1 tabIndex={-1}>Learning route not found</h1>
        <p>
          The URL is malformed or unknown. Your work remains in this session.
        </p>
        <a href={routes.overview('core')}>Open the core library</a>
      </>
    )
  if (
    route.kind === 'pathway' ||
    (route.kind === 'overview' && route.page === 'pathways')
  )
    return (
      <>
        <h1 tabIndex={-1}>Four quantitative pathways</h1>
        {pathways
          .filter((p) => route.kind !== 'pathway' || p.id === route.id)
          .map((p) => (
            <section className="qp-case" key={p.id}>
              <h2>
                <a href={routes.pathway(p.id)}>{p.title}</a>
              </h2>
              <p>
                Role: {p.role}. Prerequisite bridges: {p.bridges.join('; ')}.
              </p>
              <h3>Available introductory resources</h3>
              <ul>
                {[...registry.units.values()]
                  .filter((u) =>
                    u.conceptIds.some((id) => p.conceptIds.includes(id)),
                  )
                  .map((u) => (
                    <li key={u.id}>
                      {u.availability === 'available' ? (
                        <a href={routes.unit(u.id)}>{u.title}</a>
                      ) : (
                        u.title
                      )}{' '}
                      — {u.availability}
                    </li>
                  ))}
              </ul>
              <h3>Future capstone — planned, not playable</h3>
              <p>{p.capstone}</p>
              <p>
                {p.conceptIds.length} concept families in this track; this
                inventory is not a delivered lesson count.
              </p>
            </section>
          ))}
      </>
    )
  if (route.kind === 'overview' && route.page === 'reviews')
    return (
      <>
        <h1 tabIndex={-1}>Delayed review</h1>
        <p>
          Reminders use this device’s clock. They are not tamper-proof
          certification.
        </p>
        {[...registry.units.values()].map((u) => (
          <p key={u.id}>
            <a href={routes.unit(u.id, 'review')}>{u.title}</a>:{' '}
            {evidenceState(
              session.store,
              u.id,
              u.contentVersion,
              u.rubricVersion,
              session.clock,
            )}
            ; due{' '}
            {session.store.reviewSchedule[u.id]?.dueAt ??
              'after an eligible transfer'}
          </p>
        ))}
      </>
    )
  if (route.kind === 'overview' && route.page === 'atlas')
    return (
      <>
        <h1 tabIndex={-1}>96-family concept atlas</h1>
        <p>
          Kit inventory, not96 shipped lessons. Introductory resources cover
          parts of a family; advanced/research depth remains planned.
        </p>
        <label>
          Search all concept families
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {atlas.concepts
          .filter((c) =>
            `${c.id} ${c.title} ${c.research_description}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((c) => (
            <article className="qp-case" key={c.id}>
              <h2>
                {c.id} {c.title}
              </h2>
              <p>{c.research_description}</p>
              <p>
                {registry.conceptAvailability(c.id)} — {c.coverage_note}
              </p>
              <p>
                Suggested prerequisites:{' '}
                {c.suggested_prerequisites.join(', ') || 'none'}; connections:{' '}
                {c.connection_kinds.join(', ')}.
              </p>
              <p>
                {c.legacy_resources.map((id) => (
                  <a key={id} href={routes.module(id as never)}>
                    {id} core practice{' '}
                  </a>
                ))}
                {c.r1_unit_links.map((id) =>
                  registry.units.get(id as never)?.availability ===
                  'available' ? (
                    <a key={id} href={routes.unit(id as never)}>
                      {id} foundation{' '}
                    </a>
                  ) : (
                    <span key={id}>{id} partial </span>
                  ),
                )}
              </p>
              <p>
                {c.r1_experience_links.map((id) => (
                  <span key={id}>
                    {id}:{' '}
                    {registry.experiences.get(id as never)?.passedGate
                      ? 'available'
                      : 'planned'}{' '}
                  </span>
                ))}
              </p>
            </article>
          ))}
      </>
    )
  return (
    <>
      <h1 tabIndex={-1}>Foundations for defensible decisions</h1>
      <p>
        Ten-unit sequence; six complete base lessons, four partial units
        awaiting specialist banks. Completion of core practice is not foundation
        demonstration.
      </p>
      {[...registry.units.values()].map((u) => (
        <article className="qp-case" key={u.id}>
          <h2>
            {u.availability === 'available' ? (
              <a href={routes.unit(u.id)}>
                {u.id.toUpperCase()} {u.title}
              </a>
            ) : (
              `${u.id.toUpperCase()} ${u.title}`
            )}
          </h2>
          <p>
            {u.question} — {u.availability};{' '}
            {evidenceState(
              session.store,
              u.id,
              u.contentVersion,
              u.rubricVersion,
              session.clock,
            )}
            .
          </p>
        </article>
      ))}
      <h2>Six specialist laboratories</h2>
      <ul>
        {registry.experienceInventory.map((e) => (
          <li key={e.id}>
            {e.availability === 'available' ? (
              <a href={routes.lab(e.id)}>{e.title}</a>
            ) : (
              e.title
            )}{' '}
            — {e.availability}
          </li>
        ))}
      </ul>
    </>
  )
}
