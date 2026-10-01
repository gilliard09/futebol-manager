export type ManagerPopularity = {
  regional: number
  national: number
  international: number
}

export type ManagerSeasonPerformance = {
  position: number
  points: number
  wins: number
  draws: number
  losses: number
  clubReputation: number
  leagueTitle: boolean
  cupTitle: boolean
  boardConfidence?: number
  fanSatisfaction?: number
}

export type ManagerOfferLevel = 'regional' | 'national' | 'international'

export function clampPopularity(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function initialManagerPopularity(clubReputation: number): ManagerPopularity {
  return {
    regional: clampPopularity(7 + clubReputation * 0.12),
    national: clampPopularity(Math.max(0, clubReputation - 55) * 0.04),
    international: 0,
  }
}

export function managerPerformanceScore(performance: ManagerSeasonPerformance) {
  const positionScore =
    performance.position <= 1 ? 42 :
    performance.position <= 2 ? 34 :
    performance.position <= 4 ? 27 :
    performance.position <= 8 ? 18 :
    performance.position <= 12 ? 9 : 2
  const pointsScore = Math.min(14, performance.points / 8)
  const titleBonus = (performance.leagueTitle ? 24 : 0) + (performance.cupTitle ? 18 : 0)
  const stabilityBonus = Math.min(8, performance.wins * 0.35)
  const confidenceBonus = (performance.boardConfidence ?? 50) >= 80 ? 5 : 0
  const fanBonus = (performance.fanSatisfaction ?? 50) >= 80 ? 4 : 0
  return Math.round(positionScore + pointsScore + titleBonus + stabilityBonus + confidenceBonus + fanBonus)
}

export function updateManagerPopularity(
  current: ManagerPopularity,
  performance: ManagerSeasonPerformance,
): ManagerPopularity {
  const score = managerPerformanceScore(performance)
  const regionalDelta = score >= 90 ? 10 : score >= 70 ? 7 : score >= 50 ? 4 : score >= 30 ? 1 : -2
  const nationalDelta = score >= 105 ? 10 : score >= 85 ? 7 : score >= 65 ? 4 : score >= 45 ? 1 : 0
  const internationalDelta = score >= 125 ? 9 : score >= 105 ? 6 : score >= 85 ? 3 : 0

  return {
    regional: clampPopularity(current.regional + regionalDelta),
    national: clampPopularity(current.national + nationalDelta),
    international: clampPopularity(current.international + internationalDelta),
  }
}

export function offerLevelForPopularity(popularity: ManagerPopularity): ManagerOfferLevel {
  const total = popularity.regional + popularity.national + popularity.international
  if (popularity.international >= 45 || total >= 150) return 'international'
  if (popularity.national >= 35 || total >= 85) return 'national'
  return 'regional'
}

export function clubCanApproachManager(
  popularity: ManagerPopularity,
  clubReputation: number,
  performanceScore: number,
) {
  const totalPopularity = popularity.regional + popularity.national + popularity.international
  if (totalPopularity < 20 || performanceScore < 25) return false
  const level = offerLevelForPopularity(popularity)
  const threshold =
    level === 'international' ? 72 :
    level === 'national' ? 48 :
    28
  return clubReputation + performanceScore * 0.22 >= threshold
}

export function popularityLabel(value: number) {
  if (value >= 80) return 'Muito alta'
  if (value >= 60) return 'Alta'
  if (value >= 40) return 'Consolidada'
  if (value >= 20) return 'Em ascensão'
  return 'Inicial'
}

export function buildManagerRecords(input: {
  history: Array<{ final_position: number | null; points: number; wins: number }>
  trophies: number
}) {
  const positions = input.history.map(item => item.final_position).filter((value): value is number => Number.isFinite(value))
  const points = input.history.map(item => Number(item.points ?? 0))
  const wins = input.history.map(item => Number(item.wins ?? 0))
  return {
    bestFinish: positions.length ? Math.min(...positions) : null,
    mostPoints: points.length ? Math.max(...points) : 0,
    mostWins: wins.length ? Math.max(...wins) : 0,
    titles: input.trophies,
  }
}
