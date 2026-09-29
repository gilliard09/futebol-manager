export type FinanceTransactionType = 'match_revenue' | 'salary' | 'training' | 'transfer_in' | 'transfer_out' | 'bonus' | 'other'

export type FinanceTransaction = {
  id: string
  date: string
  type: FinanceTransactionType
  description: string
  amount: number
}

export type MonthlyFinance = {
  month: string
  openingBalance: number
  revenue: number
  expenses: number
  closingBalance: number
}

export function applyTransaction(balance: number, transaction: Pick<FinanceTransaction, 'amount'>) {
  return balance + transaction.amount
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
  return -(Math.max(0, monthlyPayroll))
}

export function calculateTrainingExpense(cost: number) {
  return -(Math.max(0, cost))
}

export function createTransaction(date: string, type: FinanceTransactionType, description: string, amount: number, id = crypto.randomUUID()): FinanceTransaction {
  return { id, date, type, description, amount }
}
