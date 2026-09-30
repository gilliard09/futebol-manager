import type { Club, Player } from '../types/game'
import { getSquadRole, playerOverall } from './match'

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

export type WorldSimulationResult = {
  date: string
  transfers: Array<{ playerId: string; fromClubId: string | null; toClubId: string; fee: number }>
  offers: Array<{ playerId: string; fromClubId: string; toClubId: string; fee: number }>
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function addYears(date: string, years: number) {
  const [year, month, day] = date.split('-').map(Number)
  return `${year + years}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
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

function transferNeed(player: WorldPlayer, club: WorldClub, squadSize: number, performance?: WorldClubPerformance) {
  const overall = playerOverall(player)
  const budgetPressure = club.budget > 5000000 ? 1 : club.budget > 3000000 ? 0.5 : 0
  const sportingUrgency = performance && (performance.position >= 13 || performance.recentPoints <= 4) ? 6 : 0
  const usageBonus = (player.seasonMinutes ?? 0) >= 900 ? 4 : (player.seasonMinutes ?? 0) < 180 ? -2 : 0
  const ratingBonus = (player.seasonAverageRating ?? 0) >= 7.2 ? 5 : (player.seasonAverageRating ?? 0) >= 6.8 ? 2 : (player.seasonAverageRating ?? 0) > 0 && (player.seasonAverageRating ?? 0) < 6 ? -2 : 0
  const role = getSquadRole(player)
  const roleBonus = role === 'starter' ? 4 : role === 'rotation' ? 2 : role === 'prospect' ? 1 : -2
  const moraleBonus = player.morale <= 45 ? 3 : player.morale >= 80 ? -1 : 0
  return overall + budgetPressure * 4 + (squadSize < 18 ? 8 : 0) + sportingUrgency + usageBonus + ratingBonus + roleBonus + moraleBonus
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
): WorldSimulationResult {
  const aiClubs = clubs.filter(club => club.id !== userClubId)
  const transfers: WorldSimulationResult['transfers'] = []
  const offers: WorldSimulationResult['offers'] = []
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
  // Mercado: cada clube pode contratar uma vez por janela mensal.
  if ([10, 20].includes(day)) {
    for (const buyer of aiClubs) {
      const squad = byClub.get(buyer.id) ?? []
      const performance = performanceByClub[buyer.id]
      const urgentMarket = Boolean(performance && (performance.position >= 13 || performance.recentPoints <= 4))
      const ambitiousMarket = Boolean(performance && performance.position <= 4 && performance.recentPoints >= 8)
      if (squad.length >= 22 && random01(date + buyer.id) < 0.65) continue
      if (buyer.budget < 750000) continue

      const weakestPosition = positions
        .map(position => {
          const group = squad.filter(player => player.position === position)
          const average = group.length ? group.reduce((sum, player) => sum + playerOverall(player), 0) / group.length : 0
          return { position, average, count: group.length }
        })
        .sort((a, b) => a.average - b.average || a.count - b.count)[0]

      const userCandidates = players
        .filter(player => player.clubId === userClubId)
        .filter(player => player.age <= 31)
        .filter(player => playerOverall(player) >= Math.max(62, buyer.strength - (urgentMarket ? 7 : 3)))
        .sort((a, b) => transferNeed(b, buyer, squad.length, performance) - transferNeed(a, buyer, squad.length, performance))

      const userTarget = userCandidates.find(player => {
        const price = Math.max(250000, Math.round(player.marketValue * (player.age <= 23 ? 1.18 : 1.08) / 50000) * 50000)
        return price <= buyer.budget * (urgentMarket || ambitiousMarket ? 0.8 : 0.7)
      })

      if (userTarget && random01(`${date}:offer:${buyer.id}:${userTarget.id}`) < 0.18) {
        const fee = Math.max(250000, Math.round(userTarget.marketValue * (userTarget.age <= 23 ? 1.18 : 1.08) / 50000) * 50000)
        offers.push({ playerId: userTarget.id, fromClubId: userClubId, toClubId: buyer.id, fee })
        continue
      }

      // Jogadores livres podem ser assinados sem taxa de transferência.
      const freeAgent = players
        .filter(player => player.clubId === '')
        .filter(player => player.position === weakestPosition.position)
        .filter(player => player.age <= 32)
        .filter(player => playerOverall(player) >= Math.max(56, buyer.strength - (urgentMarket ? 10 : ambitiousMarket ? 5 : 7)))
        .sort((a, b) => transferNeed(b, buyer, squad.length, performance) - transferNeed(a, buyer, squad.length, performance))[0]

      if (freeAgent && random01(`${date}:free-agent:${buyer.id}:${freeAgent.id}`) < 0.35) {
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
        .sort((a, b) => transferNeed(b, buyer, squad.length, performance) - transferNeed(a, buyer, squad.length, performance))

      const target = candidates.find(player => {
        const seller = clubs.find(club => club.id === player.clubId)
        if (!seller || seller.id === buyer.id || seller.id === userClubId) return false
        const sellerSquad = byClub.get(seller.id) ?? []
        if (sellerSquad.length <= 16) return false
        const price = Math.max(150000, Math.round(player.marketValue * (player.age <= 23 ? 1.08 : 1) / 50000) * 50000)
        return price <= buyer.budget * (urgentMarket || ambitiousMarket ? 0.8 : 0.7) && (player.contractUntil === null || player.contractUntil >= date)
      })

      if (!target) continue
      const seller = clubs.find(club => club.id === target.clubId)
      if (!seller) continue
      const fee = Math.max(150000, Math.round(target.marketValue * (target.age <= 23 ? 1.08 : 1) / 50000) * 50000)
      if (fee > buyer.budget) continue

      target.clubId = buyer.id
      buyer.budget -= fee
      seller.budget += fee
      changedClubs.add(buyer.id)
      changedClubs.add(seller.id)
      transfers.push({ playerId: target.id, fromClubId: seller.id, toClubId: buyer.id, fee })
      byClub.set(seller.id, (byClub.get(seller.id) ?? []).filter(player => player.id !== target.id))
      byClub.set(buyer.id, [...(byClub.get(buyer.id) ?? []), target])
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
      const underPressure = Boolean(performance && (performance.position >= 13 || performance.recentPoints <= 4))
      const role = getSquadRole(player)
      const roleImportant = role === 'starter' || role === 'rotation' || (role === 'prospect' && player.potential >= 84)
      const important = roleImportant && (underPressure
        ? overall >= club.strength - 2 || player.potential >= 86
        : overall >= club.strength - 4 || player.potential >= 84)
      if (!important || club.budget < 250000) continue
      const renewalChance = role === 'starter'
        ? 0.88
        : role === 'rotation'
          ? 0.76
          : 0.68
      if (random01(`${date}:renew:${player.id}`) > renewalChance) continue
      const salaryMultiplier = role === 'starter' ? 1.14 : role === 'rotation' ? 1.1 : 1.06
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
        const role = getSquadRole(player)
        const roleFactor = role === 'starter'
          ? 1.035
          : role === 'rotation'
            ? 1.015
            : role === 'prospect'
              ? 1.025
              : 0.985
        const multiplier = positionFactor * recentFactor * ageFactor * formFactor * potentialFactor * roleFactor
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

  // Pequena inflação/pressão financeira mantém o mercado ligado à economia do clube.
  if (day === 1) {
    for (const club of aiClubs) {
      const squad = byClub.get(club.id) ?? []
      const payroll = squad.reduce((sum, player) => sum + player.salary, 0)
      club.budget = Math.max(0, club.budget - payroll)
      if (club.budget < 500000 && squad.length > 18) {
        const sale = [...squad]
          .filter(player => playerOverall(player) < club.strength + 2 && player.age < 32)
          .sort((a, b) => playerOverall(a) - playerOverall(b))[0]
        if (sale && random01(date + ':forced-sale:' + sale.id) < 0.45) {
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
    const nextStrength = clamp(average + Math.min(4, Math.max(0, club.reputation - 50) / 25) + sportingModifier - depthPenalty, 35, 95)
    if (nextStrength !== club.strength) {
      club.strength = nextStrength
      changedClubs.add(club.id)
    }
  }

  return { date, transfers, offers, expiredContracts, renewals, retirements, youth, evolvedPlayers, evolvedPlayerIds: [...evolvedPlayerIds], changedClubs: [...changedClubs] }
}
