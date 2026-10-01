-- Persistent manager career: history, records, trophies, popularity and job offers.
-- All career data belongs to the authenticated (including anonymous) Supabase user.

create table if not exists public.manager_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  manager_name text not null,
  nationality text not null default 'Brasil',
  birth_date date,
  style text not null,
  personality text not null,
  regional_popularity integer not null default 8 check (regional_popularity between 0 and 100),
  national_popularity integer not null default 1 check (national_popularity between 0 and 100),
  international_popularity integer not null default 0 check (international_popularity between 0 and 100),
  career_points integer not null default 0,
  seasons_completed integer not null default 0,
  matches_played integer not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  current_club_id uuid references public.clubs(id) on delete set null,
  current_season_id uuid references public.seasons(id) on delete set null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manager_season_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  club_name text not null,
  season_name text not null,
  final_position integer,
  points integer not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  league_title boolean not null default false,
  cup_title boolean not null default false,
  regional_popularity integer not null default 0,
  national_popularity integer not null default 0,
  international_popularity integer not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, season_id, club_id)
);

create table if not exists public.manager_trophies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  competition_id uuid references public.competitions(id) on delete set null,
  competition_name text not null,
  trophy_type text not null default 'champion',
  created_at timestamptz not null default now(),
  unique (owner_id, season_id, competition_id)
);

create table if not exists public.manager_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null,
  record_value numeric not null default 0,
  season_id uuid references public.seasons(id) on delete set null,
  club_id uuid references public.clubs(id) on delete set null,
  description text not null,
  updated_at timestamptz not null default now(),
  unique (owner_id, record_type)
);

create table if not exists public.manager_offers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  offered_at date not null,
  expires_at date,
  from_club_id uuid not null references public.clubs(id) on delete cascade,
  performance_score numeric not null default 0,
  popularity_score numeric not null default 0,
  offer_level text not null default 'regional',
  message text not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists manager_season_history_owner_idx on public.manager_season_history(owner_id);
create index if not exists manager_trophies_owner_idx on public.manager_trophies(owner_id);
create index if not exists manager_records_owner_idx on public.manager_records(owner_id);
create index if not exists manager_offers_owner_status_idx on public.manager_offers(owner_id, status);
create index if not exists manager_profiles_current_club_idx on public.manager_profiles(current_club_id);

alter table public.manager_profiles enable row level security;
alter table public.manager_season_history enable row level security;
alter table public.manager_trophies enable row level security;
alter table public.manager_records enable row level security;
alter table public.manager_offers enable row level security;

revoke all on table public.manager_profiles, public.manager_season_history, public.manager_trophies, public.manager_records, public.manager_offers from anon, authenticated;

grant select, insert, update, delete on table public.manager_profiles to authenticated;
grant select, insert, update, delete on table public.manager_season_history to authenticated;
grant select, insert, update, delete on table public.manager_trophies to authenticated;
grant select, insert, update, delete on table public.manager_records to authenticated;
grant select, insert, update, delete on table public.manager_offers to authenticated;

drop policy if exists "manager profiles own select" on public.manager_profiles;
drop policy if exists "manager profiles own insert" on public.manager_profiles;
drop policy if exists "manager profiles own update" on public.manager_profiles;
drop policy if exists "manager profiles own delete" on public.manager_profiles;
create policy "manager profiles own select" on public.manager_profiles for select to authenticated using ((select auth.uid()) = owner_id);
create policy "manager profiles own insert" on public.manager_profiles for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "manager profiles own update" on public.manager_profiles for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "manager profiles own delete" on public.manager_profiles for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "manager history own select" on public.manager_season_history;
drop policy if exists "manager history own insert" on public.manager_season_history;
drop policy if exists "manager history own update" on public.manager_season_history;
create policy "manager history own select" on public.manager_season_history for select to authenticated using ((select auth.uid()) = owner_id);
create policy "manager history own insert" on public.manager_season_history for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "manager history own update" on public.manager_season_history for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "manager trophies own select" on public.manager_trophies;
drop policy if exists "manager trophies own delete" on public.manager_trophies;
drop policy if exists "manager trophies own insert" on public.manager_trophies;
drop policy if exists "manager trophies own update" on public.manager_trophies;
create policy "manager trophies own select" on public.manager_trophies for select to authenticated using ((select auth.uid()) = owner_id);
create policy "manager trophies own insert" on public.manager_trophies for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "manager trophies own update" on public.manager_trophies for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "manager trophies own delete" on public.manager_trophies for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "manager records own select" on public.manager_records;
drop policy if exists "manager records own delete" on public.manager_records;
drop policy if exists "manager records own insert" on public.manager_records;
drop policy if exists "manager records own update" on public.manager_records;
create policy "manager records own select" on public.manager_records for select to authenticated using ((select auth.uid()) = owner_id);
create policy "manager records own insert" on public.manager_records for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "manager records own update" on public.manager_records for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "manager records own delete" on public.manager_records for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "manager offers own select" on public.manager_offers;
drop policy if exists "manager offers own delete" on public.manager_offers;
drop policy if exists "manager offers own insert" on public.manager_offers;
drop policy if exists "manager offers own update" on public.manager_offers;
create policy "manager offers own select" on public.manager_offers for select to authenticated using ((select auth.uid()) = owner_id);
create policy "manager offers own insert" on public.manager_offers for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "manager offers own update" on public.manager_offers for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "manager offers own delete" on public.manager_offers for delete to authenticated using ((select auth.uid()) = owner_id);
