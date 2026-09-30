alter table public.clubs
  add column if not exists strength integer not null default 60;

alter table public.clubs
  drop constraint if exists clubs_strength_check;

alter table public.clubs
  add constraint clubs_strength_check check (strength between 1 and 99);

create table if not exists public.world_transfers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  transfer_date date not null,
  player_id uuid not null references public.players(id),
  from_club_id uuid not null references public.clubs(id),
  to_club_id uuid not null references public.clubs(id),
  fee numeric not null default 0 check (fee >= 0),
  reason text not null default 'ai_market',
  created_at timestamptz not null default now(),
  unique (season_id, player_id, transfer_date)
);

alter table public.world_transfers enable row level security;
grant select, insert on public.world_transfers to anon, authenticated;

drop policy if exists "anyone can read world transfers" on public.world_transfers;
create policy "anyone can read world transfers"
on public.world_transfers for select to anon, authenticated using (true);

drop policy if exists "game can record world transfers" on public.world_transfers;
create policy "game can record world transfers"
on public.world_transfers for insert to anon, authenticated with check (true);

grant select, update on public.clubs to anon, authenticated;
grant select, update, insert, delete on public.club_players to anon, authenticated;
grant select, update on public.players to anon, authenticated;

drop policy if exists "game can update clubs" on public.clubs;
create policy "game can update clubs"
on public.clubs for update to anon, authenticated
using (true)
with check (strength between 1 and 99 and budget >= 0 and reputation between 1 and 100);

drop policy if exists "game can update club_players" on public.club_players;
create policy "game can update club_players"
on public.club_players for update to anon, authenticated
using (true)
with check (salary >= 0 and market_value >= 0);

drop policy if exists "game can insert club_players" on public.club_players;
create policy "game can insert club_players"
on public.club_players for insert to anon, authenticated
with check (salary >= 0 and market_value >= 0);

drop policy if exists "game can delete club_players" on public.club_players;
create policy "game can delete club_players"
on public.club_players for delete to anon, authenticated using (true);

drop policy if exists "game can update players" on public.players;
create policy "game can update players"
on public.players for update to anon, authenticated
using (true)
with check (
  age between 15 and 60
  and pace between 1 and 99
  and shooting between 1 and 99
  and passing between 1 and 99
  and dribbling between 1 and 99
  and defending between 1 and 99
  and physical between 1 and 99
  and goalkeeping between 1 and 99
  and mental between 1 and 99
  and potential between 1 and 99
  and form between 1 and 100
  and morale between 1 and 100
);

update public.clubs c
set strength = greatest(1, least(99, coalesce((
  select round(avg(
    case when p.position = 'GK' then p.goalkeeping
      else (p.pace + p.shooting + p.passing + p.dribbling + p.defending + p.physical + p.mental) / 7.0
    end
  ))
  from public.club_players cp
  join public.players p on p.id = cp.player_id
  where cp.club_id = c.id
), c.reputation)));
