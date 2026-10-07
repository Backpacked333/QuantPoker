# Backtest selection and held-out evaluation

An R1 educational null simulator, not market data or a poker policy. Every stable
candidate generates synthetic ±1 outcomes with physical probability 0.5. More
development searches can produce a convincing apparent winner without any true
gross edge. Costs apply to every observation, so the true net edge is −cost.

## Integration

The package starts from frozen shared contracts at
`04667f3a8c64c8254268c657f3077c5fd6cdceae`. It changes no shared registry, game,
storage implementation, global styles, dependencies or provider configuration.
Parent integration should register the named `backtestManifest` from `manifest.ts`:

```ts
registry.registerSources(backtestManifest.sources)
backtestManifest.cases.forEach((fragment) => registry.installFragment(fragment))
registry.registerExperience({
  id: backtestManifest.id,
  title: backtestManifest.title,
  version: backtestManifest.version,
  passedGate: true, // only after the parent accepts the assigned gate
  load: () => import('../experiences/backtest/Entry'),
})
registry.assertIntegrity()
```

Lazy `Entry` receives the root `LearningSession`; lazy `View` receives exactly
`{controller, evidence}`. Explore mode grants no mastery. The six selectable finance
cases use assessment controllers with matching unit/case/version identities and
shared `submitAssessment`. The `f10-backtest` fragment contains three transfer and
three changed-number review cases, each with nine structured items, four rubric
components, critical protocol/ledger items and four hints per item. It is **not** the
complete independent F10 lesson or R1 release gate.

## Numerical model and protocol

- `backtestModel` is pure and analytic. Strict decoders reject non-finite/out-of-range
  controls; `decodeResult` validates all realized scores, costs and intervals.
- `SimulationBatch` uses `qp-rng-v1` named streams by role and stable candidate ID.
  Development and holdout have separate generator instances; neither advances the
  other's stream. Stable ascending IDs break selection ties.
- `simulation.worker.ts` executes bounded 2,048-draw batches with tagged progress,
  result, error and cancellation messages. Shared `runWorker` handles cleanup and
  stale identities. No raw draws or hidden game data are persisted.
- Research follows draft → preregistered → development complete → candidate frozen
  → evaluation revealed → ungraded research reflection. The shared controller runs
  **one** asynchronous attempt across development and evaluation. While waiting for
  freeze/reveal, its phase remains `running`, but the development worker has already
  terminated. Cancel/navigation abort the pending gate; resume keeps the same seed,
  prediction and completed development search, not a new search.
- The primary test is conservatively marked consumed **before** requesting its
  worker. Cancel/resume replays that same frozen evaluation and is labeled as such.
  A linked new experiment retains old positive/negative results, full public
  hypothesis/falsification/protocol/search summaries and consumed-dataset identities.
  Cost/sample-size edits cannot turn a previously consumed candidate stream into
  fresh evidence. The bounded 2,000-identity ledger refuses further new tests when
  full; it is never silently truncated.
- Role hashes include model/generator versions, role, seed, trial count and derived
  candidate streams. The freeze hash includes the entire preregistered protocol,
  selected ID and both dataset roles. These local FNV labels are **not** cryptographic
  authentication, guaranteed disjoint PRNG cycles, or cheating-proof secrecy.
- Wilson 95% intervals assume iid Bernoulli observations. The net-mean interval is
  `[2·lower−1−cost, 2·upper−1−cost]` for the single frozen policy, not the selected
  development maximum.
- `1−(1−.05)^M` applies to independent exact-size null tests only. The raw simulator
  does not implement those tests, multiple-testing-adjusted significance, or CSCV/PBO.

Native controls expose units, bounds, steps and errors. Every result is in a labeled
accessible table; nothing depends on hover, color, animation or a chart. Numeric
prediction/confidence, hypothesis, rationale and reflection are ungraded. Authored
structured reasoning—not sampled profit—drives the shared assessment rubric.

## Verification

From the repository root with the existing dependencies and Node runtime:

```sh
npm test -- src/curriculum/experiences/backtest
npm run typecheck
npm run lint
npm test
npm run build
npm audit
npx prettier --check src/curriculum/experiences/backtest
git diff --check
```

Tests cover independent golden Wilson/false-positive expectations, independently
computed Python seed/count vectors, 256 deterministic seeds with declared .01
held-out-mean tolerance, maximum requested 400,000+5,000-draw profiles, real handler
code over a deterministic WorkerPort transport, freeze/cancel/resume/reload/stale
responses, case schema, structured evidence and jsdom controls/results/reflection.

Browser testing was not authorized for this child. Real-browser worker responsiveness,
320px/200% zoom, keyboard/screen-reader checks, integrated routing and Atlas pause/
same-hand return remain the parent's acceptance gate. Component/transport tests do
not prove these. Source metadata identifies the checked Bailey et al. introduction
and explicitly distinguishes the original hypothetical ledgers and mathematical
simulator from empirical claims.
