import type { Club } from '../types/game'

export type CareerEconomy = {
  budget: number
  monthlySalary: number
}

export function calculateMonthlyPayroll(salaries: Array<number | null | undefined>) {
  return salaries.reduce((total: number, salary) => total + Math.max(0, Number(salary ?? 0)), 0)
}

export function calculateSeasonPayroll(monthlySalary: number, months = 12) {
  return Math.max(0, monthlySalary) * months
}

export function canAffordTransfer(club: Club, fee: number) {
  return fee >= 0 && fee <= club.budget
}

export function canAffordContract(club: Club, monthlySalary: number) {
  return monthlySalary >= 0 && monthlySalary <= 10000000
}
