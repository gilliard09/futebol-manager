import { describe, expect, it } from 'vitest'
import {
  calculateInjuryReturnDate,
  calculateSuspensionReturnDate,
  isPlayerAvailable,
  shouldSuspendForYellowAccumulation,
  suspensionMatchesForRed,
} from './discipline'

describe('discipline rules', () => {
  it('keeps an injured player out until the return date', () => {
    const player = { injuredUntil: '2026-04-15', suspendedUntil: null }
    expect(isPlayerAvailable(player, '2026-04-14')).toBe(false)
    expect(isPlayerAvailable(player, '2026-04-15')).toBe(true)
    expect(calculateInjuryReturnDate('2026-04-01')).toBe('2026-04-15')
  })

  it('suspends on every fifth accumulated yellow card', () => {
    expect(shouldSuspendForYellowAccumulation(4, 5)).toBe(true)
    expect(shouldSuspendForYellowAccumulation(5, 6)).toBe(false)
    expect(shouldSuspendForYellowAccumulation(9, 10)).toBe(true)
  })

  it('uses the next scheduled matches to determine suspension return', () => {
    const dates = ['2026-04-08', '2026-04-15', '2026-04-22']
    expect(calculateSuspensionReturnDate('2026-04-01', dates, 1)).toBe('2026-04-09')
    expect(calculateSuspensionReturnDate('2026-04-01', dates, 2)).toBe('2026-04-16')
    expect(calculateSuspensionReturnDate('2026-04-01', [], 1)).toBe('2026-04-08')
    expect(calculateSuspensionReturnDate('2026-04-01', [], 2)).toBe('2026-04-15')
  })

  it('distinguishes second-yellow and direct-red suspensions', () => {
    expect(suspensionMatchesForRed('Expulso por Segundo amarelo')).toBe(1)
    expect(suspensionMatchesForRed('Expulso por vermelho direto')).toBe(2)
  })
})
