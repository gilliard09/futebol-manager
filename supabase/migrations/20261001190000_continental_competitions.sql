create table if not exists public.competition_rules (
  competition_id uuid primary key references public.competitions(id) on delete cascade,
  format jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.competition_qualifiers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  source_competition_id uuid references public.competitions(id) on delete set null,
  source_position integer,
  qualification_type text not null,
  target_stage text not null,
  slot_order integer,
  status text not null default 'qualified',
  notes text,
  created_at timestamptz not null default now(),
  unique(season_id, competition_id, club_id, qualification_type)
);

create table if not exists public.competition_groups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  stage text not null,
  group_code text not null,
  created_at timestamptz not null default now(),
  unique(season_id, competition_id, stage, group_code)
);

create table if not exists public.competition_group_teams (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.competition_groups(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  seed integer,
  created_at timestamptz not null default now(),
  unique(group_id, club_id)
);

create index if not exists competition_qualifiers_season_competition_idx on public.competition_qualifiers(season_id, competition_id);
create index if not exists competition_groups_season_competition_idx on public.competition_groups(season_id, competition_id);
create index if not exists competition_group_teams_group_idx on public.competition_group_teams(group_id);

alter table public.competition_rules enable row level security;
alter table public.competition_qualifiers enable row level security;
alter table public.competition_groups enable row level security;
alter table public.competition_group_teams enable row level security;

drop policy if exists "competition_rules_public_read" on public.competition_rules;
create policy "competition_rules_public_read" on public.competition_rules for select to anon, authenticated using (true);

drop policy if exists "competition_qualifiers_public_read" on public.competition_qualifiers;
create policy "competition_qualifiers_public_read" on public.competition_qualifiers for select to anon, authenticated using (true);
drop policy if exists "competition_qualifiers_public_insert" on public.competition_qualifiers;
create policy "competition_qualifiers_public_insert" on public.competition_qualifiers for insert to anon, authenticated with check (true);

drop policy if exists "competition_groups_public_read" on public.competition_groups;
create policy "competition_groups_public_read" on public.competition_groups for select to anon, authenticated using (true);
drop policy if exists "competition_groups_public_insert" on public.competition_groups;
create policy "competition_groups_public_insert" on public.competition_groups for insert to anon, authenticated with check (true);

drop policy if exists "competition_group_teams_public_read" on public.competition_group_teams;
create policy "competition_group_teams_public_read" on public.competition_group_teams for select to anon, authenticated using (true);
drop policy if exists "competition_group_teams_public_insert" on public.competition_group_teams;
create policy "competition_group_teams_public_insert" on public.competition_group_teams for insert to anon, authenticated with check (true);

grant select on public.competition_rules to anon, authenticated;
grant select, insert on public.competition_qualifiers to anon, authenticated;
grant select, insert on public.competition_groups to anon, authenticated;
grant select, insert on public.competition_group_teams to anon, authenticated;

insert into public.competitions (name, country, type, division)
values
  ('CONMEBOL Libertadores', 'CONMEBOL', 'international', null),
  ('CONMEBOL Sudamericana', 'CONMEBOL', 'international', null)
on conflict (name) do update set country = excluded.country, type = excluded.type, division = excluded.division;

insert into public.competition_rules (competition_id, format)
select id,
  case name
    when 'CONMEBOL Libertadores' then jsonb_build_object(
      'country','CONMEBOL','total_entrants',47,'group_teams',32,'groups',8,'group_size',4,
      'group_matches_per_team',6,'direct_group_qualifiers',28,'phase3_group_qualifiers',4,
      'group_advance',2,'group_third_to','CONMEBOL Sudamericana playoffs',
      'stages',jsonb_build_array(
        jsonb_build_object('id','phase_1','label','Fase 1','teams',6,'legs',2),
        jsonb_build_object('id','phase_2','label','Fase 2','teams',16,'legs',2),
        jsonb_build_object('id','phase_3','label','Fase 3','teams',8,'legs',2),
        jsonb_build_object('id','group_stage','label','Fase de Grupos','teams',32,'groups',8,'group_size',4,'rounds',6),
        jsonb_build_object('id','round_of_16','label','Oitavas de final','teams',16,'legs',2),
        jsonb_build_object('id','quarterfinals','label','Quartas de final','teams',8,'legs',2),
        jsonb_build_object('id','semifinals','label','Semifinais','teams',4,'legs',2),
        jsonb_build_object('id','final','label','Final','teams',2,'legs',1,'extra_time',true,'penalties',true)
      ),
      'group_tiebreakers',jsonb_build_array('head_to_head_points','head_to_head_goal_difference','head_to_head_goals','overall_goal_difference','overall_goals_for','fewest_red_cards','fewest_yellow_cards','draw'),
      'knockout_tiebreaker','aggregate_goal_difference_then_penalties',
      'prize_champion_brl',130000000
    )
    when 'CONMEBOL Sudamericana' then jsonb_build_object(
      'country','CONMEBOL','total_entrants',44,'group_teams',32,'groups',8,'group_size',4,
      'group_matches_per_team',6,'direct_group_qualifiers',28,'libertadores_phase3_losers',4,
      'group_advance',1,'group_second_to','playoffs',
      'playoffs',jsonb_build_object('teams',16,'legs',2,'participants_a','sudamericana_group_second','participants_b','libertadores_group_third'),
      'stages',jsonb_build_array(
        jsonb_build_object('id','first_phase','label','Primeira fase','teams',32,'legs',1,'penalties',true),
        jsonb_build_object('id','group_stage','label','Fase de Grupos','teams',32,'groups',8,'group_size',4,'rounds',6),
        jsonb_build_object('id','playoffs','label','Playoffs das oitavas','teams',16,'legs',2,'penalties',true),
        jsonb_build_object('id','round_of_16','label','Oitavas de final','teams',16,'legs',2,'penalties',true),
        jsonb_build_object('id','quarterfinals','label','Quartas de final','teams',8,'legs',2,'penalties',true),
        jsonb_build_object('id','semifinals','label','Semifinais','teams',4,'legs',2,'penalties',true),
        jsonb_build_object('id','final','label','Final','teams',2,'legs',1,'extra_time',true,'penalties',true)
      ),
      'group_tiebreakers',jsonb_build_array('head_to_head_points','head_to_head_goal_difference','head_to_head_goals','overall_goal_difference','overall_goals_for','fewest_red_cards','fewest_yellow_cards','draw'),
      'knockout_tiebreaker','aggregate_goal_difference_then_penalties',
      'prize_champion_brl',76000000
    )
  end
from public.competitions
where name in ('CONMEBOL Libertadores','CONMEBOL Sudamericana')
on conflict (competition_id) do update set format = excluded.format, updated_at = now();

insert into public.competition_prizes (competition_id, prize_type, stage, amount, description)
select id, 'champion', 'final',
  case name when 'CONMEBOL Libertadores' then 130000000 when 'CONMEBOL Sudamericana' then 76000000 end,
  case name when 'CONMEBOL Libertadores' then 'Premiação do campeão da CONMEBOL Libertadores'
             when 'CONMEBOL Sudamericana' then 'Premiação do campeão da CONMEBOL Sudamericana' end
from public.competitions
where name in ('CONMEBOL Libertadores','CONMEBOL Sudamericana')
on conflict do nothing;