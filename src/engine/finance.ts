export type FinanceTransactionType = 'match_revenue' | 'salary' | 'staff_salary' | 'training' | 'transfer_in' | 'transfer_out' | 'bonus' | 'prize' | 'sponsorship' | 'fine' | 'stadium_maintenance' | 'other'

export type FinanceTransaction = {
  id: string
  date: string
  type: FinanceTransactionType
  description: string
  amount: number
  eventId?: string
}

export type MonthlyFinance = {
  month: string
  openingBalance: number
  revenue: number
  expenses: number
  closingBalance: number
}

export function applyTransaction(balance: number, transaction: Pick<FinanceTransaction, 'amount'>) {
  return Math.max(0, balance + transaction.amount)
}

export function hasTransaction(transactions: FinanceTransaction[], eventId: string) {
  return transactions.some(transaction => transaction.eventId === eventId)
}

export function calculateMonthSummary(transactions: FinanceTransaction[], month: string, openingBalance: number): MonthlyFinance {
  const monthTransactions = transactions.filter(transaction => transaction.date.slice(0, 7) === month)
  const revenue = monthTransactions.filter(transaction => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0)
  const expenses = monthTransactions.filter(transaction => transaction.amount < 0).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)
  return { month, openingBalance, revenue, expenses, closingBalance: openingBalance + revenue - expenses }
}

export function calculateMatchRevenue(attendance: number, ticketPrice = 35, homeBonus = 1) {
  return Math.max(0, Math.round(attendance * ticketPrice * homeBonus))
}

export function estimateAttendance(reputation: number, capacity = 12000) {
  const base = 4500 + Math.max(0, reputation) * 70
  return Math.min(capacity, Math.max(2500, Math.round(base)))
}

export function calculateMonthlySalaryExpense(monthlyPayroll: number) {
  return monthlyPayroll > 0 ? -monthlyPayroll : 0
}

export function calculateTrainingExpense(cost: number) {
  return cost > 0 ? -cost : 0
}

export function createTransaction(date: string, type: FinanceTransactionType, description: string, amount: number, id = crypto.randomUUID(), eventId?: string): FinanceTransaction {
  return { id, date, type, description, amount, eventId }
}


export function calculatePrizeMoney(position: number, competition: 'league' | 'cup', champion = false) {
  if (competition === 'cup') {
    if (champion) return 2_000_000
    if (position === 2) return 1_000_000
    if (position >= 3 && position <= 4) return 500_000
    return 0
  }
  if (position === 1) return 3_000_000
  if (position === 2) return 1_500_000
  if (position >= 3 && position <= 4) return 750_000
  return 0
}

export function calculateMatchRevenueFromAttendance(attendance: number, ticketPrice = 35, result: 'W' | 'D' | 'L' = 'D') {
  const resultMultiplier = result === 'W' ? 1.05 : result === 'L' ? 0.95 : 1
  return Math.max(0, Math.round(attendance * ticketPrice * resultMultiplier))
}

export function summarizeFinance(transactions: FinanceTransaction[], balance: number, monthlyPayroll: number) {
  const revenue = transactions.filter(item => item.amount > 0).reduce((sum, item) => sum + item.amount, 0)
  const expenses = transactions.filter(item => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0)
  const transferSpend = transactions.filter(item => item.type === 'transfer_out').reduce((sum, item) => sum + Math.abs(item.amount), 0)
  const transferIncome = transactions.filter(item => item.type === 'transfer_in').reduce((sum, item) => sum + Math.abs(item.amount), 0)
  const matchRevenue = transactions.filter(item => item.type === 'match_revenue').reduce((sum, item) => sum + item.amount, 0)
  const prizes = transactions.filter(item => item.type === 'prize').reduce((sum, item) => sum + item.amount, 0)
  const staffSalary = transactions.filter(item => item.type === 'staff_salary').reduce((sum, item) => sum + Math.abs(item.amount), 0)
  const fines = transactions.filter(item => item.type === 'fine').reduce((sum, item) => sum + Math.abs(item.amount), 0)
  const stadiumMaintenance = transactions.filter(item => item.type === 'stadium_maintenance').reduce((sum, item) => sum + Math.abs(item.amount), 0)
  return { balance, monthlyPayroll, revenue, expenses, transferSpend, transferIncome, matchRevenue, prizes, staffSalary, fines, stadiumMaintenance }
}
