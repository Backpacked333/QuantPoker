# Hands of a live match are not public (hands_after_match)

Date: 2026-10-10 · Status: approved by the user, migration `supabase/migrations/20261010100000_hands_after_match.sql`.

**Problem (Devin, PR #29).** `hands` had a public SELECT policy, so anyone with the publishable key could follow a rated match hand by hand while it was played: actions, decision times, the board, all-in equity. The table sends each player what they may see over its socket; the archive need not.

**Rule.** A restrictive SELECT policy for `anon, authenticated`: a hand is readable only when its match's status is not `playing`. Restrictive policies AND with the permissive ones, so every existing read rule still applies on top. The server (service role) bypasses RLS and archives as before. A player's own `hand_holes` keep their own policy and stay readable.

**Why a scalar subquery, not EXISTS.** Written as EXISTS, the planner turned the policy into a hashed subplan with a sequential scan of `matches`, which `/api/stats` would pay on every count (`migrations.test › counted per UTC day from an index` failed). The correlated scalar lookup `(select m.status from matches m where m.id = hands.match_id) <> 'playing'` probes `matches_pkey` once per hand.

**Cost (bench Q8c, PGlite, 100k matches).** The owner count stays an index-only scan on `hands_created` (0.04 ms). As anon, each counted hand costs one `matches_pkey` probe: 425 ms for the worst case of 100k hands on one day, so about 4 µs a hand. Real days are far smaller, and `/api/stats` caches for 5 minutes per isolate. Revisit (a `public` flag on hands set at match end) only if a day passes about 1M hands.

**Rejected.** A view over finished matches (a second read path for the same data); a `published` column on hands (a write per hand at match end and a backfill, for a cost we do not have yet).

**Rollback.** `drop policy hands_after_match on public.hands;` restores the previous public read. Additive and instant either way.
