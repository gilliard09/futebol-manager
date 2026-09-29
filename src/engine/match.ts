import type { Fixture, Player } from '../types/game'

export type MatchEvent = {
  minute: number
  type: 'goal' | 'chance' | 'card'
  team: 'home' | 'away'
  player: string
  text: string
}

export type MatchResult = {
  homeScore: number
  awayScore: number
  events: MatchEvent[]
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function playerOverall(player: Player) {
  if (player.position === 'GK') return player.goalkeeping
  return average([
    player.pace,
    player.shooting,
    player.passing,
    player.dribbling,
    player.defending,
    player.physical,
    player.mental,
  ])
}

function teamStrength(players: Player[]) {
  if (!players.length) return 50

  const sorted = [...players].sort((a, b) => playerOverall(b) - playerOverall(a))
  const core = sorted.slice(0, Math.min(11, sorted.length))
  const quality = average(core.map(playerOverall))
  const form = average(core.map(player => player.form))
  const morale = average(core.map(player => player.morale))

  return quality * 0.72 + form * 0.14 + morale * 0.14
}

function chooseScorer(players: Player[]) {
  const attackers = players.filter(player => ['ST', 'LW', 'RW', 'AM'].includes(player.position))
  const pool = attackers.length ? attackers : players
  return [...pool].sort((a, b) => playerOverall(b) - playerOverall(a))[Math.floor(Math.random() * Math.min(pool.length, 5))]
}

export function simulateMatch(fixture: Fixture, homePlayers: Player[], awayPlayers: Player[]): MatchResult {
  const homeStrength = teamStrength(homePlayers) + 3
  const awayStrength = teamStrength(awayPlayers)

  const homeExpected = Math.max(0.15, 1.15 + (homeStrength - awayStrength) / 35)
  const awayExpected = Math.max(0.1, 0.95 + (awayStrength - homeStrength) / 40)

  const homeScore = Math.min(6, Math.floor(Math.random() * (homeExpected + 1.15)))
  const awayScore = Math.min(6, Math.floor(Math.random() * (awayExpected + 1.05)))

  const events: MatchEvent[] = []
  const homeName = fixture.home_club?.short_name ?? 'Casa'
  const awayName = fixture.away_club?.short_name ?? 'Fora'

  for (let i = 0; i < homeScore; i++) {
    const player = chooseScorer(homePlayers)
    events.push({
      minute: 8 + Math.floor(Math.random() * 82),
      type: 'goal',
      team: 'home',
      player: player ? player.first_name + ' ' + player.last_name : homeName,
      text: 'Gol do ' + homeName,
    })
  }

  for (let i = 0; i < awayScore; i++) {
    const player = chooseScorer(awayPlayers)
    events.push({
      minute: 8 + Math.floor(Math.random() * 82),
      type: 'goal',
      team: 'away',
      player: player ? player.first_name + ' ' + player.last_name : awayName,
      text: 'Gol do ' + awayName,
    })
  }

  events.sort((a, b) => a.minute - b.minute)

  return { homeScore, awayScore, events }
}
