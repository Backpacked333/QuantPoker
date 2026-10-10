-- A school badge from a second email (L-14). The Worker emails a code to the
-- address the player gives, checks it, and calls this function: only then
-- is the school known to be theirs. The school email itself is never stored
-- here. Like the sign-in trigger (20261010110000_landing.sql), a badge once
-- set is never moved.
create function public.set_player_school(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.players
  set school = p ->> 'school', school_domain = p ->> 'domain',
      school_verified_at = (p ->> 'verifiedAt')::timestamptz
  where user_id = (p ->> 'userId')::uuid and school_domain is null;
end $$;
revoke all on function public.set_player_school(jsonb) from public, anon, authenticated;
grant execute on function public.set_player_school(jsonb) to service_role;
