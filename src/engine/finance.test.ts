import { describe, expect, it } from 'vitest'
import { applyTransaction, calculateMatchRevenue, calculateMonthlySalaryExpense, calculateMonthSummary, calculateTrainingExpense, estimateAttendance, createTransaction } from './finance'
import {
  buildSeasonFinancialHistory,
  calculateClubChangeFinancialImpact,
  calculateDynamicTicketPrice,
  calculateExpectedAttendance,
  calculateFinancialStatus,
  calculateFineAndOperationalCost,
  calculateMatchdayFinance,
  calculateNextSeasonBudget,
  calculateTechnicalStaffPayroll,
  calculateVariableCompetitionPrize,
} from './clubFinance'

describe('finance engine', () => {
  it('aplica entradas e saidas ao saldo', () => {
    expect(applyTransaction(100000, { amount: 25000 })).toBe(125000)
    expect(applyTransaction(100000, { amount: -15000 })).toBe(85000)
  })

  it('calcula resumo mensal', () => {
    const summary = calculateMonthSummary([
      { id: '1', date: '2026-01-10', type: 'match_revenue', description: 'Bilheteria', amount: 25000 },
      { id: '2', date: '2026-01-20', type: 'salary', description: 'Folha', amount: -10000 },
      { id: '3', date: '2026-02-01', type: 'salary', description: 'Folha', amount: -10000 },
    ], '2026-01', 50000)
    expect(summary.revenue).toBe(25000)
    expect(summary.expenses).toBe(10000)
    expect(summary.closingBalance).toBe(65000)
  })

  it('calcula receita de bilheteria', () => {
    expect(calculateMatchRevenue(1000, 35)).toBe(35000)
  })

  it('estima publico a partir da reputacao', () => {
    expect(estimateAttendance(50)).toBe(8000)
    expect(estimateAttendance(200)).toBe(12000)
  })

  it('calcula despesas recorrentes sem permitir valor negativo', () => {
    expect(calculateMonthlySalaryExpense(28000)).toBe(-28000)
    expect(calculateTrainingExpense(5000)).toBe(-5000)
    expect(calculateTrainingExpense(-100)).toBe(0)
  })

  it('calcula premiação variável conforme desempenho e reputação', () => {
    const champion = calculateVariableCompetitionPrize(1, 'league', { champion: true, reputation: 90 })
    const fourth = calculateVariableCompetitionPrize(4, 'league', { reputation: 90 })
    const lowRepChampion = calculateVariableCompetitionPrize(1, 'league', { champion: true, reputation: 40 })

    expect(champion).toBeGreaterThan(fourth)
    expect(champion).toBeGreaterThan(lowRepChampion)
    expect(calculateVariableCompetitionPrize(1, 'cup', { champion: true, reputation: 70 }))
      .toBeGreaterThan(calculateVariableCompetitionPrize(2, 'cup', { runnerUp: true, reputation: 70 }))
  })

  it('calcula bilheteria, preço e público com demanda do clube', () => {
    const low = calculateMatchdayFinance(20000, 40, 45, 35, 35, 'L')
    const high = calculateMatchdayFinance(20000, 85, 85, 85, 35, 'W')

    expect(high.attendance).toBeGreaterThan(low.attendance)
    expect(high.ticketPrice).toBeGreaterThanOrEqual(low.ticketPrice)
    expect(high.grossRevenue).toBeGreaterThan(low.grossRevenue)
    expect(calculateDynamicTicketPrice(35, 90, 90, 90, true))
      .toBeGreaterThan(calculateDynamicTicketPrice(35, 40, 40, 40))
    expect(calculateExpectedAttendance(1000, 100, 100, 100, 20, 20, 'W')).toBeLessThanOrEqual(1000)
  })

  it('calcula comissão técnica, multas e situação financeira crítica', () => {
    const staff = calculateTechnicalStaffPayroll(300000, 80, 82, 80)
    expect(staff).toBeGreaterThan(calculateTechnicalStaffPayroll(300000, 50, 50, 50))
    expect(calculateFineAndOperationalCost(2, 3, 4, false)).toBe(2 * 12500 + 3 * 4000 + 4 * 2500)
    expect(calculateFineAndOperationalCost(0, 0, 0, true)).toBe(25000)
    expect(calculateFinancialStatus(100000, 200000)).toBe('crítico')
    expect(calculateFinancialStatus(1000000, 200000)).toBe('saudável')
  })

  it('projeta orçamento da próxima temporada conforme caixa e resultado', () => {
    const healthy = calculateNextSeasonBudget(3000000, 5000000, 3000000, 1500000, 80, 'saudável')
    const critical = calculateNextSeasonBudget(3000000, 5000000, 3000000, 1500000, 80, 'crítico')
    expect(healthy).toBeGreaterThan(critical)
  })

  it('calcula o impacto financeiro de trocar de clube', () => {
    const impact = calculateClubChangeFinancialImpact(5000000, 80)
    expect(impact.transitionCost).toBeGreaterThanOrEqual(50000)
    expect(impact.availableBudget).toBe(5000000 - impact.transitionCost)
  })

  it('mantém histórico financeiro separado por categorias', () => {
    const transactions = [
      createTransaction('2026-02-01', 'match_revenue', 'Bilheteria', 100000, '1', 'match:1'),
      createTransaction('2026-03-01', 'sponsorship', 'Patrocínio', 50000, '2', 'sponsor:1'),
      createTransaction('2026-04-01', 'prize', 'Premiação', 150000, '3', 'prize:1'),
      createTransaction('2026-05-01', 'transfer_in', 'Venda', 300000, '4', 'transfer:1'),
      createTransaction('2026-06-01', 'salary', 'Folha', -200000, '5', 'salary:1'),
      createTransaction('2026-06-01', 'staff_salary', 'Comissão', -50000, '6', 'staff:1'),
      createTransaction('2026-06-01', 'stadium_maintenance', 'Estádio', -20000, '7', 'stadium:1'),
      createTransaction('2026-06-01', 'fine', 'Multa', -10000, '8', 'fine:1'),
      createTransaction('2026-06-01', 'other', 'Custo', -5000, '9', 'other:1'),
    ]

    const history = buildSeasonFinancialHistory(
      transactions,
      '2026',
      'Temporada 2026',
      'club-1',
      1000000,
      1315000,
      900000,
    )

    expect(history.revenue).toBe(600000)
    expect(history.expenses).toBe(285000)
    expect(history.matchRevenue).toBe(100000)
    expect(history.sponsorshipRevenue).toBe(50000)
    expect(history.prizeRevenue).toBe(150000)
    expect(history.transferRevenue).toBe(300000)
    expect(history.transferExpenses).toBe(0)
    expect(history.playerSalaryExpenses).toBe(200000)
    expect(history.staffSalaryExpenses).toBe(50000)
    expect(history.stadiumExpenses).toBe(20000)
    expect(history.finesAndCosts).toBe(15000)
    expect(history.closingBalance).toBe(1315000)
    expect(history.nextSeasonBudget).toBe(900000)
  })
})
