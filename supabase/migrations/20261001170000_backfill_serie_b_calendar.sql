-- Corrige temporadas que já possuem a Série B criada, mas ainda não têm
-- participantes e calendário persistidos.
-- A operação é idempotente e pode ser executada mais de uma vez.

do $$
declare
  v_season_id uuid;
  v_competition_id uuid;
begin
  select id
    into v_season_id
  from public.seasons
  where status = 'active'
  order by start_date desc nulls last, created_at desc
  limit 1;

  select id
    into v_competition_id
  from public.competitions
  where lower(name) = lower('Série B do Brasil')
  limit 1;

  if v_season_id is null or v_competition_id is null then
    raise notice 'Temporada ativa ou Série B não encontrada; nada a corrigir.';
    return;
  end if;

  -- Participantes da Série B.
  insert into public.competition_teams (season_id, competition_id, club_id)
  select v_season_id, v_competition_id, c.id
  from public.clubs c
  where c.division = 2
    and not exists (
      select 1
      from public.competition_teams ct
      where ct.season_id = v_season_id
        and ct.competition_id = v_competition_id
        and ct.club_id = c.id
    );

  -- Calendário completo: 20 clubes, 38 rodadas, 380 partidas.
  -- O algoritmo usa 19 clubes em rotação + um clube fixo, gerando
  -- todos os confrontos uma vez na primeira metade e invertendo
  -- os mandos na segunda metade.
  with bclubs as (
    select
      c.id,
      row_number() over (order by c.id) as rn
    from public.clubs c
    where c.division = 2
  ),
  first_leg as (
    -- Clube fixo (20) contra cada um dos outros 19.
    select
      r.round_idx + 1 as round_no,
      case when r.round_idx % 2 = 0 then fixed.id else opponent.id end as home_club_id,
      case when r.round_idx % 2 = 0 then opponent.id else fixed.id end as away_club_id
    from generate_series(0, 18) as r(round_idx)
    cross join bclubs fixed
    join bclubs opponent on opponent.rn = r.round_idx + 1
    where fixed.rn = 20

    union all

    -- Os outros 18 clubes formam 9 pares por rodada.
    select
      r.round_idx + 1 as round_no,
      case when r.round_idx % 2 = 0 then left_club.id else right_club.id end as home_club_id,
      case when r.round_idx % 2 = 0 then right_club.id else left_club.id end as away_club_id
    from generate_series(0, 18) as r(round_idx)
    cross join generate_series(1, 9) as k(slot)
    join bclubs left_club
      on left_club.rn = ((r.round_idx + k.slot - 1) % 19) + 1
    join bclubs right_club
      on right_club.rn = ((r.round_idx - k.offset - 1 + 38) % 19) + 1
  ),
  all_legs as (
    select
      round_no,
      home_club_id,
      away_club_id
    from first_leg

    union all

    select
      round_no + 19,
      away_club_id,
      home_club_id
    from first_leg
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
    v_competition_id,
    l.round_no,
    (
      coalesce((select start_date from public.seasons where id = v_season_id), current_date)
      + ((9 + (l.round_no - 1) * 5)::integer * interval '1 day')
      + interval '19 hours'
    )::timestamptz,
    'scheduled',
    l.home_club_id,
    l.away_club_id,
    null,
    null,
    null
  from all_legs l
  where not exists (
    select 1
    from public.fixtures f
    where f.season_id = v_season_id
      and f.competition_id = v_competition_id
      and f.round = l.round_no
      and f.home_club_id = l.home_club_id
      and f.away_club_id = l.away_club_id
  );

  raise notice 'Série B corrigida para a temporada %.', v_season_id;
end $$;
