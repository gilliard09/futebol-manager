import { describe, expect, it } from 'vitest'
import { buildPlayerCompetitionStats } from './competitionStats'

describe('competitionStats', () => {
  it('soma gols, assistências, aparições e média', () => {
    const matches = [
      { home_club_id: 'a', away_club_id: 'b', playerRatings: [{ playerId: 'p', name: 'João', position: 'ST', team: 'home', rating: 8, goals: 2, assists: 1, fatigue: 0 }] },
      { home_club_id: 'b', away_club_id: 'a', playerRatings: [{ playerId: 'p', name: 'João', position: 'ST', team: 'away', rating: 6, goals: 1, assists: 0, fatigue: 0 }] },
    ] as any
    const [player] = buildPlayerCompetitionStats(matches)
    expect(player.goals).toBe(3); expect(player.assists).toBe(1); expect(player.appearances).toBe(2); expect(player.averageRating).toBe(7)
  })
  it('filtra estatísticas por competição', () => {
    const matches = [
      { competition_id: 'liga', home_club_id: 'a', away_club_id: 'b', playerRatings: [{ playerId: 'p', name: 'João', position: 'ST', team: 'home', rating: 8, goals: 2, assists: 0, fatigue: 0 }] },
      { competition_id: 'copa', home_club_id: 'a', away_club_id: 'b', playerRatings: [{ playerId: 'p', name: 'João', position: 'ST', team: 'home', rating: 6, goals: 1, assists: 1, fatigue: 0 }] },
    ] as any
    const [player] = buildPlayerCompetitionStats(matches, 'copa')
    expect(player.goals).toBe(1); expect(player.assists).toBe(1); expect(player.appearances).toBe(1); expect(player.averageRating).toBe(6)
  })
})
