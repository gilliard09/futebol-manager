import { describe, expect, it } from 'vitest'
import { acceptManagerRenewal, applyFanResult, chooseBoardObjective, createBoardState, createFanState, evaluateBoard, getEconomicStatus, resolveContractAtSeasonEnd } from './management'

describe('management systems', () => {
  it('creates a board objective from club profile', () => {
    expect(chooseBoardObjective(85, 10_000_000, 82).objective).toBe('title')
    expect(chooseBoardObjective(50, 700_000, 55).objective).toBe('financial_control')
  })

  it('changes board confidence with sporting performance', () => {
    const state = createBoardState('s1', 'Temporada 2026', 65, 5_000_000, 65)
    const next = evaluateBoard(state, { position: 4, played: 8, recentPoints: 10, points: 15 }, { balance: 4_000_000, monthlyPayroll: 200_000 }, '2026-04-01')
    expect(next.confidence).toBeGreaterThan(state.confidence)
  })

  it('can offer, accept, or end the manager contract', () => {
    const state = createBoardState('s1', 'Temporada 2026', 60, 2_000_000, 60)
    const offered = resolveContractAtSeasonEnd({ ...state, confidence: 70 })

    expect(offered.managerStatus).toBe('active')
    expect(offered.renewalOffered).toBe(true)
    expect(acceptManagerRenewal(offered, 'Temporada 2027').managerStatus).toBe('renewed')
    expect(resolveContractAtSeasonEnd({ ...state, confidence: 40 }).managerStatus).toBe('contract_ended')
  })

  it('makes fans react to results and streaks', () => {
    let fans = createFanState('s1', 65, 60)
    fans = applyFanResult(fans, 'L')
    fans = applyFanResult(fans, 'L')
    fans = applyFanResult(fans, 'L')
    expect(fans.satisfaction).toBeLessThan(55)
    expect(fans.pressure).toBeGreaterThan(45)
  })

  it('classifies club economy', () => {
    expect(getEconomicStatus(100_000, 200_000)).toBe('pressão')
    expect(getEconomicStatus(3_000_000, 200_000)).toBe('saudável')
  })
})
