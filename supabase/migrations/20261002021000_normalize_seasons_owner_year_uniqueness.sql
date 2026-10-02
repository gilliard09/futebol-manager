drop index if exists public.seasons_owner_year_key;

alter table public.seasons
  add constraint seasons_owner_year_key unique (owner_id, year);
