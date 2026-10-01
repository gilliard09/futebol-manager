import type { Club, Player } from '../types/game'
import { getSquadRole, playerOverall } from './matchCore'
import { calculateTargetPriority, decideTransferNegotiation } from './marketNegotiation'
import { normalizeSalaryShare, evaluateLoanTarget, shouldOfferLoan, type LoanRecord } from './loans'
import { simulateAIClubManagement, type AIBoardDecision, type AIClubManager } from './aiClubManagement'
import { calculateTechnicalStaffPayroll } from './clubFinance'

export type WorldClub = Club & { strength: number }

export type WorldClubPerformance = {
  position: number
  points: number
  goalDifference: number
  played: number
  recentPoints: number
  recentResults: Array<'W' | 'D' | 'L'>
}

export type WorldPlayer = Player & {
  clubId: string
  marketValue: number
  salary: number
  contractUntil: string | null
  clubPlayerId: string
  seasonAppearances?: number
  seasonStarts?: number
  seasonMinutes?: number
  seasonAverageRating?: number
  seasonGoals?: number
  seasonAssists?: number
}

export type MarketInterest = {
  playerId: string
  clubIds: string[]
  startedAt: string
  stage: 'monitoring' | 'scouting' | 'proposal_ready'
  lastUpdated: string
  stageChanged?: boolean
}

export type WorldSimulationResult = {
  date: string
  transfers: Array<{ playerId: string; fromClubId: string | null; toClubId: string; fee: number }>
  offers: Array<{ playerId: string; fromClubId: string; toClubId: string; fee: number }>
  loans: LoanRecord[]
  negotiationEvents: Array<{
    playerId: string
    buyerId: string
    sellerId: string
    action: 'accepted' | 'countered' | 'rejected' | 'withdrawn'
    round: number
    offer: number
    counterOffer?: number
    reason: string
  }>
  marketInterest: MarketInterest[]
  expiredContracts: Array<{ playerId: string; clubId: string }>
  renewals: Array<{ playerId: string; clubId: string; salary: number; contractUntil: string }>
  retirements: Array<{ playerId: string; clubId: string }>
  youth: Array<{
    firstName: string
    lastName: string
    age: number
    position: string
    nationality: string
    pace: number
    shooting: number
    passing: number
    dribbling: number
    defending: number
    physical: number
    goalkeeping: number
    mental: number
    potential: number
    form: number
    morale: number
    marketValue: number
    salary: number
    contractUntil: string
    clubId: string
  }>
  evolvedPlayers: number
  evolvedPlayerIds: string[]
  changedClubs: string[]
  aiManagers: AIClubManager[]
  boardDecisions: AIBoardDecision[]
}

function hash(input: string) {
  let value = 2166136261
  for (const char of input) {
    value ^= char.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function random01(seed: string) {
  return (hash(seed) % 10000) / 10000
}

export type ClubBehavior = 'ambitious' | 'youth' | 'conservative' | 'seller' | 'balanced'

export type ClubEconomicProfile = {
  behavior: ClubBehavior
  transferBudgetRatio: number
  wageMultiplier: number
  youthPriority: number
  salePressure: number
  reserveLimit: number
}

export function getClubEconomicProfile(club: WorldClub): ClubEconomicProfile {
  const profile = hash('behavior:' + club.id) % 5
  const behavior = ['ambitious', 'youth', 'conservative', 'seller', 'balanced'][profile] as ClubBehavior
  if (behavior === 'ambitious') {
    return { behavior, transferBudgetRatio: 0.84, wageMultiplier: 1.16, youthPriority: 0.35, salePressure: 0.1, reserveLimit: 24 }
  }
  if (behavior === 'youth') {
    return { behavior, transferBudgetRatio: 0.68, wageMultiplier: 1.04, youthPriority: 1, salePressure: 0.35, reserveLimit: 23 }
  }
  if (behavior === 'conservative') {
    return { behavior, transferBudgetRatio: 0.58, wageMultiplier: 1.05, youthPriority: 0.5, salePressure: 0.5, reserveLimit: 22 }
  }
  if (behavior === 'seller') {
    return { behavior, transferBudgetRatio: 0.62, wageMultiplier: 1.02, youthPriority: 0.8, salePressure: 0.9, reserveLimit: 21 }
  }
  return { behavior, transferBudgetRatio: 0.72, wageMultiplier: 1.1, youthPriority: 0.6, salePressure: 0.25, reserveLimit: 23 }
}

function clubBehavior(club: WorldClub): ClubBehavior {
  return getClubEconomicProfile(club).behavior
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function addYears(date: string, years: number) {
  const [year, month, day] = date.split('-').map(Number)
  return `${year + years}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isLoanActiveOnDate(loan: LoanRecord, date: string) {
  return loan.startDate <= date && date < loan.endDate
}

function addMonths(date: string, months: number) {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1 + months, day))
  return next.toISOString().slice(0, 10)
}

function ageFactor(player: Player) {
  if (player.age <= 20) return 0.95
  if (player.age <= 23) return 0.7
  if (player.age <= 26) return 0.45
  if (player.age <= 29) return 0.2
  if (player.age <= 32) return -0.15
  return -0.4
}

export function playerMarketPerformanceFactor(player: WorldPlayer) {
  const rating = player.seasonAverageRating ?? 0
  return Math.max(
    0.94,
    Math.min(
      1.08,
      1
        + Math.min(0.04, (player.seasonGoals ?? 0) * 0.004)
        + Math.min(0.02, (player.seasonAssists ?? 0) * 0.0025)
        + (rating >= 7.4 ? 0.025 : rating >= 7 ? 0.012 : rating > 0 && rating < 5.9 ? -0.03 : 0),
    ),
  )
}

export function playerMarketCompetitionFactor(interestCount: number) {
  return 1 + Math.min(0.24, Math.max(0, interestCount - 1) * 0.08)
}


export type SquadNeed = {
  position: string
  current: number
  target: number
  urgency: number
}

export function evaluateSquadNeeds(players: WorldPlayer[]) {
  const targets: Record<string, number> = { GK: 2, CB: 4, LB: 2, RB: 2, DM: 2, CM: 3, AM: 2, LW: 2, RW: 2, ST: 3 }
  const counts = players.reduce<Record<string, number>>((acc, player) => {
    acc[player.position] = (acc[player.position] ?? 0) + 1
    return acc
  }, {})
  return Object.entries(targets).map(([position, target]) => {
    const current = counts[position] ?? 0
    return { position, current, target, urgency: Math.max(0, target - current) + (current === 0 ? 4 : 0) }
  }).filter(item => item.urgency > 0).sort((a, b) => b.urgency - a.urgency)
}

export function calculatePlayerMarketValue(player: WorldPlayer, competitionCount = 1) {
  const performance = playerMarketPerformanceFactor(player)
  const ageFactor = player.age <= 21 ? 1.12 : player.age <= 24 ? 1.07 : player.age <= 28 ? 1 : player.age <= 31 ? 0.9 : 0.78
  const potentialFactor = 1 + Math.max(0, player.potential - playerOverall(player)) * 0.006
  const competitionFactor = playerMarketCompetitionFactor(competitionCount)
  return Math.max(100_000, Math.round((player.marketValue || 100_000) * performance * ageFactor * potentialFactor * competitionFactor / 10_000) * 10_000)
}

export function buildScoutingReport(player: Player | WorldPlayer, scoutingLevel: 'basic' | 'detailed' | 'elite' = 'basic') {
  const overall = playerOverall(player)
  const marketValue = 'marketValue' in player ? Number(player.marketValue ?? 0) : 0
  const reliability = scoutingLevel === 'elite' ? 0.96 : scoutingLevel === 'detailed' ? 0.86 : 0.68
  const reveal = (value: number) => Math.round(value * reliability + (100 - reliability * 100) * 0.5)
  const risk = player.age <= 21 && player.potential - overall >= 12 ? 'alto potencial' : player.age >= 30 ? 'risco de declínio' : player.morale < 45 ? 'risco de adaptação' : 'risco moderado'
  return {
    overallEstimate: clamp(reveal(overall), Math.max(1, overall - 10), Math.min(99, overall + 10)),
    potentialEstimate: clamp(reveal(player.potential), 45, 99),
    reliability: Math.round(reliability * 100),
    keyAttributes: [
      ['pace', player.pace], ['shooting', player.shooting], ['passing', player.passing],
      ['dribbling', player.dribbling], ['defending', player.defending], ['physical', player.physical],
      ['mental', player.mental],
    ].sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 3),
    weakAttributes: [
      ['pace', player.pace], ['shooting', player.shooting], ['passing', player.passing],
      ['dribbling', player.dribbling], ['defending', player.defending], ['physical', player.physical],
      ['mental', player.mental],
    ].sort((a, b) => Number(a[1]) - Number(b[1])).slice(0, 2),
    developmentGap: Math.max(0, player.potential - overall),
    roleFit: getSquadRole(player),
    recommendation: player.age <= 21 && player.potential - overall >= 10
      ? 'investir'
      : overall >= 75
        ? 'titular'
        : player.age >= 30
          ? 'curto prazo'
          : 'rotação',
    risk,
    costRisk: marketValue > 0 ? Math.round(Math.min(100, (marketValue / 5_000_000) * 30 + (100 - player.morale) * 0.2)) : 0,
  }
}

export function compareScoutingPlayers(players: WorldPlayer[]) {
  return players.map(player => ({
    id: player.id,
    name: player.first_name + ' ' + player.last_name,
    position: player.position,
    overall: playerOverall(player),
    potential: player.potential,
    marketValue: player.marketValue,
    age: player.age,
  }))
}

function transferNeed(player: WorldPlayer, club: WorldClub, squadSize: number, performance?: WorldClubPerformance) {
  const overall = playerOverall(player)
  const budgetPressure = club.budget > 5000000 ? 1 : club.budget > 3000000 ? 0.5 : 0
  const sportingUrgency = performance && (performance.position >= 13 || performance.recentPoints <= 4) ? 6 : 0
  const usageBonus = (player.seasonMinutes ?? 0) >= 900 ? 4 : (player.seasonMinutes ?? 0) < 180 ? -2 : 0
  const ratingBonus = (player.seasonAverageRating ?? 0) >= 7.2 ? 5 : (player.seasonAverageRating ?? 0) >= 6.8 ? 2 : (player.seasonAverageRating ?? 0) > 0 && (player.seasonAverageRating ?? 0) < 6 ? -2 : 0
  const goalBonus = Math.min(7, (player.seasonGoals ?? 0) * 0.8)
  const assistBonus = Math.min(4, (player.seasonAssists ?? 0) * 0.5)
  const performanceBonus = goalBonus + assistBonus + ((player.seasonAverageRating ?? 0) >= 7.4 ? 3 : 0)
  const role = getSquadRole(player)
  const roleBonus = role === 'starter' ? 4 : role === 'rotation' ? 2 : role === 'prospect' ? 1 : -2
  const moraleBonus = player.morale <= 45 ? 3 : player.morale >= 80 ? -1 : 0
  return overall + budgetPressure * 4 + (squadSize < 18 ? 8 : 0) + sportingUrgency + usageBonus + ratingBonus + performanceBonus + roleBonus + moraleBonus
}

const firstNames = ['Lucas', 'Gabriel', 'Pedro', 'Matheus', 'João', 'Rafael', 'Gustavo', 'Arthur', 'Miguel', 'Enzo', 'Caio', 'Felipe']
const lastNames = ['Almeida', 'Barbosa', 'Carvalho', 'Costa', 'Ferreira', 'Gomes', 'Lima', 'Martins', 'Mendes', 'Oliveira', 'Pereira', 'Ribeiro']
const positions = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST']

function createYouth(date: string, club: WorldClub, index: number) {
  const seed = `${date}:${club.id}:youth:${index}`
  const base = 54 + Math.floor(random01(seed) * 10)
  const position = positions[hash(seed + ':position') % positions.length]
  const pace = clamp(base + (position === 'ST' || position === 'LW' || position === 'RW' ? 5 : 0), 1, 99)
  const shooting = clamp(base + (position === 'ST' ? 7 : position === 'AM' ? 3 : 0), 1, 99)
  const defending = clamp(base + (position === 'CB' || position === 'DM' ? 6 : 0), 1, 99)
  const goalkeeping = position === 'GK' ? clamp(base + 8, 1, 99) : clamp(base - 15, 1, 99)
  return {
    firstName: firstNames[hash(seed + ':first') % firstNames.length],
    lastName: lastNames[hash(seed + ':last') % lastNames.length],
    age: 17 + (hash(seed + ':age') % 3),
    position,
    nationality: 'Brasil',
    pace,
    shooting,
    passing: clamp(base + (position === 'CM' || position === 'AM' ? 6 : 0), 1, 99),
    dribbling: clamp(base + (position === 'LW' || position === 'RW' || position === 'AM' ? 5 : 0), 1, 99),
    defending,
    physical: clamp(base + 2, 1, 99),
    goalkeeping,
    mental: clamp(base + 4, 1, 99),
    potential: clamp(76 + Math.floor(random01(seed + ':potential') * 18), 70, 94),
    form: 65,
    morale: 72,
    marketValue: 250000 + base * 5000,
    salary: 9000 + base * 100,
    contractUntil: addYears(date, 3),
    clubId: club.id,
  }
}

export function simulateWorldDay(
  date: string,
  seasonId: string,
  clubs: WorldClub[],
  players: WorldPlayer[],
  userClubId: string,
  performanceByClub: Record<string, WorldClubPerformance> = {},
  previousMarketInterest: MarketInterest[] = [],
  activeLoans: LoanRecord[] = [],
  previousAIManagers: AIClubManager[] = [],
): WorldSimulationResult {
  const aiClubs = clubs.filter(club => club.id !== userClubId)
  const aiManagement = simulateAIClubManagement(date, 'Temporada ' + date.slice(0, 4), aiClubs, performanceByClub, previousAIManagers)

  const transfers: WorldSimulationResult['transfers'] = []
  const offers: WorldSimulationResult['offers'] = []
  const negotiationEvents: WorldSimulationResult['negotiationEvents'] = []
  const loans: LoanRecord[] = []
  const marketInterest: WorldSimulationResult['marketInterest'] = []
  const expiredContracts: WorldSimulationResult['expiredContracts'] = []
  const renewals: WorldSimulationResult['renewals'] = []
  const retirements: WorldSimulationResult['retirements'] = []
  const youth: WorldSimulationResult['youth'] = []
  const changedClubs = new Set<string>()
  let evolvedPlayers = 0
  const evolvedPlayerIds = new Set<string>()

  const byClub = new Map<string, WorldPlayer[]>()
  for (const player of players) {
    const squad = byClub.get(player.clubId) ?? []
    squad.push(player)
    byClub.set(player.clubId, squad)
  }

  type DevelopmentAttribute = 'pace' | 'shooting' | 'passing' | 'dribbling' | 'defending' | 'physical' | 'goalkeeping' | 'mental'
  const updatePlayer = (player: WorldPlayer, delta: number) => {
    const attributes: DevelopmentAttribute[] = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical', 'goalkeeping', 'mental']
    const key = attributes[hash(player.id + date) % attributes.length]
    const current = Number(player[key])
    const next = clamp(current + delta, 1, 99)
    if (next === current) return
    ;(player as unknown as Record<DevelopmentAttribute, number>)[key] = next
    player.form = clamp(player.form + (delta > 0 ? 1 : 0), 1, 100)
    player.morale = clamp(player.morale + (delta > 0 ? 1 : -1), 1, 100)
    evolvedPlayers++
    evolvedPlayerIds.add(player.id)
  }

  const day = Number(date.slice(8, 10))
  const month = Number(date.slice(5, 7))

  if ([10, 20].includes(day)) {
    for (const player of players) {
      const interestCount = previousMarketInterest.find(item => item.playerId === player.id)?.clubIds.length ?? 1
      const nextValue = calculatePlayerMarketValue(player, interestCount)
      player.marketValue = nextValue
    }
  }

  // A folha salarial também pesa nos clubes controlados pela IA. Assim, o
  // orçamento deixa de ser apenas um valor para transferências e passa a
  // representar a saúde financeira do clube ao longo da temporada.
  if (day === 1) {
    for (const club of clubs) {
      const squad = byClub.get(club.id) ?? []
      const payroll = squad.reduce((sum, player) => sum + Math.max(0, Number(player.salary ?? 0)), 0)
      const playerExpense = Math.round(payroll * getClubEconomicProfile(club).wageMultiplier)
      const staffExpense = calculateTechnicalStaffPayroll(payroll, club.reputation, club.strength)
      const monthlyExpense = playerExpense + staffExpense
      club.budget = Math.max(0, club.budget - monthlyExpense)
      if (club.id !== userClubId && club.budget < Math.max(250_000, monthlyExpense * 2)) {
        club.reputation = Math.max(35, club.reputation - 1)
      }
    }
  }

  // A virada do ano envelhece todos os jogadores, inclusive os do clube do treinador.
  // O envelhecimento acontece aqui para que todas as carreiras atravessem as temporadas
  // pelo mesmo relógio do mundo.
  if (month === 1 && day === 10) {
    for (const player of players) {
      player.age += 1
      const overall = playerOverall(player)
      const ageMultiplier = player.age <= 23 ? 1.08 : player.age <= 28 ? 1 : player.age <= 31 ? 0.88 : 0.7
      const potentialMultiplier = 0.85 + Math.min(0.15, Math.max(0, player.potential - overall) / 100)
      player.marketValue = Math.max(100000, Math.round((player.marketValue * ageMultiplier * potentialMultiplier) / 50000) * 50000)
      evolvedPlayerIds.add(player.id)
    }
  }

  // Desenvolvimento: jovens crescem mais, veteranos declinam gradualmente.
  if (day === 1 || day === 15) {
    for (const player of players) {
      const minutes = player.seasonMinutes ?? 0
      const appearances = player.seasonAppearances ?? 0
      const highUsage = minutes >= 900 || appearances >= 10
      const lowUsage = minutes < 180 && appearances <= 2
      const role = getSquadRole(player)
      const usageAdjustment = highUsage ? 0.12 : lowUsage ? -0.1 : 0
      const roleAdjustment = role === 'starter'
        ? 0.08
        : role === 'rotation'
          ? 0.03
          : role === 'prospect'
            ? 0.04
            : -0.02
      const performanceAdjustment = (player.seasonAverageRating ?? 0) >= 7.3
        ? 0.08
        : (player.seasonAverageRating ?? 0) > 0 && (player.seasonAverageRating ?? 0) < 6
          ? -0.05
          : 0
      const ageBase = player.age <= 23 ? 0.68 : player.age >= 31 ? 0.5 : 0.16
      const probability = Math.max(0.05, Math.min(0.88, ageBase + usageAdjustment + roleAdjustment + performanceAdjustment))
      if (random01(seasonId + date + player.id) < probability) {
        const direction = player.age >= 31
          ? -1
          : player.age <= 23 || highUsage || role === 'starter' || role === 'rotation'
            ? 1
            : 0
        const room = Math.max(0, player.potential - playerOverall(player))
        const delta = direction > 0
          ? Math.min(player.age <= 23 && role === 'starter' ? 2 : 1, room)
          : direction < 0
            ? -1
            : 0
        if (delta !== 0) updatePlayer(player, delta)
      }
    }
  }

  // Contratos vencidos viram jogadores livres. Isso vale também para o clube do treinador.
  // O jogador permanece no banco de dados, mas deixa de pertencer a qualquer clube.
  for (const player of players) {
    if (!player.clubId || !player.contractUntil || player.contractUntil >= date) continue
    const previousClubId = player.clubId
    player.clubId = ''
    player.contractUntil = null
    player.salary = 0
    expiredContracts.push({ playerId: player.id, clubId: previousClubId })
    changedClubs.add(previousClubId)
  }
  // O mercado guarda memória: interesse nasce, amadurece e só depois pode virar proposta.
  const candidateInterests = new Map<string, Set<string>>()
  if ([10, 20].includes(day)) {
    const standoutPlayers = players
      .filter(player => player.clubId && player.age <= 31)
      .filter(player => (player.seasonAppearances ?? 0) >= 4)
      .filter(player =>
        (player.seasonGoals ?? 0) >= 5 ||
        (player.seasonAssists ?? 0) >= 4 ||
        (player.seasonAverageRating ?? 0) >= 7.25,
      )
      .sort((a, b) => {
        const score = (player: WorldPlayer) =>
          (player.seasonGoals ?? 0) * 1.2 +
          (player.seasonAssists ?? 0) * 0.7 +
          Math.max(0, (player.seasonAverageRating ?? 0) - 6.5) * 4 +
          playerOverall(player) * 0.04
        return score(b) - score(a)
      })

    for (const player of standoutPlayers.slice(0, 8)) {
      const interested = aiClubs
        .filter(club => club.id !== player.clubId)
        .filter(club => {
          const squad = byClub.get(club.id) ?? []
          if (club.budget < 750000 || squad.length >= 25) return false
          const need = transferNeed(player, club, squad.length, performanceByClub[club.id])
          const price = Math.max(
            250000,
            Math.round(
              player.marketValue *
              (player.age <= 23 ? 1.18 : 1.08) *
              playerMarketPerformanceFactor(player) /
              50000,
            ) * 50000,
          )
          const strengthGap = playerOverall(player) - club.strength
          return need >= 48 && price <= club.budget * 0.9 && (strengthGap <= 15 || clubBehavior(club) === 'ambitious')
        })
        .sort((a, b) => {
          const performance = performanceByClub[a.id]
          const score = (club: WorldClub) => {
            const current = performanceByClub[club.id]
            const urgency = current && (current.position >= 13 || current.recentPoints <= 4) ? 8 : 0
            const ambition = clubBehavior(club) === 'ambitious' ? 5 : 0
            return club.budget / 1000000 + urgency + ambition
          }
          return score(b) - score(a)
        })
        .slice(0, 4)

      if (interested.length >= 2) {
        candidateInterests.set(player.id, new Set(interested.map(club => club.id)))
      }
    }
  }

  const activePlayerIds = new Set(players.filter(player => player.clubId).map(player => player.id))
  for (const previous of previousMarketInterest) {
    if (!activePlayerIds.has(previous.playerId)) continue
    const candidates = candidateInterests.get(previous.playerId)
    const nextClubs = candidates ? [...new Set([...previous.clubIds, ...candidates])] : previous.clubIds
    const elapsedDays = Math.max(0, Math.round((new Date(date).getTime() - new Date(previous.startedAt).getTime()) / 86400000))
    const stage = elapsedDays >= 28 ? 'proposal_ready' : elapsedDays >= 14 ? 'scouting' : 'monitoring'
    marketInterest.push({
      ...previous,
      clubIds: nextClubs,
      stage,
      lastUpdated: date,
      stageChanged: stage !== previous.stage,
    })
    if (candidates) candidateInterests.delete(previous.playerId)
  }

  for (const [playerId, clubsSet] of candidateInterests) {
    const clubIds = [...clubsSet]
    marketInterest.push({
      playerId,
      clubIds,
      startedAt: date,
      stage: 'monitoring',
      lastUpdated: date,
      stageChanged: true,
    })
  }

  // Mercado: cada clube pode contratar uma vez por janela mensal.
  // Propostas pelo mesmo jogador são acumuladas antes de definir o preço final,
  // permitindo que uma temporada de destaque gere concorrência real.
  const pendingUserOffers: Array<{
    playerId: string
    fromClubId: string
    toClubId: string
    baseFee: number
  }> = []

  if ([10, 20].includes(day)) {
    for (const buyer of aiClubs) {
      const squad = byClub.get(buyer.id) ?? []
      const performance = performanceByClub[buyer.id]
      const urgentMarket = Boolean(performance && (performance.position >= 13 || performance.recentPoints <= 4))
      const ambitiousMarket = Boolean(performance && performance.position <= 4 && performance.recentPoints >= 8)
      const buyerProfile = getClubEconomicProfile(buyer)
      if (squad.length >= buyerProfile.reserveLimit && random01(date + buyer.id) < (buyerProfile.behavior === 'ambitious' ? 0.35 : 0.65)) continue
      if (buyer.budget < 750000) continue

      const squadNeeds = evaluateSquadNeeds(squad)
      const weakestPosition = squadNeeds.length
        ? (() => {
            const need = squadNeeds[0]
            const group = squad.filter(player => player.position === need.position)
            return {
              position: need.position,
              average: group.length ? group.reduce((sum, player) => sum + playerOverall(player), 0) / group.length : 0,
              count: group.length,
            }
          })()
        : positions
            .map(position => {
              const group = squad.filter(player => player.position === position)
              const average = group.length ? group.reduce((sum, player) => sum + playerOverall(player), 0) / group.length : 0
              return { position, average, count: group.length }
            })
            .sort((a, b) => a.average - b.average || a.count - b.count)[0]

      const matureTargets = marketInterest
        .filter(interest => interest.stage === 'proposal_ready' && interest.clubIds.includes(buyer.id))
        .map(interest => players.find(player => player.id === interest.playerId))
        .filter((player): player is WorldPlayer => Boolean(player?.clubId === userClubId && player.age <= 31))
        .sort((a, b) => transferNeed(b, buyer, squad.length, performance) - transferNeed(a, buyer, squad.length, performance))

      const userTarget = matureTargets.find(player => {
        const price = Math.max(
          250000,
          Math.round(
            player.marketValue *
            (player.age <= 23 ? 1.18 : 1.08) *
            playerMarketPerformanceFactor(player) *
            playerMarketCompetitionFactor(marketInterest.find(item => item.playerId === player.id)?.clubIds.length ?? 1) /
            50000,
          ) * 50000,
        )
        return price <= buyer.budget * (urgentMarket || ambitiousMarket ? 0.82 : 0.72)
      })

      const userPerformance = userTarget
        ? (userTarget.seasonGoals ?? 0) * 0.8 + (userTarget.seasonAssists ?? 0) * 0.5 + ((userTarget.seasonAverageRating ?? 0) >= 7.4 ? 3 : 0)
        : 0
      const offerChance = userTarget
        ? Math.min(0.9, 0.72 + Math.max(0, userPerformance - 3) * 0.035)
        : 0

      if (userTarget && random01(`${date}:offer:${buyer.id}:${userTarget.id}`) < offerChance) {
        const baseFee = Math.max(250000, Math.round(userTarget.marketValue * (userTarget.age <= 23 ? 1.18 : 1.08) / 50000) * 50000)
        pendingUserOffers.push({
          playerId: userTarget.id,
          fromClubId: userClubId,
          toClubId: buyer.id,
          baseFee,
        })
        continue
      }

      // Jogadores livres podem ser assinados sem taxa de transferência.
      const freeAgent = players
        .filter(player => player.clubId === '')
        .filter(player => player.position === weakestPosition.position)
        .filter(player => player.age <= 32)
        .filter(player => playerOverall(player) >= Math.max(56, buyer.strength - (urgentMarket ? 10 : ambitiousMarket ? 5 : 7)))
        .sort((a, b) => transferNeed(b, buyer, squad.length, performance) - transferNeed(a, buyer, squad.length, performance))[0]

      const freeAgentChance = buyerProfile.behavior === 'conservative' ? 0.52 : buyerProfile.behavior === 'seller' ? 0.44 : buyerProfile.behavior === 'ambitious' ? 0.22 : 0.35
      if (freeAgent && random01(`${date}:free-agent:${buyer.id}:${freeAgent.id}`) < freeAgentChance) {
        const salary = Math.round(Math.max(8000, freeAgent.salary || playerOverall(freeAgent) * 120) / 500) * 500
        freeAgent.clubId = buyer.id
        freeAgent.salary = salary
        freeAgent.contractUntil = addYears(date, 2)
        buyer.budget = Math.max(0, buyer.budget - salary * 0.5)
        changedClubs.add(buyer.id)
        transfers.push({ playerId: freeAgent.id, fromClubId: null, toClubId: buyer.id, fee: 0 })
        renewals.push({ playerId: freeAgent.id, clubId: buyer.id, salary, contractUntil: freeAgent.contractUntil })
        byClub.set('', (byClub.get('') ?? []).filter(player => player.id !== freeAgent.id))
        byClub.set(buyer.id, [...(byClub.get(buyer.id) ?? []), freeAgent])
        continue
      }
      const candidates = players
        .filter(player => player.clubId !== buyer.id && player.clubId !== userClubId)
        .filter(player => player.position === weakestPosition.position)
        .filter(player => player.age <= 31)
        .filter(player => playerOverall(player) >= Math.max(58, buyer.strength - (urgentMarket ? 8 : ambitiousMarket ? 3 : 5)))
        .sort((a, b) => {
          const needA = transferNeed(a, buyer, squad.length, performance)
          const needB = transferNeed(b, buyer, squad.length, performance)
          const priorityA = calculateTargetPriority(a, buyer, weakestPosition.average < buyer.strength - 5 ? 10 : 5, 1.1)
          const priorityB = calculateTargetPriority(b, buyer, weakestPosition.average < buyer.strength - 5 ? 10 : 5, 1.1)
          return (needB + priorityB) - (needA + priorityA)
        })

      // O clube trabalha com uma lista de alvos. Se a primeira negociação falhar,
      // ele não fica parado: parte para a próxima alternativa da mesma posição.
      const targets = candidates
        .filter(player => {
          const seller = clubs.find(club => club.id === player.clubId)
          if (!seller || seller.id === buyer.id || seller.id === userClubId) return false
          const sellerSquad = byClub.get(seller.id) ?? []
          if (sellerSquad.length <= 16) return false
          const interest = marketInterest.find(item => item.playerId === player.id)
          if (interest && (interest.stage !== 'proposal_ready' || !interest.clubIds.includes(buyer.id))) return false
          const performanceFactor = playerMarketPerformanceFactor(player)
          const competitionFactor = interest ? playerMarketCompetitionFactor(interest.clubIds.length) : 1
          const price = Math.max(
            150000,
            Math.round(player.marketValue * (player.age <= 23 ? 1.08 : 1) * performanceFactor * competitionFactor / 50000) * 50000,
          )
          return price <= buyer.budget * Math.min(0.88, buyerProfile.transferBudgetRatio + (urgentMarket || ambitiousMarket ? 0.06 : 0)) &&
            (player.contractUntil === null || player.contractUntil >= date)
        })
        .slice(0, 5)

      let completedPurchase = false
      for (const target of targets) {
        if (completedPurchase) break
        const seller = clubs.find(club => club.id === target.clubId)
        if (!seller) continue

        const sellerSquad = byClub.get(seller.id) ?? []
        const sellerAverage = sellerSquad.length
          ? sellerSquad.reduce((sum, player) => sum + playerOverall(player), 0) / sellerSquad.length
          : seller.strength
        const playerImportance = Math.max(0, Math.min(1,
          (playerOverall(target) - sellerAverage + 12) / 24 +
          (getSquadRole(target) === 'starter' ? 0.35 : getSquadRole(target) === 'rotation' ? 0.12 : 0),
        ))
        const sellerPressure = seller.budget < 750000 ? 0.9 : seller.budget < 1500000 ? 0.55 : 0.15
        const askingPrice = Math.max(
          150000,
          Math.round(
            target.marketValue *
            (target.age <= 23 ? 1.08 : 1) *
            playerMarketPerformanceFactor(target) *
            playerMarketCompetitionFactor(marketInterest.find(item => item.playerId === target.id)?.clubIds.length ?? 1) /
            50000,
          ) * 50000,
        )
        let currentOffer = Math.max(
          150000,
          Math.round(
            Math.min(
              askingPrice * (urgentMarket || ambitiousMarket ? 0.84 : 0.76),
              buyer.budget * (urgentMarket || ambitiousMarket ? 0.78 : 0.68),
            ) / 50000,
          ) * 50000,
        )

        let agreedFee: number | null = null
        for (let round = 0; round < 3; round++) {
          const decision = decideTransferNegotiation({
            askingPrice,
            offer: currentOffer,
            round,
            maxRounds: 2,
            sellerBehavior: clubBehavior(seller),
            sellerBudgetPressure: sellerPressure,
            playerImportance,
            competitionCount: marketInterest.find(item => item.playerId === target.id)?.clubIds.length ?? 1,
            playerAge: target.age,
            buyerReputation: buyer.reputation,
            roll: hash(`${date}:negotiation:${buyer.id}:${seller.id}:${target.id}:${round}`) % 100,
          })

          negotiationEvents.push({
            playerId: target.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            action: decision.action === 'accept' ? 'accepted' : decision.action === 'counter' ? 'countered' : decision.action === 'reject' ? 'rejected' : 'withdrawn',
            round,
            offer: currentOffer,
            ...(decision.action === 'counter' ? { counterOffer: decision.counterOffer } : {}),
            reason: decision.reason,
          })

          if (decision.action === 'accept') {
            agreedFee = decision.offer
            break
          }
          if (decision.action === 'reject' || decision.action === 'withdraw') break

          // O comprador decide se acompanha a contraproposta. Clubes com orçamento
          // apertado são mais propensos a desistir e procurar a próxima alternativa.
          const counter = Math.min(decision.counterOffer, buyer.budget)
          const buyerAcceptance = hash(`${date}:buyer-response:${buyer.id}:${seller.id}:${target.id}:${round}`) % 100
          if (counter > buyer.budget || (counter > askingPrice * 1.04 && buyerAcceptance < 55)) break
          currentOffer = Math.max(currentOffer, Math.round(counter / 50000) * 50000)
        }

        if (agreedFee === null || agreedFee > buyer.budget) continue

        target.clubId = buyer.id
        buyer.budget -= agreedFee
        seller.budget += agreedFee
        changedClubs.add(buyer.id)
        changedClubs.add(seller.id)
        transfers.push({ playerId: target.id, fromClubId: seller.id, toClubId: buyer.id, fee: agreedFee })
        byClub.set(seller.id, (byClub.get(seller.id) ?? []).filter(player => player.id !== target.id))
        byClub.set(buyer.id, [...(byClub.get(buyer.id) ?? []), target])
        completedPurchase = true
      }
    }
  }

  for (const playerId of [...new Set(pendingUserOffers.map(offer => offer.playerId))]) {
    const playerOffers = pendingUserOffers.filter(offer => offer.playerId === playerId)
    const competitionFactor = playerMarketCompetitionFactor(playerOffers.length)

    for (const offer of playerOffers) {
      const buyer = aiClubs.find(club => club.id === offer.toClubId)
      if (!buyer) continue
      const buyerPremium = Math.min(0.08, Math.max(0, buyer.reputation - 65) * 0.001)
      const fee = Math.max(
        250000,
        Math.round((offer.baseFee * competitionFactor * (1 + buyerPremium)) / 50000) * 50000,
      )
      if (fee <= buyer.budget) {
        offers.push({
          playerId: offer.playerId,
          fromClubId: offer.fromClubId,
          toClubId: offer.toClubId,
          fee,
        })
      }
    }
  }

  // Empréstimos: o mercado também resolve excesso de elenco e desenvolvimento.
  if ([10, 20].includes(day)) {
    const activeLoanPlayerIds = new Set(activeLoans.filter(loan => isLoanActiveOnDate(loan, date)).map(loan => loan.playerId))
    const destinations = aiClubs.filter(club => (byClub.get(club.id) ?? []).length < 24).sort((a, b) => (byClub.get(a.id)?.length ?? 0) - (byClub.get(b.id)?.length ?? 0))
    for (const destination of destinations.slice(0, 6)) {
      const destinationSquad = byClub.get(destination.id) ?? []
      const depth = new Map<string, number>()
      for (const player of destinationSquad) depth.set(player.position, (depth.get(player.position) ?? 0) + 1)
      const candidates = aiClubs
        .filter(parent => parent.id !== destination.id && (byClub.get(parent.id) ?? []).length >= 19)
        .flatMap(parent => (byClub.get(parent.id) ?? []).map(player => ({ parent, player })))
        .filter(({ parent, player }) => {
          if (activeLoanPlayerIds.has(player.id) || !player.contractUntil || player.contractUntil < date || player.age > 29) return false
          const role = getSquadRole(player)
          const room = Math.max(0, player.potential - playerOverall(player))
          const behavior = clubBehavior(parent)
          if (behavior === 'youth') return player.age <= 23 && room >= 7 && role !== 'starter'
          if (behavior === 'seller') return player.age <= 24 || role === 'backup' || role === 'prospect'
          return role === 'backup' || role === 'prospect' || (player.age <= 23 && room >= 10)
        })
        .map(({ parent, player }) => ({
          parent,
          player,
          evaluation: evaluateLoanTarget(player, player.marketValue, { id: parent.id, budget: parent.budget, strength: parent.strength, reputation: parent.reputation, behavior: clubBehavior(parent) }, { id: destination.id, budget: destination.budget, strength: destination.strength, reputation: destination.reputation, behavior: clubBehavior(destination) }, destinationSquad.length, depth.get(player.position) ?? 0),
        }))
        .filter(item => shouldOfferLoan(item.evaluation, { id: destination.id, budget: destination.budget, strength: destination.strength, reputation: destination.reputation, behavior: clubBehavior(destination) }))
        .sort((a, b) => b.evaluation.score - a.evaluation.score)
      const selected = candidates[0]
      if (!selected) continue
      const { parent, player, evaluation } = selected
      const seed = 'loan:' + seasonId + ':' + date + ':' + parent.id + ':' + destination.id + ':' + player.id
      if (hash(seed) % 100 >= Math.min(78, 38 + evaluation.score)) continue
      const fee = Math.max(25000, evaluation.fee)
      const salaryShare = normalizeSalaryShare(evaluation.salaryShare)
      const destinationCost = fee + Math.round(player.salary * (salaryShare / 100) * evaluation.months)
      if (destinationCost > destination.budget) continue
      const record: LoanRecord = {
        id: 'loan:' + seasonId + ':' + date + ':' + player.id + ':' + destination.id,
        date, startDate: date, endDate: addMonths(date, evaluation.months),
        playerId: player.id, playerName: player.first_name + ' ' + player.last_name,
        parentClubId: parent.id, loanClubId: destination.id, fee, salary: Math.max(0, player.salary), salaryShare,
      }
      loans.push(record)
      activeLoanPlayerIds.add(player.id)
      parent.budget += fee + Math.round(player.salary * (1 - salaryShare / 100))
      destination.budget = Math.max(0, destination.budget - destinationCost)
      changedClubs.add(parent.id); changedClubs.add(destination.id)
    }
  }
  // Carreira: o contexto do jogador também pesa no ambiente do elenco.
  // Contrato perto do fim, salário muito abaixo do padrão e desempenho coletivo ruim
  // podem reduzir o ânimo. Um bom momento esportivo e uma posição importante no elenco
  // ajudam a manter a motivação. Isso afeta também o clube do treinador.
  for (const club of clubs) {
    const squad = byClub.get(club.id) ?? []
    if (!squad.length) continue
    const performance = performanceByClub[club.id]
    const averageOverall = squad.reduce((sum, player) => sum + playerOverall(player), 0) / squad.length
    const averageSalary = squad.reduce((sum, player) => sum + Math.max(0, player.salary), 0) / squad.length
    const ordered = [...squad].sort((a, b) => playerOverall(b) - playerOverall(a))

    for (const player of squad) {
      if (!player.contractUntil) continue
      const overall = playerOverall(player)
      const monthsToEnd = Math.round((new Date(player.contractUntil).getTime() - new Date(date).getTime()) / (30 * 86400000))
      let moraleDelta = 0

      if (monthsToEnd >= 0 && monthsToEnd <= 6) moraleDelta -= 2
      if (averageSalary > 0 && player.salary < averageSalary * 0.7 && overall >= averageOverall + 3) moraleDelta -= 1
      if (performance && performance.position >= 13 && performance.recentPoints <= 4 && overall >= averageOverall + 3) moraleDelta -= 1
      if (performance && performance.position <= 4 && performance.recentPoints >= 8 && ordered.indexOf(player) < 6) moraleDelta += 1
      if (player.age <= 23 && player.potential >= overall + 10 && ordered.indexOf(player) >= 10) moraleDelta -= 1

      if (moraleDelta !== 0) {
        player.morale = clamp(player.morale + moraleDelta, 25, 100)
        evolvedPlayerIds.add(player.id)
      }
    }
  }

  // O papel no elenco também muda a dinâmica contratual: jogadores importantes
  // custam mais para serem mantidos, enquanto reservas descontentes ficam mais suscetíveis
  // a procurar uma mudança de clube.
  for (const club of clubs) {
    const squad = byClub.get(club.id) ?? []
    if (!squad.length) continue
    for (const player of squad) {
      if (!player.contractUntil) continue
      const role = getSquadRole(player)
      const starts = player.seasonStarts ?? 0
      const appearances = player.seasonAppearances ?? 0
      if (role === 'starter' && starts >= 8 && player.morale >= 70) {
        player.morale = clamp(player.morale + 1, 25, 100)
        evolvedPlayerIds.add(player.id)
      }
      if ((role === 'backup' || role === 'rotation' || role === 'prospect') && appearances <= 2 && player.morale <= 55) {
        player.morale = clamp(player.morale - 1, 25, 100)
        evolvedPlayerIds.add(player.id)
      }
    }
  }

  // Renovações: clubes protegem titulares e jovens de alto potencial antes do fim do contrato.
  for (const club of aiClubs) {
    const squad = byClub.get(club.id) ?? []
    for (const player of squad) {
      if (!player.contractUntil || player.age > 33) continue
      const monthsToEnd = Math.round((new Date(player.contractUntil).getTime() - new Date(date).getTime()) / (30 * 86400000))
      if (monthsToEnd > 6 || monthsToEnd < 0) continue
      const overall = playerOverall(player)
      const performance = performanceByClub[club.id]
      const behavior = clubBehavior(club)
      const underPressure = Boolean(performance && (performance.position >= 13 || performance.recentPoints <= 4))
      const role = getSquadRole(player)
      const roleImportant = role === 'starter' || role === 'rotation' || (role === 'prospect' && player.potential >= 84)

      // A renovação segue a identidade do clube: desenvolvedores protegem jovens,
      // vendedores evitam comprometer a folha, clubes ambiciosos seguram titulares
      // e clubes conservadores só renovam quando o custo cabe com folga no caixa.
      const strategicPriority =
        behavior === 'youth'
          ? (player.age <= 23 && player.potential >= overall + 8 ? 14 : 0)
          : behavior === 'seller'
            ? (player.age <= 24 || overall >= club.strength + 4 ? 4 : -8)
            : behavior === 'ambitious'
              ? (role === 'starter' ? 10 : 3)
              : behavior === 'conservative'
                ? (overall >= club.strength - 1 ? 5 : -5)
                : 0

      const important = roleImportant && strategicPriority >= -2 && (
        underPressure
          ? overall >= club.strength - 2 || player.potential >= 86
          : overall >= club.strength - 4 || player.potential >= 84
      )
      if (!important || club.budget < 250000) continue

      const renewalChance = Math.max(
        0.35,
        Math.min(
          0.94,
          (role === 'starter' ? 0.82 : role === 'rotation' ? 0.7 : 0.58) +
          strategicPriority * 0.012 -
          (underPressure && behavior === 'conservative' ? 0.08 : 0),
        ),
      )
      if (random01(`${date}:renew:${player.id}`) > renewalChance) continue
      const profile = getClubEconomicProfile(club)
      const salaryMultiplier = role === 'starter'
        ? profile.wageMultiplier
        : role === 'rotation'
          ? Math.max(1.02, profile.wageMultiplier - 0.03)
          : Math.max(1.01, profile.wageMultiplier - 0.06)
      const salary = Math.round(Math.max(player.salary * salaryMultiplier, overall * 1200) / 500) * 500
      player.salary = salary
      player.contractUntil = addYears(date, 2)
      club.budget = Math.max(0, club.budget - salary * 0.2)
      renewals.push({ playerId: player.id, clubId: club.id, salary, contractUntil: player.contractUntil })
    }
  }

  // Janela de fim de temporada: veteranos podem se aposentar e clubes recompõem a base.
  if (month === 12 && day === 20) {
    for (const club of aiClubs) {
      const squad = byClub.get(club.id) ?? []
      for (const player of [...squad]) {
        if (player.age < 34) continue
        if (random01(`${seasonId}:retire:${player.id}`) > 0.38) continue
        retirements.push({ playerId: player.id, clubId: club.id })
        byClub.set(club.id, (byClub.get(club.id) ?? []).filter(item => item.id !== player.id))
        player.clubId = ''
        changedClubs.add(club.id)
      }

      const afterRetirements = byClub.get(club.id) ?? []
      const targetSize = 18
      let youthIndex = 0
      while (afterRetirements.length + youthIndex < targetSize) {
        const prospect = createYouth(date, club, youthIndex++)
        youth.push(prospect)
      }
    }
  }

  // O momento esportivo também altera o valor econômico do elenco.
  // O ajuste é mensal e combina desempenho coletivo, forma, potencial e idade.
  if (day === 1) {
    for (const club of aiClubs) {
      const performance = performanceByClub[club.id]
      const squad = byClub.get(club.id) ?? []
      if (!performance || performance.played < 1) continue

      const positionFactor = performance.position <= 4 ? 1.06 : performance.position >= 13 ? 0.94 : 1
      const recentFactor = performance.recentPoints >= 10 ? 1.04 : performance.recentPoints <= 4 ? 0.95 : 1

      for (const player of squad) {
        const overall = playerOverall(player)
        const ageFactor = player.age <= 23 ? 1.04 : player.age >= 32 ? 0.93 : 1
        const formFactor = player.form >= 80 ? 1.025 : player.form <= 45 ? 0.96 : 1
        const potentialFactor = player.potential >= overall + 10 ? 1.025 : 1
        const performanceFactor = playerMarketPerformanceFactor(player)
        const role = getSquadRole(player)
        const roleFactor = role === 'starter'
          ? 1.035
          : role === 'rotation'
            ? 1.015
            : role === 'prospect'
              ? 1.025
              : 0.985
        const multiplier = positionFactor * recentFactor * ageFactor * formFactor * potentialFactor * performanceFactor * roleFactor
        player.marketValue = Math.max(100000, Math.round((player.marketValue * multiplier) / 50000) * 50000)
        evolvedPlayerIds.add(player.id)
      }

      // A reputação acompanha lentamente o desempenho; não é suficiente para
      // transformar uma temporada ruim em um clube de elite de um dia para o outro.
      const reputationDelta = performance.position <= 4
        ? 1
        : performance.position >= 13
          ? -1
          : 0
      if (reputationDelta !== 0) {
        club.reputation = clamp(Number(club.reputation ?? 50) + reputationDelta, 35, 95)
        changedClubs.add(club.id)
      }
    }
  }

  // Finanças da IA: além dos salários, os clubes recebem receitas recorrentes
  // proporcionais à reputação, estádio e força comercial. Assim, o caixa não vira
  // apenas uma contagem regressiva de salários e as decisões de mercado continuam sustentáveis.
  if (day === 1) {
    for (const club of aiClubs) {
      const squad = byClub.get(club.id) ?? []
      const payroll = squad.reduce((sum, player) => sum + Math.max(0, player.salary), 0)
      const capacity = Math.max(8000, Number(club.stadium_capacity ?? 12000))
      const attendanceRate = Math.max(0.35, Math.min(0.9, 0.45 + Number(club.reputation ?? 50) / 250))
      const homeMatchesRevenue = Math.round(capacity * attendanceRate * 35 * 2)
      const sponsorshipRevenue = Math.round(25_000 + Number(club.reputation ?? 50) * 1_200)
      const operatingRevenue = homeMatchesRevenue + sponsorshipRevenue
      const profile = getClubEconomicProfile(club)
      const monthlyExpense = Math.round(payroll * profile.wageMultiplier)
      club.budget = Math.max(0, club.budget + operatingRevenue - monthlyExpense)

      const needsSale = club.budget < 500000 || squad.length > profile.reserveLimit
      if (needsSale && squad.length > 18) {
        const sale = [...squad]
          .filter(player => playerOverall(player) < club.strength + 2 && player.age < 32)
          .filter(player => profile.behavior === 'seller' || profile.behavior === 'conservative' || playerOverall(player) < club.strength - 2)
          .sort((a, b) => {
            const aScore = playerOverall(a) + (getSquadRole(a) === 'starter' ? 20 : 0) + (profile.behavior === 'seller' && a.age <= 24 ? 8 : 0)
            const bScore = playerOverall(b) + (getSquadRole(b) === 'starter' ? 20 : 0) + (profile.behavior === 'seller' && b.age <= 24 ? 8 : 0)
            return aScore - bScore
          })[0]
        const saleChance = profile.behavior === 'seller'
          ? 0.72
          : profile.behavior === 'conservative'
            ? 0.55
            : club.budget < 500000
              ? 0.45
              : 0.28
        if (sale && random01(date + ':forced-sale:' + sale.id) < saleChance) {
          const buyer = aiClubs
            .filter(other => other.id !== club.id && other.budget > sale.marketValue)
            .sort((a, b) => b.budget - a.budget)[0]
          if (buyer) {
            const fee = Math.max(150000, Math.round(sale.marketValue / 50000) * 50000)
            sale.clubId = buyer.id
            club.budget += fee
            buyer.budget -= fee
            changedClubs.add(club.id)
            changedClubs.add(buyer.id)
            transfers.push({ playerId: sale.id, fromClubId: club.id, toClubId: buyer.id, fee })
            byClub.set(club.id, (byClub.get(club.id) ?? []).filter(item => item.id !== sale.id))
            byClub.set(buyer.id, [...(byClub.get(buyer.id) ?? []), sale])
          }
        }
      }
    }
  }

  // Uma geração de jovens pode ocorrer mesmo antes da virada de temporada se o elenco cair abaixo de 16.
  if (day === 25) {
    for (const club of aiClubs) {
      const squad = byClub.get(club.id) ?? []
      if (squad.length >= 16 || random01(date + ':academy:' + club.id) > 0.22) continue
      const prospect = createYouth(date, club, squad.length)
      youth.push(prospect)
      changedClubs.add(club.id)
    }
  }

  for (const club of aiClubs) {
    const squad = byClub.get(club.id) ?? []
    const average = squad.length ? squad.reduce((sum, player) => sum + playerOverall(player), 0) / squad.length : club.strength
    const depthPenalty = squad.length < 16 ? (16 - squad.length) * 2 : 0
    const performance = performanceByClub[club.id]
    const sportingModifier = performance
      ? performance.position <= 4
        ? 1.5
        : performance.position >= 13
          ? -1.5
          : 0
      : 0
    const manager = aiManagement.managers.find(item => item.clubId === club.id)
    const strategyModifier = manager
      ? manager.style === 'ambitious' && performance?.position <= 6
        ? 0.7
        : manager.style === 'defensive' && performance?.position >= 13
          ? 0.5
          : (manager.style === 'youth' || manager.style === 'development') && squad.filter(player => player.age <= 23).length >= 5
            ? 0.4
            : 0
      : 0
    const nextStrength = clamp(average + Math.min(4, Math.max(0, club.reputation - 50) / 25) + sportingModifier + strategyModifier - depthPenalty, 35, 95)
    if (nextStrength !== club.strength) {
      club.strength = nextStrength
      changedClubs.add(club.id)
    }
  }

  return { date, transfers, offers, loans, negotiationEvents, marketInterest, expiredContracts, renewals, retirements, youth, evolvedPlayers, evolvedPlayerIds: [...evolvedPlayerIds], changedClubs: [...changedClubs], aiManagers: aiManagement.managers, boardDecisions: aiManagement.decisions }
}
