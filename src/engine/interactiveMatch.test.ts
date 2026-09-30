import { describe, expect, it } from 'vitest'
import type { Fixture, Player } from '../types/game'
import {
  advanceInteractiveMinute,
  changeInteractiveTactics,
  createInteractiveMatch,
  makeInteractiveSubstitution,
} from './interactiveMatch'

function player(id: string, position: string, number: number): Player {
  return {
    id,
    first_name: 'Jogador',
    last_name: id,
    age: 24,
    nationality: 'Brasil',
    position,
    pace: 70,
    shooting: 70,
    passing: 70,
    dribbling: 70,
    defending: 70,
    physical: 70,
    goalkeeping: position === 'GK' ? 75 : 20,
    mental: 70,
    potential: 80,
    form: 70,
    morale: 70,
    squad_number: number,
  }
}

function squad(prefix: string): Player[] {
  const positions = ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'DM', 'CM', 'LW', 'ST', 'RW', 'CB', 'DM', 'CM', 'AM', 'LW', 'ST', 'RW', 'LB', 'RB', 'ST', 'CM']
  return positions.map((position, index) => player(prefix + index, position, index + 1))
}

const fixture: Fixture = {
  id: 'fixture-1',
  competition_id: 'league',
  competition_name: 'Liga Nacional do Brasil',
  round: 1,
  scheduled_at: '2026-01-10T22:00:00.000Z',
  status: 'scheduled',
  home_club_id: 'home',
  away_club_id: 'away',
  home_score: null,
  away_score: null,
  home_club: { name: 'Casa FC', short_name: 'Casa FC' },
  away_club: { name: 'Fora FC', short_name: 'Fora FC' },
}

const config = {
  tactic: 'balanced' as const,
  formation: '4-3-3' as const,
  coachStyle: 'balanced',
  coachPersonality: 'motivator',
}

describe('interactive match', () => {
  it('advances one minute and keeps the simulation state incremental', () => {
    const initial = createInteractiveMatch(fixture, squad('H'), squad('A'), config, config, {}, {}, () => 0.5)
    const next = advanceInteractiveMinute(initial, 'home')
    expect(next.minute).toBe(1)
    expect(next.timeline).toHaveLength(1)
    expect(next.finished).toBe(false)
  })

  it('changes tactics and affects the team configuration for future minutes', () => {
    const initial = createInteractiveMatch(fixture, squad('H'), squad('A'), config, config, {}, {}, () => 0.5)
    const next = changeInteractiveTactics(initial, 'home', 'offensive', '4-4-2')
    expect(next.home.tactic).toBe('offensive')
    expect(next.home.formation).toBe('4-4-2')
    expect(next.events.some(event => event.type === 'tactical_change')).toBe(true)
  })

  it('allows a manual substitution before the five-substitution limit', () => {
    const initial = createInteractiveMatch(fixture, squad('H'), squad('A'), config, config, {}, {}, () => 0.5)
    const outgoing = initial.home.lineup[9].player.id
    const incoming = initial.home.bench[0].id
    const next = makeInteractiveSubstitution(initial, 'home', outgoing, incoming)
    expect(next.home.substitutions).toBe(1)
    expect(next.home.lineup.some(item => item.player.id === incoming)).toBe(true)
    expect(next.events.some(event => event.type === 'substitution')).toBe(true)
  })

  it('finishes at minute 90 instead of calculating the whole match upfront', () => {
    let state = createInteractiveMatch(fixture, squad('H'), squad('A'), config, config, {}, {}, () => 0.5)
    for (let index = 0; index < 90; index += 1) state = advanceInteractiveMinute(state, 'home')
    expect(state.minute).toBe(90)
    expect(state.finished).toBe(true)
    expect(state.timeline).toHaveLength(90)
  })
})
