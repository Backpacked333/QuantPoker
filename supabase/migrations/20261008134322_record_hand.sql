-- One call per finished hand from the table server, in one transaction, and
-- idempotent on the hand id so outbox retries are safe.
create function public.record_hand(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hand text := p ->> 'id';
  v_match uuid := (p ->> 'matchId')::uuid;
begin
  insert into public.hands (id, match_id, hand_no, segment, button, commitment, leaves, reveal, record)
  values (
    v_hand, v_match, (p ->> 'handNo')::integer, (p ->> 'segment')::smallint,
    (p ->> 'button')::smallint, p ->> 'commitment', decode(p ->> 'leaves', 'base64'),
    p -> 'reveal', p -> 'record')
  on conflict (id) do nothing;
  if not found then
    return;
  end if;

  insert into public.hands_private (hand_id, deck, secret, holes)
  values (
    v_hand,
    array(select jsonb_array_elements_text(p -> 'deck'))::smallint[],
    decode(p ->> 'secret', 'base64'),
    p -> 'holes');

  insert into public.hand_holes (hand_id, user_id, cards)
  select v_hand, (h ->> 'userId')::uuid,
         array(select jsonb_array_elements_text(h -> 'cards'))::smallint[]
  from jsonb_array_elements(p -> 'holesByUser') h;

  update public.match_players mp
  set net_chips = mp.net_chips + n.value::integer
  from jsonb_each_text(p -> 'netByUser') n
  where mp.match_id = v_match and mp.user_id = n.key::uuid;
end $$;

revoke all on function public.record_hand(jsonb) from public, anon, authenticated;
grant execute on function public.record_hand(jsonb) to service_role;
