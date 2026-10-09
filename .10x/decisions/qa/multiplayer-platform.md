# QA — multiplayer-platform (Phase 0, Steps 1–4)

Last updated: 2026-10-08 · Report: `.10x/reviews/2026-10-08-qa-report.md`

## Risk profile

| Area                          | Failure                                                     | Blast radius                                     | Priority |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | -------- |
| Worker auth (`auth.ts`)       | Wrong person sits down; forged tokens accepted              | Every match; trust in ratings later              | P0       |
| Redaction (`seatView`)        | Opponent's hole cards leak before showdown                  | Every hand; unfixable after the fact             | P0       |
| Engine settlement             | Wrong pots / side pots / odd chips                          | Every multi-way all-in; ratings built on results | P0       |
| Table server (`TableDO`)      | Lost/duplicated moves, stuck hands, wrong presence          | One match at a time                              | P1       |
| Live client (`client`, UI)    | Stale state shown, moves sent while offline, wrong captions | One player at a time                             | P1       |
| Sign-in return (`authReturn`) | Invited friend lands on the home page instead of the table  | Invite conversion                                | P2       |

## Coverage before this review

Strong: engine invariant walks (10k hands × N=2..6), differential vs. the HU trainer, redaction per seat, deck commitment, migrations + RLS on PGlite, client snapshot ordering and backoff, worker idempotency/restart/second-tab, two-browser e2e.

Gaps found:

1. **No test with a real (ES256) token.** All worker tests used dev tokens, so issuer, audience, expiry, key id, alg pinning and the missing-username path were untested.
2. **Dev tokens in production** — no test that `dev.*` is refused when `DEV_AUTH_SECRET` is unset.
3. Engine: no crafted case for all-ins on a later street (3 pots, a folded contributor), the button folding first at N=3, a walk to the big blind at N=3, or all three seats all in from the blinds with an uncalled refund.
4. Table: no test that the opponent sees a player drop and return, or that the returner gets the same cards and actions.
5. `toHeroGame` result captions (win / lose / split / fold) untested; it is what the live table shows.
6. Live table: "disconnected" and "Reconnecting…" states untested; nothing proved moves are disabled while offline.
7. `authReturn` untested for `#play/<id>` (the invite-link path).

## Tests added (27)

- `worker/test/auth.test.ts` (15): valid ES256 accepted over HTTP and WebSocket; rejects wrong issuer, wrong audience, expired, unpublished key, unknown kid, no `sub`, swapped payload, `alg: none`, HS256 signed with the publishable key, garbage; valid token without a `players` row refused; dev tokens only with the secret, bad user ids refused.
- `worker/test/table.test.ts` (+1): opponent drop → `connected: false`; return → `connected: true`, same hole cards and action list, monotonic `seq`, hand plays to showdown.
- `src/engine/engine.test.ts` (+4): three pots from flop all-ins; button folds first at N=3; BB wins the blinds at N=3; three short stacks all in from the blinds with the uncalled 7 refunded.
- `src/engine/project.test.ts` (5, new): hero mapping from both seats, showdown captions, split pot, fold captions, folded cards stay hidden, non-HU refused.
- `src/net/LiveTable.test.tsx` (+1): opponent "disconnected", own "Reconnecting…", Call disabled while offline, recovers after the backoff.
- `src/lib/authReturn.test.ts` (+1): `#play/<uuid>` restored after the provider redirect.

Mutation check: removing the issuer check, the audience check, the `sub` type check, or the `DEV_AUTH_SECRET` guard each turns exactly one test red. Removing `algorithms: ['ES256']` is not caught — jose already refuses HS256 against an EC JWK — so the pin is defence in depth, kept.

## Bug found and fixed

**Rejoin presence (P1).** When a player reconnected, `join` broadcast to everyone except the new socket and `frame()` treated that excluded socket as offline, so the opponent kept seeing "· disconnected" until the next action. Fix in `worker/src/table.ts`: `broadcast` now takes `{ gone, skip }` — `gone` (a closing socket) is offline and not sent to; `skip` (a socket that just got its welcome) is not sent to but counts as connected. Regression test: "shows an opponent dropping and returning…".

## Not covered (accepted for now)

- A player who never acts stalls the table — no clock until Step 5. Step 5's tests must cover the timeout path.
- Real Supabase sign-in end to end, including confirming the live token's `alg: ES256`: needs the deployed site (pending user dashboard actions).
- iOS Safari background tabs, long (minutes) disconnects, many concurrent tables: manual / later load test.

## Quality gates (every Phase 0 step from here)

1. `npm run lint`, `npm run typecheck`, `npm run typecheck:worker` clean.
2. `npm test` and `npm run worker:test` green; no `.skip`/`.only`.
3. `npm run build` with the entry chunk under the 150 kB gzip budget.
4. `npx playwright test` green, including the `live` two-browser project.
5. Protocol changes: a real two-client smoke against `wrangler dev`.
6. Auth or redaction changes: a test that fails when the new check is removed.
