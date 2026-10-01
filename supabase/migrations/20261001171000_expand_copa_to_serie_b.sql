-- Expande a Copa Nacional para os 36 clubes atuais das Séries A e B.
-- A temporada atual ainda não possui partidas concluídas da Copa, então o
-- calendário inicial de 16 partidas pode ser substituído com segurança.

do $$
declare
  v_season_id uuid;
  v_cup_id uuid;
  v_completed integer;
begin
  select id into v_season_id
  from public.seasons
  where status = 'active'
  order by start_date desc nulls last, created_at desc
  limit 1;

  select id into v_cup_id
  from public.competitions
  where name = 'Copa Nacional do Brasil'
  limit 1;

  if v_season_id is null or v_cup_id is null then
    raise notice 'Temporada ativa ou Copa Nacional não encontrada.';
    return;
  end if;

  select count(*) into v_completed
  from public.fixtures
  where season_id = v_season_id
    and competition_id = v_cup_id
    and status = 'completed';

  if v_completed > 0 then
    raise exception 'A Copa desta temporada já possui partidas concluídas; não é seguro reconstruir o calendário automaticamente.';
  end if;

  insert into public.competition_teams (season_id, competition_id, club_id)
  select v_season_id, v_cup_id, c.id
  from public.clubs c
  where c.division in (1, 2)
    and not exists (
      select 1
      from public.competition_teams ct
      where ct.season_id = v_season_id
        and ct.competition_id = v_cup_id
        and ct.club_id = c.id
    );

  delete from public.fixtures
  where season_id = v_season_id
    and competition_id = v_cup_id
    and status <> 'completed';

  -- Fase preliminar: 8 clubes de menor força, 4 jogos únicos.
  with ranked as (
    select
      c.id,
      row_number() over (
        order by coalesce(c.strength, c.reputation, 50), c.name
      ) as rn
    from public.clubs c
    where c.division in (1, 2)
  ),
  preliminary as (
    select
      a.id as home_club_id,
      b.id as away_club_id,
      row_number() over (order by a.rn) as match_no
    from ranked a
    join ranked b on b.rn = a.rn + 1
    where a.rn in (1, 3, 5, 7)
  )
  insert into public.fixtures (
    season_id,
    competition_id,
    round,
    scheduled_at,
    status,
    home_club_id,
    away_club_id,
    home_score,
    away_score,
    winner_club_id
  )
  select
    v_season_id,
    v_cup_id,
    1,
    (
      coalesce((select start_date from public.seasons where id = v_season_id), current_date)
      + ((38 + match_no)::integer * interval '1 day')
      + interval '19 hours'
    )::timestamptz,
    'scheduled',
    home_club_id,
    away_club_id,
    null,
    null,
    null
  from preliminary;

  raise notice 'Copa Nacional expandida para 36 participantes.';
end $$;
