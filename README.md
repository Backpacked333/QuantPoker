# QuantPoker

**From the felt to the market.** An interactive learning workspace that builds quantitative-finance intuition from poker decisions—without claiming that poker and options are the same game.

The app has seven connected modules, seven live mathematical labs, a searchable concept map, fourteen mastery questions, and a private local notebook. It is a working, client-only educational product, not a trading system, a poker solver, or a live market-data service.

## Run locally

Use Node.js 24 LTS and npm (Node 22.12+ is also supported by the toolchain).

```sh
nvm install
nvm use
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). No environment variables, API keys, database, or account are required. The `.nvmrc` file pins the Node major version; `package-lock.json` locks dependencies.

```sh
npm run test       # Mathematical, curriculum, persistence and component tests
npm run lint       # ESLint, TypeScript and React Hooks rules
npm run typecheck  # Strict TypeScript checks
npm run build      # Typecheck and produce dist/
npm run preview   # Serve the production build locally
```

The application is a static Vite build and can be served by any static host. Hash-based routes support deep links without server rewrite rules. Google Fonts improves typography when reachable; system fallbacks keep the app functional without it. There are no analytics or third-party application APIs.

## Curriculum architecture

| Stage            | Module                            | Poker mechanics   | Finance connection                      | Interactive experiment                                                          |
| ---------------- | --------------------------------- | ----------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| Foundations      | 01 · The price of a decision      | Pot odds          | Expected payoff and entry price         | Adjust pot, call cost, and equity; compare call EV with folding                 |
| Foundations      | 02 · Count the possible futures   | Outs              | State spaces and probability            | Compare exact draws without replacement with the rule of two/four               |
| Foundations      | 03 · Your share of uncertainty    | Equity            | Physical vs. risk-neutral probabilities | Combine wins and split pots; distinguish equity from delta                      |
| Decision science | 04 · Good bets. Fair prices.      | Expected value    | Risk-neutral pricing                    | Move physical forecasts independently of binomial pricing weights               |
| Decision science | 05 · The value of a response      | Fold equity       | Contingent payoff trees                 | Combine folds with equity conditional on the calling range                      |
| Market mechanics | 06 · An edge is not a smooth line | Variance          | Implied volatility                      | Compare chip dispersion with a synthetic Black–Scholes premium and IV inversion |
| Market mechanics | 07 · Build the same payoff twice  | Payoff accounting | Delta hedging and put-call parity       | Verify replication in both states and compare parity portfolios                 |

### Learning sequence

```text
Pot odds → Outs → Equity → Expected value → Fold equity ──┐
   └───────────────────────┘                Variance ────┴→ Replication
                              Expected value ──┘
```

The canonical prerequisite graph lives in `src/curriculum.ts`; prerequisites are recommendations, not access locks. Learners can explore any module or lab immediately. Completion requires both checkpoint answers to be correct. Explanations follow every submitted attempt, and retries are unlimited. Completion is a local learning aid, not a secure certification or proof of expertise.

Every module has the same contract:

1. Three explicit learning objectives.
2. A poker-to-finance connection and an explicit analogy boundary.
3. Three short conceptual explanations.
4. A worked numerical example and defined notation.
5. A manipulable lab with visible assumptions.
6. A two-question checkpoint with explanatory feedback.
7. A field-note area and further-reading link.

## Important model boundaries

- **Pot odds:** `EV = eP − (1−e)C`; `P` includes the opponent’s bet and excludes the learner’s additional call. Previously invested chips are sunk. No future betting, rake, or ties in this lab.
- **Outs:** uniform sampling without replacement, with fixed clean outs. Hitting a draw is not the same as winning, and the lab is not a hand evaluator.
- **Equity:** `P(win) + ½P(tie)` for heads-up, equally split pots. These probabilities are entered by the learner, not computed from cards or ranges. Multiway pots and side pots are not modeled.
- **Fold equity:** `fP + (1−f)[e(P+B)−(1−e)B]`, where `e` is conditional on being called. Both players put in the same new bet. No subsequent raises/bets. Positive bet EV alone does not show that betting beats checking.
- **Risk-neutral pricing:** a frictionless, non-dividend, one-step binomial model. `r` is the simple risk-free return for the full period. Valid states satisfy `0 < d < 1+r < u`. The UI limits inputs to this domain; the model rejects invalid inputs.
- **Delta/parity:** European options with matching strike/expiry. Delta is stock units, not a win probability. Exact replication in a two-state model is not a claim that real-world discrete delta hedging is riskless.
- **Variance:** independent, identical binary poker payoffs of ±100 chips. Total mean scales with `n`; total standard deviation scales with `√n`. Dependence and changing strategies are outside the model.
- **Implied volatility:** the separate Black–Scholes lab uses spot = strike = 100, one year, 5% continuously compounded annual interest, and no dividends. It generates a synthetic premium, then numerically recovers its IV. This intentionally demonstrates inversion without implying access to real market prices. A standard polynomial normal-CDF approximation and a bisection solver are used; prices are educational approximations.

Poker equity is not option delta. Physical probabilities are not necessarily risk-neutral probabilities. Chip standard deviation is not annualized return volatility. Fold equity is strategic behavior, not an arbitrage-pricing identity. Those distinctions are part of the curriculum rather than hidden disclaimers.

## Code organization

```text
src/
  curriculum.ts              Typed modules, prerequisites, examples, questions
  App.tsx                    Hash navigation, learning path, map, lessons, notebook
  components/
    Labs.tsx                 Seven labeled, resettable interactive experiments
    Checkpoint.tsx           Quiz feedback, retries, completion callback
  lib/
    math.ts                  Pure, domain-validated mathematical functions
    progress.ts              Versioned and validated local-storage schema
  *.test.ts(x)               Curriculum and integration tests
  lib/*.test.ts              Math and persistence regression tests
```

To add a module, extend `LabId`, add its typed content and prerequisites to `modules`, register a lab in `Labs.tsx`, and add numerical fixtures and interaction tests. Preserve the separation between educational content, pure model code, and presentation. Prerequisites must reference earlier modules; tests enforce uniqueness and ordering. The content model does not require a backend and can later be moved to a CMS without replacing the mathematics layer.

## Data and accessibility

- Progress and notes are stored under `quantpoker.learning.v1` in this browser’s `localStorage`. There is no cloud sync or account. Clearing browser data deletes them.
- Malformed records, unknown module IDs, duplicate completions, and unsupported schema versions are normalized safely. Notes are capped at 10,000 characters per module. Storage failures display an explicit warning and allow in-memory learning to continue.
- Notes can be exported as Markdown. Resetting progress and notes requires an explicit confirmation. Lab inputs reset when switching experiments or reloading; they are intentionally not persisted.
- Semantic landmarks, native labeled sliders/selects/radio controls, keyboard focus styling, route-heading focus, a skip link, live calculation results, and reduced-motion support are included. Desktop, tablet, and mobile layouts use CSS breakpoints.
- Further-reading URLs are external resources; they are supplementary and not required to complete any module.

## Scope

This first implementation intentionally excludes accounts, cloud persistence, real-money play, live option quotes, poker range solving, instructor dashboards, multi-user collaboration, and investment recommendations. All examples are educational, and all chips are hypothetical.
