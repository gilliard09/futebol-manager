import { describe, expect, it } from 'vitest'
import { continentalQualificationIds, resolveBrazilianContinentalQualifications } from './continentalQualifications'
import type { StandingRow } from './competitions'

const standings: StandingRow[] = Array.from({ length: 16 }, (_, index) => ({
  id: `club-${index + 1}`,
  name: `Clube ${index + 1}`,
  played: 30,
  wins: 20 - index,
  draws: 5,
  losses: 5 + index,
  gf: 50 - index,
  ga: 20 + index,
  points: 65 - index,
}))

const clubs = standings.map(row => ({ id: row.id, division: 1 }))

describe('resolveBrazilianContinentalQualifications', () => {
  it('mantém cinco vagas da Libertadores quando o campeão da Copa está no G4', () => {
    const result = resolveBrazilianContinentalQualifications({ leagueStandings: standings, clubs, copaChampionId: 'club-2' })

    expect(continentalQualificationIds(result, 'libertadores')).toEqual([
      'club-1', 'club-2', 'club-3', 'club-4', 'club-5',
    ])
  })

  it('leva o campeão da Copa para a Libertadores quando ele está fora do G4', () => {
    const result = resolveBrazilianContinentalQualifications({ leagueStandings: standings, clubs, copaChampionId: 'club-10' })

    expect(continentalQualificationIds(result, 'libertadores')).toEqual([
      'club-1', 'club-2', 'club-3', 'club-4', 'club-10',
    ])
  })

  it('redistribui a Sul-Americana para baixo quando há clube classificado na Libertadores', () => {
    const result = resolveBrazilianContinentalQualifications({ leagueStandings: standings, clubs, copaChampionId: 'club-8' })

    expect(continentalQualificationIds(result, 'sudamericana')).toEqual([
      'club-6', 'club-7', 'club-9', 'club-10', 'club-11', 'club-12',
    ])
  })

  it('não classifica clube da Série B/rebaixado e completa as vagas pela tabela', () => {
    const clubsWithRelegated = clubs.map(club => club.id === 'club-3' ? { ...club, division: 2 } : club)
    const result = resolveBrazilianContinentalQualifications({ leagueStandings: standings, clubs: clubsWithRelegated })

    expect(continentalQualificationIds(result, 'libertadores')).toEqual([
      'club-1', 'club-2', 'club-4', 'club-5', 'club-6',
    ])
    expect(continentalQualificationIds(result, 'sudamericana')).toEqual([
      'club-7', 'club-8', 'club-9', 'club-10', 'club-11', 'club-12',
    ])
  })

  it('adiciona vaga do campeão continental quando ele ainda não está classificado', () => {
    const result = resolveBrazilianContinentalQualifications({
      leagueStandings: standings,
      clubs,
      previousLibertadoresChampionId: 'club-12',
      previousSudamericanaChampionId: 'club-13',
    })

    expect(continentalQualificationIds(result, 'libertadores')).toEqual([
      'club-1', 'club-2', 'club-3', 'club-4', 'club-5', 'club-12', 'club-13',
    ])
  })

  it('não duplica campeão continental já classificado pela Liga', () => {
    const result = resolveBrazilianContinentalQualifications({
      leagueStandings: standings,
      clubs,
      previousLibertadoresChampionId: 'club-2',
      previousSudamericanaChampionId: 'club-9',
    })

    expect(continentalQualificationIds(result, 'libertadores')).toEqual([
      'club-1', 'club-2', 'club-3', 'club-4', 'club-5', 'club-9',
    ])
  })
})
