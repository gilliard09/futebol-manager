create table if not exists public.season_club_movements (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  from_division integer not null,
  to_division integer not null,
  movement text not null check (movement in ('promoted','relegated','stayed')),
  created_at timestamptz not null default now(),
  unique (season_id, club_id)
);
create index if not exists season_club_movements_season_idx on public.season_club_movements(season_id);
alter table public.season_club_movements enable row level security;
drop policy if exists "season club movements are public" on public.season_club_movements;
create policy "season club movements are public" on public.season_club_movements for select to anon, authenticated using (true);