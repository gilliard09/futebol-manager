alter table public.players
  add column if not exists injured_until date,
  add column if not exists suspended_until date,
  add column if not exists yellow_cards integer not null default 0,
  add column if not exists red_cards integer not null default 0;

update public.players
set yellow_cards = coalesce(yellow_cards, 0),
    red_cards = coalesce(red_cards, 0);