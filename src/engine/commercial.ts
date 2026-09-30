export type SponsorContract = {
  status?: 'active' | 'fulfilled' | 'terminated'
  completedSeasons?: number
  sponsorId: string
  name: string
  seasonId: string
  upfront: number
  monthly: number
  objective: string
  objectiveTarget: number
  progress: number
  reputationRequired: number
}

export type StadiumState = {
  clubId: string
  seasonId: string
  name: string
  capacity: number
  level: number
  baseTicketPrice: number
  attendanceRate: number
  maintenance: number
  upgrades: Array<{ level: number; name: string; cost: number; capacityGain: number }>
}

export const SPONSORS = [
  { id: 'regional', name: 'Parceiro Regional', reputation: 0, upfront: 120_000, monthly: 35_000, objective: 'Manter média de público', target: 45 },
  { id: 'national', name: 'Marca Nacional', reputation: 55, upfront: 300_000, monthly: 75_000, objective: 'Terminar na primeira metade', target: 8 },
  { id: 'premium', name: 'Patrocinador Premium', reputation: 75, upfront: 650_000, monthly: 140_000, objective: 'Disputar o título', target: 4 },
] as const

export function chooseSponsor(reputation: number): SponsorContract {
  const sponsor = [...SPONSORS].reverse().find(item => reputation >= item.reputation) ?? SPONSORS[0]
  return { status: 'active', completedSeasons: 0, sponsorId: sponsor.id, name: sponsor.name, seasonId: '', upfront: sponsor.upfront, monthly: sponsor.monthly, objective: sponsor.objective, objectiveTarget: sponsor.target, progress: 0, reputationRequired: sponsor.reputation }
}

export function resolveSponsorAtSeasonEnd(contract: SponsorContract, progress: number, reputation: number) {
  const fulfilled = progress >= contract.objectiveTarget
  const nextReputation = Math.max(0, reputation + (fulfilled ? 2 : -2))
  const nextSponsor = chooseSponsor(nextReputation)
  return {
    fulfilled,
    reputation: nextReputation,
    nextSponsor: {
      ...nextSponsor,
      completedSeasons: (contract.completedSeasons ?? 0) + 1,
    },
  }
}

export function carryStadiumToNextSeason(state: StadiumState, seasonId: string) {
  return { ...state, seasonId }
}

export function createStadium(clubId: string, seasonId: string, stadiumName = 'Estádio Municipal'): StadiumState {
  return { clubId, seasonId, name: stadiumName, capacity: 12_000, level: 1, baseTicketPrice: 35, attendanceRate: 0.72, maintenance: 15_000, upgrades: [] }
}

export function stadiumUpgradeCost(level: number) {
  return Math.round((250_000 * Math.pow(1.55, Math.max(0, level - 1))) / 10_000) * 10_000
}

export function canUpgradeStadium(state: StadiumState, balance: number) {
  return state.level < 6 && balance >= stadiumUpgradeCost(state.level + 1)
}

export function upgradeStadium(state: StadiumState) {
  const nextLevel = state.level + 1
  if (nextLevel > 6) return state
  const gain = 2_000 + state.level * 1_000
  return {
    ...state,
    level: nextLevel,
    capacity: state.capacity + gain,
    baseTicketPrice: Math.round((state.baseTicketPrice * 1.04) * 5) / 5,
    maintenance: state.maintenance + 7_500,
    upgrades: [...state.upgrades, { level: nextLevel, name: 'Ampliação e melhorias', cost: stadiumUpgradeCost(nextLevel), capacityGain: gain }],
  }
}

export function estimateStadiumAttendance(state: StadiumState, satisfaction: number, reputation: number) {
  const satisfactionFactor = 0.72 + Math.max(0, Math.min(100, satisfaction)) / 250
  const reputationFactor = 0.7 + Math.max(0, Math.min(100, reputation)) / 300
  return Math.min(state.capacity, Math.max(1_500, Math.round(state.capacity * state.attendanceRate * satisfactionFactor * reputationFactor)))
}

export function calculateStadiumRevenue(state: StadiumState, attendance: number, result: 'W' | 'D' | 'L') {
  const multiplier = result === 'W' ? 1.05 : result === 'L' ? 0.95 : 1
  return Math.round(attendance * state.baseTicketPrice * multiplier)
}
