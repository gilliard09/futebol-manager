import type { Fixture } from '../types/game'

export type CompetitionPrizeConfig = {
  id: string
  competition_id: string
  prize_type: 'stage' | 'position' | 'runner_up' | 'champion'
  position_from: number | null
  position_to: number | null
  stage: string | null
  amount: number
  description: string | null
}

export type PrizePayment = {
  prizeId: string
  clubId: string
  prizeType: CompetitionPrizeConfig['prize_type']
  stage: string | null
  position: number | null
  amount: number
  description: string
}

export function prizeForPosition(prizes: CompetitionPrizeConfig[], position: number) {
  return prizes.find(prize => prize.prize_type === 'position' && prize.position_from != null && prize.position_to != null && position >= prize.position_from && position <= prize.position_to) ?? null
}
function stagePrize(prizes: CompetitionPrizeConfig[], stage: string) { return prizes.find(prize => prize.prize_type === 'stage' && prize.stage === stage) ?? null }
function finalPrize(prizes: CompetitionPrizeConfig[], type: 'champion' | 'runner_up') { return prizes.find(prize => prize.prize_type === type) ?? null }
function winnerOfSingle(fixture: Fixture) {
  if (fixture.winner_club_id) return fixture.winner_club_id
  if ((fixture.home_score ?? 0) > (fixture.away_score ?? 0)) return fixture.home_club_id
  if ((fixture.away_score ?? 0) > (fixture.home_score ?? 0)) return fixture.away_club_id
  return null
}
function twoLegWinner(first: Fixture, second: Fixture) {
  const clubs = [first.home_club_id, first.away_club_id]
  const goals = new Map<string, number>(clubs.map(clubId => [clubId, 0]))
  goals.set(first.home_club_id, (goals.get(first.home_club_id) ?? 0) + (first.home_score ?? 0))
  goals.set(first.away_club_id, (goals.get(first.away_club_id) ?? 0) + (first.away_score ?? 0))
  goals.set(second.home_club_id, (goals.get(second.home_club_id) ?? 0) + (second.home_score ?? 0))
  goals.set(second.away_club_id, (goals.get(second.away_club_id) ?? 0) + (second.away_score ?? 0))
  const aGoals = goals.get(clubs[0]) ?? 0
  const bGoals = goals.get(clubs[1]) ?? 0
  if (aGoals > bGoals) return clubs[0]
  if (bGoals > aGoals) return clubs[1]
  return winnerOfSingle(second)
}
function tieWinners(firstLegs: Fixture[], secondLegs: Fixture[]) {
  const secondByPair = new Map<string, Fixture>()
  for (const fixture of secondLegs) secondByPair.set([fixture.home_club_id, fixture.away_club_id].sort().join(':'), fixture)
  const winners = new Set<string>()
  for (const first of firstLegs) {
    const second = secondByPair.get([first.home_club_id, first.away_club_id].sort().join(':'))
    if (!second || first.status !== 'completed' || second.status !== 'completed') continue
    const winner = twoLegWinner(first, second)
    if (winner) winners.add(winner)
  }
  return winners
}

export function buildLeaguePrizePayments(prizes: CompetitionPrizeConfig[], standings: Array<{ id: string; name: string }>) {
  return standings.flatMap((team, index) => {
    const position = index + 1
    const prize = prizeForPosition(prizes, position)
    if (!prize || prize.amount <= 0) return []
    return [{ prizeId: prize.id, clubId: team.id, prizeType: prize.prize_type, stage: null, position, amount: prize.amount, description: prize.description ?? ('Premiação — ' + position + 'º colocado') }]
  })
}

export function buildCupPrizePayments(prizes: CompetitionPrizeConfig[], fixtures: Fixture[]) {
  const completed = fixtures.filter(fixture => fixture.status === 'completed')
  const finalRound = Math.max(...fixtures.map(fixture => fixture.round), 0)
  const final = completed.find(fixture => fixture.round === finalRound)
  const quarterFirstLegs = completed.filter(fixture => fixture.round === 5)
  const quarterSecondLegs = completed.filter(fixture => fixture.round === 6)
  const semiFirstLegs = completed.filter(fixture => fixture.round === 7)
  const semiSecondLegs = completed.filter(fixture => fixture.round === 8)
  const quarterfinalists = new Set(quarterFirstLegs.flatMap(fixture => [fixture.home_club_id, fixture.away_club_id]))
  const semifinalists = tieWinners(quarterFirstLegs, quarterSecondLegs)
  const finalists = tieWinners(semiFirstLegs, semiSecondLegs)
  const champion = final ? winnerOfSingle(final) : null
  const runnerUp = final && champion ? (final.home_club_id === champion ? final.away_club_id : final.home_club_id) : null
  const payments: PrizePayment[] = []
  const quarterPrize = stagePrize(prizes, 'quarterfinal')
  const semiPrize = stagePrize(prizes, 'semifinal')
  const championPrize = finalPrize(prizes, 'champion')
  const runnerPrize = finalPrize(prizes, 'runner_up')
  if (quarterPrize) quarterfinalists.forEach(clubId => payments.push({ prizeId: quarterPrize.id, clubId, prizeType: quarterPrize.prize_type, stage: quarterPrize.stage, position: null, amount: quarterPrize.amount, description: quarterPrize.description ?? 'Premiação — quartas de final' }))
  if (semiPrize) semifinalists.forEach(clubId => payments.push({ prizeId: semiPrize.id, clubId, prizeType: semiPrize.prize_type, stage: semiPrize.stage, position: null, amount: semiPrize.amount, description: semiPrize.description ?? 'Premiação — semifinal' }))
  if (final && finalists.size === 2 && champion && runnerUp) {
    if (championPrize) payments.push({ prizeId: championPrize.id, clubId: champion, prizeType: championPrize.prize_type, stage: championPrize.stage, position: 1, amount: championPrize.amount, description: championPrize.description ?? 'Premiação — campeão' })
    if (runnerPrize) payments.push({ prizeId: runnerPrize.id, clubId: runnerUp, prizeType: runnerPrize.prize_type, stage: runnerPrize.stage, position: 2, amount: runnerPrize.amount, description: runnerPrize.description ?? 'Premiação — vice-campeão' })
  }
  return payments
}