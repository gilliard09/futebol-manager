import { describe, expect, it } from 'vitest'
import { calculateNegotiationFloor, calculateTargetPriority, decideTransferNegotiation } from './marketNegotiation'
import type { Club, Player } from '../types/game'

const player: Player = {
  id: 'p1', first_name: 'Joao', last_name: 'Silva', age: 21, nationality: 'Brasil', position: 'ST',
  pace: 80, shooting: 82, passing: 70, dribbling: 78, defending: 30, physical: 75, goalkeeping: 10, mental: 78,
  potential: 90, form: 80, morale: 75, marketValue: 2000000, squad_number: 9,
}

const club: Club = {
  id: 'club', name: 'Club', short_name: 'CLB', city: 'Brasil', country: 'Brasil',
  division: 1, budget: 10000000, reputation: 75,
}

describe('market negotiation', () => {
  it('calcula um piso mais baixo para clubes vendedores pressionados', () => {
    const normal = calculateNegotiationFloor(2000000, { sellerBehavior: 'balanced', sellerBudgetPressure: 0, playerImportance: 0.2, playerAge: 27 })
    const pressured = calculateNegotiationFloor(2000000, { sellerBehavior: 'seller', sellerBudgetPressure: 0.9, playerImportance: 0.1, playerAge: 27 })
    expect(pressured).toBeLessThan(normal)
  })

  it('aceita uma proposta que já supera o alvo', () => {
    const result = decideTransferNegotiation({ askingPrice: 2000000, offer: 2500000, roll: 50 })
    expect(result.action).toBe('accept')
  })

  it('faz contraproposta quando existe espaço para negociar', () => {
    const result = decideTransferNegotiation({
      askingPrice: 2000000,
      offer: 1700000,
      round: 0,
      roll: 80,
      sellerBehavior: 'conservative',
      playerImportance: 0.2,
    })
    expect(result.action).toBe('counter')
    expect(result.counterOffer).toBeGreaterThan(result.offer)
  })

  it('pode recusar proposta muito baixa', () => {
    const result = decideTransferNegotiation({
      askingPrice: 2000000,
      offer: 500000,
      roll: 10,
      sellerBehavior: 'conservative',
      playerImportance: 0.8,
    })
    expect(result.action).toBe('reject')
  })

  it('pode encerrar uma negociação que já atingiu o limite de rodadas', () => {
    const result = decideTransferNegotiation({ askingPrice: 2000000, offer: 1000000, round: 2, maxRounds: 2, roll: 10 })
    expect(result.action).toBe('withdraw')
  })

  it('prioriza jogadores adequados ao clube e ao orçamento', () => {
    const expensive = { ...player, marketValue: 9000000 }
    const affordable = { ...player, marketValue: 2000000 }
    expect(calculateTargetPriority(affordable, club, 10)).toBeGreaterThan(calculateTargetPriority(expensive, club, 10))
  })
})
