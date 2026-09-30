import type { CoachPersonality, CoachStyle, Fixture, Formation, LineupPlayer, Player } from '../types/game'
import { FORMATIONS } from '../types/game'

export type MatchEvent = {
  minute: number
  type: 'goal' | 'chance' | 'shot' | 'save' | 'card' | 'corner' | 'foul' | 'tackle' | 'substitution'
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
  minutes: number
  started: boolean
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

export type SquadRole = 'starter' | 'rotation' | 'backup' | 'prospect'

export function getSquadRole(player: Player): SquadRole {
  const appearances = player.seasonAppearances ?? 0
  const starts = player.seasonStarts ?? 0
  const minutes = player.seasonMinutes ?? 0
  const startRate = appearances > 0 ? starts / appearances : 0
  const overall = playerOverall(player)
  const developmentRoom = player.potential - overall

  if (
    appearances >= 6 &&
    starts >= 4 &&
    startRate >= 0.6 &&
    minutes >= 360
  ) {
    return 'starter'
  }

  if (
    player.age <= 23 &&
    developmentRoom >= 8 &&
    minutes < 450 &&
    starts < 4
  ) {
    return 'prospect'
  }

  if (appearances >= 4 || minutes >= 240 || starts >= 2) {
    return 'rotation'
  }

  return 'backup'
}

function performanceRating(player: Player, role = player.position) {
  return rating(player, role) * (1 - Math.min(0.2, (player.fatigue ?? 0) * 0.002))
}

function sector(lineup: LineupPlayer[], roles: string[]) {
  return average(lineup.filter(item => roles.includes(item.role)).map(item => performanceRating(item.player, item.role)))
}

function coachModifiers(style?: string, personality?: string) {
  const modifier = { attack: 0, defense: 0, possession: 0, fatigue: 0, morale: 0, youth: 0 }
  if (style === 'high_press') { modifier.attack += 3; modifier.fatigue += 5 }
  if (style === 'possession') modifier.possession += 5
  if (style === 'counter_attack') { modifier.attack += 3; modifier.possession -= 2 }
  if (style === 'direct') { modifier.attack += 2; modifier.possession -= 3 }
  if (style === 'tiki_taka') modifier.possession += 7
  if (style === 'defensive_block') modifier.defense += 5
  if (style === 'gegenpressing') { modifier.attack += 4; modifier.fatigue += 7 }
  if (style === 'set_pieces') modifier.attack += 2
  if (style === 'youth_focus') modifier.youth += 5
  if (personality === 'motivator') modifier.morale += 5
  if (personality === 'disciplinarian') modifier.defense += 3
  if (personality === 'psychologist') modifier.morale += 4
  if (personality === 'visionary') modifier.youth += 4
  if (personality === 'winning_mentality') modifier.attack += 3
  return modifier
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

function selectionScore(player: Player, role: string) {
  const roleFit = player.position === role ? 8 : 0
  const formBonus = (player.form - 50) * 0.08
  const moraleBonus = (player.morale - 50) * 0.04
  const fatiguePenalty = (player.fatigue ?? 0) * 0.16
  return rating(player, role) + roleFit + formBonus + moraleBonus - fatiguePenalty
}

function fallbackLineup(players: Player[], formation: Formation): LineupPlayer[] {
  const used = new Set<string>()
  return FORMATIONS[formation].map((role, slot) => {
    const candidates = players.filter(player => !used.has(player.id))
    const player = [...candidates].sort((a, b) => selectionScore(b, role) - selectionScore(a, role))[0]
    if (!player) return null
    used.add(player.id)
    return { player, role, slot }
  }).filter(Boolean) as LineupPlayer[]
}

export function lineupFromPlayerIds(players: Player[], formation: Formation, ids: Record<number, string>): LineupPlayer[] {
  const used = new Set<string>()
  return FORMATIONS[formation].map((role, slot) => {
    const id = ids[slot]
    if (!id || used.has(id)) return null
    const player = players.find(item => item.id === id)
    if (!player) return null
    used.add(id)
    return { player, role, slot }
  }).filter(Boolean) as LineupPlayer[]
}

export function normalizeLineup(players: Player[], formation: Formation, lineup?: LineupPlayer[]) {
  if (lineup?.length) return lineup.slice(0, 11)
  return fallbackLineup(players, formation)
}

export function selectStartingLineup(
  players: Player[],
  formation: Formation,
  coachStyle = 'balanced',
  coachPersonality = 'motivator',
  opponentPlayers: Player[] = [],
  preferredIds: Record<number, string> = {},
  matchImportance = 1,
) {
  const squadOverall = average(players.map(player => playerOverall(player)))
  const opponentOverall = opponentPlayers.length
    ? average(opponentPlayers.map(player => playerOverall(player)))
    : 60
  const opponentPressure = opponentOverall - squadOverall
  const used = new Set<string>()

  const score = (player: Player, role: string, slot: number) => {
    const overall = rating(player, role)
    const fatigue = player.fatigue ?? 0
    const recentMinutes = player.seasonMinutes ?? 0
    const recentAppearances = player.seasonAppearances ?? 0
    const recentStarts = player.seasonStarts ?? 0
    const recentRating = player.seasonAverageRating ?? 0
    const startRate = recentAppearances > 0 ? recentStarts / recentAppearances : 0
    const formBonus = (player.form - 50) * 0.12
    const moraleBonus = (player.morale - 50) * (coachPersonality === 'psychologist' ? 0.07 : 0.04)
    const roleBonus = player.position === role ? 10 : 0
    const preferredBonus = preferredIds[slot] === player.id ? 12 : 0
    const fatiguePenalty = fatigue * (matchImportance >= 1.1 ? 0.14 : 0.22)
    const workloadPenalty = recentMinutes >= 900 ? (matchImportance >= 1.1 ? 2 : 7) : recentMinutes >= 600 ? (matchImportance >= 1.1 ? 1 : 3) : 0
    const recentRatingBonus = recentRating > 0 ? (recentRating - 6.5) * 2.2 : 0
    const appearanceBonus = Math.min(1.5, recentAppearances * 0.08)
    const hierarchyBonus = Math.min(8, startRate * 8)
    const squadRole = getSquadRole(player)
    const roleHierarchyBonus = squadRole === 'starter'
      ? 3
      : squadRole === 'rotation'
        ? 1.2
        : squadRole === 'prospect'
          ? 0.6
          : 0
    const rotationBonus = coachStyle === 'youth_focus' && player.age <= 23 ? 5 : 0
    const developmentBonus = player.age <= 23 && player.potential >= overall + 8 ? 2 : 0
    const veteranPenalty = player.age >= 31 && recentMinutes >= 900 && matchImportance < 1.1 ? 2 : 0
    const bigGameBonus = matchImportance >= 1.1 && overall >= opponentOverall ? 2 : 0
    const pressureBonus = opponentPressure >= 4
      ? Math.max(0, Math.min(3, (overall - opponentOverall) * 0.5))
      : opponentPressure <= -4 && matchImportance < 1.1
        ? (player.age <= 23 || recentMinutes < 600 ? 1.5 : 0)
        : 0
    return overall + formBonus + moraleBonus + roleBonus + preferredBonus + recentRatingBonus + appearanceBonus + hierarchyBonus + roleHierarchyBonus + rotationBonus + developmentBonus + bigGameBonus + pressureBonus - fatiguePenalty - workloadPenalty - veteranPenalty
  }

  return FORMATIONS[formation].map((role, slot) => {
    const candidates = players.filter(player => !used.has(player.id))
    const player = [...candidates].sort((a, b) => score(b, role, slot) - score(a, role, slot))[0]
    if (!player) return null
    used.add(player.id)
    return { player, role, slot }
  }).filter(Boolean) as LineupPlayer[]
}

export function getAiCoachProfile(clubId: string): {
  style: CoachStyle
  personality: CoachPersonality
  formation: Formation
  tactic: 'balanced' | 'offensive' | 'defensive'
} {
  let value = 2166136261
  for (const char of clubId) {
    value ^= char.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  const hash = value >>> 0
  const styles: CoachStyle[] = ['high_press', 'possession', 'counter_attack', 'direct', 'tiki_taka', 'defensive_block', 'gegenpressing', 'set_pieces', 'youth_focus']
  const personalities: CoachPersonality[] = ['motivator', 'disciplinarian', 'psychologist', 'visionary', 'negotiator', 'winning_mentality']
  const formations: Formation[] = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2']
  const tactics: Array<'balanced' | 'offensive' | 'defensive'> = ['balanced', 'offensive', 'defensive']
  return {
    style: styles[hash % styles.length],
    personality: personalities[(hash >>> 4) % personalities.length],
    formation: formations[(hash >>> 8) % formations.length],
    tactic: tactics[(hash >>> 12) % tactics.length],
  }
}

function chooseWeighted(players: LineupPlayer[], preferredRoles: string[], random: Random) {
  const pool = players.filter(item => preferredRoles.includes(item.role))
  const source = pool.length ? pool : players
  if (!source.length) return undefined
  const total = source.reduce((sum, item) => sum + Math.max(1, rating(item.player, item.role)), 0)
  let target = random() * total
  for (const item of source) {
    target -= Math.max(1, performanceRating(item.player, item.role))
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
  minutesById: Map<string, number>,
  startedIds: Set<string>,
): PlayerMatchRating[] {
  return lineup.map(item => {
    const name = item.player.first_name + ' ' + item.player.last_name
    const playerEvents = events.filter(event => event.team === team && event.player === name)
    const goals = playerEvents.filter(event => event.type === 'goal').length
    const assists = 0
    const cards = playerEvents.filter(event => event.type === 'card').length
    const tackles = playerEvents.filter(event => event.type === 'tackle').length
    const chances = playerEvents.filter(event => event.type === 'chance').length
    const fatigue = clamp(28 + (100 - item.player.physical) * 0.62 + (tactic === 'offensive' ? 9 : tactic === 'defensive' ? 4 : 6))
    const baseRating = 5.5 + (performanceRating(item.player, item.role) - 50) * 0.055
    const raw = baseRating + goals * 0.85 + assists * 0.45 + tackles * 0.12 + chances * 0.16 - cards * 0.45 - Math.max(0, fatigue - 55) * 0.018
    return {
      playerId: item.player.id,
      name,
      position: item.role,
      team,
      rating: Math.round(clamp(raw, 1, 10) * 10) / 10,
      goals,
      assists,
      fatigue: Math.round(fatigue),
      minutes: minutesById.get(item.player.id) ?? 0,
      started: startedIds.has(item.player.id),
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
  const homeGoals = homeRatings.reduce((s, p) => s + p.goals, 0)
  const awayGoals = awayRatings.reduce((s, p) => s + p.goals, 0)
  const homeEfficiency = homeStats.xg > 0 ? homeGoals / homeStats.xg : 0
  const awayEfficiency = awayStats.xg > 0 ? awayGoals / awayStats.xg : 0
  const homeIsMoreClinical = homeEfficiency >= awayEfficiency
  const goals = homeIsMoreClinical ? homeGoals : awayGoals
  const xg = homeIsMoreClinical ? homeStats.xg : awayStats.xg
  const efficiencyText = goals > xg + 0.25
    ? `${goals} gol${goals === 1 ? '' : 's'} em ${xg.toFixed(1)} xG — converteu acima do esperado.`
    : goals + 0.25 < xg
      ? `${goals} gol${goals === 1 ? '' : 's'} em ${xg.toFixed(1)} xG — desperdiçou boas oportunidades.`
      : `${goals} gol${goals === 1 ? '' : 's'} em ${xg.toFixed(1)} xG — conversão próxima ao esperado.`
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
  coach?: { attack: number; defense: number; possession: number; fatigue: number },
) {
  const midfieldControl = clamp(own.midfield * 0.62 + own.overall * 0.38 + (coach?.possession ?? 0) * 0.35 - opponent.midfield * 0.45)
  const attackEdge = own.attack - opponent.defense
  const possessionTarget = clamp(50 + midfieldControl * 0.45 + (tactic === 'offensive' ? 2 : tactic === 'defensive' ? -1 : 0))
  stats.possession += (possessionTarget - stats.possession) * 0.22

  const pressure = clamp(0.9 + attackEdge / 65 + (coach?.attack ?? 0) / 12 + (tactic === 'offensive' ? 0.32 : tactic === 'defensive' ? -0.2 : 0) + stats.possession / 300, 0.15, 2.2)
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
  coachStyle?: string,
  coachPersonality?: string,
): MatchResult {
  const competition = (fixture.competition_name ?? '').toLowerCase()
  const matchImportance = competition.includes('copa') ? (fixture.round >= 5 ? 1.2 : 1.08) : (fixture.round >= 25 ? 1.12 : 1)
  const preferredHome = Object.fromEntries((homeLineup ?? []).map(item => [item.slot, item.player.id])) as Record<number, string>
  const preferredAway = Object.fromEntries((awayLineup ?? []).map(item => [item.slot, item.player.id])) as Record<number, string>
  const awayCoach = getAiCoachProfile(fixture.away_club_id)
  const home = selectStartingLineup(homePlayers, formation, coachStyle, coachPersonality, awayPlayers, preferredHome, matchImportance)
  const away = selectStartingLineup(awayPlayers, awayCoach.formation, awayCoach.style, awayCoach.personality, homePlayers, preferredAway, matchImportance)
  const homeBench = homePlayers.filter(player => !home.some(item => item.player.id === player.id))
  const awayBench = awayPlayers.filter(player => !away.some(item => item.player.id === player.id))
  const homeActive = [...home]
  const awayActive = [...away]
  const minutesById = new Map<string, number>()
  const enteredAtById = new Map<string, number>()
  const startedIds = new Set([...home, ...away].map(item => item.player.id))
  const substitutions = new Set<string>()
  const substitutionCount: Record<'home' | 'away', number> = { home: 0, away: 0 }
  const substitutionWindows: Record<'home' | 'away', Set<number>> = {
    home: new Set<number>(),
    away: new Set<number>(),
  }
  const modifiers = coachModifiers(coachStyle, coachPersonality)
  const homeMetrics = calculateTeamMetrics(home, tactic, formation)
  homeMetrics.attack = clamp(homeMetrics.attack + modifiers.attack)
  homeMetrics.defense = clamp(homeMetrics.defense + modifiers.defense)
  homeMetrics.midfield = clamp(homeMetrics.midfield + modifiers.possession * 0.35)
  homeMetrics.morale = clamp(homeMetrics.morale + modifiers.morale)
  homeMetrics.overall = clamp(homeMetrics.overall + modifiers.attack * 0.25 + modifiers.defense * 0.25 + modifiers.possession * 0.15 + modifiers.morale * 0.15)
  const awayModifiers = coachModifiers(awayCoach.style, awayCoach.personality)
  const awayMetrics = calculateTeamMetrics(away, awayCoach.tactic, awayCoach.formation)
  awayMetrics.attack = clamp(awayMetrics.attack + awayModifiers.attack)
  awayMetrics.defense = clamp(awayMetrics.defense + awayModifiers.defense)
  awayMetrics.midfield = clamp(awayMetrics.midfield + awayModifiers.possession * 0.35)
  awayMetrics.morale = clamp(awayMetrics.morale + awayModifiers.morale)
  awayMetrics.overall = clamp(awayMetrics.overall + awayModifiers.attack * 0.25 + awayModifiers.defense * 0.25 + awayModifiers.possession * 0.15 + awayModifiers.morale * 0.15)
  const homeStats = emptyStats()
  const awayStats = emptyStats()
  const events: MatchEvent[] = []
  const timeline: { minute: number; home: MatchStats; away: MatchStats }[] = []
  const homeName = fixture.home_club?.short_name ?? 'Casa'
  const awayName = fixture.away_club?.short_name ?? 'Fora'
  let homeScore = 0
  let awayScore = 0

  for (const item of [...home, ...away]) {
    minutesById.set(item.player.id, 90)
    enteredAtById.set(item.player.id, 1)
  }

  const rotationIntensityFor = (style: string) => style === 'high_press' || style === 'gegenpressing'
    ? 1.12
    : style === 'defensive_block' || style === 'possession'
      ? 0.94
      : 1

  const makeSubstitutions = (minute: number, active: LineupPlayer[], bench: Player[], team: 'home' | 'away') => {
    const teamCoachStyle = team === 'home' ? (coachStyle ?? 'balanced') : awayCoach.style
    const rotationIntensity = rotationIntensityFor(teamCoachStyle)
    if (![55, 70, 80].includes(minute) || substitutionWindows[team].has(minute) || substitutionCount[team] >= 5) return
    substitutionWindows[team].add(minute)

    const scoreDifference = team === 'home' ? homeScore - awayScore : awayScore - homeScore
    const protectingLead = scoreDifference > 0
    const chasingGame = scoreDifference < 0
    const tacticalUrgency = chasingGame ? (teamCoachStyle === 'counter_attack' || teamCoachStyle === 'direct' || teamCoachStyle === 'high_press' ? 1.08 : 1.02) : protectingLead ? 0.94 : 1
    const baseThreshold = minute < 65 ? 69 : minute < 76 ? 64 : 60
    const fatigueThreshold = baseThreshold * matchImportance / rotationIntensity * tacticalUrgency

    const tiredness = (item: LineupPlayer) => {
      const ageLoad = Math.max(0, item.player.age - 28) * 0.8
      const physicalLoad = Math.max(0, 70 - item.player.physical) * 0.3
      const accumulatedFatigue = (item.player.fatigue ?? 0) * (1 + Math.max(0, 70 - item.player.physical) / 180)
      const minuteLoad = minute * (teamCoachStyle === 'high_press' || teamCoachStyle === 'gegenpressing' ? 1 : 0.9)
      return accumulatedFatigue + minuteLoad + physicalLoad + ageLoad
    }

    const tired = active
      .filter(item => item.role !== 'GK' || tiredness(item) >= fatigueThreshold + 12)
      .map(item => ({ item, value: tiredness(item) }))
      .filter(({ value }) => value >= fatigueThreshold)
      .sort((a, b) => b.value - a.value)
      .slice(0, Math.min(2, 5 - substitutionCount[team]))

    for (const outgoingData of tired) {
      const outgoing = outgoingData.item
      const replacement = [...bench]
        .filter(player => !substitutions.has(player.id))
        .sort((a, b) => {
          const aBase = selectionScore(a, outgoing.role)
          const bBase = selectionScore(b, outgoing.role)
          const attackNeed = chasingGame ? 5 : protectingLead ? -2 : 0
          const defenseNeed = protectingLead ? 4 : chasingGame ? -1 : 0
          const aTactical = (['ST', 'LW', 'RW', 'AM'].includes(a.position) ? attackNeed : 0) + (['GK', 'CB', 'LB', 'RB', 'DM'].includes(a.position) ? defenseNeed : 0)
          const bTactical = (['ST', 'LW', 'RW', 'AM'].includes(b.position) ? attackNeed : 0) + (['GK', 'CB', 'LB', 'RB', 'DM'].includes(b.position) ? defenseNeed : 0)
          return (bBase + bTactical) - (aBase + aTactical)
        })[0]
      if (!replacement) continue
      const index = active.findIndex(item => item.player.id === outgoing.player.id)
      if (index < 0) continue
      const enteredAt = enteredAtById.get(outgoing.player.id) ?? 1
      minutesById.set(outgoing.player.id, Math.max(0, minute - enteredAt))
      minutesById.set(replacement.id, Math.max(0, 91 - minute))
      enteredAtById.set(replacement.id, minute)
      substitutions.add(replacement.id)
      substitutionCount[team] += 1
      active[index] = { player: replacement, role: outgoing.role, slot: outgoing.slot }
      events.push({
        minute,
        type: 'substitution',
        team,
        player: replacement.first_name + ' ' + replacement.last_name,
        text: replacement.first_name + ' ' + replacement.last_name + ' entra no lugar de ' + outgoing.player.first_name + ' ' + outgoing.player.last_name + '.',
      })
    }
  }

  for (let minute = 1; minute <= 90; minute++) {
    makeSubstitutions(minute, homeActive, homeBench, 'home')
    makeSubstitutions(minute, awayActive, awayBench, 'away')
    const homeBefore = events.length
    simulateSide(minute, 'home', homeActive, homeMetrics, awayMetrics, tactic, homeStats, events, random, homeName, modifiers)
    if (events.slice(homeBefore).some(event => event.type === 'goal')) homeScore++

    const awayBefore = events.length
    simulateSide(minute, 'away', awayActive, awayMetrics, homeMetrics, awayCoach.tactic, awayStats, events, random, awayName, awayModifiers)
    if (events.slice(awayBefore).some(event => event.type === 'goal')) awayScore++

    const tackleProbability = clamp(0.16 + ((100 - ((homeMetrics.midfield + awayMetrics.midfield) / 2)) / 400), 0.08, 0.2)
    if (random() < tackleProbability) {
      const team = random() < 0.5 ? 'home' : 'away'
      const stats = team === 'home' ? homeStats : awayStats
      const side = team === 'home' ? homeActive : awayActive
      const player = chooseWeighted(side, ['CB', 'LB', 'RB', 'DM', 'CM'], random)
      const name = player ? player.player.first_name + ' ' + player.player.last_name : 'Jogador'
      stats.tackles++
      events.push({ minute, type: 'tackle', team, player: name, text: name + ' ganha a disputa e faz o desarme.' })
    }

    if (random() < 0.035) {
      const team = random() < 0.5 ? 'home' : 'away'
      const stats = team === 'home' ? homeStats : awayStats
      const side = team === 'home' ? homeActive : awayActive
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

  const homeRatings = buildPlayerRatings([...home, ...homeBench.map(player => ({ player, role: player.position, slot: -1 }))], 'home', events, tactic, minutesById, startedIds).filter(player => player.minutes > 0)
  const awayRatings = buildPlayerRatings([...away, ...awayBench.map(player => ({ player, role: player.position, slot: -1 }))], 'away', events, awayCoach.tactic, minutesById, startedIds).filter(player => player.minutes > 0)
  const playerRatings = [...homeRatings, ...awayRatings]
  const analysis = buildAnalysis(homeRatings, awayRatings, homeStats, awayStats)

  return { homeScore, awayScore, events: events.sort((a, b) => a.minute - b.minute), homeMetrics, awayMetrics, homeStats, awayStats, timeline, playerRatings, analysis }
}
