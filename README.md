# QuantPoker

**Play the hand. Understand the odds.**

QuantPoker teaches the mathematics of uncertain decisions through a play-money poker game. A heads-up Texas Hold’em table sits beside a live finance panel: estimate equity, inspect expected value, rotate 3D payoff surfaces, and explore the connections—and differences—between poker, options, and insurance.

This is a **single-player educational web app**, not an online gambling service, multiplayer platform, trading tool, or source of investment advice.

## Run locally

Requirements: Node.js **22.12+** and npm. Node 22 LTS is specified in `.nvmrc`; Node 24 also works.

```sh
nvm install           # optional, if using nvm
nvm use
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). No API keys, database, account, or environment variables are required. `.env.example` documents that intentionally empty configuration.

```sh
npm run typecheck    # strict TypeScript
npm run lint         # ESLint and React hooks checks
npm test             # engine, finance, curriculum, storage and component tests
npm run build        # type-check + production assets in dist/
npm run preview      # locally serve the production build
```

The app can be served by any static host. Build with `npm run build` and use `dist` as the output directory. There are no server routes or client-side path-routing requirements. A local preview is not a public deployment.

## What you can do

- Play heads-up no-limit Hold’em against **Atlas**, a lightweight probability-based practice bot.
- Fold, check, call, bet, and raise; use half-pot, pot, or maximum-effective-stack sizing.
- See correctly evaluated best-five-card hands, all-in runouts, split pots, alternating dealer/blinds, chip balances, and action history.
- Start with a clearly labeled **guided flop** (`A♠ J♠` on `K♠ Q♠ 7♦`). Both players previously invested 60; Atlas bet another 40. The 160-chip pot, stacks, and call price are internally consistent. The opponent’s teaching hand is fixed, but never supplied to the hero’s equity estimator. Subsequent hands are shuffled.
- Compare **fold, call/check, and raise scenarios** without playing an action. Raise sizing comes from the table; assumed fold probability is explicitly adjustable, not a hidden claim about Atlas.
- Rotate animated **3D decision terrains**, inspect points with your pointer or keyboard-accessible sliders, and open a larger view. Readouts show both normalized values and chips. The live marker, surface, and formulas share the same model; overbets automatically expand the risk axis.
- Select a likely favorable or unfavorable **next public card** and reprice every lens. What-if scenarios are clearly labeled, never change the dealt hand, and expire when the real board changes.
- After settlement, compare the realized result with a **final-decision review** frozen at the information you had before acting. Later board cards and the opponent's revealed hand do not leak into that analysis.
- Explore **optionality**: compare committing capital with preserving the choice to fold. Connect the zero-EV frontier, local sensitivity, next-card uncertainty, and finite information clock to options concepts—with explicit limits on the analogy.
- Explore **protection** priced from this decision's modeled loss probability and exposure. Compare unhedged versus protected downside and outcome dispersion, including ties and opponent folds.
- Complete three short lessons with explanatory quizzes; track the last 100 hand results on the current device.
- Open the **Curriculum** for eight deeper poker-to-finance modules, live labs, a searchable concept map, mastery checkpoints, and a local notebook. Relevant lessons are linked from each finance lens.
- Pause the bot, enable optional gentle action sounds, and inspect hand history.

On narrow screens, the side-by-side layout becomes a vertical stack with the table first. Reduced-motion preferences, keyboard-operable controls, native modal focus handling, and text equivalents for chart formulas are included. 3D requires WebGL; if unavailable, the calculations and lessons remain usable.

## The math and its limits

### Integrated curriculum

The table remains the default experience (`#table`). The **Curriculum** navigation opens `#learn/path`; individual lessons support links such as `#learn/module/odds/learn`, with `lab` and `check` tabs. The concept map, standalone experiments, and notebook live at `#learn/map`, `#learn/lab/odds`, and `#learn/notebook`. Hash routes need no hosting rewrite configuration.

Opening the curriculum pauses the bot without resetting your hand, stacks, raise size, selected lens, results, or manual pause setting. A visible-information hand summary carries your cards, public board, pot, call cost, estimated equity, and (when facing a bet) break-even equity into the lesson. **Return to this hand** resumes the same game. Lab inputs are independent experiments, not edits to dealt cards or bankroll. Finance-panel what-if controls and camera position reset when the table panel is remounted; the game itself does not. Reloading still starts a fresh guided hand.

| Stage            | Poker mechanic               | Finance connection                       | Experiment                                                                         |
| ---------------- | ---------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Foundations      | Pot odds                     | Expected payoff and entry price          | Change pot, call cost, and equity                                                  |
| Foundations      | Outs                         | State spaces and probability             | Exact draws without replacement vs. rule of two/four                               |
| Foundations      | Equity                       | Physical vs. risk-neutral probabilities  | Combine wins and split pots                                                        |
| Decision science | Expected value               | Risk-neutral pricing                     | Separate physical forecasts from binomial pricing weights                          |
| Decision science | Fold equity                  | Contingent payoff trees                  | Mix folds with equity conditional on a call                                        |
| Market mechanics | Variance                     | Implied volatility                       | Compare poker dispersion with a synthetic option premium and IV inversion          |
| Market mechanics | Payoff accounting            | Delta hedging and put-call parity        | Replicate terminal payoffs and compare parity portfolios                           |
| Market mechanics | All-in cashouts and bankroll | Insurance premiums and credit protection | Compare cashout/run-twice settlements, Kelly sizing, ruin risk, and variance bands |

Each typed module in `src/curriculum/curriculum.ts` defines three objectives, recommended prerequisites, conceptual explanations, an explicit analogy boundary, a worked numerical example, formula notation, a lab, two mastery questions with feedback, notes, and a further-reading link. Prerequisites guide sequencing but never lock access. Both questions must be correct for local completion; retries are unlimited. The original three lens mini-lessons remain available from the table and retain their existing completion records.

Important distinctions are taught explicitly:

- Poker equity is **not** option delta; physical probabilities are **not** necessarily risk-neutral probabilities.
- The binomial lab assumes `0 < d < 1+r < u`, a frictionless non-dividend stock, and a simple risk-free rate for the full period. It prices by replication: `q = (1+r-d)/(u-d)` and `V = [qVu + (1-q)Vd]/(1+r)`.
- Delta is the stock quantity in an exact two-state hedge, not a probability. Put-call parity is `C-P = S-K/(1+r)` for matching European claims. This does not make real-world discrete hedging riskless.
- The variance experiment assumes independent binary ±100-chip payoffs; total mean scales with the number of hands and standard deviation with its square root.
- The separate Black–Scholes example assumes spot = strike = 100, one year, a 5% continuously compounded rate, and no dividends. It generates a **synthetic** premium and recovers IV by bisection; it does not fetch market prices or convert chip variance into annualized volatility.
- The fold-equity lab assumes equal new bets, no subsequent betting, and equity conditional on being called. It is a strategic payoff tree, not an arbitrage-pricing identity.
- The all-in risk lab uses a binary win/loss payoff with known physical equity. Two equal runouts are treated as independent, so they preserve EV and halve variance; real boards share a depleted deck. A cashout charges a percentage of the fair gross payout. The Kelly model repeats constant, independent odds, resizes after every result, and defines ruin as crossing a selected drawdown floor over a finite horizon—not literal bankruptcy.
- Cashing out sells the whole pot claim; loss-only insurance pays on a defined losing event while retaining the hand. The latter is the closer credit-default-swap analogy. The lab has no reference entity, default timing, recovery auction, credit-spread curve, discounting, collateral, or counterparty credit risk and does not produce a market CDS price.

Curriculum records now use `quantpoker.learning.v2`; valid learning-v1 notes and core completions migrate without becoming new foundation evidence. Normal migration leaves `quantpoker.learning.v1` untouched as a fallback. Table history and lens mini-lessons retain the separate `quantpoker.progress.v1` key, which curriculum reset never removes. Malformed records are preserved with recovery/export choices; storage failures retain work in the root session until the tab closes. JSON and Markdown exports, bounded retention, and multi-tab conflict warnings are included. There is no JSON importer, account, or cloud sync.

### R1 shared foundation (A00)

The core library remains the default curriculum. `#learn/foundations` adds the ten-unit framework: F01–F04, F06 and F09 have seven-step lessons, worked/partial/practice cases, three finance transfers and three varied reviews apiece. F05/F07/F08/F10 remain visibly **partial** until their owners' required banks are integrated. The six specialist laboratories are **planned**, not shipped in this foundation commit. Four pathway pages at `#learn/pathways` and the kit-derived 96-family atlas at `#learn/atlas` describe coverage honestly; future capstones are not playable links.

Predictions are committed before structured answers/reveals. Hints and repeated exposed cases remain practice, not unaided demonstration. A fresh transfer needs at least 80% and all critical items correct; prose and simulated profits are never graded. Delayed review uses device-clock reminders at 3, then 10, then 30 days; failed/assisted reviews retry at 1 day. This editable local evidence is not secure certification.

See the [frozen developer contract and runnable test fixture](src/curriculum/core/README.md) for manifest, controller, case-fragment, persistence, route, deterministic-stream, worker, source and accessibility APIs. Browser acceptance and complete R1 integration remain separate from unit/component checks.

The curriculum is lazy-loaded and its CSS is scoped to `.curriculum-workspace`, so it does not restyle the table or 3D panel. Pure models live in `src/curriculum/lib/math.ts`, independent of poker-game transitions. Add new modules by extending the typed content and lab registry, then adding numerical and interaction tests.

### Showdown equity

The hero’s estimator samples **2,000** uniformly random legal opponent hands and future boards, counting ties as half a win. It runs in a Web Worker and sees only the hero’s two cards and public board. It does **not** read Atlas’s hidden cards, condition on its betting range, or claim solver accuracy. At 2,000 independent samples, the worst-case approximate 95% sampling margin is ±2.2 percentage points; model error can be much larger. Estimates are stable through actions on the same board and recomputed when visible cards change.

On the flop and turn, each legal next card gets **180 additional simulations**, retaining win, tie, and loss probabilities. The standard deviation of these conditional equity estimates is displayed as next-card volatility. This is a directional, noise-contaminated sensitivity diagnostic, **not annualized market volatility or an exact ranking of outs**. Favorable and unfavorable cards are selected from these noisy estimates. Before the flop it is unavailable (a flop reveals three cards); on the river no next-card uncertainty remains.

### Expected value

For current pot `P`, additional call cost `C`, and showdown equity `p`:

```text
EV(call) = p × P − (1 − p) × C
Break-even equity = C / (P + C)
Normalized 3D surface = p − (1 − p) × (C / P)
```

The call formula assumes **no further betting, no rake, and no fold equity**. Previously invested chips are sunk costs. A free check's value is its modeled check-down pot share, not a guaranteed profit or an estimate of future betting value. A realized hand result is not evidence that a decision was good or bad.

For a raise risking `R` additional chips, an opponent call of `A`, and an explicitly assumed fold probability `f`:

```text
EV(raise) = f × P + (1 − f) × [p × (P + A) − (1 − p) × R]
EV(fold) = 0  (incremental, excluding sunk chips)
```

The raise model assumes the alternative to folding is calling, not reraising. Equity is still against a uniform random hand, not a conditioned calling range. The terrain varies equity and capital at risk while holding the pot, opponent call amount, and fold-probability assumption fixed. It is a sensitivity surface, not a set of recommendations or exclusively legal poker actions. The current-action marker always evaluates the actual selected risk.

### Optionality and the market analogy

```text
Decision choice value = max(0, EV(selected continuation))
Call-EV sensitivity per percentage point = (P + C) / 100
Raise-EV sensitivity per percentage point = (1 − f) × (P + A + R) / 100
```

This surface clips negative modeled EV at zero because you can decline before committing. The kink illustrates convexity in a decision value function, **not an actual option payoff or option price**. Once you pay, losses are possible. The panel maps probability, price, sensitivity, information arrival, and optionality into plain-language financial concepts. Next-card dispersion is not implied volatility, the finite card clock is not market theta, and local EV sensitivity is not a Black–Scholes Greek. Poker has no traded underlying, risk-neutral measure, continuous hedge, interest-rate curve, or dividends. The beginner lesson separately explains a real vanilla call's expiration payoff `max(S − K, 0) − premium`.

### Insurance

```text
Net outcome = −loss + min(loss, coverage) − premium
Fair premium = loss-event probability × coverage
```

Coverage ranges from zero to the selected decision's incremental exposure. The loss-event probability comes from the Monte Carlo **loss** frequency, not `1 − equity` (which would misprice ties). For a raise it is additionally multiplied by `1 − f`. The hypothetical premium is paid in every state, and coverage pays only on a loss; ties and opponent folds do not trigger payment. The outcome distribution includes fold, win, tie, and loss states. Its mean is unchanged by fair coverage, while standard deviation falls. The terrain varies loss probability and coverage, repricing the premium for each point and normalizing bad-state net outcome by exposure. No exposure produces a flat zero surface. Real policies include expenses, margins, exclusions, and often deductibles. The model does not purchase insurance or affect the poker bankroll.

These are **conceptual connections**, not measured correlations with financial assets.

## Architecture

| Area         | Implementation                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Interface    | React 19 + TypeScript; Vite; responsive CSS; Lucide icons                                                                |
| Poker engine | Immutable game transitions in `src/lib/poker.ts`; all nine hand categories and tie-breakers                              |
| Equity       | Worker in `src/lib/equity.worker.ts`; visible-information Monte Carlo                                                    |
| Finance      | Pure functions in `src/lib/finance.ts` shared with charts/tests                                                          |
| 3D           | Lazy-loaded Three.js + OrbitControls; raycast inspection, numerical probes, animated marker; static under reduced motion |
| Persistence  | Versioned, validated browser localStorage in `src/lib/storage.ts`                                                        |
| Fonts        | Bundled DM Sans and Manrope (Fontsource, SIL Open Font License); no Google Fonts requests                                |
| CI           | GitHub Actions: clean install, typecheck, lint, tests, production build                                                  |

All play is client-side. The application makes no analytics or AI-provider requests and stores no credentials. Reloading starts a fresh guided table while preserving lesson completion and recorded results. Settings, the current hand, and the current session bankroll are not persisted. When a player runs out of chips, **Refill & deal next hand** resets both practice stacks to 2,000 and keeps the recorded results.

## Validation

Automated coverage includes:

- Category ordering, wheel straights, kickers, double-triplet full houses, and three-pair best-hand selection.
- Comparison of seven-card evaluation with all 21 five-card subsets over 1,000 deterministic random hands.
- Blinds, big-blind option, action order, minimum raises, effective-stack caps, short all-ins, folds, showdown ties, and input immutability.
- Chip conservation and termination across 500 deterministic randomized hands.
- Bot action validity and independence from the hero’s hidden cards.
- Known equity cases, conditional next-card distributions, fold/call/raise arithmetic, sensitivity surfaces, and unclamped overbet markers.
- Fair protection preserving expected wealth with ties and opponent folds; reduced payoff dispersion; premium-inclusive vanilla option payoffs in the lesson utilities.
- Corrupt/unavailable browser storage and bounded saved history.
- Curriculum mathematics: exact outs, EV, variance, binomial replication, put-call parity, Black–Scholes benchmarks, and IV inversion.
- Module integrity, checkpoint retry/completion, notebook export/reset, and malformed curriculum storage.
- Table-to-lesson deep links, preserved hands and manual pause state, suspended/resumed bot turns, and isolation of legacy history from curriculum resets. Component tests mock the equity worker and WebGL renderer; engine and finance calculations are tested separately.

These tests do not replace browser end-to-end, screen-reader, mobile-device, or cross-browser testing.

## Deliberate boundaries

- **Not multiplayer:** no lobby, accounts, matchmaking, or authoritative server.
- **Not money-safe:** cards and state can be inspected in browser developer tools. Randomness uses `Math.random`, adequate for a non-adversarial local teaching game, not gambling.
- **Not a solver:** Atlas estimates its own equity against random hands with a small simulation budget and simple betting rules. It is a practice opponent, not an expert strategy model.
- **Heads-up only:** bets are capped at the effective stack, so multiway side pots are not needed. A standard burn-card ritual is omitted without changing the distribution of dealt cards.
- **Not a certification:** the lessons are an introductory explanation of risk, not a full quantitative-finance curriculum.

The next product steps should be driven by learner feedback: richer hand-by-hand explanations, calibrated opponent ranges, further lessons, and independently validated financial models—before adding multiplayer or account infrastructure.
