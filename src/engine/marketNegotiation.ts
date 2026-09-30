import type { Club, Player } from '../types/game'

export type NegotiationAction = 'accept' | 'counter' | 'reject' | 'withdraw'

export type NegotiationContext = {
  askingPrice: number
  offer: number
  round?: number
  maxRounds?: number
  sellerBehavior?: 'ambitious' | 'youth' | 'conservative' | 'seller' | 'balanced'
  sellerBudgetPressure?: number
  playerImportance?: number
  buyerBudgetRatio?: number
  competitionCount?: number
  playerAge?: number
  buyerReputation?: number
  roll?: number
}

export type NegotiationDecision = {
  action: NegotiationAction
  offer: number
  minimum: number
  counterOffer: number
  reason: string
}

function roundMoney(value: number) {
  return Math.max(0, Math.round(value / 50000) * 50000)
}

export function calculateNegotiationFloor(askingPrice: number, context: Pick<NegotiationContext, 'sellerBehavior' | 'sellerBudgetPressure' | 'playerImportance' | 'playerAge'> = {}) {
  const asking = Math.max(0, askingPrice)
  let factor = 0.88

  if (context.sellerBehavior === 'seller') factor -= 0.09
  if (context.sellerBehavior === 'conservative') factor += 0.06
  if (context.sellerBehavior === 'youth') factor += 0.04
  if (context.sellerBehavior === 'ambitious') factor += 0.03

  factor -= Math.min(0.12, Math.max(0, context.sellerBudgetPressure ?? 0) * 0.12)
  factor += Math.min(0.08, Math.max(0, context.playerImportance ?? 0) * 0.08)

  if ((context.playerAge ?? 26) <= 21) factor += 0.03
  if ((context.playerAge ?? 26) >= 31) factor -= 0.03

  return roundMoney(asking * Math.max(0.68, Math.min(1.02, factor)))
}

export function decideTransferNegotiation(context: NegotiationContext): NegotiationDecision {
  const asking = Math.max(0, context.askingPrice)
  const offer = Math.max(0, context.offer)
  const round = Math.max(0, context.round ?? 0)
  const maxRounds = Math.max(1, context.maxRounds ?? 3)
  const competition = Math.max(1, context.competitionCount ?? 1)
  const roll = Math.max(0, Math.min(99, context.roll ?? 50))
  const minimum = calculateNegotiationFloor(asking, context)

  const competitionPremium = Math.min(0.12, (competition - 1) * 0.04)
  const reputationPremium = Math.min(0.05, Math.max(0, (context.buyerReputation ?? 60) - 60) * 0.001)
  const target = roundMoney(Math.max(minimum, asking * (1 + competitionPremium + reputationPremium)))

  if (offer >= target) {
    return { action: 'accept', offer, minimum, counterOffer: offer, reason: 'A proposta atingiu o valor que o clube considera adequado.' }
  }

  if (round >= maxRounds) {
    if (offer >= minimum && roll >= 30) {
      return { action: 'accept', offer, minimum, counterOffer: offer, reason: 'O clube encerrou a negociação aceitando a última proposta.' }
    }
    return { action: 'withdraw', offer, minimum, counterOffer: 0, reason: 'O clube desistiu após várias rodadas sem chegar a um acordo.' }
  }

  if (offer < minimum * 0.78 && roll < 38) {
    return { action: 'reject', offer, minimum, counterOffer: 0, reason: 'A proposta ficou muito abaixo do que o clube considera aceitável.' }
  }

  if (offer >= minimum * 0.92 && roll >= 28) {
    return {
      action: 'counter',
      offer,
      minimum,
      counterOffer: roundMoney(Math.max(offer * 1.08, target)),
      reason: 'O clube respondeu com uma contraproposta para tentar elevar o valor.',
    }
  }

  if (roll < 18) {
    return { action: 'withdraw', offer, minimum, counterOffer: 0, reason: 'O clube decidiu priorizar outros alvos e encerrou as conversas.' }
  }

  return {
    action: 'counter',
    offer,
    minimum,
    counterOffer: roundMoney(Math.max(minimum, (offer + target) / 2)),
    reason: 'O clube não aceitou o valor inicial, mas mantém a negociação aberta.',
  }
}

export function calculateTargetPriority(
  player: Player,
  club: Club,
  positionNeed: number,
  strategyWeight = 1,
) {
  const overall = (
    player.pace + player.shooting + player.passing + player.dribbling +
    player.defending + player.physical + player.goalkeeping + player.mental
  ) / 8

  const ageScore = player.age <= 23 ? 10 : player.age <= 27 ? 6 : player.age <= 30 ? 2 : -4
  const performanceScore = (player.form - 50) * 0.08 + (player.morale - 50) * 0.04
  const affordability = club.budget > 0 ? Math.max(0, 12 - ((player.marketValue ?? 0) / club.budget) * 12) : 0

  return positionNeed * 1.8 + overall * 0.55 + ageScore + performanceScore + affordability * strategyWeight
}
