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
