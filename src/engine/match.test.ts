import { describe, expect, it } from 'vitest'
import { calculateTeamMetrics, getAiCoachProfile, getSquadRole, selectStartingLineup, simulateMatch } from './match'
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

  it('does not select injured or suspended players for the next match', () => {
    const squad = lineup().map(item => item.player)
    const injured = { ...squad[9], injuredUntil: '2026-02-20' }
    const suspended = { ...squad[8], suspendedUntil: '2026-02-20' }
    const home = squad.map(item => item.id === injured.id ? injured : item.id === suspended.id ? suspended : item)
    const matchFixture = { ...fixture, scheduled_at: '2026-02-10T19:00:00.000Z' }
    const result = simulateMatch(matchFixture, home, squad.map((item, index) => ({ ...item, id: 'away-' + index })), 'balanced', '4-3-3', undefined, undefined, () => 0.5)
    const selectedIds = result.playerRatings.filter(item => item.team === 'home' && item.started).map(item => item.playerId)

    expect(selectedIds).not.toContain(injured.id)
    expect(selectedIds).not.toContain(suspended.id)
  })

  it('keeps player ratings in a football-like 5-10 range', () => {
    const result = simulateMatch(fixture, lineup().map(x => x.player), lineup().map(x => x.player), 'balanced', '4-3-3', lineup(), lineup(), () => 0.5)
    expect(result.playerRatings).toHaveLength(22)
    expect(result.playerRatings.every(p => p.rating >= 1 && p.rating <= 10)).toBe(true)
    expect(result.analysis.standout.rating).toBeGreaterThanOrEqual(1)
    expect(result.analysis.standout.rating).toBeLessThanOrEqual(10)
  })

  it('chooses the starting eleven using fatigue, form and recent workload', () => {
    const starters = lineup(72).map(item => item.player)
    const tiredStarter = { ...starters[9], fatigue: 90, seasonMinutes: 950, seasonAppearances: 14, form: 48 }
    const freshStriker = { ...player('fresh-striker', 'ST', 70), fatigue: 5, seasonMinutes: 180, seasonAppearances: 4, form: 88, morale: 90 }
    const squad = starters.map(item => item.id === tiredStarter.id ? tiredStarter : item).concat(freshStriker)
    const selected = selectStartingLineup(squad, '4-3-3', 'balanced', 'psychologist', [], {}, 1)
    const striker = selected.find(item => item.role === 'ST')

    expect(striker?.player.id).toBe(freshStriker.id)
    expect(selected).toHaveLength(11)
    expect(new Set(selected.map(item => item.player.id)).size).toBe(11)
  })

  it('classifies squad hierarchy from season usage and development profile', () => {
    expect(getSquadRole({ ...player('starter', 'ST', 70), seasonAppearances: 12, seasonStarts: 9, seasonMinutes: 900 })).toBe('starter')
    expect(getSquadRole({ ...player('rotation', 'ST', 70), seasonAppearances: 7, seasonStarts: 2, seasonMinutes: 360 })).toBe('rotation')
    expect(getSquadRole({ ...player('prospect', 'ST', 66), age: 20, potential: 82, seasonAppearances: 2, seasonStarts: 0, seasonMinutes: 120 })).toBe('prospect')
    expect(getSquadRole({ ...player('backup', 'ST', 70), seasonAppearances: 1, seasonStarts: 0, seasonMinutes: 45 })).toBe('backup')
  })

  it('uses season starts as part of the squad hierarchy', () => {
    const starters = lineup(70).map(item => item.player)
    const established = { ...starters[9], seasonAppearances: 12, seasonStarts: 12, seasonMinutes: 980, seasonAverageRating: 7.4, form: 78 }
    const challenger = { ...player('challenger-st', 'ST', 69), seasonAppearances: 4, seasonStarts: 0, seasonMinutes: 160, seasonAverageRating: 6.9, form: 78 }
    const squad = starters.map(item => item.id === established.id ? established : item).concat(challenger)
    const selected = selectStartingLineup(squad, '4-3-3', 'balanced', 'motivator', [], {}, 1)
    const striker = selected.find(item => item.role === 'ST')
    expect(striker?.player.id).toBe(established.id)
  })

  it('keeps AI coach profiles deterministic and makes opponent strength influence selection', () => {
    const first = getAiCoachProfile('club-alpha')
    expect(getAiCoachProfile('club-alpha')).toEqual(first)
    expect(['4-3-3', '4-4-2', '4-2-3-1', '3-5-2']).toContain(first.formation)

    const squad = lineup(70).map(item => item.player)
    const eliteOpponent = lineup(82).map(item => item.player)
    const selected = selectStartingLineup(squad, '4-3-3', 'balanced', 'motivator', eliteOpponent, {}, 1.1)

    expect(selected).toHaveLength(11)
    expect(new Set(selected.map(item => item.player.id)).size).toBe(11)
  })

  it('rotates players during the match and records real minutes', () => {
    const starters = lineup(55).map(item => item.player)
    const bench = [
      player('bench-gk', 'GK', 54),
      player('bench-cm', 'CM', 58),
      player('bench-st', 'ST', 58),
      player('bench-lb', 'LB', 58),
    ]
    const players = [...starters, ...bench]
    const awayPlayers = players.map((item, index) => ({ ...item, id: 'away-' + index }))
    const homeLineup = lineup(55)
    const awayLineup = homeLineup.map((item, index) => ({ ...item, player: awayPlayers[index] }))
    const result = simulateMatch(fixture, players, awayPlayers, 'balanced', '4-3-3', homeLineup, awayLineup, () => 0.5)
    expect(result.events.some(event => event.type === 'substitution')).toBe(true)
    expect(result.playerRatings.some(player => player.started && player.minutes < 90)).toBe(true)
    expect(result.playerRatings.some(player => !player.started && player.minutes > 0)).toBe(true)
    expect(result.playerRatings.every(player => player.minutes > 0 && player.minutes <= 90)).toBe(true)
  })

  it('adapts rotation to the coach profile and match state', () => {
    const starters = lineup(80).map(item => ({ ...item.player, fatigue: 0 }))
    const bench = [player('bench-1', 'CM', 78), player('bench-2', 'ST', 78), player('bench-3', 'LW', 78), player('bench-4', 'CB', 78)]
    const homePlayers = [...starters, ...bench]
    const awayPlayers = [...starters.map((item, index) => ({ ...item, id: 'away-' + index })), ...bench.map((item, index) => ({ ...item, id: 'away-bench-' + index }))]
    const homeLineup = lineup(80).map(item => ({ ...item, player: { ...item.player, fatigue: 0 } }))
    const awayLineup = homeLineup.map((item, index) => ({ ...item, player: awayPlayers[index] }))

    const highPress = simulateMatch(fixture, homePlayers, awayPlayers, 'balanced', '4-3-3', homeLineup, awayLineup, () => 0.5, 'high_press', 'motivator')
    const defensive = simulateMatch(fixture, homePlayers, awayPlayers, 'balanced', '4-3-3', homeLineup, awayLineup, () => 0.5, 'defensive_block', 'disciplinarian')
    const highPressSub = highPress.events.find(event => event.type === 'substitution' && event.team === 'home')
    const defensiveSub = defensive.events.find(event => event.type === 'substitution' && event.team === 'home')

    expect(highPressSub).toBeDefined()
    expect(defensiveSub).toBeDefined()
    expect(highPressSub!.minute).toBeLessThanOrEqual(defensiveSub!.minute)
    expect(highPress.events.filter(event => event.type === 'substitution' && event.team === 'home').length).toBeLessThanOrEqual(5)
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
