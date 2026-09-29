import type { Fixture, Formation, LineupPlayer, Player } from '../types/game'
import { FORMATIONS } from '../types/game'

export type MatchEvent = {
  minute: number
  type: 'goal' | 'chance' | 'shot' | 'save' | 'card' | 'corner' | 'foul'
  team: 'home' | 'away'
  player: string
  text: string
}

export type MatchStats = {
  possession: number
  shots: number
  shotsOnTarget: number
  corners: number
  fouls: number
  yellowCards: number
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
  homeStats: MatchStats
  awayStats: MatchStats
}

type Random = () => number

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 50
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function rating(player: Player, role = player.position) {
  if (role === 'GK') return player.goalkeeping * 0.8 + player.mental * 0.2
  if (['CB', 'LB', 'RB', 'DM'].includes(role)) return player.defending * 0.45 + player.physical * 0.2 + player.mental * 0.15 + player.passing * 0.2
  if (['CM', 'AM'].includes(role)) return player.passing * 0.35 + player.dribbling * 0.2 + player.mental * 0.2 + player.physical * 0.1 + player.shooting * 0.15
  if (['LW', 'RW'].includes(role)) return player.pace * 0.25 + player.dribbling * 0.3 + player.passing * 0.15 + player.shooting * 0.2 + player.mental * 0.1
  return player.shooting * 0.4 + player.pace * 0.2 + player.dribbling * 0.15 + player.physical * 0.1 + player.mental * 0.15
}

export function playerOverall(player: Player) {
  return Math.round(rating(player))
}

function sector(lineup: LineupPlayer[], roles: string[]) {
  return average(lineup.filter(item => roles.includes(item.role)).map(item => rating(item.player, item.role)))
}

function tacticalFit(lineup: LineupPlayer[], tactic: string, formation: Formation) {
  if (!lineup.length) return 50
  const defense = sector(lineup, ['GK', 'CB', 'LB', 'RB', 'DM'])
  const midfield = sector(lineup, ['CM', 'DM', 'AM'])
  const attack = sector(lineup, ['LW', 'RW', 'ST'])
  const wide = sector(lineup, ['LB', 'RB', 'LW', 'RW'])
  let fit = 50
  if (formation === '4-3-3') fit += wide * 0.08 + midfield * 0.04
  if (formation === '4-4-2') fit += average([defense, attack]) * 0.06
  if (formation === '4-2-3-1') fit += midfield * 0.08
  if (formation === '3-5-2') fit += midfield * 0.09 + attack * 0.03
  if (tactic === 'offensive') fit += attack * 0.08 - defense * 0.03
  if (tactic === 'defensive') fit += defense * 0.08 - attack * 0.03
  return clamp(fit)
}

export function calculateTeamMetrics(lineup: LineupPlayer[], tactic = 'balanced', formation: Formation = '4-3-3'): TeamMetrics {
  const goalkeeper = sector(lineup, ['GK'])
  const defense = sector(lineup, ['CB', 'LB', 'RB', 'DM'])
  const midfield = sector(lineup, ['CM', 'DM', 'AM'])
  const attack = sector(lineup, ['LW', 'RW', 'ST'])
  const form = average(lineup.map(item => item.player.form))
  const morale = average(lineup.map(item => item.player.morale))
  const fit = tacticalFit(lineup, tactic, formation)
  const overall = goalkeeper * 0.15 + defense * 0.28 + midfield * 0.27 + attack * 0.2 + form * 0.05 + morale * 0.05
  return { overall: overall * 0.97 + fit * 0.03, goalkeeper, defense, midfield, attack, form, morale, tacticalFit: fit }
}

function fallbackLineup(players: Player[], formation: Formation): LineupPlayer[] {
  const used = new Set<string>()
  return FORMATIONS[formation].map((role, slot) => {
    const candidates = players.filter(player => !used.has(player.id))
    const player = candidates.find(p => p.position === role) ?? candidates.sort((a, b) => playerOverall(b) - playerOverall(a))[0]
    if (!player) return null
    used.add(player.id)
    return { player, role, slot }
  }).filter(Boolean) as LineupPlayer[]
}

export function normalizeLineup(players: Player[], formation: Formation, lineup?: LineupPlayer[]) {
  if (lineup?.length) return lineup.slice(0, 11)
  return fallbackLineup(players, formation)
}

function chooseWeighted(players: LineupPlayer[], preferredRoles: string[], random: Random) {
  const pool = players.filter(item => preferredRoles.includes(item.role))
  const source = pool.length ? pool : players
  if (!source.length) return undefined
  const total = source.reduce((sum, item) => sum + Math.max(1, rating(item.player, item.role)), 0)
  let target = random() * total
  for (const item of source) {
    target -= Math.max(1, rating(item.player, item.role))
    if (target <= 0) return item
  }
  return source[source.length - 1]
}

function emptyStats(): MatchStats {
  return { possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0 }
}

function simulateSide(
  minute: number,
  team: 'home' | 'away',
  lineup: LineupPlayer[],
  own: TeamMetrics,
  opponent: TeamMetrics,
  tactic: string,
  stats: MatchStats,
  events: MatchEvent[],
  random: Random,
  clubName: string,
) {
  const midfieldControl = clamp(own.midfield * 0.62 + own.overall * 0.38 - opponent.midfield * 0.45)
  const attackEdge = own.attack - opponent.defense
  const possession = clamp(50 + midfieldControl * 0.45 + (tactic === 'offensive' ? 2 : tactic === 'defensive' ? -1 : 0))
  stats.possession += (possession - stats.possession) * 0.22

  const pressure = clamp(0.9 + attackEdge / 65 + (tactic === 'offensive' ? 0.32 : tactic === 'defensive' ? -0.2 : 0) + possession / 300, 0.15, 2.2)
  const chanceProbability = 0.065 * pressure
  if (random() > chanceProbability) return

  stats.shots++
  const attacker = chooseWeighted(lineup, ['ST', 'LW', 'RW', 'AM'], random)
  const attackerQuality = attacker ? rating(attacker.player, attacker.role) : own.attack
  const keeper = opponent.goalkeeper
  const shotQuality = clamp(50 + (attackerQuality - opponent.defense) * 0.65 + (attacker?.player.mental ?? 50) * 0.15 + random() * 22 - 11)
  const onTarget = shotQuality > 52 || random() < 0.22
  const playerName = attacker ? attacker.player.first_name + ' ' + attacker.player.last_name : clubName

  events.push({ minute, type: 'chance', team, player: playerName, text: playerName + ' encontra espaço e cria uma boa chance.' })

  if (!onTarget) {
    events.push({ minute, type: 'shot', team, player: playerName, text: playerName + ' finaliza para fora.' })
    return
  }

  stats.shotsOnTarget++
  const saveChance = clamp(0.58 - (shotQuality - 50) / 170 + (keeper - 50) / 220, 0.18, 0.78)
  if (random() < saveChance) {
    events.push({ minute, type: 'save', team: team === 'home' ? 'away' : 'home', player: 'Goleiro', text: 'Defesa importante do goleiro.' })
    return
  }

  events.push({ minute, type: 'goal', team, player: playerName, text: 'Gol do ' + clubName + '!' })
}

export function simulateMatch(
  fixture: Fixture,
  homePlayers: Player[],
  awayPlayers: Player[],
  tactic = 'balanced',
  formation: Formation = '4-3-3',
  homeLineup?: LineupPlayer[],
  awayLineup?: LineupPlayer[],
  random: Random = Math.random,
): MatchResult {
  const home = normalizeLineup(homePlayers, formation, homeLineup)
  const away = normalizeLineup(awayPlayers, '4-3-3', awayLineup)
  const homeMetrics = calculateTeamMetrics(home, tactic, formation)
  const awayMetrics = calculateTeamMetrics(away, 'balanced', '4-3-3')
  const homeStats = emptyStats()
  const awayStats = emptyStats()
  const events: MatchEvent[] = []
  const homeName = fixture.home_club?.short_name ?? 'Casa'
  const awayName = fixture.away_club?.short_name ?? 'Fora'
  let homeScore = 0
  let awayScore = 0

  for (let minute = 1; minute <= 90; minute++) {
    const homeBefore = events.length
    simulateSide(minute, 'home', home, homeMetrics, awayMetrics, tactic, homeStats, events, random, homeName)
    if (events.slice(homeBefore).some(event => event.type === 'goal')) homeScore++
    const awayBefore = events.length
    simulateSide(minute, 'away', away, awayMetrics, homeMetrics, 'balanced', awayStats, events, random, awayName)
    if (events.slice(awayBefore).some(event => event.type === 'goal')) awayScore++

    if (random() < 0.035) {
      const team = random() < 0.5 ? 'home' : 'away'
      const stats = team === 'home' ? homeStats : awayStats
      stats.fouls++
      const side = team === 'home' ? home : away
      const player = chooseWeighted(side, ['CB', 'LB', 'RB', 'DM', 'CM'], random)
      const name = player ? player.player.first_name + ' ' + player.player.last_name : 'Jogador'
      events.push({ minute, type: 'foul', team, player: name, text: name + ' comete falta.' })
      if (random() < 0.2) {
        stats.yellowCards++
        events.push({ minute, type: 'card', team, player: name, text: 'Cartão amarelo.' })
      }
    }

    if (random() < 0.022) {
      const team = random() < 0.5 ? 'home' : 'away'
      const stats = team === 'home' ? homeStats : awayStats
      stats.corners++
      const side = team === 'home' ? home : away
      const player = chooseWeighted(side, ['LW', 'RW', 'ST'], random)
      const name = player ? player.player.first_name + ' ' + player.player.last_name : 'Jogador'
      events.push({ minute, type: 'corner', team, player: name, text: 'Escanteio.' })
    }
  }

  const totalPossession = homeStats.possession + awayStats.possession || 100
  homeStats.possession = Math.round((homeStats.possession / totalPossession) * 100)
  awayStats.possession = 100 - homeStats.possession

  return { homeScore, awayScore, events: events.sort((a, b) => a.minute - b.minute), homeMetrics, awayMetrics, homeStats, awayStats }
}
