-- Official competition prize configuration and idempotent payment ledger.

create table if not exists public.competition_prizes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  prize_type text not null,
  position_from integer,
  position_to integer,
  stage text,
  amount numeric(14,2) not null default 0,
  description text,
  created_at timestamptz not null default now(),
  constraint competition_prizes_amount_check check (amount >= 0),
  constraint competition_prizes_position_check check (
    (position_from is null and position_to is null)
    or (position_from is not null and position_to is not null and position_from >= 1 and position_to >= position_from)
  )
);

create unique index if not exists competition_prizes_unique_config
on public.competition_prizes (
  competition_id,
  prize_type,
  coalesce(position_from, 0),
  coalesce(position_to, 0),
  coalesce(stage, '')
);

create table if not exists public.competition_prize_payments (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  prize_id uuid not null references public.competition_prizes(id) on delete restrict,
  prize_type text not null,
  stage text,
  position integer,
  amount numeric(14,2) not null,
  description text,
  paid_at timestamptz not null default now(),
  constraint competition_prize_payments_amount_check check (amount > 0),
  constraint competition_prize_payments_position_check check (position is null or position >= 1)
);

create unique index if not exists competition_prize_payments_unique
on public.competition_prize_payments (competition_id, season_id, club_id, prize_id);

create index if not exists competition_prizes_competition_idx
on public.competition_prizes (competition_id);

create index if not exists competition_prize_payments_season_idx
on public.competition_prize_payments (season_id);

create index if not exists competition_prize_payments_club_idx
on public.competition_prize_payments (club_id);

alter table public.competition_prizes enable row level security;
alter table public.competition_prize_payments enable row level security;

drop policy if exists "competition_prizes_select_anon" on public.competition_prizes;
create policy "competition_prizes_select_anon"
on public.competition_prizes for select to anon, authenticated using (true);

drop policy if exists "competition_prize_payments_select_authenticated" on public.competition_prize_payments;
create policy "competition_prize_payments_select_authenticated"
on public.competition_prize_payments for select to anon, authenticated using (true);

drop policy if exists "competition_prize_payments_insert_anon" on public.competition_prize_payments;
create policy "competition_prize_payments_insert_anon"
on public.competition_prize_payments for insert to anon, authenticated with check (true);

drop policy if exists "competition_prize_payments_update_anon" on public.competition_prize_payments;
create policy "competition_prize_payments_update_anon"
on public.competition_prize_payments for update to anon, authenticated using (true) with check (true);

grant select on public.competition_prizes to anon, authenticated;
grant select, insert, update on public.competition_prize_payments to anon, authenticated;

insert into public.competition_prizes (competition_id, prize_type, stage, amount, description)
select c.id, v.prize_type, v.stage, v.amount, v.description
from public.competitions c
cross join (values
  ('stage','quarterfinal',4000000::numeric,'Classificação às quartas de final'),
  ('stage','semifinal',9000000::numeric,'Classificação à semifinal'),
  ('runner_up','runner_up',34000000::numeric,'Premiação do vice-campeão'),
  ('champion','champion',78000000::numeric,'Premiação do campeão')
) v(prize_type,stage,amount,description)
where c.name = 'Copa Nacional do Brasil'
on conflict do nothing;

insert into public.competition_prizes (competition_id, prize_type, position_from, position_to, amount, description)
select c.id, 'position', v.position_from, v.position_to, v.amount, v.description
from public.competitions c
cross join (values
  (1,1,50000000::numeric,'Premiação do campeão'),
  (2,2,45000000::numeric,'Premiação do vice-campeão'),
  (3,3,43000000::numeric,'Premiação do 3º colocado'),
  (4,4,40000000::numeric,'Premiação do 4º colocado'),
  (5,5,38000000::numeric,'Premiação do 5º colocado'),
  (6,6,35000000::numeric,'Premiação do 6º colocado'),
  (7,7,32000000::numeric,'Premiação do 7º colocado'),
  (8,8,30000000::numeric,'Premiação do 8º colocado'),
  (9,9,27000000::numeric,'Premiação do 9º colocado'),
  (10,10,25000000::numeric,'Premiação do 10º colocado'),
  (11,11,20000000::numeric,'Premiação do 11º colocado'),
  (12,12,19000000::numeric,'Premiação do 12º colocado'),
  (13,13,18000000::numeric,'Premiação do 13º colocado'),
  (14,14,17000000::numeric,'Premiação do 14º colocado'),
  (15,15,16000000::numeric,'Premiação do 15º colocado'),
  (16,16,15000000::numeric,'Premiação do 16º colocado')
) v(position_from,position_to,amount,description)
where c.name = 'Liga Nacional do Brasil'
on conflict do nothing;

insert into public.competition_prizes (competition_id, prize_type, position_from, position_to, amount, description)
select c.id, 'position', v.position_from, v.position_to, v.amount, v.description
from public.competitions c
cross join (values
  (1,1,2500000::numeric,'Premiação do campeão da Série B'),
  (2,6,1000000::numeric,'Premiação do 2º ao 6º colocado da Série B')
) v(position_from,position_to,amount,description)
where c.name = 'Série B do Brasil'
on conflict do nothing;
