import type { Player } from '../types/game'

export type TrainingFocus = 'balanced' | 'technical' | 'physical' | 'mental' | 'goalkeeping'

export const TRAINING_FOCUSES: Record<TrainingFocus, { label: string; description: string; cost: number }> = {
  balanced: { label: 'Equilibrado', description: 'Desenvolvimento geral do elenco.', cost: 5000 },
  technical: { label: 'Técnico', description: 'Passe, drible e finalização.', cost: 6500 },
  physical: { label: 'Físico', description: 'Velocidade e capacidade física.', cost: 6000 },
  mental: { label: 'Mental', description: 'Mentalidade, concentração e consistência.', cost: 5500 },
  goalkeeping: { label: 'Goleiros', description: 'Treino específico para goleiros.', cost: 4500 },
}

type Random = () => number

function improve(value: number, potential: number, age: number, intensity: number, random: Random) {
  if (value >= potential) return value
  const ageFactor = age <= 21 ? 1.3 : age <= 25 ? 1 : age <= 29 ? 0.7 : 0.35
  const chance = Math.min(0.9, 0.22 * ageFactor * intensity)
  return random() < chance ? Math.min(potential, value + 1) : value
}

export function trainPlayer(player: Player, focus: TrainingFocus, random: Random = Math.random): Player {
  const intensity = focus === 'balanced' ? 1 : 1.15
  const next = { ...player }

  if (focus === 'technical' || focus === 'balanced') {
    next.passing = improve(next.passing, next.potential, next.age, intensity, random)
    next.dribbling = improve(next.dribbling, next.potential, next.age, intensity, random)
    next.shooting = improve(next.shooting, next.potential, next.age, intensity, random)
  }
  if (focus === 'physical' || focus === 'balanced') {
    next.pace = improve(next.pace, next.potential, next.age, intensity, random)
    next.physical = improve(next.physical, next.potential, next.age, intensity, random)
  }
  if (focus === 'mental' || focus === 'balanced') {
    next.mental = improve(next.mental, next.potential, next.age, intensity, random)
  }
  if (focus === 'goalkeeping' && next.position === 'GK') {
    next.goalkeeping = improve(next.goalkeeping, next.potential, next.age, intensity, random)
  }

  next.form = Math.min(100, next.form + 2)
  next.morale = Math.min(100, next.morale + 1)
  next.fatigue = Math.min(100, (next.fatigue ?? 0) + 12)
  return next
}

export function trainSquad(players: Player[], focus: TrainingFocus, random: Random = Math.random) {
  return players.map(player => trainPlayer(player, focus, random))
}


export function recoverPlayers(players: Player[], amount = 18) {
  return players.map(player => ({
    ...player,
    fatigue: Math.max(0, (player.fatigue ?? 0) - amount),
  }))
}

export function applyMatchFatigue(players: Player[], ratings: Array<{ playerId: string; fatigue: number }>) {
  const fatigueById = new Map(ratings.map(item => [item.playerId, item.fatigue]))
  return players.map(player => ({
    ...player,
    fatigue: Math.min(100, (player.fatigue ?? 0) + Math.round((fatigueById.get(player.id) ?? 20) * 0.45)),
  }))
}
