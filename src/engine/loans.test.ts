import { describe, expect, it } from 'vitest'
import type { Club, Player } from '../types/game'
import { applyLoan, calculateLoanEndDate, calculateLoanFee, calculateLoanSalaryCost, createLoanRecord, getActiveLoan, getCurrentClubId, isLoanActive, normalizeSalaryShare, type LoanState } from './loans'

const player: Player = { id: 'p1', first_name: 'Joao', last_name: 'Silva', age: 20, nationality: 'Brasil', position: 'ST', pace: 80, shooting: 78, passing: 60, dribbling: 75, defending: 30, physical: 70, goalkeeping: 10, mental: 65, potential: 85, form: 60, morale: 70, squad_number: 9 }
const club: Club = { id: 'c1', name: 'Clube', short_name: 'CLU', city: 'Cidade', country: 'Brasil', division: 1, budget: 1000000, reputation: 50 }

describe('loans', () => {
  it('calcula a data final respeitando os meses', () => expect(calculateLoanEndDate('2026-01-15', 6)).toBe('2026-07-15'))
  it('mantem a vigencia ate a data final e retorna depois dela', () => {
    const record = createLoanRecord('2026-01-15', player, 'c1', 'c2', 50000, 10000, 60, 6, '11111111-1111-4111-8111-111111111111')
    expect(isLoanActive(record, '2026-07-14')).toBe(true)
    expect(isLoanActive(record, '2026-07-15')).toBe(false)
  })
  it('encontra o clube do emprestimo ativo', () => {
    const state: LoanState = { records: [createLoanRecord('2026-01-15', player, 'c1', 'c2', 50000, 10000, 60, 6, '11111111-1111-4111-8111-111111111111')] }
    expect(getActiveLoan('p1', '2026-03-01', state)?.loanClubId).toBe('c2')
    expect(getCurrentClubId('c1', 'p1', '2026-03-01', {}, state)).toBe('c2')
    expect(getCurrentClubId('c1', 'p1', '2026-08-01', {}, state)).toBe('c1')
  })
  it('limita a participacao salarial e calcula os custos', () => {
    expect(normalizeSalaryShare(-10)).toBe(0)
    expect(normalizeSalaryShare(150)).toBe(100)
    expect(calculateLoanSalaryCost(10000, 60, true)).toBe(6000)
    expect(calculateLoanSalaryCost(10000, 60, false)).toBe(4000)
  })
  it('calcula taxa de emprestimo e preserva historico', () => {
    expect(calculateLoanFee(player, 1000000, 6)).toBeGreaterThan(0)
    const first = createLoanRecord('2026-01-15', player, 'c1', 'c2', 50000, 10000, 60, 6, '11111111-1111-4111-8111-111111111111')
    const second = createLoanRecord('2026-02-15', player, 'c1', 'c3', 70000, 10000, 50, 3, '22222222-2222-4222-8222-222222222222')
    const state = applyLoan(applyLoan({ records: [] }, first), second)
    expect(state.records).toHaveLength(2)
    expect(state.records[1].loanClubId).toBe('c3')
  })
})