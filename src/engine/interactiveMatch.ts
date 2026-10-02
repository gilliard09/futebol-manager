import type { Fixture, Formation, LineupPlayer, Player } from '../types/game'
import { FORMATIONS } from '../types/game'
import { isPlayerAvailable } from './discipline'
import {
  calculateTeamMetrics,
  getAiCoachProfile,
  playerOverall,
  selectStartingLineup,
} from './matchCore'
import type {
  MatchEvent,
  MatchResult,
  MatchStats,
  PlayerMatchRating,
  TeamMetrics,
} from './match'

export type InteractiveTeam = 'home' | 'away'
export type InteractiveTactic = 'balanced' | 'offensive' | 'defensive'
export type TacticalInstruction = 'normal' | 'press' | 'hold' | 'overlap' | 'protect' | 'direct'

export type InteractiveTeamState = {
  lineup: LineupPlayer[]
  bench: Player[]
  tactic: InteractiveTactic
  formation: Formation
  coachStyle: string
  coachPersonality: string
  metrics: TeamMetrics
  substitutions: number
  yellowCards: Map<string, number>
  removed: Set<string>
  sectorInstructions: Record<string, TacticalInstruction>
  playerInstructions: Record<string, TacticalInstruction>
  risk: number
}

export type InteractiveMatchState = {
  fixture: Fixture
  minute: number
  homeScore: number
  awayScore: number
  events: MatchEvent[]
  homeStats: MatchStats
  awayStats: MatchStats
  timeline: { minute: number; home: MatchStats; away: MatchStats }[]
  home: InteractiveTeamState
  away: InteractiveTeamState
  homeSquad: Player[]
  awaySquad: Player[]
  homeStartingIds: Set<string>
  awayStartingIds: Set<string>
  finished: boolean
  rng: () => number
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 50
}

function emptyStats(): MatchStats {
  return {
    possession: 50,
    shots: 0,
    shotsOnTarget: 0,
    chances: 0,
    tackles: 0,
    corners: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    offsides: 0,
    injuries: 0,
    xg: 0,
  }
}

function rating(player: Player, role = player.position) {
  if (role === 'GK') return player.goalkeeping * 0.8 + player.mental * 0.2
  if (['CB', 'LB', 'RB', 'DM'].includes(role)) return player.defending * 0.45 + player.physical * 0.2 + player.mental * 0.15 + player.passing * 0.2
  if (['CM', 'AM'].includes(role)) return player.passing * 0.35 + player.dribbling * 0.2 + player.mental * 0.2 + player.physical * 0.1 + player.shooting * 0.15
  if (['LW', 'RW'].includes(role)) return player.pace * 0.25 + player.dribbling * 0.3 + player.passing * 0.15 + player.shooting * 0.2 + player.mental * 0.1
  return player.shooting * 0.4 + player.pace * 0.2 + player.dribbling * 0.15 + player.physical * 0.1 + player.mental * 0.15
}

function chooseWeighted(players: LineupPlayer[], roles: string[], random: () => number) {
  const pool = players.filter(item => roles.includes(item.role))
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

function coachModifier(style: string, personality: string) {
  let attack = 0
  let defense = 0
  let possession = 0
  if (style === 'high_press' || style === 'gegenpressing') attack += 4
  if (style === 'counter_attack' || style === 'direct') attack += 3
  if (style === 'possession' || style === 'tiki_taka') possession += 6
  if (style === 'defensive_block') defense += 5
  if (style === 'set_pieces') attack += 2
  if (personality === 'disciplinarian') defense += 3
  if (personality === 'winning_mentality') attack += 3
  return { attack, defense, possession }
}

function recalculateMetrics(team: InteractiveTeamState) {
  const metrics = calculateTeamMetrics(team.lineup, team.tactic, team.formation)
  const modifier = coachModifier(team.coachStyle, team.coachPersonality)
  metrics.attack = clamp(metrics.attack + modifier.attack)
  metrics.defense = clamp(metrics.defense + modifier.defense)
  metrics.midfield = clamp(metrics.midfield + modifier.possession * 0.35)
  metrics.overall = clamp(metrics.overall + modifier.attack * 0.25 + modifier.defense * 0.25 + modifier.possession * 0.15)
  team.metrics = metrics
}

export function createInteractiveMatch(
  fixture: Fixture,
  homePlayers: Player[],
  awayPlayers: Player[],
  homeConfig: { tactic: InteractiveTactic; formation: Formation; coachStyle: string; coachPersonality: string },
  awayConfig?: { tactic: InteractiveTactic; formation: Formation; coachStyle: string; coachPersonality: string },
  homePreferred: Record<number, string> = {},
  awayPreferred: Record<number, string> = {},
  random: () => number = Math.random,
): InteractiveMatchState {
  const awayCoach = getAiCoachProfile(fixture.away_club_id)
  const effectiveAway = awayConfig ?? { tactic: awayCoach.tactic, formation: awayCoach.formation, coachStyle: awayCoach.style, coachPersonality: awayCoach.personality }
  const importance = (fixture.competition_name ?? '').toLowerCase().includes('copa') ? 1.1 : 1
  const matchDate = fixture.scheduled_at.slice(0, 10)
  const available = (player: Player) => isPlayerAvailable(player, matchDate)
  const availableHomePlayers = homePlayers.filter(available)
  const availableAwayPlayers = awayPlayers.filter(available)
  const homeLineup = selectStartingLineup(availableHomePlayers, homeConfig.formation, homeConfig.coachStyle, homeConfig.coachPersonality, availableAwayPlayers, homePreferred, importance)
  const awayLineup = selectStartingLineup(availableAwayPlayers, effectiveAway.formation, effectiveAway.coachStyle, effectiveAway.coachPersonality, availableHomePlayers, awayPreferred, importance)
  const home: InteractiveTeamState = {
    lineup: homeLineup,
    bench: availableHomePlayers.filter(player => !homeLineup.some(item => item.player.id === player.id)),
    tactic: homeConfig.tactic,
    formation: homeConfig.formation,
    coachStyle: homeConfig.coachStyle,
    coachPersonality: homeConfig.coachPersonality,
    metrics: calculateTeamMetrics(homeLineup, homeConfig.tactic, homeConfig.formation),
    substitutions: 0,
    yellowCards: new Map(),
    removed: new Set(),
    sectorInstructions: { defense: 'normal', midfield: 'normal', attack: 'normal' },
    playerInstructions: {},
    risk: 50,
  }
  const away: InteractiveTeamState = {
    lineup: awayLineup,
    bench: availableAwayPlayers.filter(player => !awayLineup.some(item => item.player.id === player.id)),
    tactic: effectiveAway.tactic,
    formation: effectiveAway.formation,
    coachStyle: effectiveAway.coachStyle,
    coachPersonality: effectiveAway.coachPersonality,
    metrics: calculateTeamMetrics(awayLineup, effectiveAway.tactic, effectiveAway.formation),
    substitutions: 0,
    yellowCards: new Map(),
    removed: new Set(),
    sectorInstructions: { defense: 'normal', midfield: 'normal', attack: 'normal' },
    playerInstructions: {},
    risk: 50,
  }
  recalculateMetrics(home)
  recalculateMetrics(away)
  return {
    fixture,
    minute: 0,
    homeScore: 0,
    awayScore: 0,
    events: [],
    homeStats: emptyStats(),
    awayStats: emptyStats(),
    timeline: [],
    home,
    away,
    homeSquad: availableHomePlayers.map(player => ({ ...player })),
    awaySquad: availableAwayPlayers.map(player => ({ ...player })),
    homeStartingIds: new Set(homeLineup.map(item => item.player.id)),
    awayStartingIds: new Set(awayLineup.map(item => item.player.id)),
    finished: false,
    rng: random,
  }
}

function cloneTeam(team: InteractiveTeamState): InteractiveTeamState {
  return {
    ...team,
    lineup: team.lineup.map(item => ({ ...item, player: { ...item.player } })),
    bench: team.bench.map(player => ({ ...player })),
    metrics: { ...team.metrics },
    yellowCards: new Map(team.yellowCards),
    removed: new Set(team.removed),
    sectorInstructions: { ...team.sectorInstructions },
    playerInstructions: { ...team.playerInstructions },
    risk: team.risk,
  }
}

function cloneState(state: InteractiveMatchState): InteractiveMatchState {
  return {
    ...state,
    events: [...state.events],
    homeStats: { ...state.homeStats },
    awayStats: { ...state.awayStats },
    timeline: [...state.timeline],
    home: cloneTeam(state.home),
    away: cloneTeam(state.away),
    homeSquad: state.homeSquad.map(player => ({ ...player })),
    awaySquad: state.awaySquad.map(player => ({ ...player })),
    homeStartingIds: new Set(state.homeStartingIds),
    awayStartingIds: new Set(state.awayStartingIds),
  }
}

function pushEvent(state: InteractiveMatchState, event: MatchEvent) {
  state.events.push(event)
}

function simulateTeamMinute(
  state: InteractiveMatchState,
  teamName: InteractiveTeam,
) {
  const own = teamName === 'home' ? state.home : state.away
  const opponent = teamName === 'home' ? state.away : state.home
  const stats = teamName === 'home' ? state.homeStats : state.awayStats
  const clubName = teamName === 'home' ? (state.fixture.home_club?.short_name ?? 'Casa') : (state.fixture.away_club?.short_name ?? 'Fora')
  const midfield = own.metrics.midfield * 0.62 + own.metrics.overall * 0.38 - opponent.metrics.midfield * 0.45
  const possessionTarget = clamp(50 + midfield * 0.45 + (own.tactic === 'offensive' ? 3 : own.tactic === 'defensive' ? -2 : 0))
  stats.possession += (possessionTarget - stats.possession) * 0.24

  const homeAdvantage = teamName === 'home' ? 3.5 : 0
  const attackEdge = own.metrics.attack + homeAdvantage - opponent.metrics.defense
  const tacticalBoost = own.tactic === 'offensive' ? 0.34 : own.tactic === 'defensive' ? -0.2 : 0
  const attackInstruction = own.sectorInstructions.attack
  const defenseInstruction = own.sectorInstructions.defense
  const midfieldInstruction = own.sectorInstructions.midfield
  const riskBoost = (own.risk - 50) / 180
  const instructionBoost = (attackInstruction === 'press' || attackInstruction === 'direct' ? 0.08 : attackInstruction === 'protect' ? -0.06 : 0)
    + (midfieldInstruction === 'press' ? 0.04 : midfieldInstruction === 'hold' ? 0.03 : 0)
  const fatiguePenalty = average(own.lineup.map(item => clamp((item.player.fatigue ?? 0) + state.minute * 0.45, 0, 100))) / 500
  const chanceProbability = clamp(0.045 * (0.9 + attackEdge / 65 + tacticalBoost + stats.possession / 300 + riskBoost + instructionBoost - fatiguePenalty), 0.006, 0.115)
  if (state.rng() > chanceProbability || own.lineup.length < 7) return

  stats.chances += 1
  const attacker = chooseWeighted(own.lineup, ['ST', 'LW', 'RW', 'AM'], state.rng)
  const playerName = attacker ? attacker.player.first_name + ' ' + attacker.player.last_name : clubName
  const attackerQuality = attacker ? rating(attacker.player, attacker.role) : own.metrics.attack
  pushEvent(state, { minute: state.minute, type: 'chance', team: teamName, player: playerName, text: playerName + ' encontra espaço e cria uma boa chance.' })

  stats.shots += 1
  if (state.rng() < 0.18) {
    stats.corners += 1
    pushEvent(state, { minute: state.minute, type: 'corner', team: teamName, player: playerName, text: 'A defesa desvia e é escanteio.' })
  }

  const playerInstruction = attacker ? own.playerInstructions[attacker.player.id] : 'normal'
  const instructionEffect = playerInstruction === 'direct' ? 4 : playerInstruction === 'press' ? 2 : playerInstruction === 'protect' ? -4 : playerInstruction === 'hold' ? 1 : playerInstruction === 'overlap' ? 3 : 0
  const shotQuality = clamp(50 + (attackerQuality - opponent.metrics.defense) * 0.65 + (attacker?.player.mental ?? 50) * 0.15 + instructionEffect + state.rng() * 22 - 11)
  stats.xg += clamp(0.12 + (shotQuality - 50) / 180 + (attacker?.player.mental ?? 50) / 700, 0.04, 0.62)
  const onTarget = shotQuality > 52 || state.rng() < 0.22
  if (!onTarget) {
    pushEvent(state, { minute: state.minute, type: 'shot', team: teamName, player: playerName, text: playerName + ' finaliza para fora.' })
    return
  }

  stats.shotsOnTarget += 1
  const saveChance = clamp(0.64 - (shotQuality - 50) / 190 + (opponent.metrics.goalkeeper - 50) / 230, 0.25, 0.84)
  if (state.rng() < saveChance) {
    pushEvent(state, { minute: state.minute, type: 'save', team: teamName === 'home' ? 'away' : 'home', player: 'Goleiro', text: 'Defesa importante do goleiro.' })
    return
  }

  if (teamName === 'home') state.homeScore += 1
  else state.awayScore += 1
  const assister = own.lineup.find(item => item.player.id !== attacker?.player.id && ['CM','AM','LW','RW','DM'].includes(item.role))
  const assistName = assister ? assister.player.first_name + ' ' + assister.player.last_name : undefined
  pushEvent(state, { minute: state.minute, type: 'goal', team: teamName, player: playerName, playerId: attacker?.player.id, assistPlayer: assistName, assistPlayerId: assister?.player.id, text: 'Gol do ' + clubName + '!' + (assistName ? ' Assistência: ' + assistName + '.' : '') })
}

function simulateDisciplineAndIncidents(state: InteractiveMatchState) {
  const random = state.rng
  const teamName: InteractiveTeam = random() < 0.5 ? 'home' : 'away'
  const team = teamName === 'home' ? state.home : state.away
  const stats = teamName === 'home' ? state.homeStats : state.awayStats

  const defensiveInstruction = team.sectorInstructions.defense
  const foulRisk = defensiveInstruction === 'press' ? 0.012 : 0
  if (random() < 0.17 + foulRisk) {
    stats.tackles += 1
    const tackler = chooseWeighted(team.lineup, ['CB', 'LB', 'RB', 'DM', 'CM'], random)
    if (tackler) pushEvent(state, { minute: state.minute, type: 'tackle', team: teamName, player: tackler.player.first_name + ' ' + tackler.player.last_name, text: tackler.player.first_name + ' ' + tackler.player.last_name + ' ganha a disputa e faz o desarme.' })
  }

  if (random() < 0.038 && team.lineup.length) {
    stats.fouls += 1
    const fouler = chooseWeighted(team.lineup, ['CB', 'LB', 'RB', 'DM', 'CM'], random) ?? team.lineup[0]
    const name = fouler.player.first_name + ' ' + fouler.player.last_name
    pushEvent(state, { minute: state.minute, type: 'foul', team: teamName, player: name, text: name + ' comete falta.' })
    if (random() < 0.12) {
      const clubName = teamName === 'home' ? (state.fixture.home_club?.short_name ?? 'Casa') : (state.fixture.away_club?.short_name ?? 'Fora')
      pushEvent(state, {
        minute: state.minute,
        type: 'penalty',
        team: teamName === 'home' ? 'away' : 'home',
        player: teamName === 'home' ? (state.fixture.away_club?.short_name ?? 'Visitante') : (state.fixture.home_club?.short_name ?? 'Mandante'),
        text: 'Pênalti para ' + (teamName === 'home' ? (state.fixture.away_club?.short_name ?? 'Visitante') : (state.fixture.home_club?.short_name ?? 'Mandante')) + '! Falta de ' + name + '.',
      })
    }
    if (random() < 0.24) {
      const yellows = team.yellowCards.get(fouler.player.id) ?? 0
      team.yellowCards.set(fouler.player.id, yellows + 1)
      stats.yellowCards += 1
      if (yellows >= 1 || random() < 0.025) {
        stats.redCards = (stats.redCards ?? 0) + 1
        pushEvent(state, { minute: state.minute, type: 'red_card', team: teamName, player: name, playerId: fouler.player.id, text: yellows >= 1 ? 'Segundo amarelo. Expulso!' : 'Cartão vermelho direto. Expulso!' })
        const index = team.lineup.findIndex(item => item.player.id === fouler.player.id)
        if (index >= 0 && fouler.player.position !== 'GK') {
          team.lineup.splice(index, 1)
          team.removed.add(fouler.player.id)
        }
      } else {
        pushEvent(state, { minute: state.minute, type: 'card', team: teamName, player: name, playerId: fouler.player.id, text: 'Cartão amarelo.' })
      }
    }
  }

  if (random() < 0.018 && team.lineup.length) {
    const offside = chooseWeighted(team.lineup, ['ST', 'LW', 'RW', 'AM'], random)
    if (offside) {
      const name = offside.player.first_name + ' ' + offside.player.last_name
      stats.offsides = (stats.offsides ?? 0) + 1
      pushEvent(state, { minute: state.minute, type: 'offside', team: teamName, player: name, text: name + ' está impedido.' })
    }
  }

  if (random() < 0.004 && team.lineup.length) {
    const injured = chooseWeighted(team.lineup, ['ST', 'LW', 'RW', 'AM', 'CM', 'CB', 'LB', 'RB', 'DM'], random)
    if (injured) {
      const name = injured.player.first_name + ' ' + injured.player.last_name
      stats.injuries = (stats.injuries ?? 0) + 1
      // A lesão tira o jogador da ação, mas preserva sua vaga até o treinador escolher o substituto.
      // Assim o painel de incidente consegue identificar exatamente quem saiu e a equipe não fica
      // com 10 jogadores por um erro de interface.
      team.removed.add(injured.player.id)
      pushEvent(state, { minute: state.minute, type: 'injury', team: teamName, player: name, playerId: injured.player.id, text: name + ' sente uma lesão e deixa a partida. Escolha um substituto.' })
    }
  }
}

function aiTacticalAdjustment(state: InteractiveMatchState, teamName: InteractiveTeam) {
  if (![35, 55, 70, 80].includes(state.minute)) return
  const team = teamName === 'home' ? state.home : state.away
  const scoreDiff = teamName === 'home' ? state.homeScore - state.awayScore : state.awayScore - state.homeScore
  if (scoreDiff < 0 && team.tactic !== 'offensive') {
    team.tactic = 'offensive'
    team.risk = Math.min(90, team.risk + 15)
    team.sectorInstructions.attack = 'direct'
    recalculateMetrics(team)
    pushEvent(state, { minute: state.minute, type: 'tactical_change', team: teamName, player: 'Comissão técnica', text: 'A IA aumenta a pressão e adota uma postura ofensiva.' })
  } else if (scoreDiff > 0 && state.minute >= 70 && team.tactic !== 'defensive') {
    team.tactic = 'defensive'
    team.risk = Math.max(20, team.risk - 15)
    team.sectorInstructions.defense = 'protect'
    recalculateMetrics(team)
    pushEvent(state, { minute: state.minute, type: 'tactical_change', team: teamName, player: 'Comissão técnica', text: 'A IA protege a vantagem e fecha mais a equipe.' })
  }
}

function aiSubstitution(state: InteractiveMatchState, teamName: InteractiveTeam) {
  const team = teamName === 'home' ? state.home : state.away
  if (team.substitutions >= 5 || team.bench.length === 0 || ![55, 70, 80].includes(state.minute)) return
  const scoreDiff = teamName === 'home' ? state.homeScore - state.awayScore : state.awayScore - state.homeScore
  const tired = [...team.lineup].sort((a, b) => ((b.player.fatigue ?? 0) + state.minute) - ((a.player.fatigue ?? 0) + state.minute))[0]
  const shouldChange = scoreDiff < 0 ? true : scoreDiff > 0 ? state.minute >= 70 : Boolean(tired && (tired.player.fatigue ?? 0) + state.minute > 70)
  if (!shouldChange || !tired) return
  const replacement = [...team.bench].sort((a, b) => {
    const aScore = rating(a, tired.role) + (scoreDiff < 0 && ['ST', 'LW', 'RW', 'AM'].includes(a.position) ? 5 : 0)
    const bScore = rating(b, tired.role) + (scoreDiff < 0 && ['ST', 'LW', 'RW', 'AM'].includes(b.position) ? 5 : 0)
    return bScore - aScore
  })[0]
  if (!replacement) return
  const index = team.lineup.findIndex(item => item.player.id === tired.player.id)
  if (index < 0) return
  team.lineup[index] = { player: replacement, role: tired.role, slot: tired.slot }
  team.bench = team.bench.filter(player => player.id !== replacement.id)
  team.substitutions += 1
  recalculateMetrics(team)
  pushEvent(state, {
    minute: state.minute,
    type: 'substitution',
    team: teamName,
    player: replacement.first_name + ' ' + replacement.last_name,
    playerId: replacement.id,
    outgoingPlayerId: tired.player.id,
    text: replacement.first_name + ' ' + replacement.last_name + ' entra no lugar de ' + tired.player.first_name + ' ' + tired.player.last_name + '.',
  })
}

function reassignFormation(team: InteractiveTeamState, formation: Formation) {
  const used = new Set<string>()
  const lineup = FORMATIONS[formation].map((role, slot) => {
    const candidates = team.lineup
      .filter(item => !used.has(item.player.id))
      .sort((a, b) => {
        const aFit = (a.player.position === role ? 20 : 0) + playerOverall(a.player) + (['CB','LB','RB','DM'].includes(role) ? a.player.defending : ['ST','LW','RW','AM'].includes(role) ? a.player.shooting : a.player.passing)
        const bFit = (b.player.position === role ? 20 : 0) + playerOverall(b.player) + (['CB','LB','RB','DM'].includes(role) ? b.player.defending : ['ST','LW','RW','AM'].includes(role) ? b.player.shooting : b.player.passing)
        return bFit - aFit
      })[0]
    if (!candidates) return null
    used.add(candidates.player.id)
    return { player: candidates.player, role, slot }
  }).filter(Boolean) as LineupPlayer[]
  team.lineup = lineup
}
export function changeInteractiveInstruction(state: InteractiveMatchState, teamName: InteractiveTeam, sector: 'defense' | 'midfield' | 'attack', instruction: TacticalInstruction) {
  const next = cloneState(state)
  const team = teamName === 'home' ? next.home : next.away
  team.sectorInstructions[sector] = instruction
  recalculateMetrics(team)
  next.events.push({ minute: next.minute, type: 'tactical_change', team: teamName, player: 'Comissão técnica', text: 'Ajuste no setor ' + sector + ': ' + instruction + '.' })
  return next
}

export function changeInteractivePlayerInstruction(state: InteractiveMatchState, teamName: InteractiveTeam, playerId: string, instruction: TacticalInstruction) {
  const next = cloneState(state)
  const team = teamName === 'home' ? next.home : next.away
  if (!team.lineup.some(item => item.player.id === playerId)) return state
  team.playerInstructions[playerId] = instruction
  const selected = team.lineup.find(item => item.player.id === playerId)
  if (!selected) return state
  const selectedName = selected.player.first_name + ' ' + selected.player.last_name
  next.events.push({ minute: next.minute, type: 'tactical_change', team: teamName, player: selectedName, playerId, text: 'Instrução individual alterada para ' + instruction + '.' })
  return next
}

export function changeInteractiveRisk(state: InteractiveMatchState, teamName: InteractiveTeam, risk: number) {
  const next = cloneState(state)
  const team = teamName === 'home' ? next.home : next.away
  team.risk = clamp(risk, 10, 95)
  next.events.push({ minute: next.minute, type: 'tactical_change', team: teamName, player: 'Comissão técnica', text: 'Nível de risco ajustado para ' + Math.round(team.risk) + '/100.' })
  return next
}

export function makeInteractiveSubstitution(
  state: InteractiveMatchState,
  teamName: InteractiveTeam,
  outgoingId: string,
  incomingId: string,
) {
  const next = cloneState(state)
  const team = teamName === 'home' ? next.home : next.away
  if (team.substitutions >= 5) return state
  const index = team.lineup.findIndex(item => item.player.id === outgoingId)
  const incoming = team.bench.find(player => player.id === incomingId)
  if (index < 0 || !incoming) return state
  const outgoing = team.lineup[index]
  const isForcedIncidentReplacement = team.removed.has(outgoingId)
  if (!isForcedIncidentReplacement && team.removed.has(outgoingId)) return state
  team.lineup[index] = { player: incoming, role: outgoing.role, slot: outgoing.slot }
  team.bench = team.bench.filter(player => player.id !== incomingId)
  team.removed.delete(outgoingId)
  team.substitutions += 1
  recalculateMetrics(team)
  next.events.push({
    minute: next.minute,
    type: 'substitution',
    team: teamName,
    player: incoming.first_name + ' ' + incoming.last_name,
    playerId: incoming.id,
    outgoingPlayerId: outgoing.player.id,
    text: incoming.first_name + ' ' + incoming.last_name + ' entra no lugar de ' + outgoing.player.first_name + ' ' + outgoing.player.last_name + '.',
  })
  return next
}

export function resolveInteractivePenalty(state: InteractiveMatchState, teamName: InteractiveTeam, kickerId: string) {
  const next = cloneState(state)
  const team = teamName === 'home' ? next.home : next.away
  const kicker = team.lineup.find(item => item.player.id === kickerId)
  if (!kicker) return state
  const scored = next.rng() < clamp(0.68 + (kicker.player.shooting - 60) / 220, 0.45, 0.92)
  const name = kicker.player.first_name + ' ' + kicker.player.last_name
  const clubName = teamName === 'home' ? (next.fixture.home_club?.short_name ?? 'Casa') : (next.fixture.away_club?.short_name ?? 'Fora')
  if (scored) {
    if (teamName === 'home') next.homeScore += 1
    else next.awayScore += 1
    const stats = teamName === 'home' ? next.homeStats : next.awayStats
    stats.shots += 1
    stats.shotsOnTarget += 1
    stats.xg += 0.76
    next.events.push({ minute: next.minute, type: 'goal', team: teamName, player: name, playerId: kicker.player.id, text: name + ' cobra o pênalti, desloca o goleiro e marca! Gol do ' + clubName + '.' })
  } else {
    next.events.push({ minute: next.minute, type: 'shot', team: teamName, player: name, playerId: kicker.player.id, text: name + ' cobra o pênalti, mas a bola não entra.' })
  }
  return next
}

export function changeInteractiveTactics(
  state: InteractiveMatchState,
  teamName: InteractiveTeam,
  tactic: InteractiveTactic,
  formation?: Formation,
) {
  const next = cloneState(state)
  const team = teamName === 'home' ? next.home : next.away
  team.tactic = tactic
  if (formation) {
    team.formation = formation
    reassignFormation(team, formation)
  }
  recalculateMetrics(team)
  next.events.push({
    minute: next.minute,
    type: 'tactical_change',
    team: teamName,
    player: 'Comissão técnica',
    text: 'A equipe muda sua abordagem para ' + (tactic === 'offensive' ? 'ofensiva' : tactic === 'defensive' ? 'defensiva' : 'equilibrada') + (formation ? ' e ajusta a formação para ' + formation + '.' : '.'),
  })
  return next
}

export function advanceInteractiveMinute(state: InteractiveMatchState, controlledTeam: InteractiveTeam = 'home'): InteractiveMatchState {
  if (state.finished || state.minute >= 90) return { ...state, finished: true, minute: 90 }
  const next = cloneState(state)
  next.minute += 1

  const aiTeam: InteractiveTeam = controlledTeam === 'home' ? 'away' : 'home'
  aiTacticalAdjustment(next, aiTeam)
  aiSubstitution(next, aiTeam)
  simulateTeamMinute(next, 'home')
  simulateTeamMinute(next, 'away')
  simulateDisciplineAndIncidents(next)

  next.timeline.push({
    minute: next.minute,
    home: { ...next.homeStats },
    away: { ...next.awayStats },
  })

  if (next.minute >= 90) {
    const total = next.homeStats.possession + next.awayStats.possession || 100
    next.homeStats.possession = Math.round((next.homeStats.possession / total) * 100)
    next.awayStats.possession = 100 - next.homeStats.possession
    next.timeline = next.timeline.map(snapshot => {
      const snapshotTotal = snapshot.home.possession + snapshot.away.possession || 100
      return {
        minute: snapshot.minute,
        home: { ...snapshot.home, possession: Math.round((snapshot.home.possession / snapshotTotal) * 100) },
        away: { ...snapshot.away, possession: 100 - Math.round((snapshot.home.possession / snapshotTotal) * 100) },
      }
    })
    next.finished = true
  }
  return next
}

function buildRatings(state: InteractiveMatchState): PlayerMatchRating[] {
  const ratings: PlayerMatchRating[] = []
  const teams: Array<[InteractiveTeam, InteractiveTeamState, Player[], Set<string>]> = [
    ['home', state.home, state.homeSquad, state.homeStartingIds],
    ['away', state.away, state.awaySquad, state.awayStartingIds],
  ]
  for (const [teamName, team, squad, startingIds] of teams) {
    for (const player of squad) {
      const name = playerNameForRating(player)
      const playerEvents = state.events.filter(event => event.team === teamName && event.playerId === player.id)
      const goals = state.events.filter(event => event.team === teamName && event.type === 'goal' && event.playerId === player.id).length
      const assists = state.events.filter(event => event.type === 'goal' && event.assistPlayerId === player.id).length
      const cards = playerEvents.filter(event => (event.type === 'card' || event.type === 'red_card') && event.playerId === player.id).length
      const outgoingEvent = state.events.find(event => event.type === 'substitution' && event.outgoingPlayerId === player.id)
      const incomingEvent = state.events.find(event => event.type === 'substitution' && event.playerId === player.id && event.outgoingPlayerId)
      const injuryEvent = state.events.find(event => event.type === 'injury' && event.playerId === player.id)
      const enteredMinute = incomingEvent?.minute ?? 1
      const minutes = outgoingEvent
        ? Math.max(0, outgoingEvent.minute - 1)
        : injuryEvent
          ? Math.max(0, injuryEvent.minute - 1)
          : incomingEvent
            ? Math.max(0, state.minute - enteredMinute)
            : startingIds.has(player.id) && !team.removed.has(player.id)
              ? state.minute
              : 0
      const base = 5.5 + (playerOverall(player) - 60) * 0.055
      if (minutes <= 0) continue
      ratings.push({
        playerId: player.id,
        name,
        position: player.position,
        team: teamName,
        rating: Math.round(clamp(base + goals * 0.85 - cards * 0.4, 1, 10) * 10) / 10,
        goals,
        assists,
        fatigue: Math.round(clamp((player.fatigue ?? 0) + minutes * 0.45)),
        minutes,
        started: startingIds.has(player.id),
      })
    }
  }
  return ratings
}

function playerNameForRating(player: Player) {
  return player.first_name + ' ' + player.last_name
}

export function interactiveMatchResult(state: InteractiveMatchState): MatchResult {
  const playerRatings = buildRatings(state)
  const standout = [...playerRatings].sort((a, b) => b.rating - a.rating || b.goals - a.goals)[0]
  const homeXg = Number(state.homeStats.xg.toFixed(1))
  const awayXg = Number(state.awayStats.xg.toFixed(1))
  const efficiency = state.homeScore >= state.awayScore
    ? state.homeScore > homeXg + 0.25 ? 'O mandante converteu acima do esperado.' : 'O mandante teve uma conversão próxima ao esperado.'
    : state.awayScore > awayXg + 0.25 ? 'O visitante converteu acima do esperado.' : 'O visitante teve uma conversão próxima ao esperado.'
  const fatiguePlayer = [...playerRatings].sort((a, b) => b.fatigue - a.fatigue)[0]
  const analysis = {
    homeXg,
    awayXg,
    efficiencyText: efficiency,
    standout,
    fatigueText: fatiguePlayer ? fatiguePlayer.name + ' terminou com índice de fadiga ' + fatiguePlayer.fatigue + '/100.' : 'Fadiga não disponível.',
  }
  return {
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    events: [...state.events].sort((a, b) => a.minute - b.minute),
    homeMetrics: state.home.metrics,
    awayMetrics: state.away.metrics,
    homeStats: state.homeStats,
    awayStats: state.awayStats,
    timeline: state.timeline,
    playerRatings,
    analysis,
  }
}
