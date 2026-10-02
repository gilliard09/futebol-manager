create schema if not exists private;

create or replace function private.user_owns_season(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seasons
    where id = p_season_id
      and owner_id = (select auth.uid())
  );
$$;

revoke all on function private.user_owns_season(uuid) from public;
grant execute on function private.user_owns_season(uuid) to authenticated;

drop policy if exists "authenticated can create own scheduled fixtures" on public.fixtures;

create policy "authenticated can create own scheduled fixtures"
on public.fixtures
for insert
to authenticated
with check (
  (select private.user_owns_season(season_id))
  and status = 'scheduled'
  and home_score is null
  and away_score is null
  and home_club_id <> away_club_id
);
