-- Perfil realista dos 16 clubes-base do universo atual do jogo.
-- founded_year e stadium_capacity são dados históricos/estruturais;
-- reputation, strength e budget são aproximações de jogo para 2026,
-- calibradas para refletir porte, elenco e capacidade financeira relativa.

alter table public.clubs
  add column if not exists founded_year integer,
  add column if not exists stadium_capacity integer;

with profile(name, founded_year, stadium, stadium_capacity, reputation, strength, budget) as (
  values
    ('Atlético Mineiro', 1908, 'Arena MRV', 47465, 88, 88, 85000000),
    ('Bahia', 1931, 'Arena Fonte Nova', 56500, 78, 79, 95000000),
    ('Botafogo', 1894, 'Estádio Nilton Santos', 44661, 84, 86, 125000000),
    ('Ceará', 1914, 'Arena Castelão', 57876, 68, 70, 30000000),
    ('Corinthians', 1910, 'Neo Química Arena', 49205, 89, 82, 70000000),
    ('Cruzeiro', 1921, 'Mineirão', 62170, 82, 81, 90000000),
    ('Flamengo', 1895, 'Maracanã', 78838, 95, 94, 180000000),
    ('Fluminense', 1902, 'Maracanã', 78838, 84, 82, 70000000),
    ('Fortaleza', 1918, 'Arena Castelão', 57876, 75, 78, 45000000),
    ('Grêmio', 1903, 'Arena do Grêmio', 60540, 84, 83, 75000000),
    ('Internacional', 1909, 'Beira-Rio', 50128, 86, 84, 80000000),
    ('Palmeiras', 1914, 'Allianz Parque', 43713, 94, 93, 160000000),
    ('Santos', 1912, 'Vila Belmiro', 16068, 88, 77, 50000000),
    ('São Paulo', 1930, 'MorumBIS', 66795, 92, 84, 65000000),
    ('Vasco da Gama', 1898, 'São Januário', 24584, 86, 78, 55000000),
    ('Vitória', 1899, 'Barradão', 30793, 67, 68, 25000000)
)
update public.clubs c
set
  founded_year = p.founded_year,
  stadium = p.stadium,
  stadium_capacity = p.stadium_capacity,
  reputation = p.reputation,
  strength = p.strength,
  budget = p.budget
from profile p
where lower(c.name) like '%' || lower(p.name) || '%';

-- O reset de nova carreira usa este baseline; portanto os valores
-- atualizados precisam ser refletidos também na fotografia inicial do mundo.
update public.world_baseline_clubs b
set
  budget = c.budget,
  reputation = c.reputation,
  strength = c.strength
from public.clubs c
where c.id = b.id;

comment on column public.clubs.founded_year is 'Ano de fundação do clube, usado como dado histórico do universo do jogo.';
comment on column public.clubs.stadium_capacity is 'Capacidade de referência do estádio do clube, em lugares.';

create index if not exists clubs_reputation_idx on public.clubs(reputation);
create index if not exists clubs_strength_idx on public.clubs(strength);
