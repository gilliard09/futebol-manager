import { describe, expect, it } from 'vitest'
import { getCompetitionTopScorer, buildCompetitionHistoryResult, buildSeasonCompletion } from './seasonHistory'

describe('season history', () => {
  it('calcula o artilheiro apenas dentro da competição', () => {
    const matches = [
      { competition_id: 'liga', playerRatings: [{ playerId: 'p1', name: 'A', goals: 2, assists: 0, rating: 7, team: 'home' }] },
      { competition_id: 'copa', playerRatings: [{ playerId: 'p1', name: 'A', goals: 9, assists: 0, rating: 7, team: 'home' }] },
      { competition_id: 'liga', playerRatings: [{ playerId: 'p2', name: 'B', goals: 3, assists: 0, rating: 7, team: 'away' }] },
    ] as any
    expect(getCompetitionTopScorer(matches, 'liga')).toMatchObject({ playerId: 'p2', goals: 3 })
  })

  it('isola o artilheiro por temporada quando há múltiplas temporadas', () => {
    const matches = [
      { competition_id: 'liga', season_id: 's1', playerRatings: [{ playerId: 'p1', name: 'A', goals: 4, assists: 0, rating: 7, team: 'home' }] },
      { competition_id: 'liga', season_id: 's2', playerRatings: [{ playerId: 'p2', name: 'B', goals: 6, assists: 0, rating: 7, team: 'home' }] },
    ] as any
    expect(getCompetitionTopScorer(matches, 'liga', 's1')).toMatchObject({ playerId: 'p1', goals: 4 })
    expect(getCompetitionTopScorer(matches, 'liga', 's2')).toMatchObject({ playerId: 'p2', goals: 6 })
  })

  it('só encerra mata-mata quando a final tem vencedor', () => {
    const fixtures = [
      { round: 7, status: 'completed', home_club_id: 'a', away_club_id: 'b', home_score: 1, away_score: 1, winner_club_id: 'b' },
    ]
    const result = buildCompetitionHistoryResult('copa', fixtures, [] as any[])
    expect(result).toMatchObject({ championClubId: 'b', runnerUpClubId: 'a', topScorerGoals: 0 })
  })
})


import { resolveDivisionMovement } from './seasonHistory'

describe('division movement', () => {

  it('calcula movimento quando uma segunda divisão estiver ativa', () => {
    const standings = [
      { id: 'a', name: 'A', played: 1, wins: 1, draws: 0, losses: 0, gf: 2, ga: 0, points: 3 },
      { id: 'b', name: 'B', played: 1, wins: 0, draws: 0, losses: 1, gf: 0, ga: 2, points: 0 },
    ]
    expect(resolveDivisionMovement(standings, { divisionsActive: true, relegationSlots: 1, promotionSlots: 1 })).toEqual({
      relegatedClubIds: ['b'],
      promotedClubIds: ['a'],
      activated: true,
    })
  })

  it('nao ativa rebaixamento antes da Serie B existir', () => {
    const standings = [{ id: 'a', name: 'A', played: 1, wins: 1, draws: 0, losses: 0, gf: 1, ga: 0, points: 3 }, { id: 'b', name: 'B', played: 1, wins: 0, draws: 0, losses: 1, gf: 0, ga: 1, points: 0 }]
    expect(resolveDivisionMovement(standings)).toEqual({ relegatedClubIds: [], promotedClubIds: [], activated: false })
  })
})
