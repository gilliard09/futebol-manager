import { describe, expect, it } from 'vitest'
import { resolveSerieBPromotion, resolveDivisionMovement, swapDivisions, SERIE_B_2026_CLUBS } from './divisionSystem'
import { buildLeagueFixtures } from './seasonSchedule'

const rows = (ids: string[]) => ids.map((id, index) => ({
  id, name: id, played: 38, wins: 20 - index, draws: 5, losses: 13 + index, gf: 50 - index, ga: 30, points: 65 - index * 2,
}))

describe('division system', () => {
  it('promove os dois primeiros diretamente e resolve os dois playoffs do G4', () => {
    const result = resolveSerieBPromotion(rows(['1','2','3','4','5','6']), { '3': 80, '4': 80, '5': 70, '6': 50 })
    expect(result.promotedClubIds).toEqual(['1','2','3','4'])
    expect(result.playoffs).toEqual([
      { first: '3', second: '6', winner: '3' },
      { first: '4', second: '5', winner: '4' },
    ])
  })
  it('rebaixa os quatro últimos da elite e promove quatro da Série B', () => {
    const result = resolveDivisionMovement(rows(['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p']), rows(['q','r','s','t','u','v']), { s: 80, v: 50, t: 80, u: 50 })
    expect(result.relegatedClubIds).toEqual(['m','n','o','p'])
    expect(result.promotedClubIds).toEqual(['q','r','s','t'])
  })
  it('mantém a Série B com 20 clubes e 38 rodadas de ida e volta', () => {
    expect(SERIE_B_2026_CLUBS).toHaveLength(20)
    const clubs = SERIE_B_2026_CLUBS.map((seed, index) => ({
      id: `b-${index}`, name: seed.name, short_name: seed.shortName, city: seed.city, country: 'Brasil',
      division: 2, budget: seed.budget, reputation: seed.reputation, strength: seed.strength,
    }))
    const fixtures = buildLeagueFixtures('season', '2026-03-21', clubs, 'serie-b')
    expect(fixtures).toHaveLength(380)
    expect(new Set(fixtures.map(item => item.round))).toHaveSize(38)
    expect(fixtures.filter(item => item.round === 1)).toHaveLength(10)
    expect(fixtures.filter(item => item.round === 38)).toHaveLength(10)
  })

  it('move os clubes entre as divisões sem alterar os demais', () => {
    const clubs = [
      { id: 'a', name: 'A', short_name: 'A', city: 'A', country: 'Brasil', division: 1, budget: 0, reputation: 50 },
      { id: 'b', name: 'B', short_name: 'B', city: 'B', country: 'Brasil', division: 2, budget: 0, reputation: 50 },
      { id: 'c', name: 'C', short_name: 'C', city: 'C', country: 'Brasil', division: 2, budget: 0, reputation: 50 },
    ]
    expect(swapDivisions(clubs, ['b'], ['a']).map(club => [club.id, club.division])).toEqual([['a',2],['b',1],['c',2]])
  })
})
