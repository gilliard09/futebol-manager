-- Allow players to exist without a club between contracts.
alter table public.club_players
  alter column club_id drop not null;

-- A free-agent signing has no selling club.
alter table public.world_transfers
  alter column from_club_id drop not null;
