create table if not exists public.club_management_seasons (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  manager_status text not null default 'active' check (manager_status in ('active','dismissed','contract_ended','renewed')),
  objective text not null,
  objective_label text not null,
  expectation integer not null default 50 check (expectation between 0 and 100),
  confidence integer not null default 62 check (confidence between 0 and 100),
  satisfaction integer not null default 55 check (satisfaction between 0 and 100),
  fan_expectation integer not null default 55 check (fan_expectation between 0 and 100),
  fan_pressure integer not null default 45 check (fan_pressure between 0 and 100),
  contract_end_season text not null,
  renewal_offered boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (season_id, club_id)
);

create index if not exists club_management_seasons_season_idx on public.club_management_seasons(season_id);
create index if not exists club_management_seasons_club_idx on public.club_management_seasons(club_id);

alter table public.club_management_seasons enable row level security;

drop policy if exists "club management is public" on public.club_management_seasons;
create policy "club management is public"
  on public.club_management_seasons
  for select
  to anon, authenticated
  using (true);
