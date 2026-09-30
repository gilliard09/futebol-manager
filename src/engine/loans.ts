import type { Club, Player } from '../types/game'

export type LoanClubProfile = {
  id: string
  budget: number
  strength: number
  reputation?: number
  behavior?: 'ambitious' | 'youth' | 'conservative' | 'seller' | 'balanced'
}

export type LoanEvaluation = {
  score: number
  fee: number
  salaryShare: number
  months: number
  reason: string
}

export type LoanRecord = {
  id: string
  date: string
  startDate: string
  endDate: string
  playerId: string
  playerName: string
  parentClubId: string
  loanClubId: string
  fee: number
  salary: number
  salaryShare: number
}

export type LoanState = { records: LoanRecord[] }

export const EMPTY_LOAN_STATE: LoanState = { records: [] }

export function isLoanActive(loan: LoanRecord, today: string) {
  return loan.startDate <= today && today < loan.endDate
}

export function getActiveLoan(playerId: string, today: string, state: LoanState) {
  return state.records.find(loan => loan.playerId === playerId && isLoanActive(loan, today)) ?? null
}

export function getCurrentClubId(baseClubId: string, playerId: string, today: string, transferOverrides: Record<string, string>, state: LoanState) {
  const loan = getActiveLoan(playerId, today, state)
  return loan?.loanClubId ?? transferOverrides[playerId] ?? baseClubId
}

export function calculateLoanEndDate(startDate: string, months: number) {
  const safeMonths = Math.max(1, Math.min(12, Math.round(months)))
  const date = new Date(startDate + 'T12:00:00Z')
  date.setUTCMonth(date.getUTCMonth() + safeMonths)
  return date.toISOString().slice(0, 10)
}

export function calculateLoanFee(player: Player, marketValue: number, months: number) {
  const value = Math.max(0, marketValue)
  const durationFactor = Math.max(0.5, Math.min(1.5, months / 6))
  const ageFactor = player.age <= 21 ? 1.15 : player.age >= 31 ? 0.85 : 1
  return Math.max(25000, Math.round((value * 0.08 * durationFactor * ageFactor) / 5000) * 5000)
}

export function normalizeSalaryShare(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function calculateLoanSalaryCost(salary: number, salaryShare: number, isLoanClub: boolean) {
  const monthly = Math.max(0, salary)
  const share = normalizeSalaryShare(salaryShare) / 100
  return Math.round(monthly * (isLoanClub ? share : 1 - share))
}

export function canCompleteLoan(club: Club, fee: number) {
  return fee >= 0 && fee <= club.budget
}

export function createLoanRecord(date: string, player: Player, parentClubId: string, loanClubId: string, fee: number, salary: number, salaryShare: number, months: number, id = crypto.randomUUID()): LoanRecord {
  return { id, date, startDate: date, endDate: calculateLoanEndDate(date, months), playerId: player.id, playerName: player.first_name + ' ' + player.last_name, parentClubId, loanClubId, fee: Math.max(0, fee), salary: Math.max(0, salary), salaryShare: normalizeSalaryShare(salaryShare) }
}

export function evaluateLoanTarget(
  player: Player,
  marketValue: number,
  parentClub: LoanClubProfile,
  destinationClub: LoanClubProfile,
  destinationSquadSize: number,
  destinationPositionDepth: number,
): LoanEvaluation {
  const overall = playerOverallForLoan(player)
  const room = Math.max(0, player.potential - overall)
  const isProspect = player.age <= 23 && room >= 8
  const parentBehavior = parentClub.behavior ?? 'balanced'
  const destinationBehavior = destinationClub.behavior ?? 'balanced'
  const playingOpportunity = Math.max(0, 12 - destinationPositionDepth * 3)
  const strengthFit = Math.max(0, 10 - Math.abs(destinationClub.strength - overall) * 0.7)
  const developmentFit = isProspect ? playingOpportunity * 1.25 + (destinationBehavior === 'youth' ? 6 : 0) : playingOpportunity * 0.55
  const sellerMotivation = parentBehavior === 'seller' ? 5 : parentBehavior === 'youth' && isProspect ? 8 : 0
  const affordability = destinationClub.budget <= 0 ? 0 : Math.max(0, Math.min(12, destinationClub.budget / Math.max(250000, marketValue * 0.12)))
  const score = Math.round(developmentFit + strengthFit + sellerMotivation + affordability + (destinationSquadSize < 20 ? 4 : 0) - (destinationSquadSize >= 25 ? 8 : 0) - (player.age >= 30 ? 5 : 0))
  const months = isProspect ? 6 : player.age <= 27 ? 5 : 4
  const fee = calculateLoanFee(player, marketValue, months)
  const salaryShare = isProspect ? (destinationBehavior === 'conservative' ? 60 : 70) : 55
  const reason = isProspect ? 'jovem com potencial e espaço para ganhar minutos' : playingOpportunity >= 7 ? 'ganho de minutos para um jogador fora da rotação' : 'redução de folha e busca por utilização'
  return { score, fee, salaryShare: normalizeSalaryShare(salaryShare), months, reason }
}

export function shouldOfferLoan(evaluation: LoanEvaluation, destinationClub: LoanClubProfile) {
  const budgetLimit = Math.max(150000, destinationClub.budget * 0.18)
  return evaluation.score >= 20 && evaluation.fee <= budgetLimit
}

function playerOverallForLoan(player: Player) {
  const positionWeights: Record<string, Array<keyof Player>> = {
    GK: ['goalkeeping', 'mental', 'physical'], CB: ['defending', 'physical', 'mental'], LB: ['defending', 'pace', 'physical'], RB: ['defending', 'pace', 'physical'],
    DM: ['defending', 'passing', 'physical'], CM: ['passing', 'mental', 'physical'], AM: ['passing', 'dribbling', 'shooting'], LW: ['pace', 'dribbling', 'shooting'], RW: ['pace', 'dribbling', 'shooting'], ST: ['shooting', 'physical', 'pace'],
  }
  const keys = positionWeights[player.position] ?? ['mental', 'physical', 'passing']
  return Math.round(keys.reduce((sum, key) => sum + Number(player[key] ?? 0), 0) / keys.length)
}
export function applyLoan(state: LoanState, record: LoanRecord): LoanState {
  return { records: [...state.records, record] }
}