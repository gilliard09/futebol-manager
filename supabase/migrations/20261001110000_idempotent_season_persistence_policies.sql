-- Idempotent repair for season persistence policies.
-- Run this after the earlier season/player-stat persistence migration.

drop policy if exists "anyone can read player season stats" on public.player_season_stats;
drop policy if exists "game can insert player season stats" on public.player_season_stats;
drop policy if exists "game can update player season stats" on public.player_season_stats;

create policy "anyone can read player season stats"
  on public.player_season_stats
  for select
  to anon, authenticated
  using (true);

create policy "game can insert player season stats"
  on public.player_season_stats
  for insert
  to anon, authenticated
  with check (true);

create policy "game can update player season stats"
  on public.player_season_stats
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "season can be finalized or reset" on public.seasons;

create policy "season can be finalized or reset"
  on public.seasons
  for update
  to anon, authenticated
  using (status in ('active', 'completed'))
  with check (
    (status = 'completed' and end_date is not null)
    or
    (status = 'active' and end_date is null)
  );

grant select, insert, update, delete
  on public.player_season_stats
  to anon, authenticated, service_role;
