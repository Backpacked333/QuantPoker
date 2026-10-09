-- The archive of finished play. The table server (a Durable Object) is the
-- only writer, through the service role; nothing about a live hand is stored
-- here. Public rows never contain the deck or unshown hole cards.

create table public.matches (
  id uuid primary key,
  kind text not null default 'hu-casual' check (kind in ('hu-casual')),
  status text not null default 'playing' check (status in ('playing', 'finished', 'void')),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index matches_recent on public.matches (created_at desc);

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.players (user_id),
  seat smallint not null check (seat between 0 and 5),
  net_chips integer not null default 0,
  timeouts smallint not null default 0 check (timeouts >= 0),
  abandoned boolean not null default false,
  primary key (match_id, seat),
  unique (match_id, user_id)
);
create index match_players_user on public.match_players (user_id, match_id);

create table public.hands (
  id text primary key check (id ~ '^[0-9a-f-]{36}:[0-9]+$'), -- '<matchId>:<handNo>'
  match_id uuid not null references public.matches (id) on delete cascade,
  hand_no integer not null check (hand_no > 0),
  segment smallint not null default 1 check (segment > 0),
  button smallint not null check (button between 0 and 5),
  commitment text not null check (commitment ~ '^[0-9a-f]{64}$'),
  leaves bytea not null check (octet_length(leaves) = 52 * 32),
  reveal jsonb not null check (jsonb_typeof(reveal) = 'array'),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (match_id, hand_no)
);

-- Everything a hand needs to be audited, including folded cards. Service
-- role only: RLS on with no policies, and no grants to clients.
create table public.hands_private (
  hand_id text primary key references public.hands (id) on delete cascade,
  deck smallint[] not null check (cardinality(deck) = 52),
  secret bytea not null check (octet_length(secret) = 32),
  holes jsonb not null check (jsonb_typeof(holes) = 'object')
);

-- Each player can always see their own hole cards, folded or not.
create table public.hand_holes (
  hand_id text not null references public.hands (id) on delete cascade,
  user_id uuid not null references public.players (user_id),
  cards smallint[] not null check (cardinality(cards) = 2),
  primary key (hand_id, user_id)
);
create index hand_holes_user on public.hand_holes (user_id);

create table public.abandonments (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.players (user_id),
  match_id uuid references public.matches (id) on delete set null,
  hand_no integer,
  kind text not null check (kind in ('timeout_x3', 'no_show', 'leave_mid_hand')),
  at timestamptz not null default now()
);
create index abandonments_user on public.abandonments (user_id, at desc);

create table public.incidents (
  id bigint generated always as identity primary key,
  match_id uuid,
  hand_no integer,
  kind text not null check (char_length(kind) between 1 and 80),
  detail jsonb not null,
  at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['matches', 'match_players', 'hands', 'hands_private',
                           'hand_holes', 'abandonments', 'incidents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  -- Public history: matches, seats, hands and abandonment counts.
  foreach t in array array['matches', 'match_players', 'hands', 'abandonments'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

grant select on public.hand_holes to authenticated;
create policy hand_holes_own on public.hand_holes
  for select to authenticated using ((select auth.uid()) = user_id);
