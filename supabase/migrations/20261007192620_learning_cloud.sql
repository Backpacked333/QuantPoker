begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  sound boolean not null default false,
  fast boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.hand_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 120),
  session_id text generated always as (split_part(id, ':', 1)) stored,
  hand_number integer not null check (hand_number > 0),
  net integer not null check (abs(net) <= 1000000),
  result text not null check (char_length(result) <= 1000),
  guided boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index hand_results_recent on public.hand_results(user_id, created_at desc);
create index hand_results_session on public.hand_results(user_id, session_id);

create table public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lens text not null check (lens in ('equity', 'options', 'insurance')),
  completed_at timestamptz not null default now(),
  primary key (user_id, lens)
);

create table public.practice_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  lens text not null check (lens in ('equity', 'options', 'insurance')),
  stage text not null check (stage in ('prediction', 'transfer')),
  answer_id text not null check (char_length(answer_id) between 1 and 80),
  correct boolean not null,
  context jsonb not null check (jsonb_typeof(context) = 'object' and octet_length(context::text) <= 4000),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index practice_attempts_recent on public.practice_attempts(user_id, created_at desc);

create table public.coach_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  text text not null check (char_length(text) between 1 and 12000),
  snapshot_id text not null check (char_length(snapshot_id) <= 1000),
  label text not null check (char_length(label) <= 200),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index coach_messages_recent on public.coach_messages(user_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['profiles', 'hand_results', 'lesson_progress', 'practice_attempts', 'coach_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy own_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy own_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy own_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy own_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

create function public.clear_learning_progress() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from public.hand_results where user_id = auth.uid();
  delete from public.lesson_progress where user_id = auth.uid();
  delete from public.practice_attempts where user_id = auth.uid();
end $$;
revoke all on function public.clear_learning_progress() from public, anon;
grant execute on function public.clear_learning_progress() to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.coach_usage (
  scope text not null,
  window_start timestamptz not null,
  used integer not null default 0,
  primary key (scope, window_start)
);
alter table private.coach_usage enable row level security;

create function public.reserve_coach_request(learner uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  today timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  minute timestamptz := date_trunc('minute', now());
begin
  if not exists (select 1 from auth.users where id = learner and email_confirmed_at is not null and not is_anonymous) then
    return false;
  end if;
  perform pg_advisory_xact_lock(710071930);
  delete from private.coach_usage where window_start < today - interval '2 days';
  insert into private.coach_usage(scope, window_start) values
    ('global', today), ('day:' || learner, today), ('minute:' || learner, minute)
    on conflict do nothing;
  if exists (select 1 from private.coach_usage where
    (scope = 'global' and window_start = today and used >= 100) or
    (scope = 'day:' || learner and window_start = today and used >= 10) or
    (scope = 'minute:' || learner and window_start = minute and used >= 3)) then
    return false;
  end if;
  update private.coach_usage set used = used + 1 where
    (scope = 'global' and window_start = today) or
    (scope = 'day:' || learner and window_start = today) or
    (scope = 'minute:' || learner and window_start = minute);
  return true;
end $$;
revoke all on function public.reserve_coach_request(uuid) from public, anon, authenticated;
grant execute on function public.reserve_coach_request(uuid) to service_role;

commit;
