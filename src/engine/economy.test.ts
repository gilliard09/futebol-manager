import { describe, expect, it } from 'vitest'
import { calculateMonthlyPayroll, calculateSeasonPayroll, canAffordContract, canAffordTransfer } from './economy'

const club = {
  id: '1',
  name: 'Clube',
  short_name: 'CLB',
  city: 'Cidade',
  country: 'Brasil',
  stadium: 'Estádio',
  division: 1,
  budget: 1000000,
  reputation: 50,
}

describe('economia da carreira', () => {
  it('calcula a folha mensal ignorando valores ausentes', () => {
    expect(calculateMonthlyPayroll([1000, 2500, null, undefined])).toBe(3500)
  })

  it('projeta a folha anual', () => {
    expect(calculateSeasonPayroll(3500)).toBe(42000)
  })

  it('valida orçamento para transferências', () => {
    expect(canAffordTransfer(club, 500000)).toBe(true)
    expect(canAffordTransfer(club, 1500000)).toBe(false)
  })

  it('valida salário de contrato', () => {
    expect(canAffordContract(club, 5000)).toBe(true)
    expect(canAffordContract(club, -1)).toBe(false)
  })
})
