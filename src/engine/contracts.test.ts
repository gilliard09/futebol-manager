import { describe, expect, it } from 'vitest'
import { addContractYears, calculateRenewalSalary, daysUntilContractEnd, getContractStatus } from './contracts'

describe('contracts engine', () => {
  it('classifica contratos por prazo', () => {
    expect(getContractStatus('2026-01-10', '2026-01-11')).toBe('expired')
    expect(getContractStatus('2026-01-25', '2026-01-11')).toBe('critical')
    expect(getContractStatus('2026-03-01', '2026-01-11')).toBe('attention')
    expect(getContractStatus('2027-01-11', '2026-01-11')).toBe('safe')
  })

  it('calcula dias restantes', () => {
    expect(daysUntilContractEnd('2026-01-18', '2026-01-11')).toBe(7)
  })

  it('calcula salario de renovacao sem reduzir o salario atual', () => {
    expect(calculateRenewalSalary(10000, 1000000, 2)).toBe(10000 * 1.04)
  })

  it('adiciona anos sem depender do fuso local', () => {
    expect(addContractYears('2026-01-11', 2)).toBe('2028-01-11')
  })
})
