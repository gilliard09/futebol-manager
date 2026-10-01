alter table public.seasons add column if not exists owner_id uuid references auth.users(id);
alter table public.seasons alter column owner_id set default auth.uid();
alter table public.seasons drop constraint if exists seasons_year_key;

create unique index if not exists seasons_owner_year_key
  on public.seasons(owner_id, year)
  where owner_id is not null;

create unique index if not exists seasons_global_year_key
  on public.seasons(year)
  where owner_id is null;

drop policy if exists "authenticated can create seasons" on public.seasons;
create policy "authenticated can create own seasons"
  on public.seasons for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'active'
    and end_date is null
  );

drop policy if exists "season can be finalized or reset" on public.seasons;
create policy "season owner can be finalized or reset"
  on public.seasons for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "season owner can delete" on public.seasons;
create policy "season owner can delete"
  on public.seasons for delete
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "authenticated can create own competition teams" on public.competition_teams;
create policy "authenticated can create own competition teams"
  on public.competition_teams for insert
  to authenticated
  with check (
    exists (
      select 1 from public.seasons s
      where s.id = competition_teams.season_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "public can schedule Copa progression" on public.fixtures;
drop policy if exists "public can reset completed fixtures" on public.fixtures;
drop policy if exists "public can complete scheduled fixtures" on public.fixtures;
drop policy if exists "owners can complete scheduled fixtures" on public.fixtures;

drop policy if exists "authenticated can create own scheduled fixtures" on public.fixtures;
create policy "authenticated can create own scheduled fixtures"
  on public.fixtures for insert
  to authenticated
  with check (
    exists (
      select 1 from public.seasons s
      where s.id = fixtures.season_id
        and s.owner_id = (select auth.uid())
    )
    and status = 'scheduled'
    and home_score is null
    and away_score is null
    and home_club_id <> away_club_id
  );

create policy "owners can complete scheduled fixtures"
  on public.fixtures for update
  to authenticated
  using (
    exists (
      select 1 from public.seasons s
      where s.id = fixtures.season_id
        and (s.owner_id = (select auth.uid()) or s.owner_id is null)
    )
    and status = 'scheduled'
  )
  with check (
    exists (
      select 1 from public.seasons s
      where s.id = fixtures.season_id
        and (s.owner_id = (select auth.uid()) or s.owner_id is null)
    )
    and status = 'completed'
    and home_score is not null
    and away_score is not null
    and home_score >= 0 and away_score >= 0
    and home_score <= 20 and away_score <= 20
  );

drop policy if exists "owners can reset own completed fixtures" on public.fixtures;
create policy "owners can reset own completed fixtures"
  on public.fixtures for update
  to authenticated
  using (
    exists (
      select 1 from public.seasons s
      where s.id = fixtures.season_id
        and s.owner_id = (select auth.uid())
    )
    and status = 'completed'
  )
  with check (
    exists (
      select 1 from public.seasons s
      where s.id = fixtures.season_id
        and s.owner_id = (select auth.uid())
    )
    and status = 'scheduled'
    and home_score is null
    and away_score is null
    and winner_club_id is null
  );

drop policy if exists "owners can delete own fixtures" on public.fixtures;
create policy "owners can delete own fixtures"
  on public.fixtures for delete
  to authenticated
  using (
    exists (
      select 1 from public.seasons s
      where s.id = fixtures.season_id
        and s.owner_id = (select auth.uid())
    )
  );
