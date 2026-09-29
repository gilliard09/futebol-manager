import { describe, expect, it } from 'vitest'
import { calculateAskingPrice, calculateMinimumOffer, negotiateTransfer } from './transfers'
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
})
