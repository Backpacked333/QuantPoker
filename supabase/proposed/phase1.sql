-- PROPOSED Phase 1 schema (DBA review, 2026-10-09). NOT A MIGRATION: nothing
-- in this folder is applied to any database. Each section names the ticket
-- that ships it as its own timestamped migration in supabase/migrations/,
-- with its PGlite test (.10x/tickets.md). supabase/bench/plans.ts loads this
-- file on top of the real migrations to time the Phase 1 queries and
-- self-check the rules below. Rationale, alternatives and rollback:
-- .10x/decisions/dba/phase1-schema.md.

-- ---- Shipped ------------------------------------------------------------------
-- P1-01's part (the rated kind, match_players.outcome, adjusted_chips,
-- finished_at and match_players_history) shipped as
-- supabase/migrations/*_rated_matches.sql, and P1-04's matches.rematch_of
-- (with record_match v5) as supabase/migrations/*_rematch.sql.

-- ---- P1-12: ratings ----------------------------------------------------------
-- Glicko-2 state per format, stored on the display scale: rating = 1500 +
-- 173.7178·mu, rd = 173.7178·phi, and sigma. src/rating/glicko2.ts (P1-11)
-- converts. The counters are updated by apply_rating in the same
-- exactly-once transaction as the rating, so the ladder reads every column
-- it shows from this row instead of aggregating per candidate.
create table public.ratings (
  user_id uuid not null references public.players (user_id) on delete cascade,
  format text not null check (format in ('hu-duplicate', '6max')),
  -- Glicko-2 ratings are unbounded: a 100 ± 350 player who loses to an
  -- equal goes below zero (src/rating/glicko2.test.ts), so the check only
  -- refuses what no model produces (and NaN, which sorts above every
  -- number). A floor, if wanted, is a product rule for the model, not here.
  rating double precision not null default 1500
    check (rating > -100000 and rating < 100000),
  rd double precision not null default 350 check (rd > 0 and rd <= 350),
  sigma double precision not null default 0.06 check (sigma > 0 and sigma < 1),
  matches integer not null default 0 check (matches >= 0),
  wins integer not null default 0,
  draws integer not null default 0,
  -- Rated matches abandoned (forfeit or three timeouts), counted by
  -- apply_rating, plus rated no-shows (R-14: void and unrated, but counted)
  -- and rated matches both players left (void, one each), counted by
  -- P1-12's record_match (and backfilled from abandonments when
  -- the ratings table ships) in the branch that voids the match, which
  -- runs once under the match row lock. The ladder rule is abandoned /
  -- matches over the lifetime (R-13: "until it falls" works by dilution).
  abandoned integer not null default 0 check (abandoned >= 0),
  -- Accuracy is not kept here: it shipped in P1-10 as public.accuracy
  -- (supabase/migrations/*_accuracy.sql), which the ladders join.
  last_match_at timestamptz,
  -- Compare-and-set: apply_rating names the version it computed from.
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, format),
  check (wins >= 0 and draws >= 0 and wins + draws <= matches)
);
create index ratings_ladder on public.ratings (format, rating desc, user_id);

-- Append-only. One 'match' row per player per rated match: the partial
-- unique index makes rating a match twice structurally impossible. 'reset'
-- rows come from apply_sanction (P1-18); 'decay' is reserved for inactivity.
create table public.rating_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.players (user_id) on delete cascade,
  format text not null check (format in ('hu-duplicate', '6max')),
  kind text not null check (kind in ('match', 'reset', 'decay')),
  match_id uuid references public.matches (id),
  outcome text check (outcome in ('win', 'draw', 'loss')),
  before_rating double precision not null,
  before_rd double precision not null,
  before_sigma double precision not null,
  after_rating double precision not null,
  after_rd double precision not null,
  after_sigma double precision not null,
  model_version text not null,
  created_at timestamptz not null default now(),
  check ((kind = 'match') = (match_id is not null and outcome is not null))
);
create unique index rating_history_once on public.rating_history (match_id, user_id)
  where kind = 'match';
create index rating_history_user on public.rating_history (user_id, format, created_at desc);
create index rating_history_match on public.rating_history (match_id);
-- The "this month" ladder (R-16) reads one month of match rows.
create index rating_history_month on public.rating_history (format, created_at)
  where kind = 'match';

create function private.refuse_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;
create trigger rating_history_append_only
  before update or delete on public.rating_history
  for each row execute function private.refuse_change();
create trigger rating_history_no_truncate
  before truncate on public.rating_history
  for each statement execute function private.refuse_change();

-- The Worker computes Glicko-2 and sends the new values with the version it
-- read. A redelivery is a no-op; a stale version raises 40001 and the Worker
-- recomputes from fresh rows (P1-12: "two matches finishing out of order
-- for one player both apply, each against the then-current rating").
-- p: { matchId, format, modelVersion,
--      players: [{ userId, outcome, abandoned, version, rating, rd, sigma }] }
create function public.apply_rating(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_match uuid := (p ->> 'matchId')::uuid;
  v_format text := p ->> 'format';
  r jsonb;
  cur public.ratings;
begin
  if exists (
    select 1 from public.rating_history
    where match_id = v_match and kind = 'match'
  ) then
    return;
  end if;
  -- Rows are locked in user_id order, so two matches that share a player
  -- and are rated at once wait for each other instead of deadlocking.
  for r in
    select value from jsonb_array_elements(p -> 'players')
    order by value ->> 'userId'
  loop
    insert into public.ratings (user_id, format)
    values ((r ->> 'userId')::uuid, v_format)
    on conflict do nothing;
    select * into cur from public.ratings
    where user_id = (r ->> 'userId')::uuid and format = v_format
    for update;
    if cur.version <> (r ->> 'version')::integer then
      raise exception 'stale rating version for %', cur.user_id
        using errcode = '40001';
    end if;
    insert into public.rating_history (
      user_id, format, kind, match_id, outcome,
      before_rating, before_rd, before_sigma,
      after_rating, after_rd, after_sigma, model_version)
    values (
      cur.user_id, v_format, 'match', v_match, r ->> 'outcome',
      cur.rating, cur.rd, cur.sigma,
      (r ->> 'rating')::float8, (r ->> 'rd')::float8, (r ->> 'sigma')::float8,
      p ->> 'modelVersion');
    update public.ratings
    set rating = (r ->> 'rating')::float8, rd = (r ->> 'rd')::float8,
        sigma = (r ->> 'sigma')::float8, matches = matches + 1,
        wins = wins + (r ->> 'outcome' = 'win')::int,
        draws = draws + (r ->> 'outcome' = 'draw')::int,
        abandoned = abandoned + coalesce((r ->> 'abandoned')::boolean, false)::int,
        last_match_at = now(), version = version + 1, updated_at = now()
    where user_id = cur.user_id and format = v_format;
  end loop;
end $$;

-- ---- P1-09 / P1-10: grades and accuracy -------------------------------------
-- Shipped: hand_grades and record_grades (P1-09, *_hand_grades*.sql), and
-- public.accuracy with private.player_accuracy, private.refresh_accuracy and
-- the finish trigger (P1-10, *_accuracy.sql). Nothing left to propose.

-- ---- P1-17: reports ------------------------------------------------------------
create table public.reports (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches (id),
  -- Set from the caller's token; clients cannot name another reporter.
  reporter_id uuid not null default auth.uid() references public.players (user_id),
  reported_id uuid not null references public.players (user_id),
  reason text not null check (reason in ('cheating', 'payout', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_note text,
  outcome text check (outcome in ('no_action', 'warned', 'sanctioned')),
  unique (match_id, reporter_id),
  check (reporter_id <> reported_id)
);
-- Triage: open reports oldest first; the 7-day SLA is computed from these.
create index reports_open on public.reports (created_at) where reviewed_at is null;
-- The daily cap counts a reporter's last 24 h.
create index reports_reporter_day on public.reports (reporter_id, created_at);
-- Moderation reads every report against a player; also serves the key.
create index reports_reported on public.reports (reported_id, created_at desc);

-- At most 10 reports per reporter per 24 h (P1-17). Invoker rights: the
-- reporter's own rows are visible to them, which is all it counts. The
-- transaction lock per reporter makes two concurrent reports count one
-- after the other; without it both could see 9 and both insert.
create function private.reports_daily_cap() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('reports:' || new.reporter_id::text, 0));
  if (select count(*) from public.reports
      where reporter_id = new.reporter_id
        and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'report limit reached' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger reports_daily_cap before insert on public.reports
  for each row execute function private.reports_daily_cap();

-- ---- P1-18: sanctions ------------------------------------------------------------
create table public.sanctions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.players (user_id),
  kind text not null check (kind in ('flag', 'rating_reset', 'ladder_removal')),
  reason text not null,
  decided_by text not null,
  decided_at timestamptz not null default now(),
  lifted_at timestamptz,
  appeal_text text check (appeal_text is null or char_length(appeal_text) <= 1000),
  appeal_at timestamptz,
  appeal_outcome text check (appeal_outcome in ('upheld', 'overturned'))
);
create index sanctions_user on public.sanctions (user_id, decided_at desc);

-- Service role only (scripts/sanction.mjs). A rating reset restores the
-- provisional default and appends a 'reset' history row; the version bump
-- makes any rating computed before it stale.
-- p: { userId, kind, reason, decidedBy, format }
create function public.apply_sanction(p jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  cur public.ratings;
begin
  insert into public.sanctions (user_id, kind, reason, decided_by)
  values ((p ->> 'userId')::uuid, p ->> 'kind', p ->> 'reason', p ->> 'decidedBy')
  returning id into v_id;
  if p ->> 'kind' = 'rating_reset' then
    select * into cur from public.ratings
    where user_id = (p ->> 'userId')::uuid and format = p ->> 'format'
    for update;
    if found then
      insert into public.rating_history (
        user_id, format, kind, before_rating, before_rd, before_sigma,
        after_rating, after_rd, after_sigma, model_version)
      values (cur.user_id, cur.format, 'reset', cur.rating, cur.rd, cur.sigma,
              1500, 350, 0.06, 'reset');
      update public.ratings
      set rating = 1500, rd = 350, sigma = 0.06,
          version = version + 1, updated_at = now()
      where user_id = cur.user_id and format = cur.format;
    end if;
  end if;
  return v_id;
end $$;

-- One appeal per sanction, by its own player, while it stands. Invoker
-- rights, like every function a browser may call (rls-matrix.test.ts keeps
-- security definers away from browsers): the column grant and the policy
-- under Access decide which row it may touch, and the trigger stamps the
-- time so a client cannot choose it.
create function public.appeal_sanction(p_id bigint, p_text text) returns void
language plpgsql set search_path = '' as $$
begin
  update public.sanctions set appeal_text = p_text where id = p_id;
  if not found then
    raise exception 'no open sanction of yours to appeal' using errcode = '42501';
  end if;
end $$;
create function private.stamp_appeal() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.appeal_at := now();
  return new;
end $$;
create trigger sanctions_appeal_at before update of appeal_text on public.sanctions
  for each row execute function private.stamp_appeal();

-- ---- P1-14 (v1) and P1-18 (v2): ladder ----------------------------------------
-- Shown in its final form, after sanctions exist. P1-14 ships it without
-- the ladder_removal clause; P1-18 replaces both functions to add it.
-- Share of the player's rated matches they abandoned, over the lifetime
-- (R-13). For the profile; the ladder reads the same counters inline.
create function public.abandonment_rate(p_user uuid, p_format text default 'hu-duplicate')
returns real
language sql stable set search_path = '' as $$
  select coalesce((
    select r.abandoned::real / nullif(r.matches, 0)
    from public.ratings r
    where r.user_id = p_user and r.format = p_format), 0)::real
$$;

-- All-time ladder: eligible players by rating, keyset on (rating desc,
-- user_id). Eligible: not provisional (rd < 100 and ≥ 20 matches), a rated
-- match in the last 30 days, abandonment < 10% (exactly 10% is out), and no
-- active ladder removal (P1-18). Trend is the rating change over 30 days,
-- looked up for the page's rows only.
create function public.ladder(
  p_format text, p_after_rating double precision default null,
  p_after_user uuid default null, p_page integer default 50)
returns table (user_id uuid, username text, rating double precision,
               rd double precision, matches integer, wins integer,
               draws integer, accuracy real, trend double precision)
language sql stable set search_path = '' as $$
  select l.*, l.rating - (
      select h.before_rating from public.rating_history h
      where h.user_id = l.user_id and h.format = p_format
        and h.created_at >= now() - interval '30 days'
      order by h.created_at
      limit 1) as trend
  from (
    select r.user_id, p.username, r.rating, r.rd, r.matches, r.wins, r.draws,
           a.accuracy
    from public.ratings r
    join public.players p on p.user_id = r.user_id
    left join public.accuracy a on a.user_id = r.user_id and a.format = r.format
    where r.format = p_format
      and r.rd < 100 and r.matches >= 20
      and r.last_match_at >= now() - interval '30 days'
      and 10 * r.abandoned < r.matches
      and (p_after_rating is null
           or r.rating < p_after_rating
           or (r.rating = p_after_rating and r.user_id > p_after_user))
      and not exists (
        select 1 from public.sanctions s
        where s.user_id = r.user_id and s.kind = 'ladder_removal'
          and s.lifted_at is null)
    order by r.rating desc, r.user_id
    limit least(p_page, 100)
  ) l
  order by l.rating desc, l.user_id
$$;

-- "This month" (R-16): current rating, players with a rated match this UTC
-- month, and matches, wins, draws and trend over the month. Same
-- eligibility and keyset as ladder().
create function public.ladder_month(
  p_format text, p_after_rating double precision default null,
  p_after_user uuid default null, p_page integer default 50,
  p_month date default date_trunc('month', now() at time zone 'utc')::date)
returns table (user_id uuid, username text, rating double precision,
               rd double precision, matches integer, wins integer,
               draws integer, accuracy real, trend double precision)
language sql stable set search_path = '' as $$
  with month as (
    select h.user_id, count(*)::int as matches,
           count(*) filter (where h.outcome = 'win')::int as wins,
           count(*) filter (where h.outcome = 'draw')::int as draws,
           (array_agg(h.after_rating order by h.created_at desc))[1]
             - (array_agg(h.before_rating order by h.created_at))[1] as trend
    from public.rating_history h
    where h.format = p_format and h.kind = 'match'
      and h.created_at >= p_month::timestamp at time zone 'utc'
      and h.created_at < (p_month + interval '1 month')::timestamp at time zone 'utc'
    group by h.user_id)
  select r.user_id, p.username, r.rating, r.rd, mo.matches, mo.wins, mo.draws,
         a.accuracy, mo.trend
  from month mo
  join public.ratings r on r.user_id = mo.user_id and r.format = p_format
  join public.players p on p.user_id = r.user_id
  left join public.accuracy a on a.user_id = r.user_id and a.format = r.format
  where r.rd < 100 and r.matches >= 20
    and r.last_match_at >= now() - interval '30 days'
    and 10 * r.abandoned < r.matches
    and (p_after_rating is null
         or r.rating < p_after_rating
         or (r.rating = p_after_rating and r.user_id > p_after_user))
    and not exists (
      select 1 from public.sanctions s
      where s.user_id = r.user_id and s.kind = 'ladder_removal'
        and s.lifted_at is null)
  order by r.rating desc, r.user_id
  limit least(p_page, 100)
$$;

-- ---- P1-16: external profile views -------------------------------------------
create table public.profile_views (
  user_id uuid not null references public.players (user_id) on delete cascade,
  day date not null,
  views integer not null default 0 check (views >= 0),
  shares integer not null default 0 check (shares >= 0),
  primary key (user_id, day)
);

-- ---- Access: every new table and function ---------------------------------------
-- Same rule as the Phase 0 archive: RLS on and client grants revoked for
-- every table, then reads only where the decisions make the data public.
-- Writes go through service-role functions, except a report.
do $$
declare t text;
begin
  foreach t in array array['ratings', 'rating_history',
                           'reports', 'sanctions', 'profile_views'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  -- Ratings, history (the rating graph) and the ladder are public.
  foreach t in array array['ratings', 'rating_history'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- P1-17: a participant of a finished rated match reports the other player,
-- once; reporters read their own rows, so a reported player never reads
-- reports about them. matches and match_players are public, so the check
-- runs with the reporter's own rights.
grant select on public.reports to authenticated;
grant insert (match_id, reported_id, reason, note) on public.reports to authenticated;
create policy reports_own on public.reports
  for select to authenticated using ((select auth.uid()) = reporter_id);
create policy reports_file on public.reports
  for insert to authenticated
  with check (
    reports.reporter_id = (select auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = reports.match_id and m.kind = 'hu-rated'
        and m.status = 'finished')
    and exists (
      select 1 from public.match_players a
      join public.match_players b on b.match_id = a.match_id
      where a.match_id = reports.match_id and a.user_id = reports.reporter_id
        and b.user_id = reports.reported_id));

-- P1-18: the profile shows "Sanctioned · <kind> · <date>". The reason and
-- the appeal text stay with the service role. A player writes the appeal
-- text of their own standing sanction, once.
grant select (id, user_id, kind, decided_at, lifted_at, appeal_outcome)
  on public.sanctions to anon, authenticated;
create policy public_read on public.sanctions
  for select to anon, authenticated using (true);
grant update (appeal_text) on public.sanctions to authenticated;
create policy sanctions_appeal on public.sanctions
  for update to authenticated
  using ((select auth.uid()) = user_id and appeal_text is null and lifted_at is null)
  with check ((select auth.uid()) = user_id);

-- profile_views: service role only (the Worker counts views and shares).

do $$
declare f text;
begin
  foreach f in array array['public.apply_rating(jsonb)', 'public.apply_sanction(jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
revoke all on function public.appeal_sanction(bigint, text) from public, anon;
grant execute on function public.appeal_sanction(bigint, text) to authenticated;
revoke all on function private.refuse_change() from public, anon, authenticated;
revoke all on function private.reports_daily_cap() from public, anon, authenticated;
revoke all on function private.stamp_appeal() from public, anon, authenticated;
