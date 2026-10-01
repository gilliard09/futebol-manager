import { describe, expect, it } from 'vitest'
import { resolveSerieBPromotion, resolveDivisionMovement, swapDivisions } from './divisionSystem'

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
  it('move os clubes entre as divisões sem alterar os demais', () => {
    const clubs = [
      { id: 'a', name: 'A', short_name: 'A', city: 'A', country: 'Brasil', division: 1, budget: 0, reputation: 50 },
      { id: 'b', name: 'B', short_name: 'B', city: 'B', country: 'Brasil', division: 2, budget: 0, reputation: 50 },
      { id: 'c', name: 'C', short_name: 'C', city: 'C', country: 'Brasil', division: 2, budget: 0, reputation: 50 },
    ]
    expect(swapDivisions(clubs, ['b'], ['a']).map(club => [club.id, club.division])).toEqual([['a',2],['b',1],['c',2]])
  })
})
