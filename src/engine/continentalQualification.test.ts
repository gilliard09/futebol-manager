import { describe, expect, it } from 'vitest'
import { buildContinentalGroups, buildContinentalGroupFixtures, resolveBrazilianContinentalQualifications, selectForeignContinentalClubs } from './continentalQualification'
import type { StandingRow } from './competitions'
import type { Club } from '../types/game'

function standings(count = 16): StandingRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `club-${index + 1}`,
    name: `Clube ${index + 1}`,
    played: 30, wins: 20 - index, draws: 5, losses: 5 + index,
    gf: 50 - index, ga: 20 + index, points: 65 - index * 2,
  }))
}

function clubs(divisions: Record<string, number> = {}) {
  return Array.from({ length: 16 }, (_, index) => ({
    id: `club-${index + 1}`, division: divisions[`club-${index + 1}`] ?? 1,
  }))
}

describe('resolveBrazilianContinentalQualifications', () => {
  it('classifica G4 + campeão da Copa e 6º-11º para a Sul-Americana', () => {
    const result = resolveBrazilianContinentalQualifications({
      leagueStandings: standings(), clubs: clubs(), copaChampionId: 'club-12',
    })
    expect(result.filter(item => item.competition === 'libertadores').map(item => item.clubId))
      .toEqual(['club-1', 'club-2', 'club-3', 'club-4', 'club-12'])
    expect(result.filter(item => item.competition === 'sudamericana').map(item => item.clubId))
      .toEqual(['club-6', 'club-7', 'club-8', 'club-9', 'club-10', 'club-11'])
  })

  it('move a vaga da Libertadores para o 5º quando o campeão da Copa está no G4', () => {
    const result = resolveBrazilianContinentalQualifications({
      leagueStandings: standings(), clubs: clubs(), copaChampionId: 'club-3',
    })
    expect(result.filter(item => item.competition === 'libertadores').map(item => item.clubId))
      .toEqual(['club-1', 'club-2', 'club-3', 'club-4', 'club-5'])
  })

  it('não permite clube da Série B na Libertadores', () => {
    const result = resolveBrazilianContinentalQualifications({
      leagueStandings: standings(), clubs: clubs({ 'club-5': 2 }), copaChampionId: 'club-5',
    })
    expect(result.filter(item => item.competition === 'libertadores').map(item => item.clubId))
      .toEqual(['club-1', 'club-2', 'club-3', 'club-4', 'club-6'])
  })

  it('campeões continentais mantêm suas respectivas vagas sem roubar as nacionais', () => {
    const result = resolveBrazilianContinentalQualifications({
      leagueStandings: standings(), clubs: clubs(),
      copaChampionId: 'club-12',
      previousLibertadoresChampionId: 'club-14',
      previousSudamericanaChampionId: 'club-15',
    })
    expect(result.filter(item => item.competition === 'libertadores').map(item => item.clubId))
      .toEqual(['club-1', 'club-2', 'club-3', 'club-4', 'club-12', 'club-14'])
    expect(result.filter(item => item.competition === 'sudamericana').map(item => item.clubId))
      .toEqual(['club-15', 'club-6', 'club-7', 'club-8', 'club-9', 'club-10', 'club-11'])
  })
})

function mockClub(id: string, country: string, strength: number): Club {
  return { id, name: id, short_name: id, city: 'Cidade', country, division: 1, budget: 0, reputation: strength, strength }
}

describe('montagem continental', () => {
  it('seleciona apenas clubes estrangeiros fora das vagas brasileiras', () => {
    const all = [
      mockClub('br1', 'Brasil', 100),
      ...Array.from({ length: 40 }, (_, i) => mockClub(`foreign-${i + 1}`, i % 9 === 0 ? 'Argentina' : `Pais${i}`, 100 - i)),
    ]
    const selected = selectForeignContinentalClubs(all, new Set(['br1']), 27)
    expect(selected).toHaveLength(27)
    expect(selected.every(club => club.country !== 'Brasil')).toBe(true)
    expect(selected[0].id).toBe('foreign-1')
  })

  it('monta 8 grupos de 4 sem repetir país dentro do grupo', () => {
    const all = Array.from({ length: 32 }, (_, i) => mockClub(`c${i + 1}`, `P${i % 8}`, 100 - i))
    const draw = buildContinentalGroups('libertadores', all)
    expect(draw.groups).toHaveLength(8)
    expect(draw.groups.every(group => group.length === 4)).toBe(true)
    expect(draw.groups.every(group => new Set(group.map(club => club.country)).size === 4)).toBe(true)
  })

  it('gera 48 jogos da fase de grupos por competição', () => {
    const all = Array.from({ length: 32 }, (_, i) => mockClub(`c${i + 1}`, `P${i % 8}`, 100 - i))
    const draw = buildContinentalGroups('sudamericana', all)
    const fixtures = buildContinentalGroupFixtures('season', 'competition', draw.groups, 2027)
    expect(fixtures).toHaveLength(48)
    expect(new Set(fixtures.map(fixture => fixture.round))).toEqual(new Set([1,2,3,4,5,6]))
    expect(new Set(fixtures.map(fixture => fixture.homeClubId))).toHaveLength(32)
  })
})
