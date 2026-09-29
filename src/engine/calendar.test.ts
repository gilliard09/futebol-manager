import { describe, expect, it } from 'vitest'
import { addDays, canAdvanceDay, createSeasonClock, daysBetween, toDateKey } from './calendar'

describe('calendar engine', () => {
  it('cria o relogio tres dias antes do primeiro jogo', () => {
    const clock = createSeasonClock('2026-01-11', '2026-01-18T22:00:00Z')
    expect(clock.currentDate).toBe('2026-01-15')
    expect(clock.seasonStart).toBe('2026-01-11')
  })

  it('avanca um dia sem depender do horario local', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(toDateKey('2026-02-03T22:00:00Z')).toBe('2026-02-03')
  })

  it('calcula a distancia entre partidas', () => {
    expect(daysBetween('2026-01-15', '2026-01-18')).toBe(3)
  })

  it('impede avancar alem do dia da proxima partida', () => {
    expect(canAdvanceDay({ currentDate: '2026-01-17', seasonStart: '2026-01-11' }, '2026-01-18')).toBe(true)
    expect(canAdvanceDay({ currentDate: '2026-01-18', seasonStart: '2026-01-11' }, '2026-01-18')).toBe(false)
  })
})
