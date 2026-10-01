import { describe, expect, it } from 'vitest'
import { buildLeagueFixtures, buildCupFixtures } from './seasonSchedule'
import {
  buildStandings,
  resolveCompletedKnockoutStage,
  choosePenaltyWinner,
  type StandingRow,
} from './competitions'
import {
  buildContinentalGroupFixtures,
  buildContinentalGroups,
  pairLibertadoresRoundOf16,
  pairSudamericanaPlayoffs,
  buildTwoLegFixtures,
  buildSingleFinalFixture,
  resolveContinentalTwoLegTie,
  resolveContinentalSingleMatch,
  type ContinentalGroup,
  type ContinentalTeam,
} from './continentalCompetition'
import { buildSeasonCompletion } from './seasonHistory'
import type { Club, Fixture } from '../types/game'

type SimFixture = Fixture & { stage?: string }

const seasonId = 'season-simulation-2026'

function club(id: string, division: number, country = 'Brasil', strength = 70): Club {
  return {
    id,
    name: id.toUpperCase(),
    short_name: id.toUpperCase(),
    city: id,
    country,
    division,
    budget: 10_000_000,
    reputation: strength,
    strength,
  }
}

const liga = Array.from({ length: 16 }, (_, i) => club(`A${String(i + 1).padStart(2, '0')}`, 1, 'Brasil', 90 - i))
const serieB = Array.from({ length: 20 }, (_, i) => club(`B${String(i + 1).padStart(2, '0')}`, 2, 'Brasil', 80 - i))
const copa = [...liga, ...serieB]

function asFixture(row: {
  season_id: string
  competition_id: string
  round: number
  scheduled_at: string
  status: 'scheduled' | 'completed'
  home_club_id: string
  away_club_id: string
  home_score: number | null
  away_score: number | null
  winner_club_id: string | null
}, index: number): SimFixture {
  return {
    id: `sim-${row.competition_id}-${row.round}-${index}`,
    competition_id: row.competition_id,
    season_id: row.season_id,
    round: row.round,
    scheduled_at: row.scheduled_at,
    status: row.status,
    home_club_id: row.home_club_id,
    away_club_id: row.away_club_id,
    home_score: row.home_score,
    away_score: row.away_score,
    winner_club_id: row.winner_club_id,
    home_club: { name: row.home_club_id, short_name: row.home_club_id },
    away_club: { name: row.away_club_id, short_name: row.away_club_id },
  }
}

function playLeague(rows: SimFixture[]) {
  return rows.map((fixture, index) => ({
    ...fixture,
    status: 'completed',
    home_score: index % 3 === 0 ? 2 : 1,
    away_score: index % 3 === 1 ? 1 : 0,
    winner_club_id: index % 3 === 1 ? fixture.home_club_id : fixture.home_club_id,
  })) as SimFixture[]
}

function playKnockoutStage(rows: SimFixture[], round: number) {
  return rows.map((fixture, index) => {
    const homeWins = index % 2 === 0
    return {
      ...fixture,
      status: 'completed',
      home_score: homeWins ? 1 : 0,
      away_score: homeWins ? 0 : 1,
      winner_club_id: homeWins ? fixture.home_club_id : fixture.away_club_id,
    }
  }) as SimFixture[]
}

function simulateBrazilCup(): SimFixture[] {
  const initial = buildCupFixtures(seasonId, '2026-02-18', copa, 'copa')
    .map((row, i) => asFixture(row, i))
  const all = [...playKnockoutStage(initial, 1)]
  const resolverRounds = [1, 2, 4, 6, 8]

  for (const currentRound of resolverRounds) {
    const next = resolveCompletedKnockoutStage(
      all,
      currentRound,
      copa.map(item => item.id),
    )
    expect(next, `Copa deveria gerar a rodada seguinte após a rodada ${currentRound}`).not.toBeNull()

    const nextRows = next!.map((row, index) =>
      asFixture({
        season_id: seasonId,
        competition_id: 'copa',
        round: row.round,
        scheduled_at: row.scheduledAt,
        status: 'scheduled',
        home_club_id: row.homeClubId,
        away_club_id: row.awayClubId,
        home_score: null,
        away_score: null,
        winner_club_id: null,
      }, all.length + index),
    )
    all.push(...playKnockoutStage(nextRows, currentRound + 1))
  }

  return all
}

function continentalClub(id: string, country: string, strength = 70): ContinentalTeam {
  return { id, name: id, country, strength, reputation: strength }
}

function buildGroups(prefix: string): ContinentalGroup[] {
  return Array.from({ length: 8 }, (_, groupIndex) => ({
    code: `${prefix}-${String.fromCharCode(65 + groupIndex)}`,
    teams: [
      continentalClub(`${prefix}-BR-${groupIndex + 1}`, 'Brasil', 85 - groupIndex),
      continentalClub(`${prefix}-AR-${groupIndex + 1}`, 'Argentina', 80 - groupIndex),
      continentalClub(`${prefix}-CL-${groupIndex + 1}`, 'Chile', 75 - groupIndex),
      continentalClub(`${prefix}-CO-${groupIndex + 1}`, 'Colômbia', 70 - groupIndex),
    ],
  }))
}

function buildGroupFixtures(
  competitionId: string,
  groups: ContinentalGroup[],
  startDay: number,
): SimFixture[] {
  const rows: SimFixture[] = []
  for (const group of groups) {
    for (let leg = 0; leg < 2; leg++) {
      const round = leg * 3 + 1
      for (let i = 0; i < group.teams.length; i++) {
        for (let j = i + 1; j < group.teams.length; j++) {
          const home = leg === 0 ? group.teams[i] : group.teams[j]
          const away = leg === 0 ? group.teams[j] : group.teams[i]
          const date = new Date(Date.UTC(2026, 3, startDay + round - 1))
          date.setUTCMinutes(rows.length % 8 * 30)
          rows.push({
            id: `group-${competitionId}-${rows.length}`,
            competition_id: competitionId,
            season_id: seasonId,
            round,
            scheduled_at: date.toISOString(),
            status: 'completed',
            home_club_id: home.id,
            away_club_id: away.id,
            home_score: 1,
            away_score: 0,
            winner_club_id: home.id,
            home_club: { name: home.id, short_name: home.id },
            away_club: { name: away.id, short_name: away.id },
          })
        }
      }
    }
  }
  return rows
}

function fixtureFromContinental(
  competitionId: string,
  index: number,
  item: {
    round: number
    homeClubId: string
    awayClubId: string
    scheduledAt: string
    stage?: string
  },
): SimFixture {
  return {
    id: `continental-${competitionId}-${index}`,
    competition_id: competitionId,
    season_id: seasonId,
    round: item.round,
    scheduled_at: item.scheduledAt,
    status: 'completed',
    home_club_id: item.homeClubId,
    away_club_id: item.awayClubId,
    home_score: 1,
    away_score: 0,
    winner_club_id: item.homeClubId,
    home_club: { name: item.homeClubId, short_name: item.homeClubId },
    away_club: { name: item.awayClubId, short_name: item.awayClubId },
  }
}

function simulateContinentalKnockout(
  competitionId: string,
  winners: string[],
  runnersUp: string[],
  startRound: number,
  fixtures: SimFixture[],
) {
  let currentWinners = [...winners]
  let currentRunners = [...runnersUp]
  let round = startRound

  if (competitionId === 'sudamericana') {
    const playoffPairs = pairSudamericanaPlayoffs(currentWinners, currentRunners)
    const playoff = buildTwoLegFixtures(
      playoffPairs,
      round,
      '2026-07-01',
      '2026-07-08',
      'sudamericana_playoff',
    )
    const played = playoff.map((item, index) => fixtureFromContinental(competitionId, fixtures.length + index, item))
    fixtures.push(...played)

    const playoffWinners: string[] = []
    for (let i = 0; i < playoffPairs.length; i++) {
      const first = played[i * 2]
      const second = played[i * 2 + 1]
      playoffWinners.push(resolveContinentalTwoLegTie(first, second, first.home_club_id))
    }
    currentWinners = playoffWinners
    currentRunners = []
    round = 3
  }

  const pairs = competitionId === 'libertadores'
    ? pairLibertadoresRoundOf16(currentWinners, currentRunners)
    : Array.from({ length: Math.floor(currentWinners.length / 2) }, (_, i) => ({
        homeClubId: currentWinners[i * 2],
        awayClubId: currentWinners[i * 2 + 1],
      }))

  let active = pairs

  for (const stage of ['round_of_16', 'quarterfinals', 'semifinals'] as const) {
    if (!active.length) break
    const firstDate = `2026-08-${String(1 + round * 3).padStart(2, '0')}`
    const secondDate = `2026-08-${String(8 + round * 3).padStart(2, '0')}`
    const tieFixtures = buildTwoLegFixtures(active, round, firstDate, secondDate, stage)
    const played = tieFixtures.map((item, index) => fixtureFromContinental(competitionId, fixtures.length + index, item))
    fixtures.push(...played)

    const winnersNext: string[] = []
    for (let i = 0; i < active.length; i++) {
      const first = played[i * 2]
      const second = played[i * 2 + 1]
      winnersNext.push(resolveContinentalTwoLegTie(first, second, first.home_club_id))
    }

    active = Array.from({ length: Math.floor(winnersNext.length / 2) }, (_, i) => ({
      homeClubId: winnersNext[i * 2],
      awayClubId: winnersNext[i * 2 + 1],
    }))
    round += 2
  }

  if (active.length === 1) {
    const final = buildSingleFinalFixture(
      active[0].homeClubId,
      active[0].awayClubId,
      9,
      '2026-11-28T20:00:00.000Z',
    )
    fixtures.push(fixtureFromContinental(competitionId, fixtures.length, final))
    const last = fixtures.at(-1)!
    expect(resolveContinentalSingleMatch(last, last.home_club_id)).toBe(last.home_club_id)
  }
}

function simulateContinental(prefix: 'lib' | 'sul') {
  const competitionId = prefix === 'lib' ? 'libertadores' : 'sudamericana'
  const groups = buildGroups(prefix)
  const teams = groups.flatMap(group => group.teams)
  const groupFixtures = buildGroupFixtures(
    competitionId,
    groups,
    prefix === 'lib' ? 7 : 8,
  )

  const qualification = buildContinentalGroupQualification(
    groups,
    groupFixtures,
  )

  const allFixtures = [...groupFixtures]
  if (prefix === 'lib') {
    simulateContinentalKnockout(competitionId, qualification.winners, qualification.runnersUp, 1, allFixtures)
  } else {
    simulateContinentalKnockout(competitionId, qualification.runnersUp, qualification.thirds, 1, allFixtures)
  }

  return { groups, teams, fixtures: allFixtures }
}

describe('season simulation', () => {
  it('simula uma temporada completa de 2026 sem intervenção manual', () => {
    const leagueRows = buildLeagueFixtures(seasonId, '2026-01-28', liga, 'liga')
    const serieBRows = buildLeagueFixtures(seasonId, '2026-01-28', serieB, 'serie-b')
    const cupFixtures = simulateBrazilCup()
    const libertadores = simulateContinental('lib')
    const sudamericana = simulateContinental('sul')

    expect(leagueRows).toHaveLength(16 * 15)
    expect(serieBRows).toHaveLength(20 * 19)
    expect(new Date(leagueRows[0].scheduled_at).toISOString().startsWith('2026-01-28')).toBe(true)
    expect(new Date(serieBRows[0].scheduled_at).toISOString().startsWith('2026-01-28')).toBe(true)
    expect(new Date(cupFixtures[0].scheduled_at).toISOString().startsWith('2026-02-18')).toBe(true)

    const libGroupDates = libertadores.fixtures.filter(f => f.round <= 6).map(f => f.scheduled_at).sort()
    const sulGroupDates = sudamericana.fixtures.filter(f => f.round <= 6).map(f => f.scheduled_at).sort()
    expect(libGroupDates[0].startsWith('2026-04-07')).toBe(true)
    expect(sulGroupDates[0].startsWith('2026-04-08')).toBe(true)

    const leagueFixtures = playLeague(leagueRows.map((row, i) => asFixture(row, i)))
    const serieBFixtures = playLeague(serieBRows.map((row, i) => asFixture(row, i)))
    const leagueStandings = buildStandings(liga, leagueFixtures)
    const serieBStandings = buildStandings(serieB, serieBFixtures)

    expect(leagueStandings).toHaveLength(16)
    expect(serieBStandings).toHaveLength(20)
    expect(leagueFixtures.every(f => f.status === 'completed')).toBe(true)
    expect(serieBFixtures.every(f => f.status === 'completed')).toBe(true)

    expect(cupFixtures).toHaveLength(4 + 16 + 16 + 8 + 4 + 1)
    expect(cupFixtures.every(f => f.status === 'completed')).toBe(true)
    expect(cupFixtures.at(-1)?.round).toBe(9)
    expect(cupFixtures.at(-1)?.winner_club_id).toBeTruthy()

    expect(libertadores.fixtures.every(f => f.status === 'completed')).toBe(true)
    expect(sudamericana.fixtures.every(f => f.status === 'completed')).toBe(true)
    expect(libertadores.fixtures.some(f => f.round === 9)).toBe(true)
    expect(sudamericana.fixtures.some(f => f.round === 9)).toBe(true)

    const completion = buildSeasonCompletion(
      { id: seasonId, name: 'Temporada 2026 · simulation' },
      'liga',
      'copa',
      leagueFixtures,
      cupFixtures,
      [],
      {
        libertadoresId: 'libertadores',
        sudamericanaId: 'sudamericana',
        libertadoresFixtures: libertadores.fixtures,
        sudamericanaFixtures: sudamericana.fixtures,
      },
    )

    expect(completion).not.toBeNull()
    expect(completion?.league.championClubId).toBeTruthy()
    expect(completion?.cup.championClubId).toBeTruthy()
    expect(completion?.libertadores?.championClubId).toBeTruthy()
    expect(completion?.sudamericana?.championClubId).toBeTruthy()

    const report = {
      season: 2026,
      competitions: {
        liga: leagueFixtures.length,
        serieB: serieBFixtures.length,
        copa: cupFixtures.length,
        libertadores: libertadores.fixtures.length,
        sudamericana: sudamericana.fixtures.length,
      },
      completed: {
        liga: leagueFixtures.filter(f => f.status === 'completed').length,
        serieB: serieBFixtures.filter(f => f.status === 'completed').length,
        copa: cupFixtures.filter(f => f.status === 'completed').length,
        libertadores: libertadores.fixtures.filter(f => f.status === 'completed').length,
        sudamericana: sudamericana.fixtures.filter(f => f.status === 'completed').length,
      },
      champions: {
        liga: completion?.league.championClubId,
        copa: completion?.cup.championClubId,
        libertadores: completion?.libertadores?.championClubId,
        sudamericana: completion?.sudamericana?.championClubId,
      },
    }

    console.log('\n=== SEASON SIMULATION 2026 ===')
    console.log(JSON.stringify(report, null, 2))
    console.log('RESULTADO: PASS')
  })
})
