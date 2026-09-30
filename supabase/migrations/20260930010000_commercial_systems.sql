create table if not exists public.club_commercial_seasons (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.seasons(id) on delete cascade,
 club_id uuid not null references public.clubs(id) on delete cascade,
 sponsor_id text not null,
 sponsor_name text not null,
 sponsor_upfront bigint not null default 0,
 sponsor_monthly bigint not null default 0,
 sponsor_objective text not null,
 sponsor_target integer not null default 0,
 sponsor_progress integer not null default 0,
 stadium_name text not null,
 stadium_capacity integer not null default 12000,
 stadium_level integer not null default 1,
 stadium_ticket_price integer not null default 35,
 stadium_maintenance bigint not null default 15000,
 updated_at timestamptz not null default now(),
 unique(season_id, club_id)
);
create index if not exists club_commercial_seasons_season_idx on public.club_commercial_seasons(season_id);
create index if not exists club_commercial_seasons_club_idx on public.club_commercial_seasons(club_id);
alter table public.club_commercial_seasons enable row level security;
drop policy if exists "club commercial public read" on public.club_commercial_seasons;
create policy "club commercial public read" on public.club_commercial_seasons for select to anon, authenticated using (true);
