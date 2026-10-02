import { describe, expect, it } from 'vitest'
import { buildLeagueFixtures, buildCupFixtures } from './seasonSchedule'
import {
  buildStandings,
  resolveCompletedKnockoutStage,
} from './competitions'
import {
  buildContinentalGroupQualification,
  pairLibertadoresRoundOf16,
  pairSudamericanaPlayoffs,
  buildTwoLegFixtures,
  buildSingleFinalFixture,
  resolveContinentalTwoLegTie,
  resolveContinentalSingleMatch,
  pairSequential,
  type ContinentalGroup,
  type ContinentalTeam,
  type ContinentalStage,
} from './continentalCompetition'
import { buildSeasonCompletion } from './seasonHistory'
import type { Club, Fixture } from '../types/game'

type SimFixture = Fixture & { stage?: ContinentalStage }

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
    winner_club_id: fixture.home_club_id,
  })) as SimFixture[]
}

function playKnockoutStage(rows: SimFixture[]) {
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
  const all = [...playKnockoutStage(initial)]
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
    all.push(...playKnockoutStage(nextRows))
  }

  return all
}

function continentalClub(id: string, country: string, strength = 70): ContinentalTeam {
  return { id, name: id, country, strength, reputation: strength }
}

function buildGroups(prefix: string, qualifiedFromPreliminary: string[] = []): ContinentalGroup[] {
  return Array.from({ length: 8 }, (_, groupIndex) => ({
    code: `${prefix}-${String.fromCharCode(65 + groupIndex)}`,
    teams: [
      continentalClub(
        qualifiedFromPreliminary[groupIndex] ?? `${prefix}-BR-${groupIndex + 1}`,
        qualifiedFromPreliminary[groupIndex] ? 'Brasil' : 'Brasil',
        85 - groupIndex,
      ),
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
    const [a, b, c, d] = group.teams
    const rounds: Array<Array<[ContinentalTeam, ContinentalTeam]>> = [
      [[a, b], [c, d]],
      [[a, c], [d, b]],
      [[a, d], [b, c]],
      [[b, a], [d, c]],
      [[c, a], [b, d]],
      [[d, a], [c, b]],
    ]

    rounds.forEach((pairings, roundIndex) => {
      const round = roundIndex + 1
      for (const [home, away] of pairings) {
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
          stage: 'group_stage',
          home_club: { name: home.id, short_name: home.id },
          away_club: { name: away.id, short_name: away.id },
        })
      }
    })
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
    stage?: ContinentalStage
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
    stage: item.stage,
    home_club: { name: item.homeClubId, short_name: item.homeClubId },
    away_club: { name: item.awayClubId, short_name: item.awayClubId },
  }
}

function stageFixtures(fixtures: SimFixture[], stage: ContinentalStage) {
  return fixtures.filter(fixture => fixture.stage === stage)
}

function stageDates(fixtures: SimFixture[], stage: ContinentalStage) {
  return [...new Set(stageFixtures(fixtures, stage).map(fixture => fixture.scheduled_at.slice(0, 10)))]
    .sort()
}

function simulateLibertadoresPreliminary() {
  const teams = Array.from({ length: 8 }, (_, index) =>
    continentalClub(`lib-pre-${index + 1}`, index % 2 === 0 ? 'Brasil' : 'Paraguai', 72 - index),
  )
  const pairs = pairSequential(teams.map(team => team.id))
  const rows = buildTwoLegFixtures(
    pairs,
    1,
    '2026-02-18',
    '2026-02-25',
    'libertadores_preliminary',
  )
  const fixtures = rows.map((item, index) => fixtureFromContinental('libertadores', index, item))
  const winners: string[] = []

  for (let i = 0; i < pairs.length; i++) {
    const first = fixtures[i * 2]
    const second = fixtures[i * 2 + 1]
    winners.push(resolveContinentalTwoLegTie(first, second, first.home_club_id))
  }

  return { teams, pairs, fixtures, winners }
}

function simulateContinentalKnockout(
  competitionId: string,
  winners: string[],
  runnersUp: string[],
  fixtures: SimFixture[],
  libertadoresThirds: string[] = [],
) {
  let currentWinners = [...winners]
  let currentRunners = [...runnersUp]

  if (competitionId === 'sudamericana') {
    const playoffPairs = pairSudamericanaPlayoffs(libertadoresThirds, currentRunners)
    const playoff = buildTwoLegFixtures(
      playoffPairs,
      1,
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
  }

  const pairs = competitionId === 'libertadores'
    ? pairLibertadoresRoundOf16(currentWinners, currentRunners)
    : currentWinners.map((winner, index) => ({
        homeClubId: winner,
        awayClubId: winners[index],
      }))

  let active = pairs
  const stages: Array<{
    stage: 'round_of_16' | 'quarterfinals' | 'semifinals'
    round: number
    firstDate: string
    secondDate: string
  }> = competitionId === 'libertadores'
    ? [
        { stage: 'round_of_16', round: 1, firstDate: '2026-08-12', secondDate: '2026-08-19' },
        { stage: 'quarterfinals', round: 3, firstDate: '2026-09-09', secondDate: '2026-09-16' },
        { stage: 'semifinals', round: 5, firstDate: '2026-10-21', secondDate: '2026-10-28' },
      ]
    : [
        { stage: 'round_of_16', round: 3, firstDate: '2026-07-29', secondDate: '2026-08-05' },
        { stage: 'quarterfinals', round: 5, firstDate: '2026-08-19', secondDate: '2026-08-26' },
        { stage: 'semifinals', round: 7, firstDate: '2026-09-16', secondDate: '2026-09-23' },
      ]

  let finalists: string[] = []

  for (const stage of stages) {
    expect(active.length).toBe(stage.stage === 'round_of_16' ? 8 : stage.stage === 'quarterfinals' ? 4 : 2)
    const tieFixtures = buildTwoLegFixtures(
      active,
      stage.round,
      stage.firstDate,
      stage.secondDate,
      stage.stage,
    )
    const played = tieFixtures.map((item, index) => fixtureFromContinental(competitionId, fixtures.length + index, item))
    fixtures.push(...played)

    const winnersNext: string[] = []
    for (let i = 0; i < active.length; i++) {
      const first = played[i * 2]
      const second = played[i * 2 + 1]
      winnersNext.push(resolveContinentalTwoLegTie(first, second, first.home_club_id))
    }

    finalists = winnersNext
    active = Array.from({ length: Math.floor(winnersNext.length / 2) }, (_, i) => ({
      homeClubId: winnersNext[i * 2],
      awayClubId: winnersNext[i * 2 + 1],
    }))
  }

  expect(finalists).toHaveLength(2)
  const final = buildSingleFinalFixture(
    finalists[0],
    finalists[1],
    9,
    '2026-11-28T20:00:00.000Z',
  )
  fixtures.push(fixtureFromContinental(competitionId, fixtures.length, final))
  const last = fixtures.at(-1)!
  expect(resolveContinentalSingleMatch(last, last.home_club_id)).toBe(last.home_club_id)

  return { finalists }
}

function simulateContinental(prefix: 'lib' | 'sul', libertadoresThirds: string[] = []) {
  const competitionId = prefix === 'lib' ? 'libertadores' : 'sudamericana'
  const preliminary = prefix === 'lib' ? simulateLibertadoresPreliminary() : null
  const groups = buildGroups(prefix, preliminary?.winners ?? [])
  const teams = groups.flatMap(group => group.teams)
  const groupFixtures = buildGroupFixtures(
    competitionId,
    groups,
    prefix === 'lib' ? 7 : 8,
  )

  const qualification = buildContinentalGroupQualification(groups, groupFixtures)
  const allFixtures = [...(preliminary?.fixtures ?? []), ...groupFixtures]

  const knockout = prefix === 'lib'
    ? simulateContinentalKnockout(competitionId, qualification.winners, qualification.runnersUp, allFixtures)
    : simulateContinentalKnockout(
        competitionId,
        qualification.winners,
        qualification.runnersUp,
        allFixtures,
        libertadoresThirds,
      )

  return {
    groups,
    teams,
    fixtures: allFixtures,
    qualification,
    preliminary,
    knockout,
  }
}

describe('season simulation', () => {
  it('simula uma temporada completa de 2026 sem intervenção manual', () => {
    const leagueRows = buildLeagueFixtures(seasonId, '2026-01-28', liga, 'liga')
    const serieBRows = buildLeagueFixtures(seasonId, '2026-01-28', serieB, 'serie-b')
    const cupFixtures = simulateBrazilCup()
    const libertadores = simulateContinental('lib')
    const sudamericana = simulateContinental('sul', libertadores.qualification.thirds)

    expect(leagueRows).toHaveLength(16 * 15)
    expect(serieBRows).toHaveLength(20 * 19)
    expect(new Date(leagueRows[0].scheduled_at).toISOString().startsWith('2026-01-28')).toBe(true)
    expect(new Date(serieBRows[0].scheduled_at).toISOString().startsWith('2026-01-28')).toBe(true)
    expect(new Date(cupFixtures[0].scheduled_at).toISOString().startsWith('2026-02-18')).toBe(true)

    const libPreliminary = libertadores.preliminary!
    expect(libPreliminary.fixtures).toHaveLength(8)
    expect(libPreliminary.winners).toHaveLength(4)
    expect(stageDates(libertadores.fixtures, 'libertadores_preliminary')).toEqual(['2026-02-18', '2026-02-25'])

    const libGroupFixtures = stageFixtures(libertadores.fixtures, 'group_stage')
    const sulGroupFixtures = stageFixtures(sudamericana.fixtures, 'group_stage')
    expect(libGroupFixtures).toHaveLength(8 * 12)
    expect(sulGroupFixtures).toHaveLength(8 * 12)
    expect(new Set(libGroupFixtures.map(f => f.round))).toEqual(new Set([1, 2, 3, 4, 5, 6]))
    expect(new Set(sulGroupFixtures.map(f => f.round))).toEqual(new Set([1, 2, 3, 4, 5, 6]))
    expect(stageDates(libertadores.fixtures, 'group_stage')).toEqual([
      '2026-04-07',
      '2026-04-08',
      '2026-04-09',
      '2026-04-10',
      '2026-04-11',
      '2026-04-12',
    ])
    expect(stageDates(sudamericana.fixtures, 'group_stage')).toEqual([
      '2026-04-08',
      '2026-04-09',
      '2026-04-10',
      '2026-04-11',
      '2026-04-12',
      '2026-04-13',
    ])

    expect(libertadores.qualification.winners).toHaveLength(8)
    expect(libertadores.qualification.runnersUp).toHaveLength(8)
    expect(libertadores.qualification.thirds).toHaveLength(8)
    expect(sudamericana.qualification.winners).toHaveLength(8)
    expect(sudamericana.qualification.runnersUp).toHaveLength(8)
    expect(sudamericana.qualification.thirds).toHaveLength(8)

    const libStages = {
      preliminary: stageFixtures(libertadores.fixtures, 'libertadores_preliminary'),
      group: libGroupFixtures,
      roundOf16: stageFixtures(libertadores.fixtures, 'round_of_16'),
      quarterfinals: stageFixtures(libertadores.fixtures, 'quarterfinals'),
      semifinals: stageFixtures(libertadores.fixtures, 'semifinals'),
      final: stageFixtures(libertadores.fixtures, 'final'),
    }
    expect(libStages.preliminary).toHaveLength(8)
    expect(libStages.roundOf16).toHaveLength(16)
    expect(libStages.quarterfinals).toHaveLength(8)
    expect(libStages.semifinals).toHaveLength(4)
    expect(libStages.final).toHaveLength(1)
    expect(libStages.final[0].scheduled_at).toBe('2026-11-28T20:00:00.000Z')
    expect(stageDates(libertadores.fixtures, 'round_of_16')).toEqual(['2026-08-12', '2026-08-19'])
    expect(stageDates(libertadores.fixtures, 'quarterfinals')).toEqual(['2026-09-09', '2026-09-16'])
    expect(stageDates(libertadores.fixtures, 'semifinals')).toEqual(['2026-10-21', '2026-10-28'])

    const sulStages = {
      playoff: stageFixtures(sudamericana.fixtures, 'sudamericana_playoff'),
      roundOf16: stageFixtures(sudamericana.fixtures, 'round_of_16'),
      quarterfinals: stageFixtures(sudamericana.fixtures, 'quarterfinals'),
      semifinals: stageFixtures(sudamericana.fixtures, 'semifinals'),
      final: stageFixtures(sudamericana.fixtures, 'final'),
    }
    expect(sulStages.playoff).toHaveLength(16)
    expect(sulStages.roundOf16).toHaveLength(16)
    expect(sulStages.quarterfinals).toHaveLength(8)
    expect(sulStages.semifinals).toHaveLength(4)
    expect(sulStages.final).toHaveLength(1)
    expect(stageDates(sudamericana.fixtures, 'sudamericana_playoff')).toEqual(['2026-07-01', '2026-07-08'])
    expect(stageDates(sudamericana.fixtures, 'round_of_16')).toEqual(['2026-07-29', '2026-08-05'])
    expect(stageDates(sudamericana.fixtures, 'quarterfinals')).toEqual(['2026-08-19', '2026-08-26'])
    expect(stageDates(sudamericana.fixtures, 'semifinals')).toEqual(['2026-09-16', '2026-09-23'])

    const libKnockoutParticipants = new Set([
      ...libertadores.qualification.winners,
      ...libertadores.qualification.runnersUp,
    ])
    expect(libKnockoutParticipants.size).toBe(16)
    expect(stageFixtures(libertadores.fixtures, 'round_of_16').flatMap(f => [f.home_club_id, f.away_club_id]).length).toBe(16 * 2)

    const sulPlayoffParticipants = new Set([
      ...libertadores.qualification.thirds,
      ...sudamericana.qualification.runnersUp,
    ])
    expect(sulPlayoffParticipants.size).toBe(16)
    const sulR16Participants = new Set(
      stageFixtures(sudamericana.fixtures, 'round_of_16').flatMap(f => [f.home_club_id, f.away_club_id]),
    )
    expect(sulR16Participants.size).toBe(16)

    expect(libertadores.fixtures.every(f => f.status === 'completed')).toBe(true)
    expect(sudamericana.fixtures.every(f => f.status === 'completed')).toBe(true)
    expect(libertadores.fixtures).toHaveLength(133)
    expect(sudamericana.fixtures).toHaveLength(141)

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
    expect(completion?.league.runnerUpClubId).toBeTruthy()
    expect(completion?.cup.championClubId).toBeTruthy()
    expect(completion?.cup.runnerUpClubId).toBeTruthy()
    expect(completion?.libertadores?.championClubId).toBeTruthy()
    expect(completion?.libertadores?.runnerUpClubId).toBeTruthy()
    expect(completion?.sudamericana?.championClubId).toBeTruthy()
    expect(completion?.sudamericana?.runnerUpClubId).toBeTruthy()

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
