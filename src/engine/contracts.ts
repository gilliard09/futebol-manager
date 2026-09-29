export type Contract = {
  contractUntil: string | null
  salary: number
  marketValue: number
}

export type ContractStatus = 'expired' | 'critical' | 'attention' | 'safe'

export function getContractStatus(contractUntil: string | null, today: string): ContractStatus {
  if (!contractUntil) return 'safe'
  const current = new Date(today + 'T12:00:00Z').getTime()
  const expiry = new Date(contractUntil + 'T12:00:00Z').getTime()
  const days = Math.ceil((expiry - current) / 86400000)
  if (days < 0) return 'expired'
  if (days <= 30) return 'critical'
  if (days <= 90) return 'attention'
  return 'safe'
}

export function daysUntilContractEnd(contractUntil: string | null, today: string) {
  if (!contractUntil) return null
  return Math.ceil((new Date(contractUntil + 'T12:00:00Z').getTime() - new Date(today + 'T12:00:00Z').getTime()) / 86400000)
}

export function calculateRenewalSalary(currentSalary: number, marketValue: number, years: number) {
  const base = Math.max(currentSalary, marketValue * 0.004)
  const durationFactor = years >= 3 ? 1.08 : years === 2 ? 1.04 : 1
  return Math.ceil((base * durationFactor) / 100) * 100
}

export function addContractYears(dateKey: string, years: number) {
  const date = new Date(dateKey + 'T12:00:00Z')
  date.setUTCFullYear(date.getUTCFullYear() + years)
  return date.toISOString().slice(0, 10)
}
