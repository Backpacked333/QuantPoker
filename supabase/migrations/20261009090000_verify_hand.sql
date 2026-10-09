-- Step 7: every archived hand is re-verified off the game path. The Worker's
-- queue consumer reads a hand with audit_hand, replays it from the full deck,
-- and records the verdict with verify_hand or record_incident. Queue
-- messages may be redelivered or arrive out of order, so every call is
-- idempotent. All three are for the service role only, and run with its
-- rights (security invoker): none of them needs more.

-- One incident per hand and kind: a redelivered message, a retried outbox
-- call or a second DLQ pass writes nothing new.
alter table public.incidents
  add constraint incidents_once unique nulls not distinct (match_id, hand_no, kind);

-- Everything the verifier needs, base64 like the archive payload; null when
-- the hand is not archived (yet).
create function public.audit_hand(p jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', h.id,
    'matchId', h.match_id,
    'handNo', h.hand_no,
    'commitment', h.commitment,
    'leaves', translate(encode(h.leaves, 'base64'), E'\n', ''),
    'reveal', h.reveal,
    'record', h.record,
    'verified', h.verified,
    'deck', to_jsonb(hp.deck),
    'secret', translate(encode(hp.secret, 'base64'), E'\n', ''),
    'holes', hp.holes)
  from public.hands h
  join public.hands_private hp on hp.hand_id = h.id
  where h.id = p ->> 'id'
$$;

create function public.verify_hand(p jsonb) returns void
language sql set search_path = '' as $$
  update public.hands set verified = true
  where id = p ->> 'id' and not verified
$$;

create function public.record_incident(p jsonb) returns void
language sql set search_path = '' as $$
  insert into public.incidents (match_id, hand_no, kind, detail)
  values (
    (p ->> 'matchId')::uuid,
    (p ->> 'handNo')::integer,
    p ->> 'kind',
    coalesce(p -> 'detail', '{}'::jsonb))
  on conflict on constraint incidents_once do nothing
$$;

revoke all on function public.audit_hand(jsonb) from public, anon, authenticated;
revoke all on function public.verify_hand(jsonb) from public, anon, authenticated;
revoke all on function public.record_incident(jsonb) from public, anon, authenticated;
grant execute on function public.audit_hand(jsonb) to service_role;
grant execute on function public.verify_hand(jsonb) to service_role;
grant execute on function public.record_incident(jsonb) to service_role;
