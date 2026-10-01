grant select, insert, update on public.season_club_movements to anon, authenticated;
drop policy if exists "game can write season club movements" on public.season_club_movements;
create policy "game can write season club movements"
on public.season_club_movements for insert to anon, authenticated with check (movement in ('promoted','relegated','stayed'));
drop policy if exists "game can update season club movements" on public.season_club_movements;
create policy "game can update season club movements"
on public.season_club_movements for update to anon, authenticated
using (true)
with check (movement in ('promoted','relegated','stayed'));
