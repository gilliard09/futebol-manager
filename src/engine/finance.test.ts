import { describe, expect, it } from 'vitest'
import { applyTransaction, calculateMatchRevenue, calculateMonthlySalaryExpense, calculateMonthSummary, calculateTrainingExpense, estimateAttendance } from './finance'

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
})
