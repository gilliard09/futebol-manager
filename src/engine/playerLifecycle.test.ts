import { describe, expect, it } from 'vitest'
import {
  ageDevelopmentDelta,
  careerAverageRating,
  injuryDurationDays,
  recordCareerMatch,
  retirementChance,
  shouldRequestTransfer,
  updateDissatisfaction,
  updatePlayerLifecycle,
} from './playerLifecycle'

describe('player lifecycle', () => {
  it('desenvolve jovens e inicia declínio após o pico', () => {
    expect(ageDevelopmentDelta({ age: 20, potential: 82 }, 75)).toBe(1)
    expect(ageDevelopmentDelta({ age: 27, potential: 82 }, 82)).toBe(0)
    expect(ageDevelopmentDelta({ age: 31, potential: 82 }, 80)).toBe(-1)
    expect(ageDevelopmentDelta({ age: 35, potential: 82 }, 80)).toBe(-2)
  })

  it('aumenta o risco de aposentadoria com idade e baixa condição física', () => {
    expect(retirementChance({ age: 33, physical: 50, mental: 50 }, 0)).toBe(0)
    expect(retirementChance({ age: 38, physical: 45, mental: 50 }, 1)).toBeGreaterThan(retirementChance({ age: 34, physical: 70, mental: 70 }, 0))
  })

  it('gera lesões de longo prazo com duração maior', () => {
    const short = injuryDurationDays({ age: 22, physical: 80 }, 'minor', 0)
    const long = injuryDurationDays({ age: 34, physical: 50 }, 'long_term', 1)
    expect(short).toBeLessThan(long)
    expect(long).toBeGreaterThanOrEqual(45)
  })

  it('acumula insatisfação e pode gerar pedido de transferência', () => {
    const state = updatePlayerLifecycle(undefined, { dissatisfaction: 70, coachRelationship: 30 })
    const next = updateDissatisfaction(state, { morale: 35, age: 25 }, 'backup', 4)
    expect(next.dissatisfaction).toBeGreaterThan(state.dissatisfaction)
    expect(shouldRequestTransfer(next, { morale: 35 }, 0)).toBe(true)
  })

  it('mantém estatísticas históricas do jogador', () => {
    let state = updatePlayerLifecycle(undefined, {})
    state = recordCareerMatch(state, { minutes: 90, goals: 2, assists: 1, rating: 8.5, starts: 1 })
    state = recordCareerMatch(state, { minutes: 30, goals: 0, assists: 0, rating: 6.5 })
    expect(state.careerAppearances).toBe(2)
    expect(state.careerStarts).toBe(1)
    expect(state.careerMinutes).toBe(120)
    expect(state.careerGoals).toBe(2)
    expect(state.careerAssists).toBe(1)
    expect(careerAverageRating(state)).toBe(7.5)
  })
})
