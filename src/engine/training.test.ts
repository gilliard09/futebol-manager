import { describe, expect, it } from 'vitest'
import { trainPlayer } from './training'

const player = {
  id: '1', first_name: 'Teste', last_name: 'Jogador', age: 20, nationality: 'Brasil', position: 'ST',
  pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 50, physical: 70, goalkeeping: 10,
  mental: 70, potential: 80, form: 70, morale: 70, squad_number: 9,
}

describe('treinamento', () => {
  it('pode evoluir atributos até o potencial', () => {
    const trained = trainPlayer(player, 'technical', () => 0)
    expect(trained.passing).toBe(71)
    expect(trained.dribbling).toBe(71)
    expect(trained.shooting).toBe(71)
  })

  it('nunca ultrapassa o potencial', () => {
    const trained = trainPlayer({ ...player, passing: 80, dribbling: 80, shooting: 80 }, 'technical', () => 0)
    expect(trained.passing).toBe(80)
  })

  it('melhora forma e moral', () => {
    const trained = trainPlayer(player, 'balanced', () => 1)
    expect(trained.form).toBe(72)
    expect(trained.morale).toBe(71)
  })
})
