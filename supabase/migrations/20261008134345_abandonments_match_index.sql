-- Cover the abandonments -> matches foreign key (match deletes and per-match lookups).
create index abandonments_match on public.abandonments (match_id);
