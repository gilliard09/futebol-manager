import type { Club, Player } from '../types/game'
import { playerOverall } from './match'

export type WorldClub = Club & { strength: number }

export type WorldSimulationResult = {
  date: string
  transfers: Array<{ playerId: string; fromClubId: string; toClubId: string; fee: number }>
  evolvedPlayers: number
  changedClubs: string[]
}

type PlayerRow = Player & {
  clubId: string
  marketValue: number
  salary: number
  contractUntil: string | null
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

function ageFactor(player: Player) {
  if (player.age <= 20) return 0.95
  if (player.age <= 23) return 0.7
  if (player.age <= 26) return 0.45
  if (player.age <= 29) return 0.2
  if (player.age <= 32) return -0.15
  return -0.4
}

function transferNeed(player: Player, club: WorldClub, squadSize: number) {
  const overall = playerOverall(player)
  const budgetPressure = club.budget > 5000000 ? 1 : club.budget > 3000000 ? 0.5 : 0
  return overall + budgetPressure * 4 + (squadSize < 18 ? 8 : 0)
}

export function simulateWorldDay(
  date: string,
  seasonId: string,
  clubs: WorldClub[],
  players: PlayerRow[],
  userClubId: string,
): WorldSimulationResult {
  const aiClubs = clubs.filter(club => club.id !== userClubId)
  const transfers: WorldSimulationResult['transfers'] = []
  const changedClubs = new Set<string>()
  let evolvedPlayers = 0

  const byClub = new Map<string, PlayerRow[]>()
  for (const player of players) {
    const squad = byClub.get(player.clubId) ?? []
    squad.push(player)
    byClub.set(player.clubId, squad)
  }

  const updatePlayer = (player: PlayerRow, delta: number) => {
    const attributes: Array<keyof Player> = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical', 'goalkeeping', 'mental']
    const key = attributes[hash(player.id + date) % attributes.length]
    const next = clamp(Number(player[key]) + delta, 1, 99)
    if (next === Number(player[key])) return
    player[key] = next
    player.form = clamp(player.form + (delta > 0 ? 1 : 0), 1, 100)
    player.morale = clamp(player.morale + (delta > 0 ? 1 : -1), 1, 100)
    evolvedPlayers++
  }

  // O desenvolvimento acontece mensalmente. Jovens com potencial alto têm maior
  // probabilidade de crescer; veteranos podem perder atributos gradualmente.
  if (date.endsWith('-01') || date.endsWith('-15')) {
    for (const player of players) {
      const probability = player.age <= 23 ? 0.7 : player.age >= 31 ? 0.45 : 0.2
      const roll = random01(seasonId + date + player.id)
      if (roll < probability) {
        const direction = player.age >= 31 ? -1 : 1
        const cappedDelta = direction > 0 ? Math.max(0, Math.min(2, player.potential - playerOverall(player))) : -1
        if (cappedDelta !== 0) updatePlayer(player, cappedDelta)
      }
    }
  }

  // Mercado vivo: em dois dias fixos do mês, cada clube pode realizar no máximo
  // uma operação. Clubes procuram posições onde seu elenco está mais fraco.
  const day = Number(date.slice(8, 10))
  if ([10, 20].includes(day)) {
    for (const buyer of aiClubs) {
      const squad = byClub.get(buyer.id) ?? []
      if (squad.length >= 22 && random01(date + buyer.id) < 0.55) continue
      if (buyer.budget < 750000) continue

      const positions = ['GK', 'CB', 'CM', 'ST']
      const weakestPosition = positions
        .map(position => {
          const group = squad.filter(player => player.position === position)
          const average = group.length ? group.reduce((sum, player) => sum + playerOverall(player), 0) / group.length : 0
          return { position, average, count: group.length }
        })
        .sort((a, b) => a.average - b.average || a.count - b.count)[0]

      const candidates = players
        .filter(player => player.clubId !== buyer.id && player.clubId !== userClubId)
        .filter(player => player.position === weakestPosition.position)
        .filter(player => player.age <= 31)
        .filter(player => playerOverall(player) >= Math.max(58, buyer.strength - 5))
        .sort((a, b) => transferNeed(b, buyer, squad.length) - transferNeed(a, buyer, squad.length))

      const target = candidates.find(player => {
        const seller = clubs.find(club => club.id === player.clubId)
        if (!seller || seller.id === buyer.id || seller.id === userClubId) return false
        const price = Math.max(150000, Math.round(player.marketValue * (player.age <= 23 ? 1.08 : 1) / 50000) * 50000)
        return price <= buyer.budget * 0.7 && (player.contractUntil === null || player.contractUntil >= date)
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

  for (const club of aiClubs) {
    const squad = byClub.get(club.id) ?? []
    const average = squad.length ? squad.reduce((sum, player) => sum + playerOverall(player), 0) / squad.length : club.strength
    const nextStrength = clamp(average + Math.min(4, Math.max(0, club.reputation - 50) / 25), 35, 95)
    if (nextStrength !== club.strength) {
      club.strength = nextStrength
      changedClubs.add(club.id)
    }
  }

  return { date, transfers, evolvedPlayers, changedClubs: [...changedClubs] }
}
