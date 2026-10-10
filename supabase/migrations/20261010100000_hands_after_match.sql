-- Hands of a match still being played are not readable by clients (Devin,
-- PR #29). The live table sends each player what they may see over its
-- socket; until now the archive's public_read policy also let anyone with
-- the publishable key follow a match in play hand by hand, with decision
-- times and, for rated hands, all-in equity. This restrictive policy is
-- ANDed with public_read for clients: a match's hands open once it is
-- finished or void, the rule hand_grades and rated_luck already follow.
-- The server (service role) and security definer functions are unaffected.
-- The check is a correlated scalar lookup, one primary-key probe per hand
-- row: an EXISTS form is planned as a hashed subplan over every match not
-- in play, which /api/stats's per-day counts would pay on each call as the
-- matches table grows (migrations.test.ts › counted per UTC day from an
-- index). Every hand has its match (foreign key), so the lookup is never
-- empty. Additive: one policy; nothing existing is altered.
create policy hands_after_match on public.hands
  as restrictive
  for select to anon, authenticated
  using ((select m.status from public.matches m where m.id = hands.match_id)
         <> 'playing');
