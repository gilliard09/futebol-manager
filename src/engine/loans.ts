import type { Club, Player } from '../types/game'

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

export function applyLoan(state: LoanState, record: LoanRecord): LoanState {
  return { records: [...state.records, record] }
}