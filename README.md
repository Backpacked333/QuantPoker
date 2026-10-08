# QuantPoker

**Play the hand. Understand the odds.**

QuantPoker is a decision trainer disguised as a poker game. You play heads-up Texas Hold’em for play money against **Atlas**, a transparent practice bot. Before the math appears you commit to a read, then a live quant lab prices every option. After each hand you get chess-style grades on the decisions, with luck shown separately from skill.

This is a **single-player educational web app**, not a gambling service, multiplayer platform, trading tool or source of investment advice.

## Run locally

Requirements: Node.js **22.12+** and npm (`.nvmrc` pins Node 22 LTS; Node 24 also works).

```sh
npm ci
npm run dev          # http://localhost:5173
```

No API keys, database, account or environment variables are needed; `.env.example` documents that intentionally empty configuration.

```sh
npm run typecheck    # strict TypeScript, including e2e specs
npm run lint         # ESLint and React hooks rules
npm test             # unit and component tests (Vitest, jsdom)
npm run e2e          # Playwright end-to-end, accessibility and mobile checks
npm run build        # type-check + production assets in dist/
npm run preview      # serve the production build locally
```

The build is static: host `dist/` anywhere. There are no server routes or client-side routing requirements.

## The learning loop

1. **Read first.** On each street the lab stays locked until you guess how often your hand wins at showdown. Lock it in (Enter) and the lab opens, showing how close you were. Every read feeds your calibration statistics. You can skip, or turn this off in settings.
2. **Act at the table.** Fold, check, call, bet or raise, with ½-pot, ¾-pot, pot and all-in presets. Once you have made your read, the call button carries an **equity ring** with a tick at break-even, and every bet size shows its modeled EV. Keyboard: `F` `C` `R`, `1–4` for sizes, `Enter`, `P` to pause, `?` for help.
3. **See the decision.** The lab has two modes:
   - **Simple:** an equity meter against the price, a plain-language verdict, the EV of every action, how Atlas’s actions shifted its likely range, and next-card what-ifs.
   - **Analyst:** adds a 13×13 range grid of Atlas’s likely holdings, a 2D decision map (3D terrain on demand), quant metrics, a fold-probability override, and the optionality and protection lenses.
4. **Review the hand.** Each decision gets a grade (Best, Good, Inaccuracy, Mistake, Blunder). You can replay any decision with the lab frozen at that moment. The review shows result versus model expectation, a face-up equity-by-street graph after a showdown, and Atlas’s reasoning, revealed only once the hand is over.
5. **Track improvement.** The progress page charts luck versus skill (cumulative result against cumulative expectation), decision accuracy, grade distribution, read calibration with blind spots by hand type, and recent hands. You can export and import your progress.

New visitors get a welcome screen, a short spotlight tour, three **guided hands** (a big draw, a price-sensitive straight draw, a river bluff-catch) and then shuffled practice. The **Learn** section has six hands-on lessons with interactive widgets and quizzes: expected value, outs and pot odds, variance, ranges, options and insurance.

The app has light, dark and system themes, and a bottom-sheet lab on phones. It respects reduced-motion preferences and is keyboard-operable, with automated axe checks in both themes.

## Atlas, a published strategy

Atlas estimates its own equity against a random hand (250 samples, using only its cards and the board), then follows a simple policy with three selectable styles:

| Style      | Extra equity wanted to continue | Weak hands defended\* | Value raise above | Value raise rate | Bluff rate | Bet sizes (× pot) |
| ---------- | ------------------------------- | --------------------- | ----------------- | ---------------- | ---------- | ----------------- |
| Tight      | +8 pts                          | 10%                   | 68%               | 60%              | 3%         | 0.5, 0.66         |
| Balanced   | +4 pts                          | 15%                   | 65%               | 65%              | 7%         | 0.33, 0.55, 0.75  |
| Aggressive | 0                               | 22%                   | 58%               | 75%              | 14%        | 0.66, 1           |

\*Weak-hand defence applies fully to bets up to about half pot and fades to zero against large overbets, so Atlas cannot be exploited by huge shoves.

Atlas never sees your cards. Its explanations are generated from its real inputs. During play the table shows only what it did; why it did it is revealed in the review.

## The math and its limits

### Atlas’s likely range (Bayesian, from public actions only)

Every unseen starting combination (up to 1,326) begins equally likely. For each public action Atlas took, each combo is reweighted by the probability that Atlas’s published policy takes that action with that combo’s equity on the board at the time. Atlas’s own estimation noise is modeled by smoothing its thresholds. Your equity is then measured against the resulting posterior. A toggle switches the lab to the classic **any hand** model (uniform over unseen hands).

The model is only as good as the strategy description. Against real opponents, ranges are far less predictable than Atlas’s.

### Showdown equity

Results are computed per opponent combo:

- exactly on the river and turn;
- with 80 sampled runouts per combo on the flop;
- with 24 per combo pre-flop.

They are then averaged under the selected model. Ties count as half. Each new spot first gets a fast 600-sample estimate, then the full analysis in a Web Worker. Expect a point or two of Monte Carlo noise, more for single next cards. Next-card what-ifs reprice every legal next card: exactly on the turn, by sampling on the flop.

### Expected value

For pot `P` (including all bets so far), call cost `C` and equity `p`:

```text
EV(call)        = p × P − (1 − p) × C
Break-even      = C / (P + C)
EV(raise to R)  = f × P + (1 − f) × [p_called × (P + A) − (1 − p_called) × R]
EV(fold)        = 0   (incremental; chips already in are sunk)
```

`f` is the chance Atlas folds to your raise, computed from its policy over its likely range. `A` is what Atlas must add to call. `p_called` is your equity against only the hands that continue. You can override `f`; the override then applies to the whole range. EV assumes **no betting after this decision**, no rake, and treats re-raises as calls. A free check is valued as its check-down share of the pot.

### Grades

A decision’s grade is the EV it gave up against the best modeled option at that moment, as a share of the pot:

| Grade      | EV given up |
| ---------- | ----------- |
| Best       | ≤ 3% of pot |
| Good       | ≤ 8%        |
| Inaccuracy | ≤ 18%       |
| Mistake    | ≤ 35%       |
| Blunder    | > 35%       |

The thresholds leave room for Monte Carlo noise. Accuracy is 100 for a best-EV choice, falling linearly to 0 at half a pot given up.

Bets above 1.5× pot are priced and shown, but they are not used as the grading benchmark unless you chose them. The model values calling as a check-down (no implied odds) while a shove has no later betting, which would otherwise bias grades toward huge bets.

Grades judge decisions under this model, not results, and not perfect play.

### Luck versus skill

Expected result = the EV of your final decision minus the chips you had already put in. Variance = the actual result minus the expected result. Hands that ended with no decision from you count as zero variance.

### Optionality and the market analogy

```text
Choice value              = max(0, EV(selected continuation))
EV sensitivity per point  = (1 − f) × (P + A + R) / 100   (f = 0, A = 0 for a call)
```

The kink at zero illustrates the convexity of being able to decline before committing. It is not an option price. Next-card swing is not implied volatility, the information clock is not theta, and local sensitivity is not a Black–Scholes Greek. The lesson separately covers a vanilla call’s expiration payoff, `max(S − K, 0) − premium`.

### Insurance

```text
Net outcome  = −loss + min(loss, coverage) − premium
Fair premium = loss probability × coverage
```

The loss probability comes from simulated losses (not `1 − equity`, which would misprice ties), times `1 − f` for raises. Coverage pays only in the losing state. Fair cover leaves the mean unchanged and lowers the spread. Real policies add expenses, exclusions and deductibles.

These are **conceptual connections**, not measured correlations with financial assets.

## Architecture

| Area              | Implementation                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Interface         | React 19 + TypeScript, Vite, hand-written CSS with light/dark design tokens, Lucide icons, bundled DM Sans and Manrope                   |
| Poker engine      | `src/lib/poker.ts`: immutable transitions with a public action history                                                                   |
| Hand evaluator    | `src/lib/sim.ts`: bitmask evaluator on integer cards, checked score-for-score against the original readable evaluator                    |
| Atlas             | `src/lib/atlas.ts`: style-dependent probabilistic policy and explanations                                                                |
| Spot analysis     | `src/lib/range.ts`: range posterior, per-combo tables and next-card repricing, run in one long-lived Web Worker with caches              |
| Model and grading | `src/lib/model.ts`, `src/lib/grading.ts`, `src/lib/finance.ts`: pure functions shared by the UI and tests                                |
| App state         | `src/state/trainer.ts` (reducer for hands, decisions, guesses, guided path) and `src/state/spots.ts` (keyed analysis cache)              |
| Persistence       | `src/lib/storage.ts`: validated localStorage v2 with v1 migration, export/import, and a `SyncAdapter` seam for optional cloud sync later |
| 3D                | Lazy-loaded Three.js view, opened on demand. GL contexts are released on close                                                           |

All play is client-side. The app makes no analytics, AI or network requests beyond loading itself, and stores no credentials. Settings, lessons and the last 100 hands (with decision grades and reads) stay in the browser. Reloading deals a fresh hand.

## Validation

- **Engine:** the fast evaluator matches the reference evaluator on 6,000 random 5–7 card hands; also covered are categories, kickers, wheel straights, blinds, minimum raises, effective-stack caps, short and covered all-ins, chip conservation over 500 randomized hands, and immutability.
- **Atlas:** the policy is monotone in equity and sums to one, styles are ordered, explanations are generated, and outputs are independent of the hero's cards.
- **Range model:** the posterior is normalized and excludes visible cards; a bet strengthens the range; uniform mode agrees with the independent estimator; river results are exact; bigger raises fold more of the range; and raise EV matches the finance formula.
- **Grading:** grades are monotone; folding the nuts is a blunder; overbets are excluded from the grading bar.
- **Trainer:** the guided path has unique hand ids, decision snapshots are frozen, guesses attach once per street, and finished hands queue for recording.
- **Components:** the guess gate hides the math until a read is locked; the action bar and hand review are covered.
- **End to end (Playwright):** the full guess, act and review loop by keyboard; persistence across reload; every analyst view and the 3D view opened repeatedly without GL context warnings; lessons; dark mode with reduced motion; axe accessibility in light and dark; and a phone layout with no horizontal scroll and a working lab sheet.

These do not replace testing with real learners, screen-reader users and a range of devices.

## Deliberate boundaries

- **Not multiplayer, not money-safe:** there are no accounts or server. Randomness uses `Math.random`, and state is inspectable in developer tools.
- **Not a solver:** Atlas is a transparent practice opponent. Grades reflect a simplified one-decision model of Atlas, not game-theory-optimal play.
- **Heads-up only:** bets are capped at the effective stack, so side pots never arise.
- **Not a certification:** the lessons are an introduction to risk thinking, not a quantitative-finance curriculum.

Next steps should come from learner feedback: multi-street EV, opponent styles learned from your own play, more lessons, and optional cloud sync of progress through the existing `SyncAdapter` seam.
