import { describe, expect, it } from 'vitest'
import { playerPositionLabel } from './playerPositions'

describe('player positions', () => {
  it('converte as posições internas para as siglas exibidas no jogo', () => {
    const expected: Record<string, string> = {
      GK: 'GL', CB: 'ZG', RB: 'LD', LB: 'LE', RWB: 'ADD', LWB: 'ADE',
      DM: 'VOL', CM: 'MC', AM: 'MEI', RW: 'PD', LW: 'PE', CF: 'SA', ST: 'ATA',
    }
    for (const [position, label] of Object.entries(expected)) {
      expect(playerPositionLabel(position)).toBe(label)
    }
  })
})
