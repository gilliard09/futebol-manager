-- Neutral venue metadata for continental finals.
alter table public.fixtures
  add column if not exists neutral_venue boolean not null default false;

alter table public.fixtures
  add column if not exists venue_name text;

create index if not exists fixtures_neutral_venue_idx
on public.fixtures (season_id, competition_id, round)
where neutral_venue = true;
