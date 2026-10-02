create table if not exists public.player_competition_stats (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  appearances integer not null default 0 check (appearances >= 0),
  starts integer not null default 0 check (starts >= 0),
  minutes integer not null default 0 check (minutes >= 0),
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  avg_rating numeric(4,2) not null default 0 check (avg_rating >= 0 and avg_rating <= 10),
  updated_at timestamptz not null default now(),
  unique (season_id, competition_id, player_id)
);

alter table public.player_competition_stats enable row level security;

create policy "anyone can read player competition stats"
  on public.player_competition_stats for select
  to anon, authenticated
  using (true);

create policy "game can insert player competition stats"
  on public.player_competition_stats for insert
  to anon, authenticated
  with check (true);

create policy "game can update player competition stats"
  on public.player_competition_stats for update
  to anon, authenticated
  using (true)
  with check (true);

create index if not exists player_competition_stats_lookup_idx
  on public.player_competition_stats (season_id, competition_id);

create index if not exists player_competition_stats_player_idx
  on public.player_competition_stats (player_id);

grant select, insert, update, delete
  on public.player_competition_stats
  to anon, authenticated, service_role;
