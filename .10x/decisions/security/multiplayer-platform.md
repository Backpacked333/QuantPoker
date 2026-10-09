# Security Engineer — multiplayer-platform

## 2026-10-09 — Phase 0 review (Prompt 3)

Report: `.10x/reviews/2026-10-09-security-review.md`. Branch `claude/sharp-cannon-4150j6` from `3e13ae8`. Nothing was written to production. Two public reads: `/auth/v1/settings`, and the Supabase security advisors through the MCP.

### What was built

| Commit    | Change                                                                                                                                                                                                                                       | Proof (red before, green after)                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `16b7664` | `worker/src/limits.ts` `FrameBudget` (20 frames, refilled 20 per 5 s), wired into `LobbyDO` and `TableDO`; dry sockets close `4429`; frames from closed sockets are ignored; applied moves are refunded (SR-01, SR-02)                       | `worker/test/limits.test.ts`: 2 red (`expected undefined to be 4429`), then 7/7 green                                                                             |
| `79610ff` | `verifyDeal` requires each public slot opened exactly once (SR-03)                                                                                                                                                                           | `src/engine/deck.test.ts › rejects a reveal that repeats one slot…`: red (`expected true to be false`), then green                                                |
| `d608a4f` | Dev tokens need `DEV_AUTH_SECRET` ≥ 16 characters (`MIN_DEV_SECRET`); test and e2e secrets lengthened; README (SR-04)                                                                                                                        | `worker/test/auth.test.ts › stay off when the configured secret is too short…`: red (`expected 'alice' to be null`), then green; live e2e 3/3 with the new secret |
| `520c6ce` | `join()` re-checks for the same account after the lobby claim before releasing (SR-05); duplicate check removed                                                                                                                              | `worker/test/seats.test.ts › keeps an account that opens the invite twice at once…`: red (`expected null to be '<id>'`), then green, 5/5 repeat runs              |
| `f3d332d` | Proofs that held: auth edges (`nbf`, HS256 keyed with the published EC key as JWK and PEM, RS256), the frame-key allowlist with no secret or deck, byte-equal frames across opponent decks, the hostile auth return, secret-key destinations | Mutations: decode-without-verify → 13 red; opponent cards in `seatView` → 2 red; any return target → 2 red                                                        |
| `d051ecb` | `supabase/tests/rls-matrix.test.ts` (14 tables × 4 callers × 4 operations, RLS everywhere, function audit); shared `supabase/tests/harness.ts`                                                                                               | Mutations: `hand_holes` open to all, `record_hand` to anon → 2 red                                                                                                |
| `8e209c7` | An oversized (1 MB) frame is refused unparsed                                                                                                                                                                                                | Held                                                                                                                                                              |

### Numbers measured

- Lobby flood before the fix: 200 frames from one account → 200 frames to each of 5 bystanders (1,000 in total); socket never closed. After: closed at frame 21; the bystander sees ≤ 44 frames (the test bound).
- Invite spam (probe, not committed): 50/50 tables created by one account, 50 holding storage, 0 counted against the account.
- Worker bundle (`wrangler deploy --dry-run`): `index.js` 99 kB, no `sharp`/librsvg.
- `npm audit`: 4 high, all `sharp` via `miniflare` (dev only).
- Test counts at the end: `npm test` 630 (was 610), including the SQL suites at 31 (was 13); `npm run worker:test` 72 (was 52).

### Deviations from the ADR and the prompt

- **The frame budget refunds applied moves.** The ADR said 20 frames per 5 s per socket; metering only non-moves keeps fast honest play (and the existing tests) safe, since moves are paced by the opponent.
- **An oversized frame stays an `illegal` error, not a close.** It is cheap (the length is checked before parsing) and now counts against the budget.
- **No Origin allowlist.** The ADR amendment (R-2) stands; nothing found needs it.
- **Dev ids may still be UUID-shaped (SR-10, ticketed).** Blocking them would mean moving the archive tests to real ES256 tokens; the short-secret fix removes the guessable case now.
- **Not fixed here:** SR-06 (invite spam) and SR-07 (connection floods) are Mediums but not small or local. They need a per-account counter or limit design and a dashboard WAF rule, so they are tickets for S7-02. SR-08 (own folded cards) changes the reveal protocol and is new ticket S7-12.

### Gates

Final run on this branch, after the last code commit `8e209c7`:

| Gate                       | Result                                   |
| -------------------------- | ---------------------------------------- |
| `npm run typecheck`        | exit 0                                   |
| `npm run typecheck:worker` | exit 0                                   |
| `npm run lint`             | exit 0                                   |
| `npm test`                 | 57 files, **630 passed** (was 610)       |
| `npm run worker:test`      | 8 files, **72 passed** (was 52)          |
| `npm run build`            | exit 0; entry 141.4 kB gzip (budget 150) |
| `npm run e2e`              | **18 passed** (1.8 min)                  |

Real runtime (`wrangler dev` on :8788, Node WebSocket clients): the lobby flooder closes `4429 Too many messages`; the bystander sees 22 frames during 200 junk frames (was 200); the reconnect is clean, with the queue row gone; a wrong dev secret is refused at upgrade.
