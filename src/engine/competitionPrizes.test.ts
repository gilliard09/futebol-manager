import { describe, expect, it } from 'vitest'
import { buildCupPrizePayments, buildLeaguePrizePayments, type CompetitionPrizeConfig } from './competitionPrizes'

const prizes: CompetitionPrizeConfig[] = [
  { id: 'q', competition_id: 'cup', prize_type: 'stage', stage: 'quarterfinal', position_from: null, position_to: null, amount: 4_000_000, description: 'Quartas' },
  { id: 's', competition_id: 'cup', prize_type: 'stage', stage: 'semifinal', position_from: null, position_to: null, amount: 9_000_000, description: 'Semifinal' },
  { id: 'r', competition_id: 'cup', prize_type: 'runner_up', stage: 'runner_up', position_from: null, position_to: null, amount: 34_000_000, description: 'Vice' },
  { id: 'c', competition_id: 'cup', prize_type: 'champion', stage: 'champion', position_from: null, position_to: null, amount: 78_000_000, description: 'Campeão' },
  { id: 'l1', competition_id: 'league', prize_type: 'position', stage: null, position_from: 1, position_to: 1, amount: 50_000_000, description: 'Campeão' },
  { id: 'l2', competition_id: 'league', prize_type: 'position', stage: null, position_from: 2, position_to: 2, amount: 45_000_000, description: 'Vice' },
  { id: 'l5', competition_id: 'league', prize_type: 'position', stage: null, position_from: 5, position_to: 5, amount: 38_000_000, description: '5º' },
]
function fixture(round: number, home: string, away: string, hs: number, as: number, winner: string | null = null): any { return { id: round + '-' + home + '-' + away, round, home_club_id: home, away_club_id: away, home_score: hs, away_score: as, status: 'completed', winner_club_id: winner } }

describe('competition prize engine', () => {
  it('paga liga por posição exata', () => {
    const payments = buildLeaguePrizePayments(prizes, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }, { id: 'e', name: 'E' }])
    expect(payments.map(item => item.amount)).toEqual([50_000_000, 45_000_000, 38_000_000])
  })
  it('acumula quartas + semifinal + campeão', () => {
    const fixtures = [
      fixture(5, 'a', 'b', 2, 0), fixture(5, 'c', 'd', 1, 0), fixture(5, 'e', 'f', 1, 1), fixture(5, 'g', 'h', 2, 1),
      fixture(6, 'b', 'a', 0, 1), fixture(6, 'd', 'c', 1, 1), fixture(6, 'f', 'e', 0, 2), fixture(6, 'h', 'g', 0, 1),
      fixture(7, 'a', 'c', 1, 0), fixture(7, 'e', 'g', 2, 0), fixture(8, 'c', 'a', 0, 0, 'a'), fixture(8, 'g', 'e', 1, 1, 'e'), fixture(9, 'a', 'e', 3, 1, 'a'),
    ]
    const payments = buildCupPrizePayments(prizes, fixtures)
    const byClub = new Map<string, number>()
    payments.forEach(item => byClub.set(item.clubId, (byClub.get(item.clubId) ?? 0) + item.amount))
    expect(byClub.get('a')).toBe(91_000_000)
    expect(byClub.get('e')).toBe(47_000_000)
    expect(byClub.size).toBe(8)
  })
})