# Architect: 6-max arenas and the 6-max rating (P2-13, P2-14)

## 2026-10-10: stopped at the pre-check (no design note, no build)

The mission's pre-check needs both of:

- 0 invariant failures over 100k simulated 6-max hands;
- 0 invariant failures over the first 1,000 human casual 6-max hands.

| Gate                       | Count                                                                                                                                                                                                                                                            | Result                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Simulated hands, 6 players | **100,000 hands, 0 failures** (local soak, seed 20261010, `npm run engine:soak`: 100k per table size, 2 to 6 players; side pots in over 1% of multi-way hands, asserted). The nightly and PR soak (`.github/workflows/engine-soak.yml`) has 11 of 11 runs green. | **Pass** (VERIFIED)    |
| Human casual 6-max hands   | **0 hands, so 0 of the required 1,000.** Production `public.hands` holds 0 rows of any kind and 0 multi-way rows (read-only, 2026-10-10).                                                                                                                        | **Not met** (VERIFIED) |

### Why there are no human 6-max hands

- **No casual 6-max table service exists.** The engine handles 2 to 6 seats, but P2-02 (positions, dead button, rebuy), P2-03 (the casual 6-max table service), P2-04 (clock, sit-out), P2-05 and P2-06 (the N-seat UI) and P2-08 (table list) are unbuilt. The lobby says "6-max tables: coming after heads-up".
- **Production archives nothing yet** (U-4: the Worker's `SUPABASE_SECRET_KEY`). Even a live 6-max table would not reach the 1,000-hand count until U-4 is done.

### What has to happen first (shortest path, from `.10x/tickets.md`)

1. **P2-01:** put the 6-max engine gate on record. The soak above already shows 100k with 0 failures; the crafted side-pot cases are still to add.
2. **P2-02 to P2-06, then P2-08 and P2-11:** casual 6-max that humans can play.
3. **U-4,** so hands are archived and verified.
4. **The calendar gate:** 1,000 human casual 6-max hands with 0 verify failures. Count them read-only with the query below, and check `incidents` is empty.
5. Then this mission: the design note (ArenaDO seating, rating bands, rebalancing, a hand in progress during a rebalance, the failure matrix), P2-12 to P2-14, and the 12-client scripted arena in a test environment.

```sql
select count(*) as hands, count(*) filter (where verified) as verified
from public.hands h join public.matches m on m.id = h.match_id
where jsonb_array_length(h.record -> 'seats') > 2 and m.kind = 'six-casual';
```

(`six-casual` is the kind P2-03 is expected to add; adjust if it lands under another name.)

The PM spec puts this gate before rated 6-max, so it is not waived here. Building arenas against simulated hands alone would rate humans on an engine path real 6-max play has never exercised.
