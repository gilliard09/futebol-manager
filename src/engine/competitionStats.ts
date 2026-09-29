import type { PlayedMatch } from '../types/game'

export type PlayerCompetitionStat = { playerId: string; name: string; clubId: string; goals: number; assists: number; appearances: number; averageRating: number }

export function buildPlayerCompetitionStats(matches: PlayedMatch[]): PlayerCompetitionStat[] {
  const stats = new Map<string, PlayerCompetitionStat>()
  for (const match of matches) for (const rating of match.playerRatings) {
    const clubId = rating.team === 'home' ? match.home_club_id : match.away_club_id
    const current = stats.get(rating.playerId) ?? { playerId: rating.playerId, name: rating.name, clubId, goals: 0, assists: 0, appearances: 0, averageRating: 0 }
    current.goals += rating.goals; current.assists += rating.assists; current.appearances += 1
    current.averageRating = ((current.averageRating * (current.appearances - 1)) + rating.rating) / current.appearances
    stats.set(rating.playerId, current)
  }
  return [...stats.values()].sort((a,b) => b.goals-a.goals || b.assists-a.assists || b.averageRating-a.averageRating || a.name.localeCompare(b.name))
}
