import { describe, expect, it } from 'vitest'
import { calculateClubChangeFinancialImpact, calculateDynamicTicketPrice, calculateExpectedAttendance, calculateFinancialStatus, calculateMatchdayFinance, calculateNextSeasonBudget, calculateTechnicalStaffPayroll, calculateVariableCompetitionPrize } from './clubFinance'

describe('club finance', () => {
  it('varies ticket price and attendance with demand', () => {
    const low = calculateDynamicTicketPrice(35, 40, 40, 40)
    const high = calculateDynamicTicketPrice(35, 85, 85, 85, true)
    expect(high).toBeGreaterThan(low)

    const attendance = calculateExpectedAttendance(20000, 85, 85, 85, high, 35, 'W')
    expect(attendance).toBeGreaterThan(0)
    expect(attendance).toBeLessThanOrEqual(20000)
  })

  it('calculates a matchday with capacity and net revenue', () => {
    const match = calculateMatchdayFinance(12000, 70, 70, 65, 35, 'W')
    expect(match.attendance).toBeGreaterThan(0)
    expect(match.attendance).toBeLessThanOrEqual(12000)
    expect(match.grossRevenue).toBeGreaterThan(match.operatingCost)
    expect(match.netRevenue).toBe(match.grossRevenue - match.operatingCost)
  })

  it('scales staff payroll with club size and reputation', () => {
    const small = calculateTechnicalStaffPayroll(300000, 45, 45)
    const large = calculateTechnicalStaffPayroll(900000, 85, 85, 80)
    expect(large).toBeGreaterThan(small)
  })

  it('classifies critical finances and creates a performance-based prize', () => {
    expect(calculateFinancialStatus(100000, 300000)).toBe('crítico')
    expect(calculateFinancialStatus(2000000, 300000)).toBe('saudável')
    expect(calculateVariableCompetitionPrize(1, 'league', { champion: true, reputation: 80 }))
      .toBeGreaterThan(calculateVariableCompetitionPrize(10, 'league', { reputation: 50 }))
  })

  it('builds next season budget and charges a club-switch transition cost', () => {
    const budget = calculateNextSeasonBudget(4_000_000, 8_000_000, 7_000_000, 3_000_000, 75, 'saudável')
    expect(budget).toBeGreaterThan(0)

    const switchImpact = calculateClubChangeFinancialImpact(5_000_000, 80)
    expect(switchImpact.transitionCost).toBeGreaterThan(0)
    expect(switchImpact.availableBudget).toBeLessThan(5_000_000)
  })
})
