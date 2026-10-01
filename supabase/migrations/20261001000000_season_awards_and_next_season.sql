create table if not exists public.season_awards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  award_type text not null,
  club_id uuid references public.clubs(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  value numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (season_id, award_type)
);

create index if not exists season_awards_season_idx
  on public.season_awards(season_id);

alter table public.season_awards enable row level security;

drop policy if exists "season awards are public" on public.season_awards;
create policy "season awards are public"
  on public.season_awards for select
  to anon, authenticated
  using (true);

drop policy if exists "authenticated can write season awards" on public.season_awards;
create policy "authenticated can write season awards"
  on public.season_awards for insert
  to authenticated
  with check (true);

drop policy if exists "authenticated can update season awards" on public.season_awards;
create policy "authenticated can update season awards"
  on public.season_awards for update
  to authenticated
  using (true)
  with check (true);

grant select on public.season_awards to anon, authenticated;
grant insert, update on public.season_awards to authenticated;

-- A carreira precisa conseguir abrir a próxima temporada no mesmo mundo compartilhado.
drop policy if exists "authenticated can create seasons" on public.seasons;
create policy "authenticated can create seasons"
  on public.seasons for insert
  to authenticated
  with check (status = 'active' and end_date is null);

grant insert on public.seasons to authenticated;
