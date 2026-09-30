import type { StandingRow } from './competitions'

export type CompetitionHistory = {
  season: string
  leagueChampionId: string | null
  leagueChampionName: string | null
  cupChampionId: string | null
  cupChampionName: string | null
  relegatedClubIds: string[]
}

export function getRelegatedTeams(standings: StandingRow[], slots = 4) {
  if (standings.length < slots) return []
  return standings.slice(-slots).map(team => team.id)
}

export function createSeasonHistory(
  season: string,
  standings: StandingRow[],
  cupChampion?: { id: string; name: string } | null,
): CompetitionHistory {
  const champion = standings[0] ?? null
  return {
    season,
    leagueChampionId: champion?.id ?? null,
    leagueChampionName: champion?.name ?? null,
    cupChampionId: cupChampion?.id ?? null,
    cupChampionName: cupChampion?.name ?? null,
    relegatedClubIds: getRelegatedTeams(standings),
  }
}


import type { PlayedMatch } from '../types/game'
import { buildStandings } from './competitions'

export type CompetitionHistoryResult = {
  championClubId: string | null
  runnerUpClubId: string | null
  topScorerPlayerId: string | null
  topScorerGoals: number
}

export function getCompetitionTopScorer(matches: PlayedMatch[], competitionId: string) {
  const totals = new Map<string, { playerId: string; name: string; goals: number }>()
  for (const match of matches.filter(item => item.competition_id === competitionId)) {
    for (const rating of match.playerRatings) {
      const current = totals.get(rating.playerId) ?? { playerId: rating.playerId, name: rating.name, goals: 0 }
      current.goals += rating.goals
      totals.set(rating.playerId, current)
    }
  }
  return [...totals.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))[0] ?? null
}

export function buildCompetitionHistoryResult(
  competitionId: string,
  fixtures: Array<{
    round: number
    status: string
    home_club_id: string
    away_club_id: string
    home_score: number | null
    away_score: number | null
    winner_club_id?: string | null
  }>,
  matches: PlayedMatch[],
  league = false,
): CompetitionHistoryResult | null {
  const completed = fixtures.filter(item => item.status === 'completed')
  if (!completed.length) return null

  let championClubId: string | null = null
  let runnerUpClubId: string | null = null

  if (league) {
    const teams = [...new Set(fixtures.flatMap(item => [item.home_club_id, item.away_club_id]))].map(id => ({ id, name: id }))
    const standings = buildStandings(teams, fixtures as any)
    if (completed.length !== fixtures.length || !standings[0]) return null
    championClubId = standings[0].id
    runnerUpClubId = standings[1]?.id ?? null
  } else {
    const final = fixtures.find(item => item.round === 7 && item.status === 'completed')
    if (!final || !final.winner_club_id) return null
    championClubId = final.winner_club_id
    runnerUpClubId = final.home_club_id === championClubId ? final.away_club_id : final.home_club_id
  }

  const scorer = getCompetitionTopScorer(matches, competitionId)
  return {
    championClubId,
    runnerUpClubId,
    topScorerPlayerId: scorer?.playerId ?? null,
    topScorerGoals: scorer?.goals ?? 0,
  }
}
