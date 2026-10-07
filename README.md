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
- Explore an **expected value** lens with live Monte Carlo equity and a current-scenario marker on the 3D surface.
- Explore a **call option** at expiration, with adjustable asset price and a premium-aware payoff graph.
- Explore **insurance** with adjustable coverage and scenario loss, showing the cost of reducing downside.
- Complete three short lessons with explanatory quizzes; track the last 100 hand results on the current device.
- Pause the bot, enable optional gentle action sounds, and inspect hand history.

On narrow screens, the side-by-side layout becomes a vertical stack with the table first. Reduced-motion preferences, keyboard-operable controls, native modal focus handling, and text equivalents for chart formulas are included. 3D requires WebGL; if unavailable, the calculations and lessons remain usable.

## The math and its limits

### Showdown equity

The hero’s estimator samples **2,000** uniformly random legal opponent hands and future boards, counting ties as half a win. It runs in a Web Worker and sees only the hero’s two cards and public board. It does **not** read Atlas’s hidden cards, condition on its betting range, or claim solver accuracy. At 2,000 independent samples, the worst-case approximate 95% sampling margin is ±2.2 percentage points; model error can be much larger. Estimates are stable through actions on the same board and recomputed when visible cards change.

### Expected value

For current pot `P`, additional call cost `C`, and showdown equity `p`:

```text
EV(call) = p × P − (1 − p) × C
Break-even equity = C / (P + C)
Normalized 3D surface = p − (1 − p) × (C / P)
```

These formulas assume **no further betting, no rake, and no fold equity**. Previously invested chips are sunk costs. A check-down pot share is labeled separately from profit. A realized hand result is not evidence that a decision was good or bad.

### Options

```text
Expiration profit = max(asset price − strike, 0) − premium
```

The slider uses strike 100 and premium 10. The surface varies asset price 0–200 and strike 0–160, with profit normalized by 70 for display. This is **expiration payoff, not a pre-expiration option pricing model**. Poker calls are not financial call options: poker has no traded underlying, a strike price, or the same contractual rights.

### Insurance

```text
Net outcome = −loss + min(loss, coverage) − premium
Fair premium = loss-event probability × coverage
```

The illustrative premium assumes a 20% chance of a 200-chip loss and otherwise no loss, with coverage restricted to 0–200. The scenario-loss slider asks how that same policy pays in a particular hypothetical outcome; it does not recalibrate the pricing distribution. The surface uses the same premium and normalizes net outcome by 100. Real policies include expenses, margins, exclusions, and often deductibles. The model does not purchase insurance or affect the poker bankroll.

These are **conceptual connections**, not measured correlations with financial assets.

## Architecture

| Area         | Implementation                                                                              |
| ------------ | ------------------------------------------------------------------------------------------- |
| Interface    | React 19 + TypeScript; Vite; responsive CSS; Lucide icons                                   |
| Poker engine | Immutable game transitions in `src/lib/poker.ts`; all nine hand categories and tie-breakers |
| Equity       | Worker in `src/lib/equity.worker.ts`; visible-information Monte Carlo                       |
| Finance      | Pure functions in `src/lib/finance.ts` shared with charts/tests                             |
| 3D           | Lazy-loaded Three.js + OrbitControls; render on changes, not a continuous animation loop    |
| Persistence  | Versioned, validated browser localStorage in `src/lib/storage.ts`                           |
| Fonts        | Bundled DM Sans and Manrope (Fontsource, SIL Open Font License); no Google Fonts requests   |
| CI           | GitHub Actions: clean install, typecheck, lint, tests, production build                     |

All play is client-side. The application makes no analytics or AI-provider requests and stores no credentials. Reloading starts a fresh guided table while preserving lesson completion and recorded results. Settings, the current hand, and the current session bankroll are not persisted. When a player runs out of chips, **Refill & deal next hand** resets both practice stacks to 2,000 and keeps the recorded results.

## Validation

Automated coverage includes:

- Category ordering, wheel straights, kickers, double-triplet full houses, and three-pair best-hand selection.
- Comparison of seven-card evaluation with all 21 five-card subsets over 1,000 deterministic random hands.
- Blinds, big-blind option, action order, minimum raises, effective-stack caps, short all-ins, folds, showdown ties, and input immutability.
- Chip conservation and termination across 500 deterministic randomized hands.
- Bot action validity and independence from the hero’s hidden cards.
- Known equity cases, expected-value arithmetic, premium-inclusive option payoffs, capped insurance payouts, and graph/formula consistency.
- Corrupt/unavailable browser storage and bounded saved history.

These tests do not replace browser end-to-end, screen-reader, mobile-device, or cross-browser testing.

## Deliberate boundaries

- **Not multiplayer:** no lobby, accounts, matchmaking, or authoritative server.
- **Not money-safe:** cards and state can be inspected in browser developer tools. Randomness uses `Math.random`, adequate for a non-adversarial local teaching game, not gambling.
- **Not a solver:** Atlas estimates its own equity against random hands with a small simulation budget and simple betting rules. It is a practice opponent, not an expert strategy model.
- **Heads-up only:** bets are capped at the effective stack, so multiway side pots are not needed. A standard burn-card ritual is omitted without changing the distribution of dealt cards.
- **Not a certification:** the lessons are an introductory explanation of risk, not a full quantitative-finance curriculum.

The next product steps should be driven by learner feedback: richer hand-by-hand explanations, calibrated opponent ranges, further lessons, and independently validated financial models—before adding multiplayer or account infrastructure.
