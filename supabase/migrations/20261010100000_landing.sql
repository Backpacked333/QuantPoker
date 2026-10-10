-- The landing page and onboarding (architect: landing-and-onboarding §6).
--
-- 1. School badges. A confirmed email at a school's domain (or any subdomain
--    of it) sets players.school; so does any confirmed .edu or .ac.uk email,
--    shown by its domain when the school is not in our list. Only this
--    trigger writes the badge: players may still edit just username,
--    country and bio (20261008133809_players.sql). The list is ours, written
--    for the audience; it is facts, not a copied dataset.
-- 2. Challenge scores. The Worker's ScoreDO re-scores every landing-page
--    challenge and, once a player claims a score after signing up, sends it
--    here through its outbox. Each player keeps their best score per hand.

create table public.school_domains (
  domain text primary key check (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  school text not null check (char_length(school) between 2 and 80),
  country text not null check (country ~ '^[A-Z]{2}$')
);
alter table public.school_domains enable row level security;
revoke all on public.school_domains from anon, authenticated;
grant select on public.school_domains to anon, authenticated;
create policy school_domains_read on public.school_domains
  for select to anon, authenticated using (true);

insert into public.school_domains (domain, school, country) values
  ('harvard.edu', 'Harvard', 'US'),
  ('yale.edu', 'Yale', 'US'),
  ('princeton.edu', 'Princeton', 'US'),
  ('columbia.edu', 'Columbia', 'US'),
  ('barnard.edu', 'Barnard', 'US'),
  ('upenn.edu', 'Penn', 'US'),
  ('brown.edu', 'Brown', 'US'),
  ('cornell.edu', 'Cornell', 'US'),
  ('dartmouth.edu', 'Dartmouth', 'US'),
  ('mit.edu', 'MIT', 'US'),
  ('stanford.edu', 'Stanford', 'US'),
  ('caltech.edu', 'Caltech', 'US'),
  ('uchicago.edu', 'UChicago', 'US'),
  ('northwestern.edu', 'Northwestern', 'US'),
  ('duke.edu', 'Duke', 'US'),
  ('cmu.edu', 'Carnegie Mellon', 'US'),
  ('berkeley.edu', 'UC Berkeley', 'US'),
  ('ucla.edu', 'UCLA', 'US'),
  ('ucsd.edu', 'UC San Diego', 'US'),
  ('umich.edu', 'Michigan', 'US'),
  ('nyu.edu', 'NYU', 'US'),
  ('gatech.edu', 'Georgia Tech', 'US'),
  ('illinois.edu', 'UIUC', 'US'),
  ('utexas.edu', 'UT Austin', 'US'),
  ('wisc.edu', 'Wisconsin', 'US'),
  ('rice.edu', 'Rice', 'US'),
  ('jhu.edu', 'Johns Hopkins', 'US'),
  ('wustl.edu', 'WashU', 'US'),
  ('vanderbilt.edu', 'Vanderbilt', 'US'),
  ('nd.edu', 'Notre Dame', 'US'),
  ('georgetown.edu', 'Georgetown', 'US'),
  ('emory.edu', 'Emory', 'US'),
  ('virginia.edu', 'UVA', 'US'),
  ('unc.edu', 'UNC', 'US'),
  ('usc.edu', 'USC', 'US'),
  ('bc.edu', 'Boston College', 'US'),
  ('bu.edu', 'Boston University', 'US'),
  ('tufts.edu', 'Tufts', 'US'),
  ('williams.edu', 'Williams', 'US'),
  ('amherst.edu', 'Amherst', 'US'),
  ('swarthmore.edu', 'Swarthmore', 'US'),
  ('hmc.edu', 'Harvey Mudd', 'US'),
  ('pomona.edu', 'Pomona', 'US'),
  ('purdue.edu', 'Purdue', 'US'),
  ('uw.edu', 'University of Washington', 'US'),
  ('washington.edu', 'University of Washington', 'US'),
  ('umd.edu', 'Maryland', 'US'),
  ('umn.edu', 'Minnesota', 'US'),
  ('psu.edu', 'Penn State', 'US'),
  ('osu.edu', 'Ohio State', 'US'),
  ('baruch.cuny.edu', 'Baruch', 'US'),
  ('exeter.edu', 'Phillips Exeter', 'US'),
  ('andover.edu', 'Phillips Andover', 'US'),
  ('choate.edu', 'Choate', 'US'),
  ('deerfield.edu', 'Deerfield', 'US'),
  ('ox.ac.uk', 'Oxford', 'GB'),
  ('cam.ac.uk', 'Cambridge', 'GB'),
  ('imperial.ac.uk', 'Imperial', 'GB'),
  ('lse.ac.uk', 'LSE', 'GB'),
  ('ucl.ac.uk', 'UCL', 'GB'),
  ('kcl.ac.uk', 'King''s College London', 'GB'),
  ('warwick.ac.uk', 'Warwick', 'GB'),
  ('ed.ac.uk', 'Edinburgh', 'GB'),
  ('uwaterloo.ca', 'Waterloo', 'CA'),
  ('utoronto.ca', 'Toronto', 'CA'),
  ('mcgill.ca', 'McGill', 'CA'),
  ('ubc.ca', 'UBC', 'CA'),
  ('ethz.ch', 'ETH Zurich', 'CH'),
  ('epfl.ch', 'EPFL', 'CH'),
  ('polytechnique.edu', 'École Polytechnique', 'FR'),
  ('hec.edu', 'HEC Paris', 'FR'),
  ('unibocconi.it', 'Bocconi', 'IT'),
  ('nus.edu.sg', 'NUS', 'SG'),
  ('u.nus.edu', 'NUS', 'SG'),
  ('ntu.edu.sg', 'NTU Singapore', 'SG'),
  ('ust.hk', 'HKUST', 'HK'),
  ('hku.hk', 'HKU', 'HK'),
  ('tsinghua.edu.cn', 'Tsinghua', 'CN'),
  ('pku.edu.cn', 'Peking University', 'CN'),
  ('iitb.ac.in', 'IIT Bombay', 'IN'),
  ('iitd.ac.in', 'IIT Delhi', 'IN'),
  ('technion.ac.il', 'Technion', 'IL'),
  ('tau.ac.il', 'Tel Aviv University', 'IL'),
  ('anu.edu.au', 'ANU', 'AU'),
  ('unimelb.edu.au', 'Melbourne', 'AU'),
  ('sydney.edu.au', 'Sydney', 'AU');

alter table public.players
  add column school text check (school is null or char_length(school) <= 80),
  add column school_domain text,
  add column school_verified_at timestamptz,
  add constraint players_school_together check (
    (school is null) = (school_domain is null)
    and (school is null) = (school_verified_at is null));

-- The school for an email address: the listed domain that is the address's
-- domain or its nearest parent; else a bare .edu or .ac.uk domain, shown as
-- itself. Null when it is neither.
create function private.school_for(p_email text)
returns table (domain text, school text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_domain text := lower(split_part(coalesce(p_email, ''), '@', 2));
  v_labels text[];
  v_try text;
begin
  if v_domain !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then
    return;
  end if;
  v_labels := string_to_array(v_domain, '.');
  for i in 1 .. array_length(v_labels, 1) - 1 loop
    v_try := array_to_string(v_labels[i:], '.');
    return query
      select d.domain, d.school from public.school_domains d where d.domain = v_try;
    if found then
      return;
    end if;
  end loop;
  -- Unlisted: the registrable domain of a .edu or .ac.uk address.
  if v_domain ~ '(^|\.)[a-z0-9-]+\.edu$' then
    v_try := substring(v_domain from '([a-z0-9-]+\.edu)$');
  elsif v_domain ~ '(^|\.)[a-z0-9-]+\.ac\.uk$' then
    v_try := substring(v_domain from '([a-z0-9-]+\.ac\.uk)$');
  else
    return;
  end if;
  domain := v_try;
  school := v_try;
  return next;
end $$;
revoke all on function private.school_for(text) from public, anon, authenticated;

-- Sets the badge from a confirmed email, once: a later email change never
-- moves or clears it. Runs after on_auth_user_created_player (triggers on
-- the same event fire in name order), so the player row exists.
create function private.set_player_school() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  if new.email_confirmed_at is null or new.email is null then
    return null;
  end if;
  select * into v from private.school_for(new.email);
  if v.domain is null then
    return null;
  end if;
  update public.players
  set school = v.school, school_domain = v.domain,
      school_verified_at = new.email_confirmed_at
  where user_id = new.id and school_domain is null;
  return null;
end $$;
revoke all on function private.set_player_school() from public, anon, authenticated;

create trigger on_auth_user_school
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function private.set_player_school();

-- Accounts confirmed before this migration.
update public.players p
set school = s.school, school_domain = s.domain,
    school_verified_at = u.email_confirmed_at
from auth.users u
cross join lateral private.school_for(u.email) s
where u.id = p.user_id and u.email_confirmed_at is not null
  and p.school_domain is null and s.domain is not null;

create table public.challenge_scores (
  user_id uuid not null references public.players (user_id) on delete cascade,
  hand text not null check (hand ~ '^[a-z0-9-]{1,32}$'),
  ver integer not null check (ver > 0),
  accuracy smallint not null check (accuracy between 0 and 100),
  receipt text not null unique check (receipt ~ '^[0-9a-f]{32}$'),
  played_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, hand, ver)
);
alter table public.challenge_scores enable row level security;
revoke all on public.challenge_scores from anon, authenticated;
grant select on public.challenge_scores to authenticated;
-- A player reads their own scores; profiles may publish them later.
create policy challenge_scores_own on public.challenge_scores
  for select to authenticated using ((select auth.uid()) = user_id);

-- Records a claimed score (ScoreDO's outbox). Idempotent on the receipt;
-- keeps the better score when a player claims the same hand twice.
create function public.record_challenge_claim(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.challenge_scores (user_id, hand, ver, accuracy, receipt, played_at)
  values (
    (p ->> 'userId')::uuid, p ->> 'hand', (p ->> 'ver')::integer,
    (p ->> 'accuracy')::smallint, p ->> 'receipt', (p ->> 'playedAt')::timestamptz)
  on conflict (user_id, hand, ver) do update
    set accuracy = excluded.accuracy, receipt = excluded.receipt,
        played_at = excluded.played_at
    where excluded.accuracy > public.challenge_scores.accuracy;
exception when unique_violation then
  -- The same receipt again (a retried call): already recorded.
  null;
end $$;
revoke all on function public.record_challenge_claim(jsonb) from public, anon, authenticated;
grant execute on function public.record_challenge_claim(jsonb) to service_role;
