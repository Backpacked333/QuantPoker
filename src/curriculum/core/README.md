# QuantPoker R1 / A00 frozen integration contract

This is developer documentation for working code, specification v1.0. The six
specialist authors start from the parent's frozen full commit SHA. They own only
`src/curriculum/experiences/<their-id>/**`; changes to shared types, components,
registries, content, styles or App go through A07/the parent. No runtime dependency,
engine/RNG change, provider configuration, deployment or paid service is required.

## Import map

| Relative to `src/curriculum`                             | Public responsibility                                                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/types.ts`                                          | IDs, safe JSON, `ModelResult`, `Prediction`, `Question`, `CaseRecord`, `CaseFragment`, source/evidence types, manifests, View/Entry props, worker context |
| `core/validation.ts`                                     | `success`, `failure`, `numberIn`, `isRecord`, `isSafeJson`, `decodePrediction`, `validatedModel`, `safeClone`, `immutable`                                |
| `core/session.ts`                                        | `LearningSession`, `useLearningSession(rootRef?)`, `browserStorage`                                                                                       |
| `core/persistence.ts`                                    | storage keys/limits, `emptyStore`, `decodeAttempt`, `decodeStore`, `loadLearning`, `compactStore`, `exportLearning`, `StoragePort`                        |
| `core/experiments.ts`                                    | `ControllerOptions`, `RunController`, `createExperimentController`, `useExperimentController`                                                             |
| `core/assessment.ts`                                     | `evaluateCase`, `recordEvidence`, `evidenceState`, `validateCase`, `deviceClock`, `backwardClock`                                                         |
| `core/routes.ts`                                         | `LearningRoute`, `OverviewPage`, `parseLearningRoute`, `routes`                                                                                           |
| `core/registry.ts`                                       | `CurriculumRegistry`, `registry`, kit `atlas`, `assertIntegrity`, `registerSources`, `installFragment`, `registerExperience`                              |
| `core/seededRandom.ts`                                   | `GENERATOR_VERSION`, `uint32`, `createRandom`, `deriveSeed`, `namedStream`, `freshSeed`, `parameterHash`                                                  |
| `core/workers.ts`                                        | `WorkerRequest`, `WorkerResponse`, `WorkerPort`, `matchesRun`, `runWorker`                                                                                |
| `core/foundationMath.ts`                                 | finite input adapters for cashflow, conditional count, moments, nominal Kelly, log preferences, zero-interest two-state calls                             |
| `content/foundations.ts`                                 | all10 unit records, exact fragment slots, connection labels                                                                                               |
| `content/foundationCases/builders.ts`                    | optional `Scenario`, `authorCase`, `bank`, `retrieval` helpers                                                                                            |
| `content/pathways.ts`, `content/atlas-kit.json`          | 4 tracks and96 original kit family records; not invented names                                                                                            |
| `components/NumericControl.tsx`                          | finite bounded numeric field + optional equivalent slider, units and linked errors                                                                        |
| `components/PredictionForm.tsx`                          | ungraded draft capture / immutable commit callback                                                                                                        |
| `components/DataTable.tsx`, `components/SeriesChart.tsx` | caption, summary, labeled axes, explicit unavailable branches, complete accessible equivalent table                                                       |
| `components/CasePlayer.tsx`                              | persisted prediction → progressive assistance → authored structured grading → ungraded reflection/evidence                                                |

Use direct imports, not a new barrel importing all six packages.

## Package and root-session entry point

`ExperienceManifest<I,O>` requires all these fields (see `types.ts` for exact types):

```ts
id
title
version
inputVersion
conceptIds
unitIds
defaultInputs
decodeInputs
model
encodeInputs
encodeResult
decodeResult
loadView
cases
sources
assumptions
limitations
controls
probabilityInterpretation
```

`model(Readonly<I>): ModelResult<O>` is pure and independent of React/game state.
Decoders accept `unknown` and return `ModelResult<I/O>`. Successful encoded results
must be finite safe JSON. `validatedModel(decodeInputs, calculation)` catches known
`RangeError` domain failures; unexpected programming errors are not silently
converted to numeric answers. Return explicit `null` plus a status for undefined
conditionals, never zero. Use physical probabilities unless a pricing model
explicitly states otherwise. Keep money, fees and settlement timing explicit.

`loadView(): Promise<{default: ComponentType<ExperienceViewProps<I,O>>}>` is lazy.
View props are **exactly** `{controller, evidence}`. `evidence` implements
`recordAttempt(snapshot)`, `exposeHint(attemptId,hintId)` and
`exposeSolution(attemptId)`. No View writes localStorage, imports App, or receives a
`Game`. Hints/solutions must be exposed through these callbacks before display.

The package's default lazy **Entry**, distinct from its View, accepts
`ExperienceEntryProps = {session: LearningSession}`. The route shell supplies the
existing root session. A typical Entry imports its own manifest and View, calls
`useExperimentController({manifest,session,mode:'explore',caseId:'<stable-id>'})`,
then renders `<View controller={controller} evidence={session} />`.
For assessment explicitly set `mode:'assess'`, `assessmentMode:'transfer'` or
`'review'`, `unitId`, matching case/version IDs. Defaults are exploratory/practice,
not silently eligible mastery. A package can use an ErrorBoundary around its own
loading/rendering; the existing curriculum boundary also protects the route shell.

Parent registration is data-driven, no new route parser edit:

```ts
registry.registerSources(packageManifest.sources)
packageManifest.cases.forEach((fragment) => registry.installFragment(fragment))
registry.registerExperience({
  id: packageManifest.id,
  title: packageManifest.title,
  version: packageManifest.version,
  passedGate: true, // parent sets this only after accepting the package gate
  load: () => import('../experiences/<id>/Entry'),
})
registry.assertIntegrity()
```

The illustrative path above is not a production package created by A00. A07 owns
actual imports/registration. Ungated entries remain planned with no playable link.

## Controller lifecycle / concrete working fixture

`core/__fixtures__/reference.ts` exports `referenceManifest`, `ReferenceInputs`,
`ReferenceOutput`, strict decoders, pure `referenceModel` and `referenceCase`.
`ReferenceView.tsx` is a real compiling UI. Component tests execute
commit → exact run → result table → ungraded reflection → structured answers →
immutable evidence receipt, with pot100/cost25/p=.3 giving EV12.5/threshold.2.
This fixture is **not registered in production** and does not stand in for one of
the six specialist laboratories. Tests are jsdom/component checks, not browser proof.

`ControllerOptions<I,O>`:

```ts
{
  manifest, session, caseId,
  mode?: 'explore' | 'assess',
  assessmentMode?: 'practice' | 'transfer' | 'review',
  unitId?, contentVersion?, rubricVersion?, seed?, clock?, key?
}
```

The hook subscribes through `useSyncExternalStore`; the root caches runtimes by
experience/mode/assessment-mode/unit/case, or an explicit `key`. Use stable keys;
do not share one key across incompatible input types. Do not run from render.

Readable controller properties: `mode`, `phase`, immutable `inputs`, `attempt`,
`protocolState`, `result`, `status`, `progress`. Methods:

- `requestInputChange(next:I)` decodes first; invalid edits do not replace inputs.
  After commit, a valid change archives the prior snapshot and creates a linked
  draft. It never rewrites the previous prediction or evidence.
- `commitPrediction(Prediction)` is one-way from draft. Capture action, direction,
  estimate where meaningful, confidence0–100 or null/not-sure, rationale≤2,000.
  Numeric/prose confidence is not correctness grading.
- `run():Promise<void>` runs the pure synchronous model.
- `runWith(executor):Promise<void>` supports an exact population reveal or async
  worker/protocol model. `RunExecutor<I,O>` gets immutable inputs and
  `{runId,parameterHash,generatorVersion,seed,signal,onProgress}`. Its success must
  still pass the declared output encoder/decoder. Reveal only after commitment
  in assessment; a second run requires a new draft.
- `cancel()` aborts and restores committed inputs; late outputs cannot replace a
  new parameter snapshot. Navigation and reset cancel active root runtimes.
- `reflect(text)` stores ungraded text after results; `archive()` completes a run
  without claiming correctness. `resetControls()` creates a linked experiment
  after a commit and never clears history.
- `saveProtocolState(publicJson)` and `recordSearchSummary(publicJson)` persist
  bounded public protocol/search metadata. The specialist implements its own
  frozen-candidate/one-primary-holdout state machine using these facilities. Never
  persist a private unrevealed worker dataset, raw draws, hidden labels, credentials
  or game/deck data. Preserve append-only candidate/search counts when tuning.
- `submitAssessment(caseRecord,answers)` requires a completed assessment run and
  matching case/unit/content/rubric identity. It grades authored structured items,
  merges callback assistance, stores immutable submitted evidence, removes its
  active draft and returns `StructuredEvaluation`. It never scores the model's
  sampled profit. Exploration cannot use this submission path.

Input version and generator/model versions accompany attempt replay; unsupported
historical versions keep summaries readable but refuse rerunning that old snapshot.

## Case/rubric/fragments: no inferred formats

`CaseRecord` requires stable `id`, `unitId`, `contentVersion`, `rubricVersion`,
`title`, `role`, `objective`, `information[]`, `states[]`, `actions[]`, `responses`,
`cashFlows`, `constraints`, `assumptions[]`, `connection`, `mode`, `questions[]`,
`workedSolution[]`, `reflectionPrompt`, `decisionReversal`, `sources[]`.
Connections: `direct`, `added-contract`, `separate-finance`; never label a private
cashout as ordinary loss-only insurance. Modes: worked/partial/practice/transfer/review.

Every `Question` has `id`, one of four rubric components
`setup|calculation|interpretation|limitation`, positive `points`, `critical`,
`prompt`, `rationale`, and **four progressive hints**. Kinds:

- numeric: finite `expected`, nonnegative authored `tolerance`, `units`;
- choice: options `{id,label,rationale}` and expected ID or ID set;
- ordering: `{id,label}` options and an expected ordered ID array;
- classification: entries/categories `{id,label}` and expected category IDs aligned
  to entry order. Repeated categories are valid; repeated ordering items are not.

Use fresh hypothetical finance terms, not three color variants of one poker quiz.
Include critical ledger/probability/limitation items. F10 needs ≥6 items, all four
components and ≥2 critical items per variant. Free-text reflection is ungraded.

`CaseFragment = {slotId,unitId,cases:readonly CaseRecord[],lesson?:LessonCopy,
sources:readonly EvidenceReference[]}`. Cases use IDs inside the slot namespace,
for example `f05-calibration-transfer-1`, not somebody else's IDs. A full lesson
has `brief[]`, `retrieval:Question`, `predictionQuestion`, `worked[]`, `practice[]`,
`experiment:{question,instructions[],legacyId? or experienceId?}`, `transfer[]`,
`review[]`, `limitation`, `decisionReversal`. Include worked/partial/practice cases
when the slot provides a complete lesson. The parent registers sources before
installing; failed fragment validation is transactional.

### Exact fragment slots

Every slot requires ≥3 transfer **and** ≥3 review cases, correct versions and sources.
`content/foundations.ts` contains the normative per-slot `requiredTopics` checklist.
The installer validates structure/coverage; parent editorial review verifies topics
and numerical variation rather than trusting keyword matching.

| Slot              | Owner | Lesson responsibility / availability                                  |
| ----------------- | ----- | --------------------------------------------------------------------- |
| `f05-calibration` | A01   | full F05 lesson, Bayes/Beta worked/partial/practice, forecasting bank |
| `f05-selection`   | A02   | selected-evidence/positivity bank; required for F05                   |
| `f03-information` | A03   | optional signal extension to already-complete F03                     |
| `f05-information` | A03   | optional Bayes/information-value bridge                               |
| `f07-solvency`    | A05   | full F07 dependence/pooling/funding lesson and banks                  |
| `f08-contracts`   | A04   | full F08 contingent-payoff lesson and banks                           |
| `f09-contracts`   | A04   | optional protection/obligation extension to complete F09              |
| `f10-information` | A03   | cross-cutting information-value banks                                 |
| `f10-backtest`    | A06   | frozen-policy/held-out evidence reliability banks                     |
| `f10-independent` | A07   | complete F10 lesson and6-item independent finance bank                |

F05 requires calibration+selection; F07 requires solvency; F08 requires contracts;
F10 requires independent+information+backtest. Optional slots do not prevent existing
base units from being available. A05 can request additional F09/F10 supplemental
slots through the parent; it must not silently install into an A04/A07-owned slot.

## Assessment, evidence and storage

For a standalone authored case use `CasePlayer`; its session is the root session.
For a custom assessed View use controller `submitAssessment`. If evaluating manually,
pass **all** context to `evaluateCase(case,attempt,store.attempts,store.receipts,
store.reviewSchedule[case.unitId],clock,store.exposedVariants)` and submit through
`session.recordAttempt`. The compact exposure ledger prevents old revealed variants
from becoming fresh merely because detailed attempts/receipts were compacted.

Demonstration needs ≥80%, all critical items, fresh current versions, pre-outcome
prediction/rationale, no assistance and transfer mode. Early review is practice.
Review timings are+3days after first demonstration,+10 after first eligible review,
then+30; failed/assisted review retries+1 and resets streak, preserving historical
success. Retained needs two fresh delayed review variants and the current streak.
Inject `Clock=()=>Date` in tests; device clocks are not secure or authoritative.

`quantpoker.learning.v2` is authoritative after valid migration. Keep normal v1
fallback; never touch `quantpoker.progress.v1` (table). Malformed v2 is not overwritten
or auto-resurrected from v1. Recovery offers raw download, temporary work and explicit
reset. Reset writes valid empty v2 before removing only learning-v1; a failed write
is visibly session-only. Root ref retains blocked-storage work across navigation.
Revision/raw equality and storage events detect other-tab changes; no silent merge.
Reload saved progress is an explicit discard choice, with export available first.

Limits: notes10,000, rationale/reflection2,000,200 detailed attempts,20 active drafts,
1MiB UTF8 compact durable envelope, latest12 receipts/unit plus first demonstration.
Safe JSON has bounded depth/arrays/strings and forbids game/deck/private-card/secret
keys. Store only compact public model/protocol summaries. Archive before compaction;
active drafts are never evicted. Research summary counts survive detail compaction.

`session.export('json'|'markdown')` returns text for the full v2 snapshot. Oversized
temporary work exports a `quantpoker.learning.export.v1` bundle with `parts`, each a
bounded v2 envelope (shared notes/evidence are repeated, attempt/draft slices split).
This preserves the21st draft when durable storage rejects it. A single public record
larger than1MiB cannot fit a part and is explicitly rejected; model authors must
produce compact summaries, not giant raw arrays. JSON import is deferred; the bundle
is a documented recovery artifact, not an advertised working importer. Markdown
escapes HTML and includes prediction/input/result/version/seed/search/reflection data.

## Seed and worker contract

`qp-rng-v1` is Mulberry32, uint32 seed/overflow, output in[0,1). `freshSeed` uses Web
Crypto, never `Math.random`. Derived seed is FNV1a over UTF8 JSON of
`[GENERATOR_VERSION,seed,purpose,candidateId]`. Named purposes are development,
holdout,population,stress,example; candidate IDs are stable labels. Derive independent
streams, never reuse one global mutable stream for development/holdout. Python
uint32 known vectors live in `__fixtures__/rng-vectors.json`, independently checked
by tests. Hashes are stale-run labels, not cryptographic secrecy or authentication.

Worker requests:

```ts
{
  type: ('start', runId, parameterHash, generatorVersion, seed, inputs)
}
{
  type: ('cancel', runId, parameterHash, generatorVersion)
}
```

Every response repeats all three identity fields and is one of progress
`{completed,total}`, result `{result:ModelResult<O>}`, error `{message}`, or canceled.
Use `runWorker(new Worker(new URL('./worker.ts',import.meta.url),{type:'module'}),
{type:'start',inputs:publicEncodedInputs,...identity},signal,decodeResult,onProgress)`
inside `controller.runWith`. `RunContext` is not serializable: pass only its identity,
seed and encoded public inputs to the worker. Do not post `signal` or callbacks.
Listeners/worker are terminated on result, cancellation, start failure or error;
stale identity/hash/version messages are ignored. Navigation cancellation invalidates
late results even if the worker ignores abort. A real browser/max-size profile of
the A06 worker remains that agent's/A07's obligation; fake WorkerPort unit tests do
not prove UI responsiveness.

## Routing and accessibility/style contract

Unit: `routes.unit('f03','transfer')`; lab:`routes.lab('information')`;
pathway:`routes.pathway('markets-research')`; module:`routes.module('odds','lab')`.
All known IDs are frozen in `types.ts`. Core legacy aliases/fallback remain; new
unknown typed routes render a safe not-found page. Additional overview routes:
foundations,atlas,pathways,reviews; prior path/core/map/lab/notebook stay valid.
The core library remains the default; incomplete foundations never become a default
shipped path. Existing Three.js/table lazy boundaries are unchanged.

All package CSS is scoped `.curriculum-workspace .qp-<experience>-...`; use existing
fonts/theme/icons and native SVG/HTML. Do not style global `input`, `button` or `body`.
Numeric controls expose visible unit/range/step labels and linked errors; typed
invalid values remain visible while validated inputs retain their last valid value.
Every graph needs a concise summary, named units/axes, complete equivalent table,
explicit null/unavailable branches, keyboard usability if interactive and reduced
motion. `SeriesChart` does this for up to2,000 finite public points. Color is never
the sole carrier of values. Evidence/assistance states need readable text. Do not
count planned resources as playable/completed or use prose keywords to grant credit.

## Source provenance and verification

`SourceRecord = {id,title,url,references[],originalExamples?}`;
`EvidenceReference = {sourceId,claim,locator?,verification:'checked'|'pending'|
'unavailable',checkedAt?}`. Record supported claims, not fabricated quotes. Checked
claims require a concrete locator/time. Register each source once; use existing
source IDs rather than copying duplicate registrations. Specialist claims remain
pending until their owner verifies them. All business quantities/contract terms in
base banks are explicitly original hypothetical examples, not factual industry data.
The four checked A00 leads are in `content/sources.ts`: MIT18.05 probability, Boyd
Kelly/drawdown, MIT options replication and IES instructional recommendations.
The complete36-lead kit audit is **not** claimed by this foundation commit.

## Verification and scope

```sh
. "$HOME/.nvm/nvm.sh" && nvm use 24
npm ci
npm test -- src/curriculum/core src/curriculum/components/FoundationWorkspace.test.tsx
npm run typecheck
npm run lint
npm test
npm run build
npm audit
git diff --check
npx prettier --check <changed-files>
python "$ARTIFACT_DIR/verify_spec.py"
```

Node22 remains in CI/.nvmrc; Node24 is locally verified. There is no installed
pre-commit hook at the approved baseline. Existing table/lens/core tests remain part
of the full suite; only old direct-v1 persistence assertions were updated to inspect
the migrated v2 legacy compartment. No game engine changes or runtime dependencies.
Passing A00/G1 is not full R1/G2–G6 acceptance, browser acceptance, or permission to
merge/deploy. Browser tests were not run by this child, awaiting parent's approval.
