import type { Fixture } from '../types/game'

export type CompetitionFormat = 'league' | 'knockout'
export type KnockoutLegs = 1 | 2

export type CompetitionStage = {
  id: string
  label: string
  legs: KnockoutLegs
  teams: number
  penaltyIfTied: boolean
}

export type CompetitionConfig = {
  name: string
  format: CompetitionFormat
  teams: number
  pointsForWin?: number
  pointsForDraw?: number
  pointsForLoss?: number
  doubleRoundRobin?: boolean
  relegationSlots?: number
  stages?: CompetitionStage[]
}

export const BRAZIL_LEAGUE_RULES: CompetitionConfig = {
  name: 'Liga Nacional do Brasil',
  format: 'league',
  teams: 16,
  pointsForWin: 3,
  pointsForDraw: 1,
  pointsForLoss: 0,
  doubleRoundRobin: true,
  relegationSlots: 4,
}

export const BRAZIL_CUP_RULES: CompetitionConfig = {
  name: 'Copa Nacional do Brasil',
  format: 'knockout',
  teams: 16,
  stages: [
    { id: 'round_of_16', label: 'Oitavas de final', legs: 2, teams: 16, penaltyIfTied: true },
    { id: 'quarterfinals', label: 'Quartas de final', legs: 2, teams: 8, penaltyIfTied: true },
    { id: 'semifinals', label: 'Semifinal', legs: 2, teams: 4, penaltyIfTied: true },
    { id: 'final', label: 'Final', legs: 1, teams: 2, penaltyIfTied: true },
  ],
}

export type StandingRow = { id: string; name: string; played: number; wins: number; draws: number; losses: number; gf: number; ga: number; points: number }

export function buildStandings(teams: Array<{ id: string; name: string }>, fixtures: Fixture[]): StandingRow[] {
  const table = new Map<string, StandingRow>()
  teams.forEach(team => table.set(team.id, { id: team.id, name: team.name, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }))
  fixtures.filter(f => f.status === 'completed' && f.home_score != null && f.away_score != null).forEach(fixture => {
    const home = table.get(fixture.home_club_id); const away = table.get(fixture.away_club_id); if (!home || !away) return
    const goalsHome = Math.max(0, fixture.home_score ?? 0); const goalsAway = Math.max(0, fixture.away_score ?? 0)
    home.played++; away.played++; home.gf += goalsHome; home.ga += goalsAway; away.gf += goalsAway; away.ga += goalsHome
    if (goalsHome > goalsAway) { home.wins++; home.points += 3; away.losses++ }
    else if (goalsHome < goalsAway) { away.wins++; away.points += 3; home.losses++ }
    else { home.draws++; away.draws++; home.points++; away.points++ }
  })
  return [...table.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.name.localeCompare(b.name))
}

export type KnockoutPairing = { round: number; homeClubId: string; awayClubId: string }
export function createKnockoutRound(clubIds: string[], round: number): KnockoutPairing[] {
  const ordered = [...clubIds]
  return Array.from({ length: Math.floor(ordered.length / 2) }, (_, index) => ({ round, homeClubId: ordered[index * 2], awayClubId: ordered[index * 2 + 1] }))
}

export function getCompetitionStage(round: number): CompetitionStage {
  if (round <= 2) return BRAZIL_CUP_RULES.stages![0]
  if (round <= 4) return BRAZIL_CUP_RULES.stages![1]
  if (round <= 6) return BRAZIL_CUP_RULES.stages![2]
  return BRAZIL_CUP_RULES.stages![3]
}
export function getCompetitionStageLabel(round: number, _totalRounds = 7, knockout = false) {
  if (!knockout) return `Rodada ${round}`
  return getCompetitionStage(round).label
}

export function getKnockoutWinner(homeScore: number, awayScore: number, homeClubId: string, awayClubId: string) {
  if (homeScore > awayScore) return homeClubId; if (awayScore > homeScore) return awayClubId; return null
}

export function getAggregateScore(firstLeg: Pick<Fixture, 'home_club_id' | 'away_club_id' | 'home_score' | 'away_score'>, secondLeg: Pick<Fixture, 'home_club_id' | 'away_club_id' | 'home_score' | 'away_score'>, clubId: string) {
  const first = firstLeg.home_club_id === clubId ? firstLeg.home_score ?? 0 : firstLeg.away_score ?? 0
  const second = secondLeg.home_club_id === clubId ? secondLeg.home_score ?? 0 : secondLeg.away_score ?? 0
  return Math.max(0, first) + Math.max(0, second)
}

export function resolveTwoLegTie(firstLeg: Pick<Fixture, 'home_club_id' | 'away_club_id' | 'home_score' | 'away_score'>, secondLeg: Pick<Fixture, 'home_club_id' | 'away_club_id' | 'home_score' | 'away_score'>, penaltyWinner: string | null = null) {
  const clubs = [firstLeg.home_club_id, firstLeg.away_club_id]
  const totals = clubs.map(clubId => ({ clubId, goals: getAggregateScore(firstLeg, secondLeg, clubId) }))
  if (totals[0].goals > totals[1].goals) return totals[0].clubId
  if (totals[1].goals > totals[0].goals) return totals[1].clubId
  return penaltyWinner && clubs.includes(penaltyWinner) ? penaltyWinner : null
}

export function resolveSingleMatch(homeScore: number, awayScore: number, homeClubId: string, awayClubId: string, penaltyWinner: string | null = null) {
  return getKnockoutWinner(homeScore, awayScore, homeClubId, awayClubId) ?? (penaltyWinner === homeClubId || penaltyWinner === awayClubId ? penaltyWinner : null)
}

export type NextKnockoutFixture = {
  round: number
  homeClubId: string
  awayClubId: string
  scheduledAt: string
}

export function choosePenaltyWinner(homeClubId: string, awayClubId: string, seed = '') {
  let hash = 0
  for (const char of homeClubId + awayClubId + seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 2 === 0 ? homeClubId : awayClubId
}

export function getNextKnockoutRound(round: number) {
  if (round === 2) return 3
  if (round === 4) return 5
  if (round === 6) return 7
  return null
}

export function resolveCompletedKnockoutStage(fixtures: Fixture[], currentRound: number) {
  const nextRound = getNextKnockoutRound(currentRound)
  if (!nextRound || ![2, 4, 6].includes(currentRound)) return null
  const firstRound = currentRound - 1
  const completed = fixtures.filter(f => (f.round === firstRound || f.round === currentRound) && f.status === 'completed' && f.home_score != null && f.away_score != null)
    .sort((a, b) => a.round - b.round || a.scheduled_at.localeCompare(b.scheduled_at))
  if (completed.length !== 8) return null

  const ties = new Map<string, Fixture[]>()
  for (const fixture of completed) {
    const key = [fixture.home_club_id, fixture.away_club_id].sort().join(':')
    const tie = ties.get(key) ?? []
    tie.push(fixture)
    ties.set(key, tie)
  }
  if (ties.size !== 4 || [...ties.values()].some(tie => tie.length !== 2)) return null

  const winners: string[] = []
  for (const tie of ties.values()) {
    const firstLeg = tie.find(f => f.round === firstRound)
    const secondLeg = tie.find(f => f.round === currentRound)
    if (!firstLeg || !secondLeg) return null
    const winner = resolveTwoLegTie(firstLeg, secondLeg, secondLeg.winner_club_id ?? null)
    if (!winner) return null
    winners.push(winner)
  }

  const pairings: Array<{ homeClubId: string; awayClubId: string }> = []
  for (let i = 0; i < winners.length; i += 2) pairings.push({ homeClubId: winners[i], awayClubId: winners[i + 1] })

  const latest = Math.max(...completed.map(f => new Date(f.scheduled_at).getTime()))
  const firstDate = new Date(latest); firstDate.setDate(firstDate.getDate() + 7)
  const result: NextKnockoutFixture[] = []
  for (const [index, pair] of pairings.entries()) {
    const first = new Date(firstDate); first.setHours(19 + (index % 3), 0, 0, 0)
    result.push({ round: nextRound, homeClubId: pair.homeClubId, awayClubId: pair.awayClubId, scheduledAt: first.toISOString() })
    if (getCompetitionStage(nextRound).legs === 2) {
      const second = new Date(first); second.setDate(second.getDate() + 7)
      result.push({ round: nextRound + 1, homeClubId: pair.awayClubId, awayClubId: pair.homeClubId, scheduledAt: second.toISOString() })
    }
  }
  return result
}
