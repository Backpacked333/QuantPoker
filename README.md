# QuantPoker

**Play the hand. Understand the odds.**

QuantPoker teaches the mathematics of uncertain decisions through a play-money poker game. Play heads-up Texas Hold’em on a focused game screen with a live **Quant lab** alongside it on desktop: estimate equity, inspect expected value, rotate 3D payoff surfaces, and explore the connections—and differences—between poker, options, and insurance. On smaller screens, open **Hand insights** for the same learning tools.

This is a **single-player educational web app**, not an online gambling service, multiplayer platform, trading tool, or source of investment advice.

## Run locally

Requirements: Node.js **22.12+** and npm. Node 22 LTS is specified in `.nvmrc`; Node 24 also works.

```sh
nvm install           # optional, if using nvm
nvm use
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). Poker, all graphs, and the guided deterministic explanations work without any API key, database, or account. The optional conversational coach requires server-side configuration below.

```sh
npm run typecheck    # strict TypeScript
npm run lint         # ESLint and React hooks checks
npm test             # engine, finance, privacy, API and streaming tests (no live model)
npm run build        # frontend in dist/ + Node backend in dist-server/
npm run preview      # frontend-only static preview; no AI backend
npm start            # full private Node server on port 3001; see configuration below
```

The game can still be served by any static host using `dist`. **Static hosting alone does not run the AI coach.** `npm run dev` embeds the Express API in Vite's development server. `npm start` serves both built assets and the coach API from a Node process bound to **127.0.0.1** by default. Use a trusted HTTPS reverse proxy for private deployment; change `COACH_HOST` only when the proxy/container network requires it, and do not publish the HTTP backend port. Never enter the private token on a remote HTTP page. A local preview is not a public production deployment.

## Conversational coach

The Vercel deployment uses Supabase account authentication and AI Gateway's
automatic OIDC identity. No provider key is embedded in the browser. For local
development or a private standalone Node deployment:

1. Copy `.env.example` to `.env.local` and set `AI_GATEWAY_API_KEY` using your approved Vercel AI Gateway credential. No `VITE_` secret variables are used. The npm development/start scripts load this uncommitted file.
2. Start `npm run dev`. Under the graph, the coach should report **AI configured**. This badge means the backend is configured, not that the provider has been contacted; provider errors are shown when you send a question.
3. Try “Explain the point I am inspecting,” “Compare calling with raising,” or “What if the turn is the ten of spades?” Responses stream, and the coach can offer **Show on graph** buttons to change the finance lens, preview an action, inspect a calculated point, or apply a next-card what-if. These never place a bet or change the real deck.
4. Each question captures the current visible-hand/model snapshot. Replies from older snapshots are labeled, and their demonstration buttons are disabled once the model changes. Signed-in users restore their last 40 saved messages; historical graph demonstrations are not restored. Guest chat remains in memory only.

The default model is `anthropic/claude-sonnet-5.5`, verified in AI Gateway's model catalog when implemented. `COACH_MODEL` can select another tool-capable Gateway model; check its availability and pricing first. Calls cost provider credits. Nothing calls the model until you send a question.

### Privacy and deployment guardrails

- Only your two hole cards, public board/bets, model assumptions, graph coordinates, and chat are sent. A strict allowlisted serializer excludes Atlas's private cards, the deck, action logs, and settlement text. Runtime validation rejects extra fields. Provider credentials stay in the server environment.
- The LLM receives canonical EV/break-even/insurance calculations and bounded tools that reuse the same math as the charts. Tool simulations use 2,000 random legal hands; visual next-card buttons based on the worker's sensitivity scan use 180 samples. Neither conditions on a learned opponent range. AI prose may still be wrong—inspect the math and assumptions.
- Chat text goes to the configured provider. Signed-in questions and completed replies are saved under per-user database policies; guest chat stays in memory. Request bodies are not logged. The provider's retention policy still applies. Do not put personal information in chat. The game itself remains client-side and non-authoritative.
- Production requests require either a verified Supabase account (when the server Supabase credentials are configured) or `COACH_ACCESS_TOKEN`, a long random **site access token distinct from the AI key**, for private standalone deployments. The client cannot fall back to the shared token in account mode. Leave `COACH_ALLOWED_ORIGINS` empty for loopback origins, or set exact HTTPS origins; no wildcard CORS is enabled. Vercel's own deployment URL is allowed automatically.
- The preview caps requests at six per minute, two concurrent, and 30 per process by default (`COACH_REQUEST_BUDGET`). Each question is bounded to three model steps, 900 output tokens per step, a 45-second deadline, and at most two next-card simulations. Cancelling a response aborts the upstream request; already generated tokens can still be billed.
- Cloud mode adds an atomic Postgres allowance: **3 requests per minute and 10 per UTC day per verified account, 100 per UTC day site-wide**, shared across replicas and restarts. Only the server role can reserve usage; quota outages fail closed. Attempts count even if the provider later fails. Usage counters expire after two days when the next reservation runs. Private-token mode retains the per-process allowance, which resets on restart. Set an additional provider-side spending budget; request limits are not dollar limits. Never publicly expose the unauthenticated development server.
- If the key/backend is absent, poker and the deterministic learning tools keep working, and chat explicitly reports that AI is unavailable. There is no canned answer disguised as an LLM response.

## Cloud database and deployment

Production: **https://quantpoker.vercel.app**. Infrastructure is owned by the existing
`backpacked333s-projects` Vercel team and `Backpacked333's Org` in Supabase.
The dedicated Supabase project is `dbkfuxczfkawxqmaieii` (`us-east-1`).

### What is persisted

| Data | Database table | Behavior |
| --- | --- | --- |
| Verified email identity | Supabase Auth | Passwordless sign-in links; verification stays enabled |
| Sound and quick-play preferences | `profiles` | Private to the signed-in user |
| Completed hand summaries | `hand_results` | Session-grouped IDs; full synced history retained, last 100 displayed |
| Completed lessons | `lesson_progress` | Deduplicated by user and lens |
| Prediction and transfer checks | `practice_attempts` | Answer, correctness, teaching prompt, pot/call context; not certification or mastery |
| Coach questions/completed replies | `coach_messages` | Last 40 restored; hidden cards and graph execution state excluded |
| Coach usage limits | `private.coach_usage` | Server-only, shared across function instances |

Guest play still uses the original validated local progress store. **Import this
device's guest progress** is explicit so one person's browser history is not
silently attached to another account. Signed-in changes use a versioned,
account-scoped local outbox with idempotent writes; failed saves stay pending and
retry when connectivity returns, or through **Account → Retry cloud save**.
Keep the tab open if browser storage is unavailable. Signing out flushes pending
writes and clears that account's local cache. A late offline change can merge
back after a reset made on another device; this is eventual sync, not collaborative
editing or authoritative gameplay.

Reloading/signing in starts a new table: in-progress hands, decks, bankrolls,
graph scenarios, animation state and hidden cards are deliberately **not** stored.
Static curriculum content remains version-controlled. There are no payment,
multiplayer, or analytics tables. Learning progress can be cleared from Progress;
this removes hand results, lesson completion and practice checks, not coach history.
An administrator can delete an account through Supabase Auth, cascading all owned
public data. Account self-deletion and a full-history browsing/export UI are not
implemented.

### Reproduce the Supabase setup

1. Create a dedicated project. Apply the SQL in `supabase/migrations/` in filename
   order using the Supabase SQL editor, CLI, or Management API. The hosted migration
   was applied through the Management API; the local version matches its recorded
   `20261007192620` migration. Do not replay it on this existing project.
2. Enable email authentication, keep confirmation enabled, disable anonymous
   sign-ups, and set the **Site URL** and allowed redirect URL to the exact production
   origin. Add a separate localhost redirect only for a development project.
3. **Configure custom SMTP before inviting public users.** Supabase's default mailer
   only sends to team members, with a very low limit. Do not bypass verification to
   work around this. See [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).
4. Set the two `VITE_SUPABASE_*` variables from `.env.example` for browser access.
   Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only on the server for coach
   authentication/quotas. Never use a service-role or management token in `VITE_*`.
5. Run `supabase/tests/learning_rls.test.sql` in a SQL session against the target
   project, or with `supabase test db` against a migrated local database. It uses
   transactional fixtures and pgTAP, covering anonymous access, both users' CRUD,
   ownership changes, reset isolation and quota permissions. `finish()` must report
   **72 passing checks**, then rollback removes fixtures.

The explicit live integration test creates **two temporary verified fixture
accounts**, exercises all five public tables and the durable quota, and deletes
both accounts in `finally`. It does not validate real email delivery:

```sh
# Supply these only through a secure shell environment:
# SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
node scripts/cloud-smoke.mjs
# Optional: after npm run build, add DEPLOYMENT_URL to verify the deployed coach.
# This sends one real, bounded model request and consumes provider credits.
DEPLOYMENT_URL=https://quantpoker.vercel.app node scripts/cloud-smoke.mjs
```

### Reproduce the Vercel deployment

The frontend is Vite's `dist`; `api/index.ts` adapts the existing Express coach to a
Node Vercel Function. `vercel.json` routes `/api/*` to it, keeps assets static, sets
a 60-second function limit, and adds security headers. A plain static deployment
cannot answer coach requests.

```sh
vercel whoami
vercel link --project quantpoker --scope backpacked333s-projects
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

The production project has the four Supabase variables, `COACH_MODEL`, and
`COACH_ALLOWED_ORIGINS`. The service-role key is marked sensitive. Vercel provides
the short-lived `VERCEL_OIDC_TOKEN` for AI Gateway; there is no copied AI provider
secret. These variables are **production-only**. Use a separate Supabase project
for development/previews rather than sharing production data. `.vercel` and all
real environment files are ignored by git. The project is CLI-deployed, not linked
to automatic Git deployments, so an older repository branch cannot overwrite it.
Do not deploy an unreviewed source tree or commit downloaded credentials.

After deployment, check `/`, the referenced JavaScript/worker assets, and
`/api/coach/health`. A guest coach request should return 401 in account mode.
Then test a verified account, persistence after refresh, cross-account isolation,
and one streamed coach answer. The health badge confirms configuration, not model
availability or SMTP delivery.

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
- Read a chip-denominated **payoff slice** with a labeled break-even line, current estimate, and pointer/keyboard what-if inspection. Switch to 3D for the full sensitivity terrain, world-space axis labels, the gold zero-EV frontier and white current-exposure slice.
- Walk through **The price → The possibilities → The market connection**, including a 100-dot illustration of the estimated showdown distribution. Ask the context-aware coach for a different explanation or a calculated visual demonstration.
- Complete three short lessons with explanatory quizzes; track your last 100 hand results locally or in your signed-in account.
- Pause the bot, enable optional gentle action sounds, and inspect hand history.

### The Decision Room

The game uses a charcoal-and-lilac play surface instead of a simulated casino table.
The opponent, community board and your own hand occupy separate rows; card ranks
and suits never overlap, and stack labels never cover the cards. Pot size and a
four-street progress indicator sit above the board. The action dock stays beneath
your hand, with responsive sizing for desktop and portrait phones. Very short
viewports or expanded custom controls can scroll rather than clip the game.

- **Decision strip.** Next to the buttons: the price of calling (share of the final
  pot), your estimated equity from visible cards, and the modeled EV of calling.
  **Explain** opens the full analysis. Price is available immediately; equity is
  marked approximate and appears when the worker finishes its visible-card estimate.
- **Actions.** Large Fold, Check/Call and Bet/Raise buttons show the exact amount.
  Min, ½ pot, ¾ pot, pot and all-in/effective-maximum presets update the raise
  button in one tap. Select the chip-total dropdown for the slider, numeric entry
  and ±1 big blind stepper; editing the amount updates the action button live.
  Maximum-effective bets require confirmation. No action timer is imposed.
- **Play and learn together.** At widths of 1100px and above, the **Learning studio** is
  docked on the right by default, with its own scroll area. The game keeps playing
  while the graphs and explanations follow the visible hand. Hide the panel for a
  wider table, or use **Explain** to open/focus it without placing a bet. The table's
  Pause control still stops play when you want time to study.
- **A teaching surface, not just a dashboard.** A white/lilac learning studio and
  light application frame separate education from the dark poker game. Each lens
  follows **Understand → Predict → Explore → Apply**: a learning goal, a prediction,
  misconception-specific feedback, a worked example, named graph experiments,
  and a transfer question connecting poker to financial decisions. Call-price
  examples use the current pot and capped call cost; insurance practice explicitly
  labels its hypothetical probabilities. Free checks teach zero *additional*
  exposure rather than inventing a bet. No AI key is required for these lessons.
- **Explore without gates.** All teaching steps and the live graph remain available
  without completing a quiz. **Experiment controls** exposes action comparisons,
  hand context and raise assumptions; advanced details, next-card scenarios, 3D,
  coach and full lessons remain available. A guided graph experiment restores the
  call/check baseline and clears next-card hypotheticals without playing an action.
  Practice answers survive model sizing/estimate updates and hiding the panel, but
  reset when the hand, visible board, pot, call price or lens changes. The two-check
  counter is per-decision practice, not course completion or mastery. Signed-in
  answer checks are stored separately for future learning-history features.
- **Small-screen insights.** Below 1100px, **Hand insights** opens a closed-by-default
  drawer that pauses Atlas and the staged hand. A native modal dialog provides
  focus containment, Escape dismissal and focus restoration. Desktop and mobile
  visibility preferences are independent; resizing or hiding the panel keeps the
  same mounted model and coach conversation until the hand/review changes.
- **Pacing.** Dealing, chip movement, street reveals, opponent-card reveal and pot
  settlement are choreographed separately; all-in boards reveal flop → turn → river.
  The immutable engine determines every result; animation never changes cards or
  payouts, and controls and Atlas wait for the sequence. Analysis and history follow
  the **displayed** frame, so a runout never exposes future cards early. Folded
  opponent cards stay hidden; showdowns spotlight the winner’s best five cards.
- **Settings.** Quick play shortens presentation and bot delays. Optional keyboard
  actions use F/C/R and N (next hand) and are disabled in dialogs and editable
  controls. Optional synthesized sounds require a user gesture and default to muted.
  Pause freezes presentation and Atlas; dialogs also suspend the table. Reduced
  motion is respected live.

Sound and quick play persist for signed-in users; other presentation state stays session-local. This does not introduce multiplayer,
new poker rules, real money, or a stronger opponent model.

On narrow screens, the game adapts to portrait and Hand insights fills the screen
when opened. Reduced-motion preferences, keyboard-operable controls, native modal
focus handling, and text equivalents for chart formulas are included. 3D requires
WebGL; if unavailable, the calculations and lessons remain usable.

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
| Coach        | AI SDK 6 `ToolLoopAgent` through AI Gateway; Express API, NDJSON streaming, strict Zod public-state contracts            |
| Persistence  | Local guest progress; Supabase Auth/Postgres/RLS and account-scoped outbox in `src/lib/cloud-store.ts`                    |
| Fonts        | Bundled DM Sans and Manrope (Fontsource, SIL Open Font License); no Google Fonts requests                                |
| CI           | GitHub Actions: clean install, typecheck, lint, tests, production build                                                  |

All play is client-side. There are no analytics requests. Signed-in progress is sent to Supabase; model-provider requests happen server-side only after an explicit coach question. No provider credentials are bundled into the frontend. Reloading starts a fresh guided table while preserving lesson completion and recorded results. Signed-in settings and completed chat messages persist, but the current hand and session bankroll do not. When a player runs out of chips, **Refill & deal next hand** resets both practice stacks to 2,000 and keeps the recorded results.

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
- Coach visible-state isolation, invalid/hidden payload rejection, canonical graph-point calculations, production access checks, origin/body/request limits, safe provider failures, disconnect cancellation and chunked Unicode streaming.

These tests do not replace browser end-to-end, screen-reader, mobile-device, or cross-browser testing.

## Deliberate boundaries

- **Not multiplayer:** accounts save learning progress; there is no lobby, matchmaking, or authoritative game server.
- **Not money-safe:** cards and state can be inspected in browser developer tools. Randomness uses `Math.random`, adequate for a non-adversarial local teaching game, not gambling.
- **Not a solver:** Atlas estimates its own equity against random hands with a small simulation budget and simple betting rules. It is a practice opponent, not an expert strategy model.
- **Heads-up only:** bets are capped at the effective stack, so multiway side pots are not needed. A standard burn-card ritual is omitted without changing the distribution of dealt cards.
- **Not a certification:** the lessons are an introductory explanation of risk, not a full quantitative-finance curriculum.

The next product steps should be driven by learner feedback: richer hand-by-hand explanations, calibrated opponent ranges, further lessons, and independently validated financial models—not real-money play.
