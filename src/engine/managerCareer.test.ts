import { describe, expect, it } from 'vitest'
import {
  buildManagerOfferCandidates,
  clubCanApproachManager,
  managerContractEndSeason,
  managerDeparturePopularity,
  initialManagerPopularity,
  managerPerformanceScore,
  offerLevelForPopularity,
  updateManagerPopularity,
} from './managerCareer'

describe('manager career', () => {
  it('starts with regional recognition based on club reputation', () => {
    const popularity = initialManagerPopularity(60)
    expect(popularity.regional).toBe(14)
    expect(popularity.national).toBe(0)
    expect(popularity.international).toBe(0)
  })

  it('raises popularity more after a title season', () => {
    const current = { regional: 20, national: 10, international: 0 }
    const result = updateManagerPopularity(current, {
      position: 1,
      points: 75,
      wins: 24,
      draws: 3,
      losses: 3,
      clubReputation: 55,
      leagueTitle: true,
      cupTitle: true,
      boardConfidence: 90,
      fanSatisfaction: 90,
    })
    expect(result.regional).toBeGreaterThan(current.regional)
    expect(result.national).toBeGreaterThan(current.national)
    expect(result.international).toBeGreaterThan(current.international)
  })

  it('maps popularity to the appropriate market level', () => {
    expect(offerLevelForPopularity({ regional: 30, national: 10, international: 0 })).toBe('regional')
    expect(offerLevelForPopularity({ regional: 30, national: 35, international: 0 })).toBe('national')
    expect(offerLevelForPopularity({ regional: 60, national: 50, international: 45 })).toBe('international')
  })

  it('uses both manager reputation and club reputation to decide approaches', () => {
    const popularity = { regional: 45, national: 25, international: 0 }
    const score = managerPerformanceScore({
      position: 4,
      points: 62,
      wins: 18,
      draws: 8,
      losses: 4,
      clubReputation: 50,
      leagueTitle: false,
      cupTitle: false,
    })
    expect(clubCanApproachManager(popularity, 60, score)).toBe(true)
    expect(clubCanApproachManager({ regional: 5, national: 0, international: 0 }, 40, 20)).toBe(false)
  })

  it('calculates contract duration and departure consequences', () => {
    expect(managerContractEndSeason('Temporada 2026', 3)).toBe('Temporada 2029')
    expect(managerDeparturePopularity({ regional: 40, national: 20, international: 5 }, 'resigned')).toEqual({ regional: 38, national: 19, international: 5 })
  })

  it('selects the strongest eligible clubs for manager offers', () => {
    const candidates = buildManagerOfferCandidates(
      { regional: 45, national: 25, international: 0 },
      45,
      [
        { id: 'current', name: 'Clube atual', reputation: 80 },
        { id: 'a', name: 'Clube A', reputation: 70 },
        { id: 'b', name: 'Clube B', reputation: 55 },
        { id: 'c', name: 'Clube C', reputation: 40 },
        { id: 'd', name: 'Clube D', reputation: 20 },
      ],
      'current',
      2,
    )
    expect(candidates.map(club => club.id)).toEqual(['a', 'b'])
  })
})
