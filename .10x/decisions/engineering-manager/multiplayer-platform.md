# Staff Engineer / EM — multiplayer-platform

## 2026-10-09 — Tickets for Step 7, Phase 1 and Phase 2 (Prompt 2)

Deliverable: `.10x/tickets.md`. No product code changed. Gates were run on the unchanged code to confirm the branch is green.

### What was built

- **Traceability table.** Every requirement from the 5 PM files, ADR Step 7, the ADR lifecycle and failure modes, and the Prompt 5–11 extras maps to a ticket. Rows are marked ✓ when Phase 0 already did them, and "Deferred" for P1/P2-priority items outside the roadmap's Phase 1–2.
- **49 tickets.** S7-01…S7-11, P1-00…P1-22 and P2-01…P2-15, plus P2-16, which is recommended for cutting. Each has:
  - goal and user-visible outcome;
  - real files and dependencies;
  - an estimate in half-days with H/M/L confidence;
  - acceptance tests by file and name with the assertion;
  - the riskiest assumption and its cheapest check;
  - a cut line, and (S7/P1) a review fold-in slot.
- **Critical path and lanes.** Six lanes, a collision table, and SQL redefinition order (`record_match` v3 → v4 → v5, `ladder()` v1 → v2).
- **Reconciliation.** 26 resolved items (R-1…R-26) and 5 questions, each with a recommendation.
- **Metrics map.** All 25 PM success-metric rows (the two that appear in more than one PM file are listed once) plus the ADR's hands/day, each with its source or the ticket that instruments it.

### Method and numbers

- **Inputs.** `.10x/prompts.md` and the Prompt 1 deploy verification are not on this branch or `main`. They were read from `claude/amazing-ride-4vip4x` (`a71a0bb`) and `claude/zen-darwin-0t5q1p` (`c5ccdd0`) with `git show`. The code inventory (file sizes, protocol messages, migrations, CI, log sites) came from one read-only Explore agent, and the claims used in tickets were spot-checked by hand.
- **Calibration** (VERIFIED from `git log` of `refs/pull/8/head`). The ADR was committed 08:29 UTC on 2026-10-08, Step 6 at 18:18, and the last engine fix at 20:58: 12.5 h for 14 ADR-days, so 0.45 h per half-day. Multipliers: H 1.0, M 1.5, L 2.0.
- **Totals** (computed by script, then re-parsed from the document; the two agree).

  | Phase  | Tickets | Half-days | Calibrated hours |
  | ------ | ------- | --------- | ---------------- |
  | Step 7 | 11      | 23        | 14.4             |
  | P1     | 23      | 68        | 45.2             |
  | P2     | 15      | 43        | 30.4             |
  | Total  | 49      | 134       | 90.0             |

- **Critical path to the ladder.** `S7-01 → … → S7-05 → P1-01 → P1-02 → P1-03 → P1-04 → P1-12 → P1-14 → P1-15 → P1-16 → P1-21 → P1-22`: 29.7 h, 45 hd. On to 6-max: +16.7 h.
- **Dates.** Earliest 2026-10-13 (12.5 h/day, parallel lanes, same-day gates). Planning 2026-10-19 (6 h/day, +20% for review fold-ins, gate latency). Serial single session: about 10-22.

### Deviations from the ADR and prompts, and why

- **Step 7 grew from the ADR's 1 day to 11.5 builder-days.** The ADR packed queue, verification, bench, CI, the Origin allowlist, logs, smoke and trust content into day 15. Prompt 5 adds limits and a chaos pass, and the inventory found three unbuilt ADR items: the `idle` cleanup, `incidents` writes and `/api/telemetry`.
- **No Origin allowlist (R-2).** The ADR amendment, newer and explicit, removed it. Prompt 5 still listed it. It is kept as a fold-in option on S7-02.
- **No `deploy-worker.yml` (R-3).** The amendment moved deploys to Cloudflare's Git integration. A read-only deploy check (S7-07) automates what Prompt 1 did by hand.
- **Smoke target is a question (Q4), not "production".** Production has no dev tokens, and test accounts there would be production writes.
- **Duplicate format left open (Q1).** Ticketing P1-02 surfaced the problem:
  - the ADR's rule (`deck:<n - handsPerSegment>`, button flipped) and `dealSlots` together hand each player the opponent's segment-1 cards under the same board;
  - the in-match review already shows players their own past hands.

  The PM risk text says the opposite, and the ADR calls it an inherent "memory effect" limited to shown boards. Neither is the user's decision, so P1-02 is written in two variants of equal estimate.

- **Doc fixes, one line each, no requirement changed.** One goes in `product-manager/multiplayer-platform.md`: its Node and Colyseus hosting text is superseded by the amendment. The other goes in `product-manager/heads-up-duplicate-ladder.md`: a pointer to Q1.

### Gates (2026-10-09, this branch, code unchanged from `main` `22ccf8a`)

- `npm run typecheck` exit 0
- `npm run typecheck:worker` exit 0
- `npm run lint` exit 0
- `npm test`: 56 files, 610 passed
- `npm run worker:test`: 5 files, 52 passed
- `npm run build` exit 0; entry `index-SE4hRMVq.js` 141.4 kB gzip (budget 150)
- `npm run e2e`: 18 passed (1.8 min)
- `npx prettier --check .10x/` clean
