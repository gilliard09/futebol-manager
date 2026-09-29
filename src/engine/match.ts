import type { Fixture, Player } from '../types/game'

export type MatchEvent = {
  minute: number
  type: 'goal' | 'chance' | 'card'
  team: 'home' | 'away'
  player: string
  text: string
}

export type TeamMetrics = {
  overall: number
  goalkeeper: number
  defense: number
  midfield: number
  attack: number
  form: number
  morale: number
  tacticalFit: number
}

export type MatchResult = {
  homeScore: number
  awayScore: number
  events: MatchEvent[]
  homeMetrics: TeamMetrics
  awayMetrics: TeamMetrics
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 50
}

export function playerOverall(player: Player) {
  if (player.position === 'GK') return player.goalkeeping
  return average([player.pace, player.shooting, player.passing, player.dribbling, player.defending, player.physical, player.mental])
}

function sector(players: Player[], positions: string[]) {
  const values = players.filter(player => positions.includes(player.position)).map(playerOverall)
  return average(values)
}

function tacticalFit(players: Player[], tactic: string) {
  if (!players.length) return 50
  const attack = sector(players, ['ST', 'LW', 'RW', 'AM'])
  const defense = sector(players, ['GK', 'CB', 'LB', 'RB', 'DM'])
  if (tactic === 'offensive') return Math.min(100, attack * 0.65 + defense * 0.35 + 3)
  if (tactic === 'defensive') return Math.min(100, defense * 0.65 + attack * 0.35 + 3)
  return average([attack, defense])
}

export function calculateTeamMetrics(players: Player[], tactic = 'balanced'): TeamMetrics {
  const goalkeeper = sector(players, ['GK'])
  const defense = sector(players, ['CB', 'LB', 'RB', 'DM'])
  const midfield = sector(players, ['CM', 'AM', 'DM', 'LW', 'RW'])
  const attack = sector(players, ['ST', 'LW', 'RW', 'AM'])
  const form = average(players.map(player => player.form))
  const morale = average(players.map(player => player.morale))
  const fit = tacticalFit(players, tactic)

  const overall = goalkeeper * 0.15 + defense * 0.28 + midfield * 0.27 + attack * 0.20 + form * 0.05 + morale * 0.05

  return { overall: overall * 0.97 + fit * 0.03, goalkeeper, defense, midfield, attack, form, morale, tacticalFit: fit }
}

function chooseScorer(players: Player[]) {
  const attackers = players.filter(player => ['ST', 'LW', 'RW', 'AM'].includes(player.position))
  const pool = attackers.length ? attackers : players
  return [...pool].sort((a, b) => playerOverall(b) - playerOverall(a))[Math.floor(Math.random() * Math.min(pool.length, 5))]
}

export function simulateMatch(fixture: Fixture, homePlayers: Player[], awayPlayers: Player[], tactic = 'balanced'): MatchResult {
  const homeMetrics = calculateTeamMetrics(homePlayers, tactic)
  const awayMetrics = calculateTeamMetrics(awayPlayers, 'balanced')
  const homeStrength = homeMetrics.overall + 3
  const awayStrength = awayMetrics.overall

  const homeExpected = Math.max(0.2, 1.05 + (homeStrength - awayStrength) / 30)
  const awayExpected = Math.max(0.15, 0.85 + (awayStrength - homeStrength) / 35)

  const homeScore = Math.min(6, Math.floor(Math.random() * (homeExpected + 1.2)))
  const awayScore = Math.min(6, Math.floor(Math.random() * (awayExpected + 1.1)))

  const events: MatchEvent[] = []
  const homeName = fixture.home_club?.short_name ?? 'Casa'
  const awayName = fixture.away_club?.short_name ?? 'Fora'

  for (let i = 0; i < homeScore; i++) {
    const player = chooseScorer(homePlayers)
    events.push({ minute: 8 + Math.floor(Math.random() * 82), type: 'goal', team: 'home', player: player ? player.first_name + ' ' + player.last_name : homeName, text: 'Gol do ' + homeName })
  }

  for (let i = 0; i < awayScore; i++) {
    const player = chooseScorer(awayPlayers)
    events.push({ minute: 8 + Math.floor(Math.random() * 82), type: 'goal', team: 'away', player: player ? player.first_name + ' ' + player.last_name : awayName, text: 'Gol do ' + awayName })
  }

  events.sort((a, b) => a.minute - b.minute)
  return { homeScore, awayScore, events, homeMetrics, awayMetrics }
}
