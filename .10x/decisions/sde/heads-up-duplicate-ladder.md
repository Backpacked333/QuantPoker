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
- **Still to do (P1-01c):** the lobby's Rated card. Until then nothing in the UI sends `kind: 'hu-rated'`.
