import type { Player } from '../types/game'

export type PlayerLifecycleState = {
  coachRelationship: number
  dissatisfaction: number
  transferRequested: boolean
  transferRequestDate: string | null
  careerGoals: number
  careerAssists: number
  careerAppearances: number
  careerMinutes: number
  careerStarts: number
  careerRatingTotal: number
  careerRatingCount: number
  injuries: number
  longTermInjuries: number
  seasons: number
}

export type PlayerLifecycleContext = {
  date: string
  managerPersonality?: string
  managerStyle?: string
  clubPerformance?: { position?: number; recentPoints?: number }
}

export const DEFAULT_PLAYER_LIFECYCLE: PlayerLifecycleState = {
  coachRelationship: 50,
  dissatisfaction: 0,
  transferRequested: false,
  transferRequestDate: null,
  careerGoals: 0,
  careerAssists: 0,
  careerAppearances: 0,
  careerMinutes: 0,
  careerStarts: 0,
  careerRatingTotal: 0,
  careerRatingCount: 0,
  injuries: 0,
  longTermInjuries: 0,
  seasons: 0,
}

export function clampLifecycle(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function ageDevelopmentDelta(player: Pick<Player, 'age' | 'potential'>, overall: number) {
  if (player.age <= 20) return overall < player.potential ? 1 : 0
  if (player.age <= 23) return overall < player.potential ? 1 : 0
  if (player.age <= 27) return 0
  if (player.age <= 30) return -1
  if (player.age <= 33) return -1
  return -2
}

export function retirementChance(player: Pick<Player, 'age' | 'physical' | 'mental'>, seed01 = 0.5) {
  if (player.age < 34) return 0
  const agePressure = Math.max(0, player.age - 34)
  const physicalPressure = Math.max(0, 60 - player.physical) * 0.004
  const base = 0.06 + agePressure * 0.09 + physicalPressure
  return Math.min(0.82, base + (seed01 * 0.08))
}

export function injuryDurationDays(
  player: Pick<Player, 'age' | 'physical'>,
  severity: 'minor' | 'moderate' | 'long_term' = 'moderate',
  roll = 0.5,
) {
  const ranges = {
    minor: [5, 14],
    moderate: [14, 42],
    long_term: [45, 180],
  } as const
  const [min, max] = ranges[severity]
  const ageFactor = Math.max(0, player.age - 29) * 1.5
  const physicalFactor = Math.max(0, 65 - player.physical) * 0.35
  return Math.round(Math.min(210, min + (max - min) * roll + ageFactor + physicalFactor))
}

export function coachRelationshipDelta(
  player: Pick<Player, 'morale' | 'age' | 'potential'>,
  context: Pick<PlayerLifecycleContext, 'managerPersonality' | 'managerStyle' | 'clubPerformance'>,
  usage: 'starter' | 'rotation' | 'backup' | 'prospect',
) {
  let delta = 0
  if (usage === 'starter') delta += 1
  if (usage === 'backup') delta -= 1
  if (usage === 'prospect' && player.age <= 23) delta += 1
  if (context.managerPersonality === 'psychologist') delta += 1
  if (context.managerPersonality === 'motivator' && player.morale < 60) delta += 1
  if (context.managerPersonality === 'disciplinarian' && usage === 'backup') delta -= 1
  if (context.managerStyle === 'youth_focus' && player.age <= 23) delta += 1
  if (context.clubPerformance?.position && context.clubPerformance.position >= 13 && player.morale < 50) delta -= 1
  return delta
}

export function updatePlayerLifecycle(
  state: PlayerLifecycleState | undefined,
  changes: Partial<PlayerLifecycleState>,
): PlayerLifecycleState {
  return {
    ...DEFAULT_PLAYER_LIFECYCLE,
    ...(state ?? {}),
    ...changes,
    coachRelationship: clampLifecycle(changes.coachRelationship ?? state?.coachRelationship ?? 50),
    dissatisfaction: clampLifecycle(changes.dissatisfaction ?? state?.dissatisfaction ?? 0),
  }
}

export function updateDissatisfaction(
  state: PlayerLifecycleState,
  player: Pick<Player, 'morale' | 'age'>,
  usage: 'starter' | 'rotation' | 'backup' | 'prospect',
  contractMonths: number | null,
) {
  let delta = 0
  if (player.morale <= 40) delta += 2
  else if (player.morale >= 75) delta -= 1
  if ((usage === 'backup' || usage === 'rotation') && player.morale <= 55) delta += 1
  if (player.age <= 23 && usage === 'backup') delta += 1
  if (contractMonths !== null && contractMonths <= 6) delta += 1
  return updatePlayerLifecycle(state, {
    dissatisfaction: clampLifecycle(state.dissatisfaction + delta),
  })
}

export function shouldRequestTransfer(
  state: PlayerLifecycleState,
  player: Pick<Player, 'morale'>,
  seed01: number,
) {
  if (state.transferRequested) return false
  if (state.dissatisfaction < 65 || player.morale > 42) return false
  return seed01 < Math.min(0.7, 0.18 + (state.dissatisfaction - 65) * 0.012)
}

export function recordCareerMatch(
  state: PlayerLifecycleState,
  rating: { appearances?: number; starts?: number; minutes: number; goals: number; assists: number; rating: number },
) {
  const appearances = state.careerAppearances + (rating.appearances ?? 1)
  const ratingCount = state.careerRatingCount + 1
  return updatePlayerLifecycle(state, {
    careerAppearances: appearances,
    careerStarts: state.careerStarts + (rating.starts ?? 0),
    careerMinutes: state.careerMinutes + rating.minutes,
    careerGoals: state.careerGoals + rating.goals,
    careerAssists: state.careerAssists + rating.assists,
    careerRatingTotal: state.careerRatingTotal + rating.rating,
    careerRatingCount: ratingCount,
  })
}

export function careerAverageRating(state: PlayerLifecycleState) {
  return state.careerRatingCount ? Number((state.careerRatingTotal / state.careerRatingCount).toFixed(2)) : 0
}
