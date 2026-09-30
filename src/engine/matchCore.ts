import type { CoachPersonality, CoachStyle, Formation, LineupPlayer, Player } from '../types/game'
import { FORMATIONS } from '../types/game'

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

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 50
}

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

export function rating(player: Player, role = player.position) {
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

export function performanceRating(player: Player, role = player.position) {
  return rating(player, role) * (1 - Math.min(0.2, (player.fatigue ?? 0) * 0.002))
}

function sector(lineup: LineupPlayer[], roles: string[]) {
  return average(lineup.filter(item => roles.includes(item.role)).map(item => performanceRating(item.player, item.role)))
}

export function coachModifiers(style?: string, personality?: string) {
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

export function selectionScore(player: Player, role: string) {
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

