-- Ownership and RLS for per-user career management/commercial state.
-- The world itself remains shared; career state is isolated by auth.uid().

alter table public.club_management_seasons
  add column if not exists owner_id uuid references auth.users(id) on delete cascade default auth.uid();

alter table public.club_commercial_seasons
  add column if not exists owner_id uuid references auth.users(id) on delete cascade default auth.uid();

alter table public.club_management_seasons
  drop constraint if exists club_management_seasons_season_id_club_id_key;

alter table public.club_commercial_seasons
  drop constraint if exists club_commercial_seasons_season_id_club_id_key;

create unique index if not exists club_management_seasons_owner_unique
  on public.club_management_seasons(season_id, club_id, owner_id)
  where owner_id is not null;

create unique index if not exists club_commercial_seasons_owner_unique
  on public.club_commercial_seasons(season_id, club_id, owner_id)
  where owner_id is not null;

drop policy if exists "club management is public" on public.club_management_seasons;
drop policy if exists "club management public insert" on public.club_management_seasons;
drop policy if exists "club management public update" on public.club_management_seasons;
drop policy if exists "club commercial public read" on public.club_commercial_seasons;
drop policy if exists "club commercial public insert" on public.club_commercial_seasons;
drop policy if exists "club commercial public update" on public.club_commercial_seasons;

create policy "club management own select"
  on public.club_management_seasons for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "club management own insert"
  on public.club_management_seasons for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "club management own update"
  on public.club_management_seasons for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "club commercial own select"
  on public.club_commercial_seasons for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "club commercial own insert"
  on public.club_commercial_seasons for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "club commercial own update"
  on public.club_commercial_seasons for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

revoke all on table public.club_management_seasons from anon, authenticated;
revoke all on table public.club_commercial_seasons from anon, authenticated;
grant select, insert, update on table public.club_management_seasons to authenticated;
grant select, insert, update on table public.club_commercial_seasons to authenticated;

create index if not exists club_management_seasons_owner_idx
  on public.club_management_seasons(owner_id);

create index if not exists club_commercial_seasons_owner_idx
  on public.club_commercial_seasons(owner_id);

-- This RPC mutates the shared football world and must never be callable by a browser.
revoke execute on function public.reset_world_state() from public;
revoke execute on function public.reset_world_state() from anon;
revoke execute on function public.reset_world_state() from authenticated;
