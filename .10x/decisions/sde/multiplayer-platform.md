# multiplayer-platform — SDE log

## Step 2 — Accounts (done 2026-10-08, two user actions pending)

ADR: §Auth, §Data model, §Client integration, §Migration path step 2.

### Discovery that changed the plan

The Supabase project was **not empty**. Migration `20261007192620_learning_cloud` (from the unmerged branches `devin/1791400999-supabase-vercel` and `devin/1791354563-context-aware-coach`) is live and created `profiles` (private per-user settings, owner-only RLS), `hand_results`, `lesson_progress`, `practice_attempts`, `coach_messages` and `private.coach_usage`. Nothing of it exists on `main`. Step 2 therefore coexists with it and changes none of it.

### What was built

| Area                                                                                                                        | Files                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migrations (applied to project `dbkfuxczfkawxqmaieii`; file names = recorded versions; live statement MD5s match the files) | `supabase/migrations/20261008133809_players.sql`, `…134201_matches_hands.sql`, `…134322_record_hand.sql`, `…134345_abandonments_match_index.sql` |
| Migration/RLS tests on real Postgres (PGlite + a stub of Supabase's `auth` schema, roles and permissive default grants)     | `supabase/tests/migrations.test.ts` (9 tests; mutation-checked: removing a revoke or the column grant fails 3 of them)                           |
| Auth return across hash routes                                                                                              | `src/lib/authReturn.ts` (+ test), called in `src/main.tsx` before render                                                                         |
| Online area (lazy chunk)                                                                                                    | `src/net/{supabase,auth,players,AuthGate,Lobby,LiveApp}.ts(x)`, `src/net/live.css`                                                               |
| App integration                                                                                                             | `#lobby` route, **Online** nav item, `LiveApp` lazy view in `src/App.tsx`; env typings in `src/vite-env.d.ts`                                    |
| Guards                                                                                                                      | `scripts/check-bundle.mjs` fails if `supabase`/`gotrue`/`auth/v1/` reaches the entry chunk; `src/net/imports.test.ts` forbids analysis modules   |
| Docs                                                                                                                        | `.env.example`, README (online section, corrected "no network/not multiplayer" lines)                                                            |

Behaviour: the sign-in page reads `/auth/v1/settings` and shows only enabled methods (today: email only). Magic link and OAuth use PKCE and return to `/`; `authReturn` restores `#lobby` so the chunk loads and exchanges the code. First sign-in gets `player_<12 hex>` from a trigger; the gate then requires a real username (client and DB share the rules; a test asserts the reserved list matches the SQL). The lobby shows three cards: **Play 1v1** disabled with "Opening soon", **6-max** "Coming after heads-up", **Practice vs Atlas** live.

### Verified live

- PostgREST as anon: `players` 200, `hands` 200; `hands_private`, `incidents`, `rpc/record_hand` and `PATCH players` all 42501 permission denied.
- Advisors: security shows only the intended INFO for `hands_private`/`incidents` (service-role only) plus the Devin migration's `private.coach_usage`; the one performance gap (unindexed `abandonments.match_id`) was fixed by the fourth migration.
- JWKS publishes one ES256 key. The day-5 check of a real access token's `alg` still needs a real sign-in.

### Gates

typecheck ✓ · lint ✓ · prettier ✓ · `npm test` 49 files / 542 tests ✓ (48 s) · build ✓ entry 141.3 kB gzip (+0.4 kB), guard passes with and without Supabase env · e2e 15/15 ✓ (new: lobby + axe light/dark, phone lobby) · phone width sweep 320–600 px ✓ on `#table` and `#lobby`.

### Deviations from the ADR

1. **`players`, not `profiles`.** The live `profiles` is the Devin branch's private settings table; opening it for public reads would expose those settings. All multiplayer foreign keys point at `players(user_id)`.
2. **Env var names follow the existing branch:** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (ADR said `VITE_SUPABASE_KEY`). One set of config across both lines of work. The value is the `sb_publishable_…` key.
3. **Timestamped migration names** (Supabase CLI convention, after `20261007192620`), not `0001`–`0003`, plus a fourth for the FK index.
4. **Tighter SQL than the ADR sketch:** `search_path = ''` with qualified names; explicit `revoke all` from anon/authenticated before granting (Supabase's defaults grant everything); column-level `update (username, country, bio)`; reserved usernames; shape checks on `hands` (commitment hex, 1,664-byte leaves, id format) and `hands_private`; `record_hand` executable by `service_role` only.
5. **OAuth/magic-link return** via `authReturn` (sessionStorage + `history.replaceState`), because providers append `?code=` to a URL that would otherwise lose the `#lobby` route.
6. **Phone header fix** (`src/styles.css`): a fourth nav item overflowed the 412 px Pixel 7 header by 39 px, the browser zoomed out, and the tour's "Skip tour" button fell below the screen. Between 381–520 px the nav shows labels without icons; ≤ 380 px icons only (unchanged). The mobile overflow check now compares against the device width, since `scrollWidth > innerWidth` cannot fail once a phone browser widens its layout viewport.

### Tech debt

- The online chunk is 61.8 kB gzip because `@supabase/supabase-js` bundles realtime, storage and functions clients we do not use. Importing `@supabase/auth-js` + `@supabase/postgrest-js` directly could roughly halve it. Lazy-only, so the trainer is unaffected.
- The magic link must be opened in the browser that requested it (PKCE verifier in localStorage); the UI says so.
- `profiles` (Devin) and `players` (this work) are two per-user rows. If the learning-cloud branch is merged, consider one profile screen over both.

### User actions pending (not code)

1. **Vercel env vars** (the connector got 403 on both list and create): set `VITE_SUPABASE_URL = https://dbkfuxczfkawxqmaieii.supabase.co` and `VITE_SUPABASE_ANON_KEY = sb_publishable_DKfxJ0I2bbnrMHMyxiK4eg_tqsrKoI7` for Production, Preview and Development, then redeploy.
2. **Supabase Auth → URL configuration:** Site URL `https://quantpoker.vercel.app`; redirect URLs `https://quantpoker.vercel.app/**`, `https://*-backpacked333s-projects.vercel.app/**` and `http://localhost:5173/**`. Optional: enable Google and GitHub providers (each needs an OAuth app); the sign-in page shows them automatically once enabled.

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
