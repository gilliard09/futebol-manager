import { describe, expect, it } from 'vitest'
import {
  acceptManagerRenewal,
  declineManagerRenewal,
  managerContractSalary,
  managerContractYears,
  resolveContractAtSeasonEnd,
  type BoardState,
} from './management'

const state: BoardState = {
  seasonId: '2026',
  objective: 'top_four',
  objectiveLabel: 'Terminar no G4',
  expectation: 70,
  confidence: 80,
  lastEvaluation: 'Avaliação inicial',
  evaluations: 4,
  consecutivePoorResults: 0,
  managerStatus: 'active',
  contractEndSeason: 'Temporada 2026',
  renewalOffered: false,
  contractYears: 1,
}

describe('manager contract lifecycle', () => {
  it('offers renewal when confidence is sufficient', () => {
    const next = resolveContractAtSeasonEnd(state)
    expect(next.managerStatus).toBe('active')
    expect(next.renewalOffered).toBe(true)
  })

  it('accepts renewal for the next season', () => {
    const offered = resolveContractAtSeasonEnd(state)
    const renewed = acceptManagerRenewal(offered, 'Temporada 2027')
    expect(renewed.managerStatus).toBe('renewed')
    expect(renewed.contractEndSeason).toBe('Temporada 2028')
    expect(renewed.renewalOffered).toBe(false)
  })

  it('ends the contract when the manager declines', () => {
    const offered = resolveContractAtSeasonEnd(state)
    const ended = declineManagerRenewal(offered)
    expect(ended.managerStatus).toBe('contract_ended')
    expect(ended.renewalOffered).toBe(false)
  })

  it('does not offer renewal below the confidence threshold', () => {
    const next = resolveContractAtSeasonEnd({ ...state, confidence: 54 })
    expect(next.managerStatus).toBe('contract_ended')
    expect(next.renewalOffered).toBe(false)
  })

  it('scales contract duration and salary with confidence and club reputation', () => {
    expect(managerContractYears(60)).toBe(1)
    expect(managerContractYears(75)).toBe(2)
    expect(managerContractYears(90)).toBe(3)
    expect(managerContractSalary(80, 90)).toBeGreaterThan(managerContractSalary(50, 60))
  })
})
