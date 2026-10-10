# rating-and-leaderboard — SDE log

## P1-11 · Glicko-2 as a pure, versioned module (2026-10-09)

`src/rating/glicko2.ts`, `src/rating/glicko2.test.ts`; `eslint.config.js` puts `src/rating/**` in the deterministic block (no `Math.random`, timers or `Date.now`; a probe `Date.now()` was flagged).

### What it is

- **Model.** Glickman's 2013 algorithm, versioned `glicko2.v1`.
- **Scale.** Ratings are stored and shown on the display scale (rating, RD, σ, the columns of `ratings` in `supabase/proposed/phase1.sql`). The update runs on μ/φ internally (`SCALE` = 173.7178).
- **Constants.**
  - τ = 0.5 (`TAU`);
  - ε = 1e-6;
  - default 1500 ± 350, σ 0.06; RD is capped at 350.
- **Periods.** One rated match is one rating period: `rateMatch(a, b, scoreA)` rates both from their ratings before the match. Inactivity is `idle(player, periods)` with `idlePeriods(lastMatchAt, now)`: whole 30-day periods, with the clock passed in.
- **`explainPeriod`** returns the intermediates (v, Δ, μ′, φ′) for the Method page (P1-16) and for tests.

### Evidence

`src/rating/glicko2.test.ts`, 5 tests, red first: the module did not exist. Mutation check: π² → π in g() and removing the RD cap each turn a test red.

- **Glickman's worked example.** The unrounded result is 1464.0506705 / 151.5165241 / 0.0599959843, the same digits other implementations of the algorithm produce. The values the paper prints also hold within its own rounding: μ′ −0.2069, φ′ 0.8722, RD 151.52, rating 1464.06 ± 0.01, σ 0.05999.
  - The paper's intermediate v (1.7785) and Δ (−0.4834) are about 5e-4 from the unrounded 1.77898 and −0.48393, because it rounds g and E to 4 decimals before summing. The test documents this instead of matching rounded arithmetic.
- **A draw between equals** leaves both at 1500 and shrinks RD.
- **Properties over 10,000 seeded random sequences** of 5 matches each:
  - a win never lowers the rating, and a loss never raises it;
  - an upset gains more than an expected win against the same RD;
  - RD stays ≤ 350 and every value stays finite;
  - from the default, 20 matches against settled opponents bring RD under 100, the provisional line.

### Deviation from the ticket wording

The ticket says "RD shrinks with play". That is not true of every single match. A settled player (RD ≈ 50) who plays a very uncertain opponent (RD ≈ 350) can end the period with RD slightly higher than before, because the period's volatility is added before the game's information, and an uncertain opponent carries little information. That is Glicko-2 working as designed.

The test asserts what does hold for every sequence: **after playing a period, RD is lower than after sitting the same period out**. It also asserts RD falls under 100 over a run of matches from the default. P1-12's property tests should use the same formulation.

## P1-12 · The rating update when a rated match finishes (2026-10-10)

### Storage (`supabase/migrations/20261010080000_ratings.sql`)

- **`ratings`, `rating_history` and `apply_rating`** follow the DBA's design (`phase1-schema.md` D1–D3), with two changes:
  - **`apply_rating` returns the change**: per player, before and after (rating, RD), and matches played counting this one. It checks the payload against the archived match:
    - a match still playing (or missing) → `P0002`, so the Worker retries;
    - a match that is not rated, is void, or has other players or outcomes → `23514`;
    - a match already rated changes nothing and reports the same change;
    - a stale version → `40001` with nothing written.
  - **Abandonment is counted by a trigger** on `match_players.abandoned`, rated matches only. It fires once, because `record_match`'s finish branch runs once under the match lock. That covers forfeit, no-show and both-gone (R-14), with no payload flag that could double-count. Earlier rated abandonments are backfilled.
- **Integrity:** `rating_history_once` makes a match rated at most once, and append-only triggers refuse update, delete and truncate for every role, the owner included.
- **Access:** ratings and history are public reads. Only `apply_rating` (`service_role`) writes.
- **The Phase 1 proposal** drops what shipped. `plans.ts` fixtures carry seat outcomes (12/12). Concurrency check 4 races two matches sharing a player on the shipped function (PASS).

### Worker (`worker/src/rating.ts`, `worker/src/table.ts`)

- **The trigger.** A rated finish with a result queues `outbox:9999:rate` after `outbox:9999:end`; void matches queue nothing. The flush stops at a failure, so the match is archived before it is rated.
- **`applyRating`** works in four steps:
  1. it reads both rows (PostgREST, secret key);
  2. it widens each RD for whole 30-day idle periods (`idle`, `idlePeriods`);
  3. it rates the match with `rateMatch` (one match = one period; `SCORE` win 1, draw 0.5, loss 0, a forfeit counting as a loss);
  4. it calls `apply_rating` with the versions read.

  On `40001` it re-reads and recomputes, up to 5 times per attempt, then backs off through the outbox. A refusal for data parks the call with an incident, like any archive call.

- **On success** the change is stored on the match. Both players get a new `rating` frame (`{ change: { [seat]: { before, after, matches } } }`), which is resent on reconnect after `match_end`.
- **New constants:** `SCORE` and `GAMES_PER_PERIOD` (named, commented) in `src/rating/glicko2.ts`; `PROVISIONAL_RD` 100, `PROVISIONAL_MATCHES` 20, `ACTIVE_DAYS` 30 and `MAX_ABANDONMENT` 0.1 in `src/rating/rules.ts`.

### Screen

- MatchEnd shows "Updating your rating…" until the frame arrives. Then it shows "Rating 1520 → 1534 (+14): beat a 1610 ± 80 player. Now 1534 ± 92." and the standing: "Provisional: 19 rated matches to go." / "Provisional until your rating deviation is under 100." / "Established rating."
- The Method link comes with P1-16.

### Tests

- **`supabase/tests/ratings.test.ts`** (8 tests, red first):
  - rated once, and a repeat reports the same change;
  - stale is refused and nothing written;
  - refusals: not finished, not rated, wrong players or outcomes;
  - only the server applies;
  - history is append-only for every role, the owner included;
  - public reads;
  - abandonment counted once per forfeit, no-show and both-gone, never for casual.
- **`worker/test/rating.test.ts`** (7 tests):
  - a completed match is rated for both, and the frame's keys equal the compiler-checked allowlist (`FRAME_KEYS.rating`, `RATING_CHANGE_KEYS`);
  - a forfeit is a loss;
  - a no-show is never sent;
  - out-of-order matches are each rated against the then-current rating (a stale version is recomputed);
  - with Supabase down at the finish, it applies later from the outbox;
  - a reconnect sees the change;
  - RD widens for idle periods.

  Mutation-checked: no stale retry, and no idle widening, each fail a test.

- **Client:** `matchResult.test.ts` (rating line: win, loss with minus sign, draw, provisional wording) and `MatchEnd.test.tsx` (updating → line; nothing for void).

### Not done here

- Rated matches archived before this deploy are not rated retroactively. Production had none as of this ticket; the count is checked read-only after deploy.

## P1-13 · Rated quick-match near your rating (2026-10-10)

- **The window** (`worker/src/pairing.ts`, pure): two rated players may meet across `100 + 50 × minutes` rating points. The minutes are the longer waiter's (the oldest player in the scan), so a long wait finds someone.
- **Queue rows.** A rated row stores the player's rating at queue time (`public.ratings` through PostgREST). A player with no row, a dev account, or a failed read queues at 1500; queueing never waits on a failing lookup. The lookup is a seam (`ratingOf`) so tests set ratings.
- **The choice.** Oldest player first. Among the opponents within the window, the closest rating wins, and a tie goes to the one who has waited longer. Casual pairing is unchanged (oldest first). The ≤ 2 pairings per pair per day cap applies to both kinds, and nothing pairs a capped pair even when they are alone in the queue.
- **The alarm.** While two or more rated players are still waiting after a pass, the lobby sets an alarm for 15 s (`REPAIR_MS`) and pairs again with the wider windows. With fewer than two it deletes the alarm and hibernates.
- **Client.** After a minute of a rated search with others in line: "Widening search… opponents further from your rating now qualify."
- **Tests.**
  - **`worker/test/lobby.test.ts › rated pairing by rating`:**
    - 400 apart pair at exactly 6:00 and not at 5:59;
    - the closest eligible opponent is chosen, with ties going to the longer waiter;
    - a capped pair never re-pairs today even alone, 55 minutes later;
    - no alarm with fewer than 2 rated players waiting (a casual player doesn't count).

    Mutation-checked: taking the first eligible opponent instead of the closest fails the closest-opponent test.

  - **`src/net/lobby.test.tsx`:** the widening line appears after a minute.

- **Liquidity check** (the ticket's riskiest assumption), `node scripts/pairing-sim.ts`: seeded Poisson arrivals, ratings 1500 ± 200, each player re-queueing after about a 12-minute match, 200 simulated hours.

  | online | median wait | p90 wait | waits > 60 s | mean gap |
  | -----: | ----------: | -------: | -----------: | -------: |
  |     10 |        29 s |    222 s |          40% |      129 |
  |     20 |        16 s |    148 s |          30% |      102 |
  |     30 |        10 s |    111 s |          23% |       90 |

  The median stays under 60 s from 10 players online. At 10 online the tail is long (p90 3.7 min), the cost of matching within about 130 points. If launch liquidity is lower, widen faster (`perMinute`) rather than starting wider.

## P1-14 · The ladder, the rating metrics and a simulated season (2026-10-10)

The DBA decisions and EXPLAIN evidence are in `.10x/decisions/dba/ladder.md`.

### What was built

- **SQL:** `supabase/migrations/20261010090000_ladder.sql` adds `ladder`, `ladder_month` and `abandonment_rate`. All three are invoker-rights, and the eligibility rules match `src/rating/rules.ts`. P1-18's sanctions clause stays in `supabase/proposed/phase1.sql`.
- **Client:**
  - `src/net/ladder.ts` holds the loaders and formatting. The rating is always shown as "1612 ± 64". It also has `standingLine`, the viewer's line: matches to go, provisional by RD, or why they are off the ladder.
  - `src/net/Ladder.tsx` is the table: rank, player, rating ± RD, accuracy, matches, win rate, and the change over 30 days or this month. It shows a page of 50 and asks for 51 to know whether a next page exists. Previous and next work from a stack of keyset cursors.
  - **Routes:** `#ladder` and `#ladder/month` belong to the Online area and are public: no sign-in, no welcome dialog, read with the publishable key. There is no new top-nav item. The ladder is linked from the lobby's rated card and the Online header.
- **Metrics:** `supabase/metrics/rating-metrics.sql` is a single read-only query, run on production read-only. All three metrics report "insufficient data (need 30)" because there are no rated matches yet.

### Review fix (PR #27)

- **Devin 🔴: a match rated after midnight on the last day of a month counted in the next month,** because `rating_history.created_at` is when the rating was applied.
  - History rows now carry `played_at` (the finish time `apply_rating` receives), backfilled for earlier rows, and both ladders count by it.
  - `ladder_month` also accepts any day of the month.
  - Tests:
    - `ladder.test.ts › a match counts in the month it was played, even when its rating applied the next month`;
    - `the migration › backfills when each earlier rated match was played, and history stays append-only`;
    - a `played_at` assertion in `ratings.test.ts`.
  - Mutation-checked (each fails a test): grouping by `created_at`, storing `now()`, skipping the backfill, and leaving the trigger off.

### Deviations

- There are two functions (`ladder`, `ladder_month`) instead of one with a `period` argument. Each keeps a plan the planner can see.
- Win rate counts wins only, and the note under the table says so; draws are visible as the gap.
- The e2e lives in `e2e/ladder.spec.ts` (desktop) and `e2e/mobile.spec.ts` (phone) rather than `app.spec.ts`. `fakeLadder` in `e2e/helpers.ts` serves `/api/config` and the ladder RPCs inside the browser, so CI needs no account service.
- Player names are plain text until P1-15 adds profiles, so no link points to a route that does not exist yet.

### Tests

- **`supabase/tests/ladder.test.ts`** (4 tests):
  - only eligible players appear, and exactly 10% abandonment is out;
  - pages of 50 over 1,000 players have no gaps or repeats, and the page size is capped at 100;
  - this month counts only that month's matches, wins and trend;
  - anon and authenticated read it with their own rights.
- **`supabase/tests/season.test.ts`:** "insufficient data" on the empty database; then 200 players and 5,000 matches, with these results:
  - Spearman(true skill, ladder rating) is 0.975;
  - 190 players are listed, and none of the 10 inactive or abandoning players is among them;
  - predictive validity is 65.4%, rating stability 13.4, accuracy validity 0.860.
- **`src/net/ladder.test.ts`** (7 tests): formatting; the standing lines, including the 10% and 30-day boundaries.
- **`src/net/Ladder.test.tsx`** (5 tests): the columns and row contents; keyset paging (ranks continue, the cursor is the last row shown, the last page has no next); the month view; a provisional viewer's "7 rated matches to go" while a visitor sees no line; empty and retry states.
- **Mutation checks:** each of these fails a test:
  - rank without the page offset;
  - asking for 50 instead of 51;
  - `>` for `>=` on abandonment;
  - a 35-day activity window;
  - "Previous" resetting to page 1.
- **e2e:**
  - the ladder is public, ranks and pages by keyset, and this month works;
  - axe reports 0 violations of any impact in light and dark;
  - at 412 px and 320 px there is no page overflow, and the table scrolls inside its own region.
  - Removing that region's `overflow-x` makes the page 563 px wide on a 412 px phone, and the test fails.

## P1-15/16 · Public profile, match review, Method page and share card (2026-10-10)

### What was built

- **Routes.**
  - **`/u/<username>`** is the share link. The Worker (`worker/src/profile.ts`, with `run_worker_first` gaining `/u/*`) serves the app with that player's link preview: the title and description carry the name and rating ± RD, provisional or not. `og:image` is an absolute URL to `public/og-default.png`.
  - The preview is built from the name as validated from the path (`[a-z0-9_]{3,20}`). HTMLRewriter's `setAttribute` escapes it again. Previews are edge-cached for 60 s, so page loads cannot become Postgres reads.
  - An unknown name gets a 404 with the app; a Supabase failure gets the generic preview.
  - In the browser, `src/lib/profilePath.ts` turns the path into `#u/<username>` at the site root.
- **Profile (`src/net/profile/`, at `#u/<username>`).** It is public; there is no sign-in.
  - Rating ± RD with an "Established" or "Provisional · X rated matches to go" badge.
  - A graph of the rating with a band one RD either side. `LineChart` gained `zero={false}` so ratings near 1500 are not drawn from 0.
  - Volume (W · D · L, win rate), abandonment ("1 of 25 (4%)"), and Sanctions "None" (P1-18 fills it).
  - Accuracy, through the same panel worded for the player.
  - The last 20 rated matches, each with the opponent's profile and a Review link.
  - Share (copy the `/u/` link) and a Method link.
- **Match review (`#match/<id>`, `src/net/MatchReview.tsx`).** The finished match hand by hand from the public archive: actions, board and only the cards shown at showdown.
  - A match still being played is refused before any hand is read.
  - Decision times are left out (tickets Q5); "ran out of time" stays.
- **Method page (`#method`, `src/info/Method.tsx`, in the info chunk).** Every number is imported from the module that applies it:
  - Glicko-2 `glicko2.v1`: τ, the start values, the scale, one match per period, the 30-day idle widening, and the update formulas;
  - the draw band (`DRAW_BAND_BB` moved to `src/rating/rules.ts`, re-exported by `worker/src/rated.ts`) and the scores;
  - the provisional rule and the ladder rules;
  - accuracy (the exact label, `grade.v1+population.v1`, the per-decision formula, the grade thresholds);
  - what the numbers do not measure, and a versions table.
- **Links.** The end-of-match rating line has "How ratings work"; ladder names link to profiles; the ladder, the profile and the public pages' header link Method.
- **Share card.** `scripts/og-card.ts` renders `public/og-default.png` (1200 × 630) with Chromium. It is generic and carries no numbers that could pass for a player's.

### Deviations and deferrals

- **Deferred to a follow-up: counting profile views from outside the app** (P1-16's `profile_views` table and `/api/profile/share`). The mission's build list does not include it. The PM metric "public profile views from outside the app" stays **needs instrumentation**.
- **No dynamic per-player image** (the ticket's cut line); the player's numbers are in the preview text.
- **`#match/<id>` replaces the ticket's `#review/<id>/1`.** No review route existed, and the hand number is navigation inside the page.
- **Only rated matches are listed** on a profile. ToS consent covers rated hand histories (PM spec); casual ones are not surfaced.

### Tests

- **`worker/test/profile.test.ts`** (7 tests):
  - the preview for `/u/alice`, plus the provisional and unrated wordings;
  - `og:image` is absolute;
  - unknown and impossible names give a 404, with no lookup for an impossible name;
  - injection: a forged row puts nothing in the page;
  - Supabase down still serves the page;
  - one read per name while cached.
  - Mutation-checked: no cache, the stored name in the title, and a loose path pattern each fail a test.
- **`supabase/tests/profile.test.ts`** (3 tests): every query the profile, review and preview make returns rows to anon; hole cards, the deck and emails are refused; anon writes nothing.
- **`src/net/profile/Profile.test.tsx`** (5 tests): the numbers, badge, sanctions and Method link; 20 matches newest first with review and opponent links; provisional; unknown and retry states; only public tables read.
- **`src/net/MatchReview.test.tsx`** (3 tests): only showdown cards (none on a fold) and no decision times; a live match is refused without reading hands; an unknown match.
- **Smaller suites:** `src/info/Method.test.tsx` (2 tests) and `src/lib/profilePath.test.ts` (2 tests).
- **e2e (`e2e/profile.spec.ts`, `e2e/mobile.spec.ts`):**
  - `/u/alice` opens the profile, and a Review link opens the match hand by hand;
  - axe reports 0 violations on the profile, the review and Method (light and dark);
  - the profile, the review and Method fit 320 px. That test caught the Method versions grid overflowing by 13 px, now fixed.
