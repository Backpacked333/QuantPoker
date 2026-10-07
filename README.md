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
npm test             # deterministic engine, finance, and storage tests
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
- Pause the bot, enable optional gentle action sounds, and inspect hand history.

On narrow screens, the side-by-side layout becomes a vertical stack with the table first. Reduced-motion preferences, keyboard-operable controls, native modal focus handling, and text equivalents for chart formulas are included. 3D requires WebGL; if unavailable, the calculations and lessons remain usable.

## The math and its limits

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

These tests do not replace browser end-to-end, screen-reader, mobile-device, or cross-browser testing.

## Deliberate boundaries

- **Not multiplayer:** no lobby, accounts, matchmaking, or authoritative server.
- **Not money-safe:** cards and state can be inspected in browser developer tools. Randomness uses `Math.random`, adequate for a non-adversarial local teaching game, not gambling.
- **Not a solver:** Atlas estimates its own equity against random hands with a small simulation budget and simple betting rules. It is a practice opponent, not an expert strategy model.
- **Heads-up only:** bets are capped at the effective stack, so multiway side pots are not needed. A standard burn-card ritual is omitted without changing the distribution of dealt cards.
- **Not a certification:** the lessons are an introductory explanation of risk, not a full quantitative-finance curriculum.

The next product steps should be driven by learner feedback: richer hand-by-hand explanations, calibrated opponent ranges, further lessons, and independently validated financial models—before adding multiplayer or account infrastructure.
