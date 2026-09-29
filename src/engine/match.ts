import type { Fixture, Formation, LineupPlayer, Player } from '../types/game'
import { FORMATIONS } from '../types/game'

export type MatchEvent = {
  minute: number
  type: 'goal' | 'chance' | 'shot' | 'save' | 'card' | 'corner' | 'foul' | 'tackle'
  team: 'home' | 'away'
  player: string
  text: string
}

export type MatchStats = {
  possession: number
  shots: number
  shotsOnTarget: number
  chances: number
  tackles: number
  corners: number
  fouls: number
  yellowCards: number
  xg: number
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
  timeline: { minute: number; home: MatchStats; away: MatchStats }[]
  playerRatings: PlayerMatchRating[]
  analysis: MatchAnalysis
}

export type PlayerMatchRating = {
  playerId: string
  name: string
  position: string
  team: 'home' | 'away'
  rating: number
  goals: number
  assists: number
  fatigue: number
}

export type MatchAnalysis = {
  homeXg: number
  awayXg: number
  efficiencyText: string
  standout: PlayerMatchRating
  fatigueText: string
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
  return { possession: 50, shots: 0, shotsOnTarget: 0, chances: 0, tackles: 0, corners: 0, fouls: 0, yellowCards: 0, xg: 0 }
}

function buildPlayerRatings(
  lineup: LineupPlayer[],
  team: 'home' | 'away',
  events: MatchEvent[],
  tactic: string,
): PlayerMatchRating[] {
  return lineup.map(item => {
    const name = item.player.first_name + ' ' + item.player.last_name
    const playerEvents = events.filter(event => event.team === team && event.player === name)
    const goals = playerEvents.filter(event => event.type === 'goal').length
    const assists = 0
    const cards = playerEvents.filter(event => event.type === 'card').length
    const tackles = playerEvents.filter(event => event.type === 'tackle').length
    const chances = playerEvents.filter(event => event.type === 'chance').length
    const fatigue = clamp(38 + (100 - item.player.physical) * 0.7 + (tactic === 'offensive' ? 8 : tactic === 'defensive' ? 3 : 5))
    const raw = playerOverall(item.player) + goals * 8 + assists * 4 + tackles * 1.5 + chances * 0.8 - cards * 1.5 - fatigue * 0.08
    return {
      playerId: item.player.id,
      name,
      position: item.role,
      team,
      rating: Math.round(clamp(raw, 1, 10) * 10) / 10,
      goals,
      assists,
      fatigue: Math.round(fatigue),
    }
  })
}

function buildAnalysis(
  homeRatings: PlayerMatchRating[],
  awayRatings: PlayerMatchRating[],
  homeStats: MatchStats,
  awayStats: MatchStats,
): MatchAnalysis {
  const all = [...homeRatings, ...awayRatings]
  const standout = [...all].sort((a, b) => b.rating - a.rating || b.goals - a.goals)[0]
  const homeEfficiency = homeStats.xg > 0 ? homeStats.shotsOnTarget / homeStats.xg : 0
  const awayEfficiency = awayStats.xg > 0 ? awayStats.shotsOnTarget / awayStats.xg : 0
  const team = homeStats.xg >= awayStats.xg ? homeStats : awayStats
  const goals = homeStats.xg >= awayStats.xg ? homeRatings.reduce((s, p) => s + p.goals, 0) : awayRatings.reduce((s, p) => s + p.goals, 0)
  const xg = homeStats.xg >= awayStats.xg ? homeStats.xg : awayStats.xg
  const efficiency = homeStats.xg >= awayStats.xg ? homeEfficiency : awayEfficiency
  const efficiencyText = goals > xg
    ? `${goals} gol${goals === 1 ? '' : 's'} em ${xg.toFixed(1)} xG — converteu acima do esperado.`
    : `${goals} gol${goals === 1 ? '' : 's'} em ${xg.toFixed(1)} xG — produção próxima ao esperado.`
  const fatigue = [...all].sort((a, b) => b.fatigue - a.fatigue)[0]
  const fatigueText = `${fatigue.name} (${fatigue.position}) terminou com índice de fadiga ${fatigue.fatigue}/100.`
  return { homeXg: Number(homeStats.xg.toFixed(1)), awayXg: Number(awayStats.xg.toFixed(1)), efficiencyText, standout, fatigueText }
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
  const possessionTarget = clamp(50 + midfieldControl * 0.45 + (tactic === 'offensive' ? 2 : tactic === 'defensive' ? -1 : 0))
  stats.possession += (possessionTarget - stats.possession) * 0.22

  const pressure = clamp(0.9 + attackEdge / 65 + (tactic === 'offensive' ? 0.32 : tactic === 'defensive' ? -0.2 : 0) + stats.possession / 300, 0.15, 2.2)
  const chanceProbability = 0.065 * pressure
  if (random() > chanceProbability) return

  stats.chances++
  const attacker = chooseWeighted(lineup, ['ST', 'LW', 'RW', 'AM'], random)
  const attackerQuality = attacker ? rating(attacker.player, attacker.role) : own.attack
  const playerName = attacker ? attacker.player.first_name + ' ' + attacker.player.last_name : clubName
  events.push({ minute, type: 'chance', team, player: playerName, text: playerName + ' encontra espaço e cria uma boa chance.' })

  if (random() < 0.18) {
    stats.corners++
    events.push({ minute, type: 'corner', team, player: playerName, text: 'A defesa desvia e é escanteio.' })
  }

  stats.shots++
  const keeper = opponent.goalkeeper
  const shotQuality = clamp(50 + (attackerQuality - opponent.defense) * 0.65 + (attacker?.player.mental ?? 50) * 0.15 + random() * 22 - 11)
  const xg = clamp(0.12 + (shotQuality - 50) / 180 + (attacker?.player.mental ?? 50) / 700, 0.04, 0.62)
  stats.xg += xg
  const onTarget = shotQuality > 52 || random() < 0.22

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
  const timeline: { minute: number; home: MatchStats; away: MatchStats }[] = []
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

    const tackleProbability = clamp(0.16 + ((100 - ((homeMetrics.midfield + awayMetrics.midfield) / 2)) / 400), 0.08, 0.2)
    if (random() < tackleProbability) {
      const team = random() < 0.5 ? 'home' : 'away'
      const stats = team === 'home' ? homeStats : awayStats
      const side = team === 'home' ? home : away
      const player = chooseWeighted(side, ['CB', 'LB', 'RB', 'DM', 'CM'], random)
      const name = player ? player.player.first_name + ' ' + player.player.last_name : 'Jogador'
      stats.tackles++
      events.push({ minute, type: 'tackle', team, player: name, text: name + ' ganha a disputa e faz o desarme.' })
    }

    if (random() < 0.035) {
      const team = random() < 0.5 ? 'home' : 'away'
      const stats = team === 'home' ? homeStats : awayStats
      const side = team === 'home' ? home : away
      const player = chooseWeighted(side, ['CB', 'LB', 'RB', 'DM', 'CM'], random)
      const name = player ? player.player.first_name + ' ' + player.player.last_name : 'Jogador'
      stats.fouls++
      events.push({ minute, type: 'foul', team, player: name, text: name + ' comete falta.' })
      if (random() < 0.2) {
        stats.yellowCards++
        events.push({ minute, type: 'card', team, player: name, text: 'Cartão amarelo.' })
      }
    }

    if (random() < 0.012) {
      const team = random() < 0.5 ? 'home' : 'away'
      const stats = team === 'home' ? homeStats : awayStats
      stats.corners++
      events.push({ minute, type: 'corner', team, player: 'Equipe', text: 'Escanteio.' })
    }

    timeline.push({
      minute,
      home: { ...homeStats },
      away: { ...awayStats },
    })
  }

  const totalPossession = homeStats.possession + awayStats.possession || 100
  homeStats.possession = Math.round((homeStats.possession / totalPossession) * 100)
  awayStats.possession = 100 - homeStats.possession

  timeline.forEach(snapshot => {
    const total = snapshot.home.possession + snapshot.away.possession || 100
    snapshot.home.possession = Math.round((snapshot.home.possession / total) * 100)
    snapshot.away.possession = 100 - snapshot.home.possession
  })

  const homeRatings = buildPlayerRatings(home, 'home', events, tactic)
  const awayRatings = buildPlayerRatings(away, 'away', events, 'balanced')
  const playerRatings = [...homeRatings, ...awayRatings]
  const analysis = buildAnalysis(homeRatings, awayRatings, homeStats, awayStats)

  return { homeScore, awayScore, events: events.sort((a, b) => a.minute - b.minute), homeMetrics, awayMetrics, homeStats, awayStats, timeline, playerRatings, analysis }
}
