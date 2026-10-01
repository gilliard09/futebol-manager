import type { CoachPersonality, CoachStyle, Fixture, Formation, LineupPlayer, Player } from '../types/game'
import { FORMATIONS } from '../types/game'
import { isPlayerAvailable } from './discipline'
import { calculateTeamMetrics, getAiCoachProfile, getSquadRole, playerOverall, selectStartingLineup, selectionScore, rating, performanceRating, coachModifiers, clamp } from './matchCore'

export { calculateTeamMetrics, getAiCoachProfile, getSquadRole, playerOverall, selectStartingLineup } from './matchCore'

export type MatchEvent = {
  minute: number
  type: 'goal' | 'chance' | 'shot' | 'save' | 'card' | 'red_card' | 'corner' | 'foul' | 'tackle' | 'substitution' | 'tactical_change' | 'injury' | 'offside' | 'penalty'
  team: 'home' | 'away'
  player: string
  playerId?: string
  text: string
  assistPlayer?: string
  assistPlayerId?: string
  outgoingPlayerId?: string
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
  redCards?: number
  offsides?: number
  injuries?: number
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
  return { possession: 50, shots: 0, shotsOnTarget: 0, chances: 0, tackles: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, offsides: 0, injuries: 0, xg: 0 }
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
    const playerEvents = events.filter(event => event.team === team && event.playerId === item.player.id)
    const goals = events.filter(event => event.team === team && event.type === 'goal' && event.playerId === item.player.id).length
    const assists = events.filter(event => event.type === 'goal' && event.assistPlayerId === item.player.id).length
    const cards = events.filter(event => event.team === team && (event.type === 'card' || event.type === 'red_card') && event.playerId === item.player.id).length
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

  const homeAdvantage = team === 'home' ? 3.5 : 0
  const pressure = clamp(0.9 + (attackEdge + homeAdvantage) / 65 + (coach?.attack ?? 0) / 12 + (tactic === 'offensive' ? 0.32 : tactic === 'defensive' ? -0.2 : 0) + stats.possession / 300, 0.15, 2.2)
  const chanceProbability = 0.045 * pressure
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
  const saveChance = clamp(0.64 - (shotQuality - 50) / 190 + (keeper - 50) / 230, 0.25, 0.84)
  if (random() < saveChance) {
    events.push({ minute, type: 'save', team: team === 'home' ? 'away' : 'home', player: 'Goleiro', text: 'Defesa importante do goleiro.' })
    return
  }

  const assister = lineup.find(item => item.player.id !== attacker?.player.id && ['CM','AM','LW','RW','DM'].includes(item.role))
  const assistName = assister ? assister.player.first_name + ' ' + assister.player.last_name : undefined
  events.push({
    minute,
    type: 'goal',
    team,
    player: playerName,
    playerId: attacker?.player.id,
    assistPlayer: assistName,
    assistPlayerId: assister?.player.id,
    text: 'Gol do ' + clubName + '!' + (assistName ? ' Assistência: ' + assistName + '.' : ''),
  })
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
  awayTactic?: 'balanced' | 'offensive' | 'defensive',
  awayFormation?: Formation,
  awayCoachStyle?: string,
  awayCoachPersonality?: string,
): MatchResult {
  const competition = (fixture.competition_name ?? '').toLowerCase()
  const matchImportance = competition.includes('copa') ? (fixture.round >= 5 ? 1.2 : 1.08) : (fixture.round >= 25 ? 1.12 : 1)
  const matchDate = fixture.scheduled_at.slice(0, 10)
  const available = (player: Player) => isPlayerAvailable(player, matchDate)
  const availableHomePlayers = homePlayers.filter(available)
  const availableAwayPlayers = awayPlayers.filter(available)
  const preferredHome = Object.fromEntries((homeLineup ?? []).map(item => [item.slot, item.player.id])) as Record<number, string>
  const preferredAway = Object.fromEntries((awayLineup ?? []).map(item => [item.slot, item.player.id])) as Record<number, string>
  const awayCoach = getAiCoachProfile(fixture.away_club_id)
  const effectiveAwayTactic = awayTactic ?? awayCoach.tactic
  const effectiveAwayFormation = awayFormation ?? awayCoach.formation
  const effectiveAwayStyle = awayCoachStyle ?? awayCoach.style
  const effectiveAwayPersonality = awayCoachPersonality ?? awayCoach.personality
  const home = selectStartingLineup(availableHomePlayers, formation, coachStyle, coachPersonality, availableAwayPlayers, preferredHome, matchImportance)
  const away = selectStartingLineup(availableAwayPlayers, effectiveAwayFormation, effectiveAwayStyle, effectiveAwayPersonality, availableHomePlayers, preferredAway, matchImportance)
  const homeBench = availableHomePlayers.filter(player => !home.some(item => item.player.id === player.id))
  const awayBench = availableAwayPlayers.filter(player => !away.some(item => item.player.id === player.id))
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
  const awayModifiers = coachModifiers(effectiveAwayStyle, effectiveAwayPersonality)
  const awayMetrics = calculateTeamMetrics(away, effectiveAwayTactic, effectiveAwayFormation)
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
  for (const player of [...homeBench, ...awayBench]) minutesById.set(player.id, 0)

  const rotationIntensityFor = (style: string) => style === 'high_press' || style === 'gegenpressing'
    ? 1.12
    : style === 'defensive_block' || style === 'possession'
      ? 0.94
      : 1

  const makeSubstitutions = (minute: number, active: LineupPlayer[], bench: Player[], team: 'home' | 'away') => {
    const teamCoachStyle = team === 'home' ? (coachStyle ?? 'balanced') : effectiveAwayStyle
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
        playerId: replacement.id,
        outgoingPlayerId: outgoing.player.id,
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
    simulateSide(minute, 'away', awayActive, awayMetrics, homeMetrics, effectiveAwayTactic, awayStats, events, random, awayName, awayModifiers)
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
      if (player && random() < 0.2) {
        stats.yellowCards++
        const previousYellows = events.filter(event => event.team === team && event.player === name && event.type === 'card').length
        if (previousYellows >= 1 || random() < 0.035) {
          stats.redCards = (stats.redCards ?? 0) + 1
          events.push({ minute, type: 'red_card', team, player: name, playerId: player.player.id, text: previousYellows >= 1 ? 'Segundo amarelo. Expulso!' : 'Cartão vermelho direto. Expulso!' })
          const index = side.findIndex(item => item.player.id === player.player.id)
          if (index >= 0 && player.player.position !== 'GK') side.splice(index, 1)
        } else {
          events.push({ minute, type: 'card', team, player: name, playerId: player.player.id, text: 'Cartão amarelo.' })
        }
      }
    }

    if (random() < 0.018) {
      const team = random() < 0.5 ? 'home' : 'away'
      const stats = team === 'home' ? homeStats : awayStats
      const side = team === 'home' ? homeActive : awayActive
      const player = chooseWeighted(side, ['ST', 'LW', 'RW', 'AM', 'CM'], random)
      if (player) {
        const name = player.player.first_name + ' ' + player.player.last_name
        stats.offsides = (stats.offsides ?? 0) + 1
        events.push({ minute, type: 'offside', team, player: name, text: name + ' está impedido.' })
      }
    }

    if (random() < 0.004) {
      const team = random() < 0.5 ? 'home' : 'away'
      const stats = team === 'home' ? homeStats : awayStats
      const side = team === 'home' ? homeActive : awayActive
      const player = chooseWeighted(side, ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'LW', 'RW', 'ST'], random)
      if (player && player.player.position !== 'GK') {
        const name = player.player.first_name + ' ' + player.player.last_name
        stats.injuries = (stats.injuries ?? 0) + 1
        const index = side.findIndex(item => item.player.id === player.player.id)
        if (index >= 0) side.splice(index, 1)
        events.push({ minute, type: 'injury', team, player: name, playerId: player.player.id, text: name + ' sente uma lesão e deixa a partida.' })
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
  const awayRatings = buildPlayerRatings([...away, ...awayBench.map(player => ({ player, role: player.position, slot: -1 }))], 'away', events, effectiveAwayTactic, minutesById, startedIds).filter(player => player.minutes > 0)
  const playerRatings = [...homeRatings, ...awayRatings]
  const analysis = buildAnalysis(homeRatings, awayRatings, homeStats, awayStats)

  return { homeScore, awayScore, events: events.sort((a, b) => a.minute - b.minute), homeMetrics, awayMetrics, homeStats, awayStats, timeline, playerRatings, analysis }
}
