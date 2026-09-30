create table if not exists public.world_baseline_clubs as
select id, budget, reputation, strength from public.clubs with no data;

create table if not exists public.world_baseline_players as
select p.id,p.first_name,p.last_name,p.age,p.nationality,p.position,p.pace,p.shooting,p.passing,p.dribbling,p.defending,p.physical,p.goalkeeping,p.mental,p.potential,p.form,p.morale
from public.players p with no data;

create table if not exists public.world_baseline_squads as
select cp.id as club_player_id,cp.club_id,cp.player_id,cp.squad_number,cp.contract_until,cp.salary,cp.market_value
from public.club_players cp with no data;

delete from public.world_baseline_clubs;
insert into public.world_baseline_clubs select id,budget,reputation,strength from public.clubs;

delete from public.world_baseline_players;
insert into public.world_baseline_players select p.id,p.first_name,p.last_name,p.age,p.nationality,p.position,p.pace,p.shooting,p.passing,p.dribbling,p.defending,p.physical,p.goalkeeping,p.mental,p.potential,p.form,p.morale from public.players p;

delete from public.world_baseline_squads;
insert into public.world_baseline_squads select cp.id,cp.club_id,cp.player_id,cp.squad_number,cp.contract_until,cp.salary,cp.market_value from public.club_players cp;

alter table public.world_baseline_clubs enable row level security;
alter table public.world_baseline_players enable row level security;
alter table public.world_baseline_squads enable row level security;

grant select on public.world_baseline_clubs,public.world_baseline_players,public.world_baseline_squads to anon,authenticated;

drop policy if exists "read world baseline clubs" on public.world_baseline_clubs;
create policy "read world baseline clubs" on public.world_baseline_clubs for select to anon,authenticated using (true);
drop policy if exists "read world baseline players" on public.world_baseline_players;
create policy "read world baseline players" on public.world_baseline_players for select to anon,authenticated using (true);
drop policy if exists "read world baseline squads" on public.world_baseline_squads;
create policy "read world baseline squads" on public.world_baseline_squads for select to anon,authenticated using (true);

create or replace function public.reset_world_state()
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.club_players;
  insert into public.club_players(id,club_id,player_id,squad_number,contract_until,salary,market_value,joined_at)
  select club_player_id,club_id,player_id,squad_number,contract_until,salary,market_value,now() from public.world_baseline_squads;
  update public.players p set first_name=b.first_name,last_name=b.last_name,age=b.age,nationality=b.nationality,position=b.position,pace=b.pace,shooting=b.shooting,passing=b.passing,dribbling=b.dribbling,defending=b.defending,physical=b.physical,goalkeeping=b.goalkeeping,mental=b.mental,potential=b.potential,form=b.form,morale=b.morale,updated_at=now()
  from public.world_baseline_players b where b.id=p.id;
  update public.clubs c set budget=b.budget,reputation=b.reputation,strength=b.strength from public.world_baseline_clubs b where b.id=c.id;
end;
$$;

revoke all on function public.reset_world_state() from public;
grant execute on function public.reset_world_state() to anon,authenticated;
