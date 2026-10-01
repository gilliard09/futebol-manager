import { describe, expect, it } from 'vitest'
import { createAIManager, simulateAIClubManagement, type AIClubManager } from './aiClubManagement'
import type { WorldClub, WorldClubPerformance } from './worldSimulation'

function club(id: string, budget = 2_000_000, strength = 65): WorldClub {
  return { id, name: 'Clube ' + id, short_name: id, city: 'Brasil', country: 'Brasil', division: 1, budget, reputation: 65, strength }
}

describe('AI club management', () => {
  it('creates a deterministic manager with a contract', () => {
    const manager = createAIManager(club('a'), 'Temporada 2026')
    expect(manager.name).toBeTruthy()
    expect(manager.contractEndSeason).toBe('Temporada 2027')
  })

  it('fires and hires a manager after sustained poor results', () => {
    const previous: AIClubManager[] = [{ ...createAIManager(club('a'), 'Temporada 2026'), confidence: 10 }]
    const performance: Record<string, WorldClubPerformance> = { a: { position: 18, points: 5, goalDifference: -12, played: 12, recentPoints: 2, recentResults: ['L', 'L', 'D', 'L', 'L'] } }
    const result = simulateAIClubManagement('2026-07-01', 'Temporada 2026', [club('a')], performance, previous)
    expect(result.decisions.some(item => item.action === 'dismiss_manager')).toBe(true)
    expect(result.decisions.some(item => item.action === 'hire_manager')).toBe(true)
  })

  it('renews a successful manager at season end', () => {
    const previous: AIClubManager[] = [{ ...createAIManager(club('a'), 'Temporada 2026'), confidence: 80 }]
    const performance: Record<string, WorldClubPerformance> = { a: { position: 2, points: 70, goalDifference: 30, played: 30, recentPoints: 10, recentResults: ['W', 'W', 'W', 'D', 'W'] } }
    const result = simulateAIClubManagement('2026-12-20', 'Temporada 2026', [club('a')], performance, previous)
    expect(result.decisions.some(item => item.action === 'renew_manager')).toBe(true)
    expect(result.managers[0].contractEndSeason).toBe('Temporada 2028')
  })

  it('changes strategy and reacts to financial pressure', () => {
    const previous: AIClubManager[] = [{ ...createAIManager(club('a', 300_000, 70), 'Temporada 2026'), style: 'ambitious', confidence: 40 }]
    const performance: Record<string, WorldClubPerformance> = { a: { position: 14, points: 10, goalDifference: -8, played: 12, recentPoints: 2, recentResults: ['L', 'L', 'D', 'L', 'L'] } }
    const result = simulateAIClubManagement('2026-07-15', 'Temporada 2026', [club('a', 300_000, 70)], performance, previous)
    expect(result.decisions.some(item => item.action === 'change_strategy')).toBe(true)
    expect(result.decisions.some(item => item.action === 'financial_control')).toBe(true)
  })
})
