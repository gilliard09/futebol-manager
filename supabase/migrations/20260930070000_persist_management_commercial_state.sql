-- Persistência completa dos estados de diretoria, torcida, patrocínio e estádio.
-- Os campos adicionais espelham o estado que já existe nos engines do jogo.

alter table public.club_management_seasons
  add column if not exists last_evaluation text not null default 'Avaliação inicial',
  add column if not exists evaluations integer not null default 0,
  add column if not exists consecutive_poor_results integer not null default 0,
  add column if not exists fan_attendance_factor numeric not null default 1,
  add column if not exists fan_recent_results text[] not null default '{}',
  add column if not exists fan_streak integer not null default 0;

alter table public.club_commercial_seasons
  add column if not exists sponsor_status text not null default 'active',
  add column if not exists sponsor_completed_seasons integer not null default 0,
  add column if not exists sponsor_reputation_required integer not null default 0,
  add column if not exists stadium_attendance_rate numeric not null default 0.72,
  add column if not exists stadium_upgrades jsonb not null default '[]'::jsonb;

alter table public.club_management_seasons
  drop constraint if exists club_management_seasons_manager_status_check;

alter table public.club_management_seasons
  add constraint club_management_seasons_manager_status_check
  check (manager_status in ('active', 'dismissed', 'contract_ended', 'renewed'));

alter table public.club_commercial_seasons
  drop constraint if exists club_commercial_seasons_sponsor_status_check;

alter table public.club_commercial_seasons
  add constraint club_commercial_seasons_sponsor_status_check
  check (sponsor_status in ('active', 'fulfilled', 'terminated'));

alter table public.club_management_seasons
  drop policy if exists "club management public insert" on public.club_management_seasons;
create policy "club management public insert"
  on public.club_management_seasons
  for insert
  to anon, authenticated
  with check (true);

alter table public.club_management_seasons
  drop policy if exists "club management public update" on public.club_management_seasons;
create policy "club management public update"
  on public.club_management_seasons
  for update
  to anon, authenticated
  using (true)
  with check (true);

alter table public.club_commercial_seasons
  drop policy if exists "club commercial public insert" on public.club_commercial_seasons;
create policy "club commercial public insert"
  on public.club_commercial_seasons
  for insert
  to anon, authenticated
  with check (true);

alter table public.club_commercial_seasons
  drop policy if exists "club commercial public update" on public.club_commercial_seasons;
create policy "club commercial public update"
  on public.club_commercial_seasons
  for update
  to anon, authenticated
  using (true)
  with check (true);

create index if not exists club_management_seasons_status_idx
  on public.club_management_seasons(manager_status);

create index if not exists club_commercial_seasons_sponsor_idx
  on public.club_commercial_seasons(sponsor_id);
