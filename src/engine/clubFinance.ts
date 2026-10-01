import type { FinanceTransaction } from './finance'

export type FinancialStatus = 'saudável' | 'atenção' | 'crítico'

export type SeasonFinancialHistory = {
  seasonId: string
  seasonName: string
  clubId: string
  openingBalance: number
  revenue: number
  expenses: number
  matchRevenue: number
  sponsorshipRevenue: number
  prizeRevenue: number
  transferRevenue: number
  transferExpenses: number
  playerSalaryExpenses: number
  staffSalaryExpenses: number
  stadiumExpenses: number
  finesAndCosts: number
  closingBalance: number
  financialStatus: FinancialStatus
  nextSeasonBudget: number
}

export type MatchdayFinance = {
  attendance: number
  ticketPrice: number
  grossRevenue: number
  operatingCost: number
  netRevenue: number
}

export function calculateFinancialStatus(balance: number, monthlyPayroll: number) : FinancialStatus {
  const payroll = Math.max(0, monthlyPayroll)
  if (balance < Math.max(150_000, payroll * 0.75)) return 'crítico'
  if (balance < Math.max(500_000, payroll * 2.5)) return 'atenção'
  return 'saudável'
}

export function calculateDynamicTicketPrice(
  basePrice: number,
  reputation: number,
  fanSatisfaction: number,
  opponentReputation = 50,
  isCup = false,
) {
  const demandFactor =
    0.82 +
    Math.max(0, Math.min(100, reputation)) / 500 +
    Math.max(0, Math.min(100, fanSatisfaction)) / 600 +
    Math.max(0, Math.min(100, opponentReputation)) / 900 +
    (isCup ? 0.08 : 0)
  return Math.max(20, Math.min(180, Math.round((basePrice * demandFactor) / 5) * 5))
}

export function calculateExpectedAttendance(
  capacity: number,
  reputation: number,
  fanSatisfaction: number,
  opponentReputation: number,
  ticketPrice: number,
  baseTicketPrice: number,
  result: 'W' | 'D' | 'L' = 'D',
) {
  const priceFactor = Math.max(0.58, Math.min(1.12, baseTicketPrice / Math.max(1, ticketPrice)))
  const resultFactor = result === 'W' ? 1.04 : result === 'L' ? 0.94 : 1
  const demand = 0.42 +
    Math.max(0, Math.min(100, reputation)) / 240 +
    Math.max(0, Math.min(100, fanSatisfaction)) / 420 +
    Math.max(0, Math.min(100, opponentReputation)) / 850
  const safeCapacity = Math.max(1, Math.round(capacity))
  return Math.min(
    safeCapacity,
    Math.max(0, Math.round(safeCapacity * demand * priceFactor * resultFactor)),
  )
}

export function calculateMatchdayFinance(
  capacity: number,
  reputation: number,
  fanSatisfaction: number,
  opponentReputation: number,
  baseTicketPrice: number,
  result: 'W' | 'D' | 'L' = 'D',
  isCup = false,
) : MatchdayFinance {
  const ticketPrice = calculateDynamicTicketPrice(baseTicketPrice, reputation, fanSatisfaction, opponentReputation, isCup)
  const attendance = calculateExpectedAttendance(capacity, reputation, fanSatisfaction, opponentReputation, ticketPrice, baseTicketPrice, result)
  const grossRevenue = Math.max(0, Math.round(attendance * ticketPrice))
  const operatingCost = Math.max(15_000, Math.round(grossRevenue * (isCup ? 0.07 : 0.055)))
  return { attendance, ticketPrice, grossRevenue, operatingCost, netRevenue: grossRevenue - operatingCost }
}

export function calculateTechnicalStaffPayroll(playerPayroll: number, clubReputation: number, clubStrength: number, managerConfidence = 62) {
  const base = Math.max(25_000, playerPayroll * 0.11)
  const reputationFactor = 0.75 + Math.max(0, Math.min(100, clubReputation)) / 250
  const strengthFactor = 0.85 + Math.max(0, Math.min(100, clubStrength)) / 400
  const confidenceFactor = 0.9 + Math.max(0, managerConfidence - 50) / 300
  return Math.round((base * reputationFactor * strengthFactor * confidenceFactor) / 500) * 500
}

export function calculateFineAndOperationalCost(
  redCards: number,
  injuries: number,
  transfersThisMonth: number,
  criticalFinancial: boolean,
) {
  const disciplinary = Math.max(0, redCards) * 12_500
  const medical = Math.max(0, injuries) * 4_000
  const registration = Math.max(0, transfersThisMonth) * 2_500
  const crisisCost = criticalFinancial ? 25_000 : 0
  return disciplinary + medical + registration + crisisCost
}

export function calculateNextSeasonBudget(
  closingBalance: number,
  seasonRevenue: number,
  seasonExpenses: number,
  performancePrize: number,
  reputation: number,
  financialStatus: FinancialStatus,
) {
  const operatingResult = seasonRevenue - seasonExpenses
  const reserveRate = financialStatus === 'crítico' ? 0.38 : financialStatus === 'atenção' ? 0.52 : 0.68
  const performanceReserve = Math.max(0, performancePrize) * (0.35 + Math.max(0, Math.min(100, reputation)) / 500)
  const base = Math.max(0, closingBalance * reserveRate + performanceReserve + Math.max(0, operatingResult) * 0.18)
  return Math.round(base / 50_000) * 50_000
}

export function calculateClubChangeFinancialImpact(targetBudget: number, targetReputation: number) {
  const transitionCost = Math.min(500_000, Math.max(50_000, Math.round((targetBudget * (0.015 + targetReputation / 10_000)) / 10_000) * 10_000))
  return {
    transitionCost,
    availableBudget: Math.max(0, targetBudget - transitionCost),
  }
}

export function buildSeasonFinancialHistory(
  transactions: FinanceTransaction[],
  seasonId: string,
  seasonName: string,
  clubId: string,
  openingBalance: number,
  closingBalance: number,
  nextSeasonBudget: number,
) : SeasonFinancialHistory {
  const ledgerTransactions = transactions.filter(item => item.eventId !== 'career:initial-budget' && !item.eventId?.startsWith('manager-switch:'))
  const sum = (types: FinanceTransaction['type'][]) =>
    ledgerTransactions.filter(item => types.includes(item.type)).reduce((total, item) => total + item.amount, 0)
  const revenue = ledgerTransactions.filter(item => item.amount > 0).reduce((total, item) => total + item.amount, 0)
  const expenses = ledgerTransactions.filter(item => item.amount < 0).reduce((total, item) => total + Math.abs(item.amount), 0)
  const playerSalaryExpenses = Math.abs(sum(['salary']))
  const staffSalaryExpenses = Math.abs(sum(['staff_salary']))
  const stadiumExpenses = Math.abs(sum(['stadium_maintenance']))
  const finesAndCosts = ledgerTransactions
    .filter(item => item.type === 'fine' || item.type === 'other')
    .reduce((total, item) => total + Math.abs(item.amount), 0)
  return {
    seasonId,
    seasonName,
    clubId,
    openingBalance,
    revenue,
    expenses,
    matchRevenue: sum(['match_revenue']),
    sponsorshipRevenue: sum(['sponsorship', 'bonus']),
    prizeRevenue: sum(['prize']),
    transferRevenue: sum(['transfer_in']),
    transferExpenses: Math.abs(sum(['transfer_out'])),
    playerSalaryExpenses,
    staffSalaryExpenses,
    stadiumExpenses,
    finesAndCosts,
    closingBalance,
    financialStatus: calculateFinancialStatus(closingBalance, (playerSalaryExpenses + staffSalaryExpenses) / 12),
    nextSeasonBudget,
  }
}
