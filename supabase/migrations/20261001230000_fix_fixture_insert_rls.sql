drop policy if exists "authenticated can create own scheduled fixtures" on public.fixtures;
drop policy if exists "authenticated can create own completed fixtures" on public.fixtures;

create policy "authenticated can create own scheduled fixtures"
on public.fixtures
for insert
to authenticated
with check (
  exists (
    select 1
    from public.seasons s
    where s.id = season_id
      and s.owner_id = (select auth.uid())
  )
  and status = 'scheduled'
  and home_score is null
  and away_score is null
  and home_club_id <> away_club_id
);

create policy "authenticated can create own completed fixtures"
on public.fixtures
for insert
to authenticated
with check (
  exists (
    select 1
    from public.seasons s
    where s.id = season_id
      and s.owner_id = (select auth.uid())
  )
  and status = 'completed'
  and home_score is not null
  and away_score is not null
  and home_score >= 0
  and away_score >= 0
  and home_score <= 20
  and away_score <= 20
  and winner_club_id is not null
  and home_club_id <> away_club_id
);
