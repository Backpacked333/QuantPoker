-- Multiplayer identity: one public row per account, created on sign-up.
--
-- This sits beside public.profiles from 20261007192620_learning_cloud, which
-- holds private per-user settings and is readable only by its owner. Players
-- are public (opponents and ladders show usernames), so they get their own
-- table instead of opening profiles up.

create table public.players (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_]{3,20}$')
    check (username not in ('atlas', 'admin', 'quantpoker', 'support', 'system', 'moderator')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  bio text not null default '' check (char_length(bio) <= 280),
  created_at timestamptz not null default now()
);

-- New accounts get a placeholder name; the client asks for a real one.
create function public.handle_new_player() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.players (user_id, username)
  values (new.id, 'player_' || substr(replace(new.id::text, '-', ''), 1, 12))
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_player() from public, anon, authenticated;

create trigger on_auth_user_created_player
  after insert on auth.users
  for each row execute function public.handle_new_player();

-- Accounts that existed before this migration.
insert into public.players (user_id, username)
select id, 'player_' || substr(replace(id::text, '-', ''), 1, 12) from auth.users
on conflict (user_id) do nothing;

alter table public.players enable row level security;
revoke all on public.players from anon, authenticated;
grant select on public.players to anon, authenticated;
-- Only these columns are editable, and only on your own row.
grant update (username, country, bio) on public.players to authenticated;
create policy players_read on public.players
  for select to anon, authenticated using (true);
create policy players_update_own on public.players
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
