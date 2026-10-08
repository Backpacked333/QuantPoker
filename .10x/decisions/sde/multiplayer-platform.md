# multiplayer-platform — SDE log

## Step 1 — Engine (done 2026-10-08)

ADR: `.10x/decisions/architect/multiplayer-platform.md` §Engine, §Wire protocol, §Randomness, §Repository layout.

### What was built

| File                      | Contents                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/engine/types.ts`     | `SeatId`, `HandConfig`, `SeatState`, `HandState`, `PlayerAction`, `HandAction`, `Pot`, `Award`, `LegalActions`, `HandResult`, `EngineError`                              |
| `src/engine/hand.ts`      | `startHand(config, deck)`, `legalActions`, `act(state, seat, action)`, `isOver`, `potTotal`, `replayHand`, `assertInvariants`                                            |
| `src/engine/pots.ts`      | `buildPots`, `referencePots` (chip-by-chip oracle), `returnUncalled`                                                                                                     |
| `src/engine/positions.ts` | `seatAfter`, `clockwiseFrom`, `blindSeats`, `nextButton`, `positionNames`; Phase 2 dead-button rule documented                                                           |
| `src/engine/deck.ts`      | `orderedDeck`, `shuffleWith(randomInt)`, `dealSlots`, `isValidDeck`, `deckFromRecord`, `commitDeck`, `revealSlots`, `verifyReveal`, hex/base64 helpers (Web Crypto only) |
| `src/engine/redact.ts`    | `seatView(state, viewer, extras)` — the only serializer                                                                                                                  |
| `src/engine/project.ts`   | `toHeroGame(view)`, `stateToHeroGame(state, hero)` (HU bridge to the trainer's `Game`), `FACE_DOWN`                                                                      |
| `src/engine/testing.ts`   | test-only helpers (seeded decks, `deckWith`, random walk, random tables)                                                                                                 |
| `src/shared/protocol.ts`  | `PROTOCOL = 'qp.v1'`, `ClientMsg`, `ServerMsg`, `LobbyMsg`, `SeatView`, `HandRecordV1`, `Reveal`, `MatchConfig`, `parseClientMsg`                                        |
| `src/lib/presets.ts`      | `buildPresets` + `Preset` (extracted from `App.tsx`; `ActionBar` re-exports the type)                                                                                    |
| `src/test/reference.ts`   | the slow reference evaluator, moved out of `src/lib/engine.test.ts` so it can be shared                                                                                  |
| `eslint.config.js`        | `src/engine/**` and `worker/**`: bans `setTimeout`, `setInterval`, `Math.random`, `Date.now`                                                                             |
| `package.json`            | `engine:soak` script (`ENGINE_SOAK=1`, 100k hands per N)                                                                                                                 |

### Tests (all `// @vitest-environment node` except presets)

- `engine.test.ts`: 10k random hands per N = 2..6 (50k total) asserting chip conservation after every action, pot/investment agreement, stack integrity, all-in flags, no folded seat eligible, no duplicate cards, termination < 200 actions, a 10% stream of illegal actions that must throw and leave the input untouched, `buildPots === referencePots` (sampled every 10th hand), showdown winners per pot vs the reference evaluator, odd-chip order, and `replayHand` byte-equality. Also asserts the walk actually reaches showdowns (> 5%) and side pots (> 1% for N > 2). Plus crafted cases: three-way all-in (main + side pot), short all-in that does not reopen, full raise that does, uncalled refund vs a short caller, odd-chip placement, blind larger than a stack, small blind that cannot cover, six-way split, big-blind option, bad configs.
- `differential.test.ts`: 10k seeded HU hands against `src/lib/poker.ts`, step for step: stacks, bets, invested, pot, board, street, turn, the full `legalActions` (including `maxRaiseTo`), result/net/winner/showdown. At every hero decision the projected `Game` equals the old one on every field grading and the table read. Plus 6 flop decisions where `gradeDecision` on the projected game `toEqual`s the trainer's, with identical `spotKey`.
- `redact.test.ts`: key allowlists for `SeatView` and its players; secrets never serialized; own/shown cards only; and for 10k random states and random viewers, swapping every unseen hole card and the whole deck leaves `JSON.stringify(seatView(...))` byte-identical.
- `deck.test.ts`: shuffle is a permutation; HU and 6-max deal slots; deck validation; encoders; commit → reveal → verify, rejecting a wrong card, a wrong salt, flipped leaf bytes, short leaves; fresh secret → fresh commitment; revealed openings independent of hidden slots; replay from a public record with a folded seat's cards unknown (`-1`).
- `protocol.test.ts`: every valid message; 19 malformed shapes rejected; 20k fuzzed frames never throw.
- `presets.test.ts`: sizing, clamping, no-raise.

### Gates run

`npm run typecheck` ✓ · `npm run lint` ✓ · `npm test` ✓ (44 files, 517 tests; wall 45 s vs 29 s before) · `npm run build` ✓ (entry chunk 140.9 kB gzip, unchanged) · `npm run e2e` ✓ (12/12 desktop + mobile). `ENGINE_SOAK=1` not run locally (≈ 10× the 26 s invariant file); scheduled for the weekly workflow in Step 7.

### Deviations from the ADR (all deliberate)

1. **`SeatView` gains `actions: HandAction[]` and `lastRaise: number`.** Both are public (derivable from the betting). `toHeroGame` needs them to rebuild `Game.history` and `Game.lastRaise`, which `Table`, `spotKey`/`rangeWeights` and `heroContext → legalActions` read. The redaction allowlist includes them.
2. **`act` uses a structural clone, not `structuredClone`.** Config, deck, recorded actions and hole-card tuples are never mutated after creation, so they are shared; players, pots and the board are copied. Measured 9× faster (≈ 30 µs → 3.4 µs per HU action) and the invariant suite went from 92 s to 26 s. Immutability is unchanged and asserted by the illegal-action stream (input JSON identical after a rejected call).
3. **A fold removes the seat from earlier streets' pots immediately.** The ADR rebuilt pots only at round close, which left a folded seat "eligible" mid-street. The invariant suite caught this on its first run.
4. **Folding is always legal**, even when checking is free, as in `poker.ts` (the differential requires it).
5. **Short raises.** The ADR allowed a below-minimum raise only as the raiser's all-in. The engine also allows raising to `maxRaiseTo` when that cap comes from the deepest opponent's stack, exactly as `poker.ts` does heads-up (required for the differential). Such a raise never reopens the betting (it does not bump `raiseSeq`), and since it puts the deepest opponent all-in nobody behind can re-raise anyway.
6. **After settlement `pots` are kept** for the award animation; `assertInvariants` then checks `Σ stack === chips`, `Σ awards === Σ pots` and `Σ net === 0` instead of the live-hand equation.
7. **`Date.now` is lint-banned in the engine and worker too**, not only `Math.random`/timers: the DO must take its clock from one place so deadlines are testable.
8. **`src/test/setup.ts` is DOM-guarded** so node-environment suites can share it.

### Tech debt created

- `project.ts` imports `categories` from `src/lib/poker.ts`, so the Worker bundle will include `poker.ts` + `random.ts` (no runtime effect; `Math.random` is referenced but never called from the engine path). Move `categories` to `sim.ts` if bundle size matters.
- `FACE_DOWN` placeholders use `rank: 0`; `Table` renders them face down until shown. Phase 2's N-seat `Table` retires `toHeroGame`.
- `referencePots` is sampled every 10th hand for speed; the soak run checks it on every 10th hand of 100k.
- `npm test` is ~16 s slower. If that hurts, split `engine.test.ts` per N into separate files (Vitest parallelizes across files), or lower `HANDS_PER_N` and lean on the weekly soak.

### Not done in Step 1 (per ADR schedule)

`bench.test.ts` (Step 7), `src/net/**` and its import guard (Step 4), `worker/**` (Step 3), the `check-bundle.mjs` grep guard (Step 2, when supabase-js is added).
