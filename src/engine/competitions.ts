import type { Fixture } from '../types/game'

export type StandingRow = {
  id: string
  name: string
  played: number
  wins: number
  draws: number
  losses: number
  gf: number
  ga: number
  points: number
}

export function buildStandings(
  teams: Array<{ id: string; name: string }>,
  fixtures: Fixture[],
): StandingRow[] {
  const table = new Map<string, StandingRow>()
  teams.forEach(team => table.set(team.id, {
    id: team.id, name: team.name, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0,
  }))

  fixtures.filter(f => f.status === 'completed' && f.home_score != null && f.away_score != null).forEach(fixture => {
    const home = table.get(fixture.home_club_id)
    const away = table.get(fixture.away_club_id)
    if (!home || !away) return
    const goalsHome = Math.max(0, fixture.home_score ?? 0)
    const goalsAway = Math.max(0, fixture.away_score ?? 0)
    home.played++; away.played++
    home.gf += goalsHome; home.ga += goalsAway
    away.gf += goalsAway; away.ga += goalsHome
    if (goalsHome > goalsAway) { home.wins++; home.points += 3; away.losses++ }
    else if (goalsHome < goalsAway) { away.wins++; away.points += 3; home.losses++ }
    else { home.draws++; away.draws++; home.points++; away.points++ }
  })

  return [...table.values()].sort((a, b) =>
    b.points - a.points ||
    (b.gf - b.ga) - (a.gf - a.ga) ||
    b.gf - a.gf ||
    a.name.localeCompare(b.name)
  )
}

export type KnockoutPairing = {
  round: number
  homeClubId: string
  awayClubId: string
}

export function createKnockoutRound(clubIds: string[], round: number): KnockoutPairing[] {
  const shuffled = [...clubIds]
  return Array.from({ length: Math.floor(shuffled.length / 2) }, (_, index) => ({
    round,
    homeClubId: shuffled[index * 2],
    awayClubId: shuffled[index * 2 + 1],
  }))
}

export function getKnockoutWinner(homeScore: number, awayScore: number, homeClubId: string, awayClubId: string) {
  if (homeScore > awayScore) return homeClubId
  if (awayScore > homeScore) return awayClubId
  return null
}

export function getCompetitionStageLabel(round: number, totalRounds: number, knockout = false) {
  if (!knockout) return `Rodada ${round}`
  const remaining = totalRounds - round + 1
  if (remaining === 1) return 'Final'
  if (remaining === 2) return 'Semifinal'
  if (remaining === 3) return 'Quartas de final'
  return `Oitavas de final`
}
