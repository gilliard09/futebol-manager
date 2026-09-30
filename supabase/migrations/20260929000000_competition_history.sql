create table if not exists public.competition_history (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  champion_club_id uuid references public.clubs(id) on delete set null,
  runner_up_club_id uuid references public.clubs(id) on delete set null,
  top_scorer_player_id uuid references public.players(id) on delete set null,
  top_scorer_goals integer not null default 0,
  created_at timestamptz not null default now(),
  unique (season_id, competition_id)
);

create index if not exists competition_history_season_idx
  on public.competition_history (season_id);

create index if not exists competition_history_competition_idx
  on public.competition_history (competition_id);

alter table public.competition_history enable row level security;

drop policy if exists "competition history is public" on public.competition_history;
create policy "competition history is public"
  on public.competition_history
  for select
  to anon, authenticated
  using (true);
