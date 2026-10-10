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
