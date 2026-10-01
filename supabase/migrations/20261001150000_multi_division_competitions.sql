-- Multi-divisão: Série B, histórico de classificação e recordes.
-- A Série B de 2026 tem 20 clubes e 38 rodadas; os dois primeiros sobem
-- diretamente e 3º-6º disputam os dois acessos restantes.
insert into public.competitions (name)
select 'Série B do Brasil'
where not exists (
  select 1 from public.competitions where lower(name) = lower('Série B do Brasil')
);

with profile(name, short_name, city, stadium, stadium_capacity, reputation, strength, budget, founded_year) as (
  values
    ('América-MG','América-MG','Belo Horizonte','Independência',23018,67,67,28000000,1912),
    ('Athletic Club','Athletic','São João del-Rei','Arena Sicredi',12000,55,57,12000000,1909),
    ('Atlético-GO','Atlético-GO','Goiânia','Antônio Accioly',12500,66,66,26000000,1937),
    ('Avaí','Avaí','Florianópolis','Ressacada',17800,64,63,22000000,1923),
    ('Botafogo-SP','Botafogo-SP','Ribeirão Preto','Santa Cruz',29292,58,58,14000000,1918),
    ('Ceará','Ceará','Fortaleza','Arena Castelão',63903,72,73,42000000,1914),
    ('CRB','CRB','Maceió','Rei Pelé',20000,58,60,13000000,1912),
    ('Criciúma','Criciúma','Criciúma','Heriberto Hülse',19300,66,66,23000000,1947),
    ('Cuiabá','Cuiabá','Cuiabá','Arena Pantanal',42968,70,70,35000000,2001),
    ('Fortaleza','Fortaleza','Fortaleza','Arena Castelão',63903,78,78,50000000,1918),
    ('Goiás','Goiás','Goiânia','Hailé Pinheiro',13200,72,71,30000000,1943),
    ('Juventude','Juventude','Caxias do Sul','Alfredo Jaconi',19924,68,67,27000000,1913),
    ('Londrina','Londrina','Londrina','Vitorino Gonçalves Dias',10500,56,57,11000000,1956),
    ('Náutico','Náutico','Recife','Aflitos',22000,63,62,18000000,1901),
    ('Novorizontino','Novorizontino','Novo Horizonte','Jorge Ismael de Biasi',16800,61,66,17000000,2010),
    ('Operário-PR','Operário-PR','Ponta Grossa','Germano Krüger',10300,61,62,15000000,1912),
    ('Ponte Preta','Ponte Preta','Campinas','Moisés Lucarelli',17728,68,65,21000000,1900),
    ('São Bernardo FC','São Bernardo','São Bernardo do Campo','Primeiro de Maio',17000,57,59,13000000,2004),
    ('Sport','Sport','Recife','Ilha do Retiro',32000,78,75,45000000,1905),
    ('Vila Nova','Vila Nova','Goiânia','Onésio Brasileiro Alvarenga',11788,64,65,20000000,1943)
)
insert into public.clubs (name, short_name, city, country, division, budget, reputation, strength, stadium, stadium_capacity, founded_year)
select p.name, p.short_name, p.city, 'Brasil', 2, p.budget, p.reputation, p.strength, p.stadium, p.stadium_capacity, p.founded_year
from profile p
where not exists (
  select 1 from public.clubs c where lower(c.name) = lower(p.name)
);

create table if not exists public.season_club_standings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  division integer not null,
  position integer not null,
  played integer not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (season_id, competition_id, club_id)
);
create index if not exists season_club_standings_season_idx on public.season_club_standings(season_id);
create index if not exists season_club_standings_club_idx on public.season_club_standings(club_id);

create table if not exists public.competition_records (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  record_type text not null,
  club_id uuid references public.clubs(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  value numeric not null default 0,
  season_id uuid references public.seasons(id) on delete set null,
  description text,
  created_at timestamptz not null default now(),
  unique (competition_id, record_type)
);
create index if not exists competition_records_competition_idx on public.competition_records(competition_id);

alter table public.season_club_standings enable row level security;
drop policy if exists "season club standings are public" on public.season_club_standings;
create policy "season club standings are public" on public.season_club_standings for select to anon, authenticated using (true);

alter table public.competition_records enable row level security;
drop policy if exists "competition records are public" on public.competition_records;
create policy "competition records are public" on public.competition_records for select to anon, authenticated using (true);

-- Elencos iniciais da Série B. São atletas genéricos para que a divisão seja
-- jogável desde a primeira temporada; o motor de ciclo de vida os substitui
-- naturalmente por novos talentos, transferências e aposentadorias.
with bclubs as (
  select id, short_name, strength
  from public.clubs
  where division = 2
),
slots as (
  select generate_series(1, 18) as n
),
seed as (
  select
    c.id as club_id,
    c.short_name,
    c.strength,
    s.n,
    (array['GK','LB','CB','CB','RB','DM','CM','CM','AM','LW','RW','ST','ST','CB','DM','CM','LW','RW'])[s.n] as position
  from bclubs c cross join slots s
)
insert into public.players (
  first_name,last_name,age,nationality,position,
  pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,
  potential,form,morale
)
select
  'Atleta',
  replace(seed.short_name, ' ', '_') || '_' || lpad(seed.n::text, 2, '0'),
  18 + ((seed.n + ascii(left(seed.short_name, 1))) % 15),
  'Brasil',
  seed.position,
  greatest(35, least(90, seed.strength + ((seed.n * 7) % 9) - 4)),
  greatest(35, least(90, seed.strength + ((seed.n * 5) % 9) - 4)),
  greatest(35, least(90, seed.strength + ((seed.n * 3) % 9) - 4)),
  greatest(35, least(90, seed.strength + ((seed.n * 11) % 9) - 4)),
  greatest(35, least(90, seed.strength + ((seed.n * 13) % 9) - 4)),
  greatest(35, least(90, seed.strength + ((seed.n * 17) % 9) - 4)),
  case when seed.position = 'GK' then greatest(35, least(90, seed.strength + ((seed.n * 19) % 9) - 4)) else 45 end,
  greatest(35, least(90, seed.strength + ((seed.n * 23) % 9) - 4)),
  greatest(seed.strength, least(95, seed.strength + 8 + (seed.n % 8))),
  70,
  70
from seed
where not exists (
  select 1 from public.players p
  where p.last_name = replace(seed.short_name, ' ', '_') || '_' || lpad(seed.n::text, 2, '0')
);

insert into public.club_players (club_id, player_id, squad_number, salary, market_value, contract_until)
select
  c.id,
  p.id,
  ((row_number() over (partition by c.id order by p.id))::integer),
  greatest(12000, round(c.strength * 420 + (row_number() over (partition by c.id order by p.id)) * 350)),
  greatest(100000, round(c.strength * 18000 + (row_number() over (partition by c.id order by p.id)) * 50000)),
  '2028-12-31'
from public.clubs c
join public.players p on p.last_name like replace(c.short_name, ' ', '_') || '_%'
where c.division = 2
and not exists (
  select 1 from public.club_players cp where cp.player_id = p.id and cp.club_id = c.id
);
