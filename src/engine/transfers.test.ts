import { describe, expect, it } from 'vitest'
import { applyTransfer, calculateAskingPrice, calculateMinimumOffer, negotiateTransfer } from './transfers'
import type { Player } from '../types/game'

const player: Player = {
  id: 'p1',
  first_name: 'Joao',
  last_name: 'Silva',
  age: 20,
  nationality: 'Brasil',
  position: 'ST',
  pace: 78,
  shooting: 80,
  passing: 68,
  dribbling: 75,
  defending: 30,
  physical: 72,
  goalkeeping: 10,
  mental: 76,
  potential: 84,
  form: 70,
  morale: 70,
  squad_number: 9,
}

describe('transfers', () => {
  it('calcula um preço de pedido acima do valor de mercado para jovem com potencial', () => {
    expect(calculateAskingPrice(player, 1000000)).toBeGreaterThan(1000000)
  })

  it('define um mínimo negociável de 90% do pedido', () => {
    const asking = 2000000
    expect(calculateMinimumOffer(asking)).toBe(1800000)
  })

  it('aceita uma oferta no mínimo e recusa abaixo dela', () => {
    expect(negotiateTransfer(2000000, 1800000).accepted).toBe(true)
    expect(negotiateTransfer(2000000, 1700000).accepted).toBe(false)
  })

  it('não permite preço negativo', () => {
    expect(calculateAskingPrice(player, -500)).toBe(100000)
  })

  it('move o jogador para o novo clube e preserva o histórico', () => {
    const state = { playerClubOverrides: {}, records: [] }
    const record = { id: 't1', date: '2026-01-11', playerId: player.id, playerName: 'Joao Silva', fromClubId: 'club-a', toClubId: 'club-b', fee: 2000000, kind: 'purchase' as const }
    const next = applyTransfer(state, record)
    expect(next.playerClubOverrides[player.id]).toBe('club-b')
    expect(next.records).toHaveLength(1)
    expect(next.records[0].fee).toBe(2000000)
  })
})
