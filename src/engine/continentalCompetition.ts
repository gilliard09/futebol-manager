import type { Fixture } from '../types/game'

export type ContinentalCompetition = 'libertadores' | 'sudamericana'
export type ContinentalStage =
  | 'libertadores_preliminary'
  | 'group_stage'
  | 'sudamericana_playoff'
  | 'round_of_16'
  | 'quarterfinals'
  | 'semifinals'
  | 'final'

export type ContinentalTeam = {
  id: string
  name: string
  country?: string
  strength?: number
  reputation?: number
}

export type ContinentalGroup = {
  code: string
  teams: ContinentalTeam[]
}

export type ContinentalQualified = {
  winners: string[]
  runnersUp: string[]
  thirds: string[]
}

export type ContinentalTie = {
  homeClubId: string
  awayClubId: string
}

function strength(team: ContinentalTeam) {
  return Number(team.strength ?? team.reputation ?? 50)
}

function seedValue(input: string) {
  let hash = 2166136261
  for (const char of input) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function continentalAutoScore(
  home: ContinentalTeam,
  away: ContinentalTeam,
  fixture: Pick<Fixture, 'id' | 'round'>,
) {
  const homeStrength = strength(home)
  const awayStrength = strength(away)
  const seed = (seedValue(`${fixture.id}:${fixture.round}`) % 10000) / 10000
  const homeGoals = Math.max(0, Math.min(5, Math.round(seed * 3 + (homeStrength - awayStrength) / 24 + 0.65)))
  const awayGoals = Math.max(0, Math.min(5, Math.round((1 - seed) * 2.7 + (awayStrength - homeStrength) / 25)))
  return [homeGoals, awayGoals] as const
}

export function buildContinentalGroupQualification(
  groups: ContinentalGroup[],
  fixtures: Fixture[],
): ContinentalQualified {
  const winners: string[] = []
  const runnersUp: string[] = []
  const thirds: string[] = []

  for (const group of groups) {
    const ids = new Set(group.teams.map(team => team.id))
    const rows = new Map<string, { id: string; points: number; wins: number; gf: number; ga: number }>()
    for (const team of group.teams) rows.set(team.id, { id: team.id, points: 0, wins: 0, gf: 0, ga: 0 })

    for (const fixture of fixtures) {
      if (fixture.status !== 'completed' || fixture.home_score == null || fixture.away_score == null) continue
      if (!ids.has(fixture.home_club_id) || !ids.has(fixture.away_club_id)) continue
      const home = rows.get(fixture.home_club_id)!
      const away = rows.get(fixture.away_club_id)!
      const hs = Number(fixture.home_score)
      const as = Number(fixture.away_score)
      home.gf += hs; home.ga += as
      away.gf += as; away.ga += hs
      if (hs > as) { home.points += 3; home.wins++ }
      else if (as > hs) { away.points += 3; away.wins++ }
      else { home.points++; away.points++ }
    }

    const ordered = [...rows.values()].sort((a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      (b.gf - b.ga) - (a.gf - a.ga) ||
      b.gf - a.gf ||
      a.id.localeCompare(b.id),
    )
    if (ordered.length === 4) {
      winners.push(ordered[0].id)
      runnersUp.push(ordered[1].id)
      thirds.push(ordered[2].id)
    }
  }

  return { winners, runnersUp, thirds }
}

export function buildTwoLegFixtures(
  pairs: ContinentalTie[],
  round: number,
  firstDate: string,
  secondDate: string,
  stage: ContinentalStage,
): Array<{
  round: number
  homeClubId: string
  awayClubId: string
  scheduledAt: string
  stage: ContinentalStage
}> {
  const rows: Array<{
    round: number
    homeClubId: string
    awayClubId: string
    scheduledAt: string
    stage: ContinentalStage
  }> = []
  pairs.forEach((pair, index) => {
    const first = new Date(firstDate + 'T19:00:00Z')
    first.setUTCMinutes(index * 30)
    const second = new Date(secondDate + 'T19:00:00Z')
    second.setUTCMinutes(index * 30)
    rows.push(
      { round, homeClubId: pair.homeClubId, awayClubId: pair.awayClubId, scheduledAt: first.toISOString(), stage },
      { round: round + 1, homeClubId: pair.awayClubId, awayClubId: pair.homeClubId, scheduledAt: second.toISOString(), stage },
    )
  })
  return rows
}

export function buildSingleFinalFixture(
  homeClubId: string,
  awayClubId: string,
  round: number,
  scheduledAt: string,
): {
  round: number
  homeClubId: string
  awayClubId: string
  scheduledAt: string
  stage: 'final'
} {
  return { round, homeClubId, awayClubId, scheduledAt, stage: 'final' }
}

export function pairLibertadoresRoundOf16(winners: string[], runnersUp: string[]): ContinentalTie[] {
  return winners.map((winner, index) => ({ homeClubId: runnersUp[index], awayClubId: winner }))
}

export function pairSudamericanaPlayoffs(libertadoresThirds: string[], sudamericanaRunnersUp: string[]): ContinentalTie[] {
  const sortedThirds = [...libertadoresThirds].sort()
  const sortedRunners = [...sudamericanaRunnersUp].sort()
  return sortedRunners.map((runner, index) => ({
    homeClubId: runner,
    awayClubId: sortedThirds[(index + 3) % sortedThirds.length],
  }))
}

export function pairSequential(clubs: string[]): ContinentalTie[] {
  return Array.from({ length: Math.floor(clubs.length / 2) }, (_, index) => ({
    homeClubId: clubs[index * 2],
    awayClubId: clubs[index * 2 + 1],
  }))
}

export function resolveContinentalTwoLegTie(
  first: Pick<Fixture, 'home_club_id' | 'away_club_id' | 'home_score' | 'away_score'>,
  second: Pick<Fixture, 'home_club_id' | 'away_club_id' | 'home_score' | 'away_score'>,
  penaltyWinner: string,
) {
  const ids = [first.home_club_id, first.away_club_id]
  const total = (clubId: string) =>
    (first.home_club_id === clubId ? Number(first.home_score ?? 0) : Number(first.away_score ?? 0)) +
    (second.home_club_id === clubId ? Number(second.home_score ?? 0) : Number(second.away_score ?? 0))
  const a = total(ids[0])
  const b = total(ids[1])
  if (a > b) return ids[0]
  if (b > a) return ids[1]
  return ids.includes(penaltyWinner) ? penaltyWinner : ids[0]
}

export function resolveContinentalSingleMatch(
  fixture: Pick<Fixture, 'home_club_id' | 'away_club_id' | 'home_score' | 'away_score'>,
  penaltyWinner: string,
) {
  const home = Number(fixture.home_score ?? 0)
  const away = Number(fixture.away_score ?? 0)
  if (home > away) return fixture.home_club_id
  if (away > home) return fixture.away_club_id
  return penaltyWinner
}
