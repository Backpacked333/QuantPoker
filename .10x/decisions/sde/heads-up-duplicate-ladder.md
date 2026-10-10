# heads-up-duplicate-ladder — SDE log

## P1-02 (variant B) · Luck-adjusted results: the engine module (2026-10-09)

Q1 was answered **B** on 2026-10-09: rated heads-up deals a fresh deck every hand and settles all-in pots at equity. This entry is the pure engine part. Wiring it into the table's match result comes with P1-01 (the rated match lifecycle), which P1-02 depends on.

### What it is

`src/engine/luck.ts`, pure and deterministic, with the engine's lint rules (no `Math.random`, timers or `Date.now`):

- **`allInPoint(state)`:** the number of board cards known when the betting ended with cards still to come. It is null for a fold, a showdown reached by betting through the river, or more than two players.
- **`equity(a, b, board)`:** seat A's exact share of the pot over every completion of the board (wins 1, ties ½), counted in integer halves.
- **`luckAdjusted(state)`:** each seat's net with the contested pot settled at equity: `net − won + equity × pot`. The adjustment is zero-sum by construction (the second seat gets `1 − equity`).

### Riskiest assumption (from the ticket): timing

| All-in at | Boards enumerated | CPU in Node |
| --------- | ----------------- | ----------- |
| Preflop   | 1,712,304         | ≈ 475 ms    |
| Flop      | 990               | < 1 ms      |
| Turn      | 44                | < 1 ms      |

The ticket set 100 ms as the threshold for moving the adjustment to the queue consumer. A preflop all-in exceeds it, but the threshold was a guess at what fits between hands, and the table already waits `NEXT_HAND_MS` = 3,000 ms after a hand ends (`worker/src/table.ts:67`). Half a second of CPU, only on the hands where it happens, fits in that gap with 6× to spare.

So the adjustment stays in the table server, synchronous and deterministic. That avoids the asynchronous result the ticket's fallback would have needed, where the match result would wait on the archive. A test guards it: a preflop enumeration must use under 2 s of CPU.

### Evidence

`src/engine/luck.test.ts`, 7 tests, red first (the module did not exist):

- **Aces against kings all in preflop, kings win:** the aces are credited 0.81–0.83 of the pot, and the nets are exact.
- **AKs vs QQ preflop:** 0.4621, the figure equity calculators print.
- **A flop all-in:** equals an independent count over all 990 run-outs made with the _other_ evaluator in the codebase (`evaluate` in `src/lib/poker.ts`), to 12 decimals.
- **No-all-in showdowns, river all-ins and folds:** unchanged.
- **Zero-sum:** over 60 adjusted random hands (seeded walk; preflop all-ins skipped for time, covered above).
- **The CPU budget** described above.

Mutation check: settling river all-ins (`< 5` → `<= 5`) and giving both seats the same equity each turn tests red.

### For P1-01

At hand end, call `luckAdjusted(state)` on the DO's full state, after sending `hand_end` and before the `nextHand` alarm. Then:

- add the adjusted nets to the match's running totals;
- store `allInAt` and `equity` with the hand, so the review and the end screen can show "luck-adjusted +3.5 bb (actual +11 bb)";
- apply the draw band (`DRAW_BAND_BB` = 2, inclusive) to the adjusted total.

## P1-01 · Rated match: the archive and the table server (2026-10-10)

### Database (PR #12, live)

`record_match` v4 stores each seat's `outcome` and `adjusted_chips` for a finished rated match, and copies `finished_at` to every seat. Review fold-ins before it shipped:

- **A rated finish missing a seat's result is refused (23502).** Otherwise it would archive as finished with NULLs, and the outbox would drop it. Refused, it is retried and then parked with an incident (S7-13), so it can be replayed.
- **`abandoned` voids the match** with a `leave_mid_hand` row for each seat in `result.abandoned`. This is the amendment's "both gone" rule; adding it to v4 saved a v5.

### Table server (P1-01b-1)

- **Kind comes from the lobby** (`InitBody.kind`). A rated table plays `RATED_CONFIG` and ignores `handsTotal`. Nothing can create one until P1-01b-3 opens the queue.
- **The luck is settled one step late, on purpose.** `settleLuck` runs as the next hand starts and at the finish, never between the last action and the showdown frames: a preflop all-in costs about 0.5 s of CPU. It is idempotent (`adjustedThrough`), and after a restart the alarm recomputes it from the stored hand.
- **A rated hand's archive calls wait under `held:<n>:*`.** `settleLuck` adds `record.luck` and moves them to `outbox:`, deleting `held:` in the same commit (no await between the two writes), then flushes. Holding them is what lets the archived record carry the luck, as the amendment wants.
- **Outcome.** Decided once from the lead (half the difference), so floating-point noise can never give both seats a win. A forfeit is a loss whatever the chips say. Void endings (`no_show`, `engine_fault`, `abandoned`) have no outcome.
- **The bank** refills to `bankMs` at hands `1 + k·bankRefillEvery`; what is left does not carry over.
- **Frames:** `match_end.result` gains `adjustedBySeat` and `outcomeBySeat`. Both are derived from shown cards only. The per-hand equity never reaches a frame (`leaks.test.ts`: result-key allowlist and a rated run).

### A pre-existing bug found on the way

`flushOutbox` returned at once while a pass was running, and that pass then removed the safety deadline. So a call queued during it (the match result, when a flush outlives the 3 s gap) was stranded for good: idle cleanup only re-arms itself. Reproduced in `archive.test.ts` by holding `record_hand` while the match ends. Now a call made during a pass makes the pass go again.

### Evidence

- `worker/test/rated.test.ts` (6 tests, red first):
  - 40 hands end complete with win/loss;
  - the bank per half;
  - an all-in on the flop is held, then archived with `luck` and added to the total;
  - three timeouts are a loss even 560 chips ahead;
  - the draw band at +40/+41;
  - a casual match is archived exactly as before.
- The draw band was written before its test. Mutating `<=` to `<` turns it red.
- Gates at `da44318`:
  - typecheck 0, typecheck:worker 0, lint 0;
  - 697 unit, 132 worker and 19 e2e tests;
  - entry bundle 141.5 kB.

### Grace and both gone (P1-01b-2)

- **A `grace` deadline per seat (60 s)** starts when a rated seat's last socket closes. Every close path (normal, error, flood cut-off, illegal frames) goes through `socketGone`. A tab replaced by a new one never starts a grace, because the new socket is already open.
- **Away seats.** Past the grace, the seat is away (`awaySince`). A turn of theirs that is pending is played at once, and later turns get a deadline of "now" (`turnFor`). Each counts as a timeout, so three in a row forfeit. A turn that began while away costs no bank, however late its alarm runs (review fold-in on #14). The turn they left on keeps normal accounting.
- **Coming back** ends the grace or the time away. A turn still pending starts over with the normal clock from the return (`back`; review fold-in on #14: a late alarm could otherwise play it at once).
- **Both away** ends the match `abandoned` (void). `result.abandoned` names both seats, and `record_match` v4 writes `leave_mid_hand` for each. Graces due together are handled before any turn, so two players leaving at once void the match instead of auto-playing a hand. The test pins this: the void match's `netBySeat` must be 0/0.
- **Evidence:** 3 tests in `rated.test.ts`. Mutating the away-seat deadline back to the normal clock turns "played at once" red.

### Deploy verification gap

`verify-deploy` compares the static files and `/api/health`, so a Worker-only change passes it before the new Worker is live. For #13 the deployed Worker code was read through the Cloudflare connector, which confirmed the new code (`settleLuck`, `flushAgain`, `held:`). A build marker in `/api/health` would close the gap (follow-up).

### Rated queue and the email gate (P1-01b-3)

- **The gate asks Supabase Auth,** `GET /auth/v1/user`, with the player's own token and the publishable key, once per lobby socket.
  - Eligible means a confirmed email (`email_confirmed_at`) on a permanent account (`is_anonymous` false), for the very account the token verified as.
  - The access token has no confirmation claim, and `user_metadata` (including any `email_verified` in it) is the user's to edit, so neither is trusted.
  - The answer is `yes`, `no` or `unknown` (Auth unreachable, so the player is told to try again). It reaches the lobby in a header only the Worker can set.
  - Positive answers are cached per isolate, because a confirmation does not lapse. Dev tokens are eligible.
- **The lobby** keeps one queue row per account, now carrying its kind.
  - It pairs only rows of the same kind, sharing the pair counter (R-25), and inits the table with that kind.
  - Asking for the other kind starts over in that line. Rows from before rated existed are casual.
  - A rated queue without eligibility gets `error unverified`. A player who already has a table is sent back to it first.
- **The end text reads the rated outcome** (`src/net/matchResult.ts`): win, draw or loss, with the luck-adjusted total in bb, or "by forfeit". A forfeit while ahead reads as a loss (review finding on #13). Casual matches keep the chips text.
- **Review fold-ins on #15:**
  - a cached yes expires after `ELIGIBLE_TTL_MS` (5 min), so a revoked confirmation lapses;
  - a match stopped by a server fault never reads as won or lost.

### The UI (P1-01c)

- **The lobby's "Play rated 1v1" card** explains the format in one line: 40 hands, all-in luck settled at equity, within 2 bb a draw.
  - "Find a rated match" queues `hu-rated`; one queue at a time, so the other card's button waits while one looks.
  - The lobby-wide presence line shows once, on the casual card.
- **A refusal (`unverified`)** stops looking and shows the server's reason on the Rated card. Retrying rated reopens the lobby socket, because the Worker checks once per socket; this was the third review finding on #15. Casual stays open to the player.
- **The match bar** reads "Rated · Hand 7 of 40". Casual is unchanged.
- **E2E:** two players find a rated match and both see "Rated · Hand 1 of 40", against `wrangler dev`, where dev accounts are eligible.

## P1-03 · Nothing to analyse during a rated match (2026-10-10, PR #17)

### What changed

- **A rated table draws no equity ring and no break-even figure** (HU AC6).
  - The live table used to draw the ring locked, with a break-even tick, and printed "break-even 33%" beside the call.
  - `ActionBar`'s `versus` prop gains `rated`, set from `view.match.kind`, which drops both.
  - Casual live tables and the trainer are unchanged.
- **The live code cannot read the debug switches.** `src/net/imports.test.ts` forbids importing `src/env.ts` and `src/lib/random.ts`. Only the trainer's dealer and Atlas draw from that source, and the server deals every live card.

### Proof

- **`worker/test/rated-leak.test.ts`** plays one 40-hand rated match, covering:
  - an all-in settled at equity;
  - a timeout;
  - a second tab;
  - a disconnect past the grace, then the return;
  - a junk frame and a stale one;
  - a reconnect after the end.

  Every frame has exactly its keys, with no analysis key at any depth. The opponent's cards appear only after that hand's showdown, and no close reason names a card. Two injected server leaks, cards in every view and an `equity` field, each turn it red.

- **`worker/test/frames.ts`** holds the allowlists, shared with `leaks.test.ts`. `keysOf<T>()` makes `typecheck:worker` fail when a protocol field is missing from a list or a list names a field that does not exist. Both were checked. This answers the ticket's riskiest assumption ("the allowlist must list every current field") with the compiler rather than a one-off review.
- **`src/net/LiveTable.test.tsx`** has two tests:
  - the rated table renders no ring, `%`, EV, read prompt or lab control, while the same decision at a casual table shows the ring;
  - `?seed=3` plus `motion=off` leave its text and controls identical. A mutation that read the `no-motion` class turned this red.
- **`e2e/live.spec.ts`:** two browsers pair through the rated queue and call down hand 1. Both the UI at each decision and every frame received are checked. Red with the flag off, green with it on.

### Decisions (reversible)

- **`?motion=off` still freezes animation on a rated table.** It hides nothing and changes no decision, and it does the same as the OS reduced-motion setting, which must keep working. The integrity spec's "ignored on rated tables" is met as "changes nothing a rated player sees or can do", which the test checks.
- **The face-up all-in equity during a runout stays** (`Table`, `faceUpEquity`). It appears only once both players are all in and the server has decided the hand, and it is the equity the luck adjustment settles at.

### Noticed

- A socket opened after `match_end` gets the welcome and the last hand, but not `match_end` again (`sendEnded`). After a reload, the rated outcome text is missing. For P1-04's end screen.
- `supabase/bench/payloads.json` fails `prettier --check` on `main`. It predates this work, and CI does not run Prettier.

### Gates

- typecheck 0, typecheck:worker 0, lint 0.
- 713 unit tests (69 files) and 143 worker tests (15 files).
- Entry bundle 141.5 kB.
- 21 e2e tests.

## P1-04 · End of match and rematch (2026-10-10, PRs #18 and #19)

### Database (PR #18, live)

- **`20261010043000_rematch.sql`:** `matches.rematch_of`, a foreign key with a partial index, and `record_match` v5.
- **v5 is v4 plus the link.** It stores the link only when the earlier match is in the archive as a finished rated match: on the call that creates the row or, failing that, on the finish.
- **Review fold-in on #18.** Archives arriving out of order used to lose the link for good. They now repair it on the finish, and a rematch never links to a match still playing, or to a casual one.
- **VERIFIED in production (read-only):**
  - the version is recorded;
  - the column and index exist;
  - the v5 lookup and repair are in the function body;
  - `record_match` is callable by `service_role` only.

### Table, lobby and screen (PR #19)

- **The offer.** After a rated match with a result, the table asks the lobby `pairsLeft`. It then offers `open`, or `limit` at the pair cap (R-9). The question is asked after the result is stored and sent, so the result never waits on the lobby.
- **The presses.**
  - One press waits `REMATCH_MS` (60 s), using a `rematch` deadline, then becomes `declined`.
  - Both presses call the lobby's `rematch`. It refuses at the cap (checked again, since the count can change after the offer) and when either player is now at another table. Otherwise it starts a new rated table: counted as a pairing, seats swapped so the other player has the first button, `rematchOf` set.
  - The offer is marked `starting` in memory before the lobby call, so neither the expiry nor another press can change it meanwhile.
- **Frames.**
  - `rematch` (client) and `rematch_state` (server), with the allowlist the compiler required in `frames.ts`.
  - A socket that joins or resyncs after the end now gets `match_end` and the offer again (the gap P1-03 found).
- **Screen.** `MatchEnd` shows:
  - "+12.5 bb · Win" (the luck-adjusted total), and the chips actually won;
  - the offer as the server holds it, from the Rematch button to "Rematch limit reached (2 per day)".

  "Starting" opens the new table. Casual tables keep their end line.

- **Not built:**
  - the rating change, which comes with P1-12;
  - the swings, which come with P1-20. There is no placeholder; the panel grows when they exist.
- **Accepted edge.** A rematch does not repeat the lobby's email check. Both players passed it when they queued, minutes earlier.
- **Review fold-ins on #19**, each with a red-then-green test:
  - An offer lost to a restart between storing the result and making the offer is now made on the next join, resync or press. `offerRematch` is idempotent and checks again after its lobby call.
  - A second press after the minute declines, even if the expiry alarm is late.
  - A press near cleanup moves the cleanup past the minute.
  - The forfeit panel shows the chips actually won.
- **Open, for the user.** A rematch stays unlinked if the earlier match is archived only after the rematch finishes, which needs an outage of about 15 minutes or more. Fixing it needs a `rematch_request` column and a v6 migration. Declined for now; the thread on #19 stays open.
- **Merged** as `6a79a93`. `verify-deploy` passed. The deployed Worker code (Cloudflare connector) was searched for the P1-04 markers, the review fixes included, and all were found.

### Evidence

- **`worker/test/rematch.test.ts`, 8 tests:**
  - both press → a new rated table with seats swapped, the lobby holding both, and `rematchOf` in its archive call;
  - a lone press declines;
  - the cap at the offer, and again at the press;
  - busy elsewhere;
  - the redaction of every frame;
  - `match_end` and the offer resent on reconnect and resync;
  - casual is illegal.
- **Mutations caught:** the lobby ignoring the cap fails 2 tests; a press that never expires fails 1.
- **Client tests:** `src/net/MatchEnd.test.tsx` (6), the headline in `matchResult.test.ts`, and a `LiveTable` test that clicks Rematch.
- **No e2e.** A rated match needs 40 hands or three 80 s timeouts in real time. The worker tests drive real sockets through the real Worker.
- **Gates:**
  - typecheck 0, typecheck:worker 0, lint 0;
  - 728 unit tests (71 files) and 151 worker tests (16 files);
  - SQL: 60 tests; plans 12/12;
  - entry bundle 141.5 kB;
  - 21 e2e tests.
