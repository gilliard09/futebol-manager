import { describe, expect, it } from 'vitest'
import { resolveBrazilianContinentalQualifications } from './continentalQualification'
import type { StandingRow } from './competitions'

function standings(count = 16): StandingRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `club-${index + 1}`,
    name: `Clube ${index + 1}`,
    played: 30,
    wins: 20 - index,
    draws: 5,
    losses: 5 + index,
    gf: 50 - index,
    ga: 20 + index,
    points: 65 - index * 2,
  }))
}

function divisions() {
  return Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`club-${index + 1}`, 1]))
}

describe('resolveBrazilianContinentalQualifications', () => {
  it('classifica G4 + campeão da Copa para a Libertadores e 6º-11º para a Sul-Americana', () => {
    const result = resolveBrazilianContinentalQualifications({
      leagueStandings: standings(),
      cupChampionId: 'club-12',
      clubDivisions: divisions(),
    })

    expect(result.filter(item => item.competition === 'libertadores').map(item => item.clubId))
      .toEqual(['club-1', 'club-2', 'club-3', 'club-4', 'club-12'])

    expect(result.filter(item => item.competition === 'sudamericana').map(item => item.clubId))
      .toEqual(['club-6', 'club-7', 'club-8', 'club-9', 'club-10', 'club-11'])
  })

  it('move a vaga da Libertadores para o 5º quando o campeão da Copa está no G4', () => {
    const result = resolveBrazilianContinentalQualifications({
      leagueStandings: standings(),
      cupChampionId: 'club-3',
      clubDivisions: divisions(),
    })

    expect(result.filter(item => item.competition === 'libertadores').map(item => item.clubId))
      .toEqual(['club-1', 'club-2', 'club-3', 'club-4', 'club-5'])
  })

  it('não permite clube rebaixado na Libertadores e redistribui a vaga pela Liga', () => {
    const result = resolveBrazilianContinentalQualifications({
      leagueStandings: standings(),
      cupChampionId: 'club-12',
      clubDivisions: divisions(),
      relegatedClubIds: ['club-2', 'club-12'],
    })

    expect(result.filter(item => item.competition === 'libertadores').map(item => item.clubId))
      .toEqual(['club-1', 'club-3', 'club-4', 'club-5', 'club-6'])

    expect(result.filter(item => item.competition === 'sudamericana').map(item => item.clubId))
      .toEqual(['club-7', 'club-8', 'club-9', 'club-10', 'club-11', 'club-13'])
  })

  it('não usa clube da Série B como substituto continental', () => {
    const clubDivisions = { ...divisions(), 'club-5': 2 }
    const result = resolveBrazilianContinentalQualifications({
      leagueStandings: standings(),
      cupChampionId: 'club-5',
      clubDivisions,
    })

    expect(result.filter(item => item.competition === 'libertadores').map(item => item.clubId))
      .toEqual(['club-1', 'club-2', 'club-3', 'club-4', 'club-6'])
    expect(result.some(item => item.clubId === 'club-5')).toBe(false)
  })

  it('adiciona vaga extra quando o campeão continental é um clube brasileiro elegível', () => {
    const result = resolveBrazilianContinentalQualifications({
      leagueStandings: standings(),
      cupChampionId: 'club-12',
      clubDivisions: divisions(),
      libertadoresHolderId: 'club-14',
      sudamericanaHolderId: 'club-15',
    })

    expect(result.filter(item => item.competition === 'libertadores').map(item => item.clubId))
      .toEqual(['club-14', 'club-1', 'club-2', 'club-3', 'club-4', 'club-12'])
    expect(result.filter(item => item.competition === 'sudamericana').map(item => item.clubId))
      .toEqual(['club-15', 'club-6', 'club-7', 'club-8', 'club-9', 'club-10', 'club-11'])
  })
})
