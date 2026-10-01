import { describe, expect, it } from 'vitest'
import {
  clubCanApproachManager,
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
})
