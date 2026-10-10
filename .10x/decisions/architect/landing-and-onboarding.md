# landing-and-onboarding: architecture

Status: **Decided 2026-10-10** (user aligned on design B). **Phase 1 built 2026-10-10**, PR #30; see §As built for where the build differs. Requirements: `.10x/decisions/product-manager/landing-and-onboarding.md` (L-1 to L-14, O-1 to O-4).

## As built (phase 1, 2026-10-10)

Where the code differs from the design below, the code wins:

- **The school list is our own.** The Hipo `university-domains-list` turned out to have no license, so nothing was copied. `school_domains` holds about 90 schools written for the audience (Ivies, top US, UK, Canada, Europe, Asia, a few elite high schools). Any other confirmed `.edu` or `.ac.uk` address still verifies and shows its registrable domain (`smallcollege.edu`). `players` gains `school`, `school_domain` and `school_verified_at`.
- **No separate `SignIn.tsx`.** `AuthGate` already was the one sign-in surface. The landing page's CTA goes to `#welcome/onboard`, a live route that renders through `AuthGate` with `onboarding`. The sign-in heading names the score ("Save your 67 and get rated"), and the username step reads "Step 1 of 3".
- **The claim checks the token only** (`verifyToken`, no username lookup), so it never waits on Supabase.
- **Model players are read from the graded accuracy, not raw EV.** An ungraded overbet's EV is biased upward, so a shove would dominate. Temperature 0.15, as a share of the pot given up.
- **Two hands were replaced** before shipping (`bluff-catcher`, `set-wet-board`). One raise dominated so heavily that every model player found it, which made the percentile meaningless. Their replacements are `underpair` and `open-ender`.
- **Grades use the trainer's Atlas model** (`range`, balanced), not the population model: the opponent is Atlas.
- **Who sees the landing page:** no trainer progress, no `qp.landed`, no Supabase session in storage, and not returning from a sign-in redirect. This is decided once at boot. Finishing or skipping the challenge sets `qp.landed`.

## As built (phase 2, 2026-10-10)

- **L-12, the share card:** one static card, `public/og-challenge.png` (drawn by `scripts/og-card.ts`), with the score to beat in the preview's title and text. This follows P1-16's cut line instead of rendering an image per score (no Satori or resvg in the Worker). `GET /c/<receipt>` reuses the profile's preview rewriting, now in `worker/src/preview.ts`.
- **L-13, the friend challenge:** `GET /api/challenge/shared/<receipt>` returns the hand, the score and its current rank. The app routes `/c/<receipt>` to `#c/<receipt>`, deals that hand with the friend's score as a banner, and ends with a head-to-head line. Receipts now live 30 days, so links do too. A shared link is anonymous; it carries no name.
- **L-14, the school code:** Resend from the Worker (`RESEND_API_KEY`, `SCHOOL_EMAIL_FROM`).
  - The code is stored only as a SHA-256 hash bound to the account, in `ScoreDO.school_codes`: 15 minutes, 5 guesses, 3 sends a day, and a failed send is refunded.
  - A right code queues `set_player_school` (migration `20261010120000_school_email.sql`) through the outbox. The address leaves storage once used or expired.
  - The school lookup reads `school_domains` with the publishable key and falls back to `.edu` or `.ac.uk`, exactly like the SQL trigger.

## Facts this design rests on (verified 2026-10-10)

- **The entry chunk is 141.5 kB of a 150 kB gzip budget** (`scripts/check-bundle.mjs`). The same check fails if `supabase|gotrue|auth/v1/` reaches the entry chunk.
- **Hosting:** one Worker serves `dist/` as static assets. Only `/api/*` and `/ws/*` run the Worker first (`wrangler.jsonc`). Routes are hash routes, parsed in `src/App.tsx` `parseRoute`. `#table` is the default.
- **First visit today:** `WelcomeDialog` shows when `!progress.onboarded`, unless the visitor arrived on a `live` or `info` route.
- **Production auth:** only email links are enabled. Google and GitHub are `false` in `/auth/v1/settings`, and email sends through Supabase's built-in sender, which is rate-limited. **User decision 2026-10-10:** enable Google and connect a custom SMTP provider (Resend) before launch (gates U-9 and U-10).
- **The server's database key is not set** (`SUPABASE_SECRET_KEY`, gate U-4), so no Worker → Postgres write works in production yet. Outbox writes wait and replay once it is set.
- **The Worker may import pure code from `src/lib`**; the grading consumer already does (`worker/src/grade.ts`). One `gradeDecision` can cost up to about 500 ms of CPU (`src/engine/bench.test.ts`), so it must never run per request.
- **`players` is public, and only server code writes it.** A trigger creates a row with a placeholder username on sign-up.

## Options considered

|       | Shape                                                                                                                                                                    | Verdict                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | The browser grades and writes scores to Postgres through an RLS policy that allows anonymous inserts                                                                     | Rejected. The percentile can be forged, and anonymous writes to Postgres are an abuse surface.                                                                        |
| **B** | **Pre-scored challenge trees; a new `ScoreDO` in the existing Worker holds histograms and counters; claims go to Postgres through an outbox; a trigger sets the school** | **Chosen.** Scores can't be forged, re-scoring costs microseconds, Postgres stays off the live path (principle 6), and nothing waits on U-4 except the claim archive. |
| C     | Worker endpoints write every score and event to Postgres with the service key; the percentile is computed in SQL                                                         | Rejected. It puts Postgres on the landing page's live path, waits on U-4, and adds load per visitor.                                                                  |

## System overview

```
Browser                                               Worker (quantpoker)                      Postgres
───────                                               ───────────────────                      ────────
entry chunk: App, Table, ActionBar (unchanged)
  └─ lazy "landing" chunk (prefetched on a first visit)
       Landing, ChallengeHand, ScoreCard, sections
       src/challenge/trees.generated.json ──grades instantly
       POST /api/challenge/score {hand, ver, path} ──▶ ScoreDO.score
                                                       re-score = table lookup
                                                       histogram[hand][0..100] += 1
                                                       nodeCounts[hand][node][action] += 1
       ◀── {accuracy, percentile, basis, crowd[], receipt}
       POST /api/events {vid, name, hand?} ───────────▶ ScoreDO.event (deduped per vid·name·day)
  └─ lazy "signin" chunk (src/net/SignIn.tsx, shared with the lobby's AuthGate)
       Google / email link → onboarding steps
       POST /api/challenge/claim {receipt} + Bearer ─▶ verifyToken → ScoreDO.claim ── outbox ──▶ record_challenge_claim()
                                                                                               → challenge_scores
auth.users insert/update of a confirmed email ─────────────────────────────────────── trigger ─▶ players.school
                                                                               (via school_domains)
GET /api/funnel (operator) ───────────────────────────▶ ScoreDO.funnel (daily counts, 30 days)
```

## Components

### 1. Challenge hands: `src/challenge/` (new, pure)

- **`hands.ts`:** about 6 curated hands. Each is fully determined: both players' hole cards, the full board, stacks, the blinds, and **a scripted Atlas response for every node the hero can reach**. The hero only gets the trainer's presets: fold, check/call, ½ pot, ¾ pot, pot, all-in. That keeps the tree finite, with at most about 40 hero nodes per hand.
- **`scripts/build-challenges.ts`** walks each tree. At every hero node it runs the trainer's existing `decisionOptions`/`gradeDecision` against the Atlas model, then writes **`src/challenge/trees.generated.json`**. For every node it stores: the options' EVs, each option's grade and EV lost, a one-line "why" key, and the next node for each action.
  - Building runs the expensive analysis once, offline.
  - A Vitest guard regenerates the JSON and fails on any difference, so the trees can't drift from the grader. The existing `GRADE_VERSION` is stamped into the file.
- **`score.ts`:** `scorePath(hand, path) → { accuracy, decisions[] } | null`. Pure lookups shared by the browser and the Worker. It returns `null` for a path that isn't in the tree. Accuracy is the same `accuracyFor` mean the rated product uses, so the two numbers mean the same thing.
- **Size:** about 6 hands × 40 nodes × about 6 options, roughly 15 kB gzip, kept in the landing chunk only.
- **The lab is not imported** (L-3): the score card's "see why" replay opens the existing review with the lab lazily, the way `#table` does.
- **Rotation:** the browser picks a hand from a random visitor ID (`qp.vid`, `crypto.randomUUID()` in localStorage). "Play another" moves to the next hand not yet played.

### 2. `ScoreDO`: a new Durable Object (SQLite), one instance, `idFromName('global')`

Tables:

```sql
histogram(hand TEXT, ver INT, bucket INT, n INT, PRIMARY KEY (hand, ver, bucket))         -- bucket = accuracy 0..100
node_counts(hand TEXT, ver INT, node TEXT, action TEXT, n INT, PRIMARY KEY (hand, ver, node, action))
events(day TEXT, name TEXT, vid TEXT, PRIMARY KEY (day, name, vid))                       -- deleted after 30 days by alarm
receipts(id TEXT PRIMARY KEY, hand TEXT, ver INT, accuracy INT, at INT, claimed_by TEXT)  -- deleted after 7 days if unclaimed
outbox(seq INTEGER PRIMARY KEY, call TEXT, attempts INT, next_at INT)
```

- **`score`** checks the path with `scorePath`; an unknown path gets a 400. It writes the histogram, the node counts and a receipt in one transaction, **then** replies (principle 3).
  - Percentile = the share of stored scores strictly below, plus half of the ties.
  - `basis` is `"players"` once the hand has 200 or more scores. Below that, `"model"`: the percentile comes from a reference distribution generated at build time by playing the population opponent model through the tree, shipped in the generated JSON.
  - `crowd[]` gives, for each decision the player made, the share of players who chose the same action. It feeds the "71% of players make this call too" line, and only shows once a node has 50 or more visits.
  - The receipt id is 128 random bits; the Worker's `crypto.getRandomValues` comes from `worker/src/shuffle.ts`'s source. The receipt is only an id. Its contents stay on the server, so no signing key is needed.
- **`event`** inserts or ignores. The allowed event names are the L-10 list, checked against a constant; anything else gets a 400. No IP address, user agent or email is stored, and the `vid` is random and client-generated.
- **`claim`** marks a receipt `claimed_by = userId`, the first claim wins and a repeat claim succeeds silently, then queues `record_challenge_claim` in the outbox. The outbox drains on an alarm with the same backoff and the same rule against parking 401/403 responses as `TableDO` (`outboxBackoff`, `refusedForData`). Until U-4 is set, it waits.
- **`funnel`** returns per-day counts for each event and the step-to-step conversion rates.
- **Load:** one instance. At launch traffic (hundreds of challenges a day, at most a few requests per second), one SQLite DO is far below its limits. If it ever needs to grow, shard by `hand` (the histogram and node counts) and by `day` (events). The `idFromName` scheme makes that a one-line change.

### 3. Worker routes (`worker/src/index.ts`, new `worker/src/challenge.ts`)

| Route                       | Auth                                            | Limit                      | Body → response                                                                 |
| --------------------------- | ----------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| `POST /api/challenge/score` | none                                            | `IP_LIMITER` + body ≤ 2 kB | `{hand, ver, path: string[]}` → `{accuracy, percentile, basis, crowd, receipt}` |
| `POST /api/events`          | none                                            | `IP_LIMITER` + body ≤ 1 kB | `{vid, name, hand?}` → 204                                                      |
| `POST /api/challenge/claim` | Bearer (Supabase JWT, `verifyToken`)            | `IP_LIMITER`               | `{receipt}` → 204, or 404 if the receipt is unknown or expired                  |
| `GET /api/funnel`           | none (aggregate counts only, like `/api/stats`) | cached 5 min per isolate   | → `{days: [{day, counts, rates}]}`                                              |

All four go through the existing Origin allowlist. `/api/*` already runs the Worker first, so no `wrangler.jsonc` routing change is needed beyond the DO binding and the `v3` migration (`new_sqlite_classes: ["ScoreDO"]`).

### 4. Routing and first visit (O-2): browser, entry chunk

- **`parseRoute` gains `'landing'`** when (a) the hash is empty or `#start`, and (b) `#start` was given explicitly, or `!progress.onboarded` with no `?code=`/`error_description` (an auth return). `#c/<hand>/<receipt>` also maps to `'landing'`, with that hand and the friend's receipt, for the friend link (L-13).
- **The landing view replaces `WelcomeDialog` for first-time visitors** on the empty route. `WelcomeDialog` stays for anyone who goes to `#table` directly without being onboarded.
- **Every existing route is untouched.** "Skip to practice" sets `onboarded` and goes to `#table`. Finishing or skipping the challenge also sets `onboarded`, so the next visit lands in the app (L-1).
- **Prefetch:** when the first-visit condition holds at boot, `import('./landing/Landing')` starts in parallel with first paint, like `labModule`. The entry chunk only gains the route branch and the lazy import, under 1 kB. The `check-bundle.mjs` budget stays at 150 kB.
- **Phase 2 share links (L-12):** add `/c/*` to `run_worker_first`. The Worker serves `index.html` through an `HTMLRewriter` that injects the OG tags and a `<script>` redirect to `#c/<hand>/<receipt>`. `GET /og/c/<receipt>.png` renders the card (Satori/resvg-wasm in the Worker, cached at the edge). This is the only part of the design that changes `wrangler.jsonc` routing.

### 5. Sign-in and onboarding: browser, lazy chunks

- **One sign-in surface (L-7):** pull the signed-out panel out of `src/net/AuthGate.tsx` into `src/net/SignIn.tsx`. `AuthGate` and the landing page's score card both render it, from the lazily loaded `src/net` chunk, so supabase never reaches the entry chunk.
  - Provider order: Google, then email link, then GitHub, each shown only when `/auth/v1/settings` reports it enabled (the existing `loadProviders`).
  - Before redirecting, `rememberAuthReturn('#welcome/onboard')` stores where to come back to.
- **The pending score (O-4):** the score card writes `qp.pendingClaim = {receipt, hand, accuracy, percentile, at}` to localStorage. It's entry-safe: plain JSON, no net imports.
- **`#welcome/onboard`** is a new `live` route inside `LiveApp`, so it loads with the net chunk. It holds three steps:
  1. **Username:** live availability through a `players` select (anon read is already granted), saved with the existing `renamePlayer`. It is skipped if the username is no longer the placeholder.
  2. **School:** reads `players.school`.
     - If the trigger already set it: "You're repping MIT ✓".
     - Otherwise: "Sign in with your school email to get a badge" (phase 1), or "Verify a school email" (phase 2, L-14). This step can be skipped.
  3. **First move:** Rated, only when `ratedEligibility` is `yes`; otherwise "Confirm your email to play rated". "Beat your score" goes to `#start`. "Learn" goes to `#learn`.

  On first entry with `qp.pendingClaim` present, it calls `POST /api/challenge/claim`, then deletes the key whether the call succeeds or returns 404. A network error leaves it for the next load.

- **Resuming:** each step is derived from server state (placeholder username, `school` null), so a skipped step can be reopened from settings with no extra state.

### 6. School identity (O-1): database

- **Migration `school_domains`:** `domain text primary key, school text not null, country text`. It is seeded from the Hipo `university-domains-list` (MIT license), filtered to the domains that list carries, with the license noted in the migration. RLS: `select` for anon (the onboarding copy needs the school name).
- **`players` gains `school text` and `school_verified_at timestamptz`,** with no write grant to anon or authenticated (same stance as today).
- **Trigger `set_player_school()`** runs `after insert or update of email, email_confirmed_at on auth.users`.
  - When `email_confirmed_at` is set, it looks up the email's domain, then each parent domain (`cs.mit.edu` → `mit.edu`), in `school_domains`. On a match it sets `school` and `school_verified_at`.
  - It never clears a school already set. Security definer, `search_path = ''`, revoked from public.
  - Google sign-ins come back with a confirmed email, so a school Google Workspace account verifies on its own.
- **Phase 2 (L-14), a second email:** `POST /api/school/start {email}` (Bearer). The Worker checks the domain is in `school_domains`, generates a 6-digit code, stores its SHA-256 hash with a 15-minute TTL in `ScoreDO`, and sends it through the Resend API (`RESEND_API_KEY` Worker secret, the same account as the Supabase SMTP, U-10). `POST /api/school/confirm {code}` checks it (5 tries max), then calls the service RPC `set_player_school(user_id, domain)`. That call needs U-4.
- **Phase 2 (`challenge_scores`):**
  ```sql
  challenge_scores(user_id uuid references players on delete cascade, hand text, ver int,
                   accuracy smallint check (accuracy between 0 and 100), receipt text unique,
                   created_at timestamptz default now(), primary key (user_id, hand, ver))
  ```
  Written only by service RPC `record_challenge_claim` (it keeps the best score per hand). RLS: the owner selects their own rows. It becomes public with P1-15. Ship it in phase 1 so the outbox has a target. The DBA should review it with the rest.

### 7. Analytics (L-10, O-3)

- The browser calls a helper `track(name, hand?)`. It lives in the entry chunk (under 300 B) and uses `navigator.sendBeacon('/api/events', …)` with a `fetch(keepalive)` fallback.
- It never blocks the UI and never retries. Losing an event is acceptable; slowing a click is not.
- Each event is sent at most once per visitor per day for one-shot events. The server deduplicates anyway.

## Failure modes

| Failure                                            | Effect                                | Handling                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ScoreDO` or the Worker unreachable                | The score card has no percentile      | The browser already has accuracy and grades from the local tree. It shows "Percentile unavailable" and keeps the sign-up CTA, with no receipt. The claim is skipped and the score is kept locally only.                                                          |
| Postgres down or U-4 unset                         | Claims don't reach `challenge_scores` | Outbox in `ScoreDO`, alarm retry with backoff. A 401/403 is never parked (same rule as `TableDO`).                                                                                                                                                               |
| Forged `path`                                      | A fake score                          | `scorePath` returns `null` for an off-tree path, so 400. A valid path is a real play. The rate limit caps histogram stuffing per address. The 200-score `basis` threshold blunts early manipulation, and per-hand percentiles limit the reach of any one attack. |
| Bot floods `/api/events`                           | Inflated funnel                       | Per-vid dedupe and the IP limiter. The funnel is for operators, not public, so the damage is limited to our own reading.                                                                                                                                         |
| `trees.generated.json` out of step with the grader | Grades disagree with the review       | The Vitest regeneration guard fails CI. `ver` is part of every histogram key, so a regenerated tree starts fresh histograms.                                                                                                                                     |
| Google OAuth not yet enabled (U-9)                 | No Google button                      | `loadProviders` hides it, and email links work (U-10 makes them reliable).                                                                                                                                                                                       |
| A hand gets spoiled online                         | A skewed percentile                   | Retire it by removing it from `hands.ts` (`ver` bump). Rotation keeps the pool varied.                                                                                                                                                                           |
| The landing chunk fails to load                    | Blank hero                            | An `ErrorBoundary` falls back to today's `WelcomeDialog` and the table.                                                                                                                                                                                          |

## Testing

- **Unit:** `scorePath` (every leaf of every tree, an unknown path, the accuracy formula equals `accuracyFor`), and the regeneration guard.
- **`parseRoute`:** a table test covering the first visit, a returning visitor, an auth return, `#start`, `#c/…`, and every existing route unchanged.
- **Worker (`@cloudflare/vitest-plugin`):**
  - `ScoreDO`: write-then-reply, percentile maths with ties, the `basis` switch at 200, event dedupe and 30-day expiry, claim idempotency, outbox replay after a 401;
  - routes: the Origin allowlist, the IP limiter, body-size 413.
- **SQL (PGlite):**
  - the `set_player_school` trigger (subdomain match, unconfirmed email ignored, never cleared);
  - RLS rows for `school_domains`, `challenge_scores` and the new `players` columns in `rls-matrix.test.ts`.
- **Playwright:**
  - a fresh context at `/` lands on the landing page and plays the hand by keyboard;
  - the score card appears;
  - a reload lands on `#table`;
  - axe passes in both themes;
  - reduced motion;
  - the challenge is interactive within 5 s under the mobile throttling profile;
  - the frame-time check on the landing page.
- **Bundle:** `check-bundle.mjs` stays green. Add a check that no `src/challenge` or `trees.generated` code is in the entry chunk.

## Build order

**Phase 1 (L-1 to L-11), about 5 days.** Each step can be merged on its own:

1. `src/challenge/`: hands, generator, generated trees and guard, `scorePath` (1.5 d).
2. `ScoreDO` + the four routes + the `wrangler.jsonc` binding and `v3` migration (1 d).
3. The landing view, the `parseRoute` change, prefetch, the challenge hand on `Table`, the score card, sections, `track()` (1.5 d).
4. `SignIn.tsx` extraction, `#welcome/onboard` steps, claim (0.5 d).
5. Migrations: `school_domains` + seed, `players.school`, the trigger, `challenge_scores` + RPC (0.5 d, DBA review).

**Phase 2 (L-12 to L-14), about 2.5 days:** `/c/*` + OG image (1.5 d), the friend comparison view (0.5 d), the school code by email (0.5 d, needs U-4 and U-10).

## User gates added

- **U-9:** create a Google OAuth client (Google Cloud console → APIs & Services → Credentials → OAuth client ID, type web). Authorized redirect URI: `https://dbkfuxczfkawxqmaieii.supabase.co/auth/v1/callback`. Paste the client ID and secret into Supabase → Authentication → Sign In / Providers → Google. Needed before the landing page launches.
- **U-10:** connect custom SMTP. Create a Resend account and verify a sending domain, then set Supabase → Authentication → SMTP Settings to Resend's SMTP host, port 465, user `resend`, and the API key as the password. Raise Supabase's email rate limit afterwards. Keep the same API key for the Worker secret `RESEND_API_KEY` (phase 2). Needed before the landing page launches.
- **U-4** (existing) also gates the claim archive and the phase 2 school code.
- **U-11 (phase 2):** set the Worker secrets for school codes: `npx wrangler secret put RESEND_API_KEY` (the U-10 Resend key) and `npx wrangler secret put SCHOOL_EMAIL_FROM` (for example `QuantPoker <verify@your-domain>`, a sender on the domain verified at Resend). Use secrets, not dashboard variables, so a deploy never clears them. Until then, onboarding says school emails cannot be sent right now.

## Out of scope

School leaderboards (after P1-14), the daily hand, referral codes, A/B testing, third-party analytics, any change to the trainer's `WelcomeDialog`, the tour or the guided hands beyond the first-visit branch.
