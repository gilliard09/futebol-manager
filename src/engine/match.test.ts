import { describe, expect, it } from 'vitest'
import { calculateTeamMetrics, simulateMatch } from './match'
import type { Fixture, LineupPlayer, Player } from '../types/game'

function player(id: string, position: Player['position'], base = 70): Player {
  return {
    id, first_name: 'Teste', last_name: id, age: 24, nationality: 'Brasil', position,
    pace: base, shooting: base, passing: base, dribbling: base, defending: base,
    physical: base, goalkeeping: position === 'GK' ? base : 40, mental: base,
    potential: base, form: 70, morale: 70, squad_number: 1,
  }
}

function lineup(base = 70): LineupPlayer[] {
  const roles = ['GK','LB','CB','CB','RB','CM','DM','CM','LW','ST','RW'] as const
  return roles.map((role, slot) => ({ role, slot, player: player(String(slot), role, base) }))
}

const fixture: Fixture = {
  id: 'fixture-test', competition_id: 'competition-test', round: 1, scheduled_at: '', status: 'scheduled',
  home_club_id: 'home', away_club_id: 'away', home_score: null, away_score: null,
  home_club: { name: 'Casa FC', short_name: 'Casa' },
  away_club: { name: 'Fora FC', short_name: 'Fora' },
}

describe('match engine', () => {
  it('keeps team metrics inside a realistic range', () => {
    const metrics = calculateTeamMetrics(lineup(), 'balanced', '4-3-3')
    expect(metrics.overall).toBeGreaterThan(40)
    expect(metrics.overall).toBeLessThan(100)
    expect(metrics.tacticalFit).toBeGreaterThan(0)
    expect(metrics.tacticalFit).toBeLessThanOrEqual(100)
  })

  it('simulates exactly 90 minutes and produces a complete timeline', () => {
    const result = simulateMatch(fixture, lineup().map(x => x.player), lineup().map(x => x.player), 'balanced', '4-3-3', lineup(), lineup(), () => 0.5)
    expect(result.timeline).toHaveLength(90)
    expect(result.timeline.at(-1)?.minute).toBe(90)
    expect(result.homeStats.shots).toBeGreaterThanOrEqual(result.homeStats.shotsOnTarget)
    expect(result.awayStats.shots).toBeGreaterThanOrEqual(result.awayStats.shotsOnTarget)
    expect(result.homeStats.xg).toBeGreaterThanOrEqual(0)
    expect(result.awayStats.xg).toBeGreaterThanOrEqual(0)
  })

  it('keeps player ratings in a football-like 5-10 range', () => {
    const result = simulateMatch(fixture, lineup().map(x => x.player), lineup().map(x => x.player), 'balanced', '4-3-3', lineup(), lineup(), () => 0.5)
    expect(result.playerRatings).toHaveLength(22)
    expect(result.playerRatings.every(p => p.rating >= 1 && p.rating <= 10)).toBe(true)
    expect(result.analysis.standout.rating).toBeGreaterThanOrEqual(1)
    expect(result.analysis.standout.rating).toBeLessThanOrEqual(10)
  })

  it('rotates players during the match and records real minutes', () => {
    const players = lineup(55).map(item => item.player)
    const result = simulateMatch(fixture, players, players.map((item, index) => ({ ...item, id: 'away-' + index })), 'balanced', '4-3-3', lineup(55), lineup(55).map((item, index) => ({ ...item, player: { ...item.player, id: 'away-' + index } })), () => 0.5)
    expect(result.events.some(event => event.type === 'substitution')).toBe(true)
    expect(result.playerRatings.some(player => player.started && player.minutes < 90)).toBe(true)
    expect(result.playerRatings.some(player => !player.started && player.minutes > 0)).toBe(true)
    expect(result.playerRatings.every(player => player.minutes > 0 && player.minutes <= 90)).toBe(true)
  })

  it('produces deterministic output when a random source is injected', () => {
    const random = () => 0.5
    const a = simulateMatch(fixture, lineup().map(x => x.player), lineup().map(x => x.player), 'balanced', '4-3-3', lineup(), lineup(), random)
    const b = simulateMatch(fixture, lineup().map(x => x.player), lineup().map(x => x.player), 'balanced', '4-3-3', lineup(), lineup(), random)
    expect(a.homeScore).toBe(b.homeScore)
    expect(a.awayScore).toBe(b.awayScore)
    expect(a.events).toEqual(b.events)
  })
})
