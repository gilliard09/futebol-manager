import { describe, expect, it } from 'vitest'
import { getClubEconomicProfile, playerMarketCompetitionFactor, playerMarketPerformanceFactor, simulateWorldDay } from './worldSimulation'
import type { Club, Player } from '../types/game'

const basePlayer = (id: string, clubId: string, position = 'ST'): Player & { clubId: string; marketValue: number; salary: number; contractUntil: string | null; clubPlayerId: string; seasonMinutes?: number; seasonAppearances?: number; seasonGoals?: number; seasonAssists?: number } => ({
  id, clubId, first_name: id, last_name: 'Player', age: 21, nationality: 'Brasil', position,
  pace: 70, shooting: 70, passing: 65, dribbling: 68, defending: 40, physical: 65, goalkeeping: 30, mental: 70,
  potential: 88, form: 70, morale: 70, squad_number: 9, marketValue: 1000000, salary: 30000, contractUntil: '2027-12-31', clubPlayerId: 'cp-' + id,
})

const club = (id: string, budget: number, strength = 70): Club & { strength: number } => ({
  id, name: id, short_name: id, city: 'Brasil', country: 'Brasil', division: 1, budget, reputation: 70, strength,
})

describe('world simulation', () => {
  it('assigns stable but distinct economic personalities to clubs', () => {
    const profiles = ['ai-a', 'ai-b', 'ai-c', 'ai-d', 'ai-e'].map(id => getClubEconomicProfile(club(id, 5000000)))
    expect(new Set(profiles.map(profile => profile.behavior)).size).toBeGreaterThanOrEqual(3)
    expect(profiles.every(profile => profile.transferBudgetRatio > 0 && profile.transferBudgetRatio <= 0.9)).toBe(true)
    expect(profiles.every(profile => profile.wageMultiplier >= 1)).toBe(true)
  })


  it('releases players when their contracts expire', () => {
    const clubs = [club('user', 1000000), club('ai', 5000000)]
    const players = [basePlayer('expired', 'user')]
    players[0].contractUntil = '2026-01-09'

    const result = simulateWorldDay('2026-01-10', 'season', clubs, players, 'user')

    expect(players[0].clubId).toBe('')
    expect(players[0].contractUntil).toBeNull()
    expect(result.expiredContracts).toEqual([{ playerId: 'expired', clubId: 'user' }])
  })
  it('never moves a player to the user club', () => {
    const clubs = [club('user', 1000000), club('ai-a', 5000000), club('ai-b', 5000000)]
    const players = [
      ...Array.from({ length: 5 }, (_, i) => basePlayer('a' + i, 'ai-a', i === 0 ? 'GK' : 'ST')),
      ...Array.from({ length: 5 }, (_, i) => basePlayer('b' + i, 'ai-b', i === 0 ? 'GK' : 'ST')),
    ]
    const result = simulateWorldDay('2026-01-10', 'season', clubs, players, 'user')
    expect(result.transfers.every(item => item.toClubId !== 'user')).toBe(true)
  })

  it('reduces morale when a player is close to contract expiry', () => {
    const clubs = [club('user', 1000000), club('ai', 5000000)]
    const player = basePlayer('contract', 'user')
    player.contractUntil = '2026-05-01'
    const before = player.morale

    simulateWorldDay('2026-01-10', 'season', clubs, [player], 'user')

    expect(player.morale).toBeLessThan(before)
  })

  it('gives playing time an effect on development probability', () => {
    const clubs = [club('user', 1000000), club('ai', 5000000)]
    const highUsage = Array.from({ length: 200 }, (_, i) => {
      const player = basePlayer('high-' + i, 'user')
      player.seasonMinutes = 1800
      player.seasonAppearances = 20
      return player
    })
    const lowUsage = Array.from({ length: 200 }, (_, i) => {
      const player = basePlayer('low-' + i, 'user')
      player.seasonMinutes = 0
      player.seasonAppearances = 0
      return player
    })
    const score = (player: Player) => player.pace + player.shooting + player.passing + player.dribbling + player.defending + player.physical + player.mental
    const beforeHigh = highUsage.map(score)
    const beforeLow = lowUsage.map(score)

    simulateWorldDay('2026-01-01', 'season', clubs, [...highUsage, ...lowUsage], 'user')

    const evolvedHigh = highUsage.filter((player, index) => score(player) > beforeHigh[index]).length
    const evolvedLow = lowUsage.filter((player, index) => score(player) > beforeLow[index]).length
    expect(evolvedHigh).toBeGreaterThan(evolvedLow)
  })

  it('rewards established roles and strong recent ratings in development', () => {
    const clubs = [club('user', 1000000), club('ai', 5000000)]
    const starters = Array.from({ length: 200 }, (_, i) => {
      const player = basePlayer('starter-growth-' + i, 'user')
      player.seasonAppearances = 12
      player.seasonStarts = 10
      player.seasonMinutes = 1000
      player.seasonAverageRating = 7.5
      return player
    })
    const backups = Array.from({ length: 200 }, (_, i) => {
      const player = basePlayer('backup-growth-' + i, 'user')
      player.seasonAppearances = 1
      player.seasonStarts = 0
      player.seasonMinutes = 45
      player.seasonAverageRating = 5.8
      return player
    })
    const score = (p: Player) => p.shooting + p.pace + p.mental + p.dribbling + p.passing + p.physical + p.defending
    const beforeStarters = starters.map(score)
    const beforeBackups = backups.map(score)

    simulateWorldDay('2026-01-01', 'season-role-test', clubs, [...starters, ...backups], 'user')

    const starterGrowth = starters.filter((player, index) => score(player) > beforeStarters[index]).length
    const backupGrowth = backups.filter((player, index) => score(player) > beforeBackups[index]).length
    expect(starterGrowth).toBeGreaterThan(backupGrowth)
  })

  it('role and morale influence transfer need', () => {
    const clubs = [club('user', 1000000), club('ai-a', 7000000), club('ai-b', 7000000)]
    const starter = basePlayer('starter-market', 'user', 'ST')
    starter.seasonAppearances = 12
    starter.seasonStarts = 10
    starter.seasonMinutes = 1000
    starter.seasonAverageRating = 7.5
    starter.morale = 90
    const unhappyBackup = basePlayer('backup-market', 'user', 'ST')
    unhappyBackup.seasonAppearances = 1
    unhappyBackup.seasonStarts = 0
    unhappyBackup.seasonMinutes = 30
    unhappyBackup.seasonAverageRating = 5.8
    unhappyBackup.morale = 35

    simulateWorldDay('2026-01-10', 'season', clubs, [starter, unhappyBackup], 'user')

    expect(unhappyBackup.morale).toBeLessThanOrEqual(34)
    expect(starter.morale).toBeGreaterThanOrEqual(90)
  })


  it('uses squad hierarchy in player market value', () => {
    const clubs = [club('user', 1000000), club('ai', 5000000)]
    const starter = basePlayer('value-starter', 'ai')
    starter.age = 27
    starter.seasonAppearances = 12
    starter.seasonStarts = 10
    starter.seasonMinutes = 1000
    starter.seasonAverageRating = 7.5
    const backup = basePlayer('value-backup', 'ai')
    backup.age = 27
    backup.seasonAppearances = 1
    backup.seasonStarts = 0
    backup.seasonMinutes = 30
    backup.seasonAverageRating = 5.8
    const before = starter.marketValue
    const beforeBackup = backup.marketValue

    simulateWorldDay('2026-01-01', 'season-role-value-test', clubs, [starter, backup], 'user', {
      ai: { position: 6, points: 9, goalDifference: 0, played: 5, recentPoints: 6, recentResults: ['W', 'D', 'L'] },
    })

    expect(starter.marketValue).toBeGreaterThan(before)
    expect(backup.marketValue).toBeLessThanOrEqual(beforeBackup)
  })

  it('creates world interest around standout players', () => {
    const clubs = [
      club('user', 1000000, 70),
      club('ai-a', 7000000, 70),
      club('ai-b', 7000000, 70),
      club('ai-c', 7000000, 70),
      club('ai-d', 7000000, 70),
    ]
    const player = basePlayer('world-star', 'ai-a', 'ST')
    player.shooting = 90
    player.pace = 88
    player.dribbling = 84
    player.mental = 82
    player.potential = 94
    player.seasonAppearances = 12
    player.seasonStarts = 11
    player.seasonMinutes = 1050
    player.seasonGoals = 11
    player.seasonAssists = 5
    player.seasonAverageRating = 7.7

    const result = simulateWorldDay('2026-06-10', 'world-interest-test', clubs, [player], 'user')
    const interest = result.marketInterest.find(item => item.playerId === player.id)

    expect(interest).toBeDefined()
    expect(interest?.clubIds.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(new Set(interest?.clubIds).size).toBe(interest?.clubIds.length)
  })

  it('creates competing offers for a standout user player and raises the fee', () => {
    const clubs = [
      club('user', 1000000, 70),
      club('ai-c', 7000000, 70),
      club('ai-d', 7000000, 70),
      club('ai-e', 7000000, 70),
      club('ai-g', 7000000, 70),
      club('ai-h', 7000000, 70),
    ]
    const player = basePlayer('star', 'user', 'ST')
    player.pace = 85
    player.shooting = 88
    player.passing = 78
    player.dribbling = 86
    player.physical = 78
    player.mental = 82
    player.potential = 94
    player.seasonAppearances = 12
    player.seasonStarts = 11
    player.seasonMinutes = 1050
    player.seasonGoals = 10
    player.seasonAssists = 5
    player.seasonAverageRating = 7.7

    const day10 = simulateWorldDay('2026-06-10', 'market-race-test', clubs, [player], 'user')
    expect(day10.marketInterest.find(item => item.playerId === player.id)?.stage).toBe('monitoring')
    expect(day10.offers.filter(offer => offer.playerId === player.id)).toHaveLength(0)

    const day20 = simulateWorldDay('2026-06-20', 'market-race-test', clubs, [player], 'user', {}, day10.marketInterest)
    expect(day20.marketInterest.find(item => item.playerId === player.id)?.stage).toBe('monitoring')
    expect(day20.offers.filter(offer => offer.playerId === player.id)).toHaveLength(0)

    const day30 = simulateWorldDay('2026-06-30', 'market-race-test', clubs, [player], 'user', {}, day20.marketInterest)
    expect(day30.marketInterest.find(item => item.playerId === player.id)?.stage).toBe('scouting')
    expect(day30.offers.filter(offer => offer.playerId === player.id)).toHaveLength(0)

    const day40 = simulateWorldDay('2026-07-10', 'market-race-test', clubs, [player], 'user', {}, day30.marketInterest)
    const playerOffers = day40.offers.filter(offer => offer.playerId === player.id)

    expect(day40.marketInterest.find(item => item.playerId === player.id)?.stage).toBe('proposal_ready')
    expect(playerOffers.length).toBeGreaterThanOrEqual(2)
    expect(new Set(playerOffers.map(offer => offer.toClubId)).size).toBe(playerOffers.length)
    expect(playerOffers.every(offer => offer.fee > 1180000)).toBe(true)
    expect(playerMarketCompetitionFactor(playerOffers.length)).toBeGreaterThan(1)
  })

  it('can evolve young players on development days', () => {
    const clubs = [club('user', 1000000), club('ai', 5000000)]
    const players = Array.from({ length: 6 }, (_, i) => basePlayer('p' + i, 'ai', i === 0 ? 'GK' : 'ST'))
    const before = players.map(player => ({ ...player }))
    simulateWorldDay('2026-01-01', 'season', clubs, players, 'user')
    expect(players.some((player, index) => player.shooting > before[index].shooting || player.pace > before[index].pace || player.passing > before[index].passing || player.dribbling > before[index].dribbling || player.mental > before[index].mental || player.physical > before[index].physical || player.defending > before[index].defending)).toBe(true)
  })
  it('gera uma nova safra de base com qualidade ligada ao clube', () => {
    const clubs = [club('user', 1000000, 70), club('ai-youth', 5000000, 70)]
    clubs[1].reputation = 90
    const players = [basePlayer('veteran', 'ai-youth')]
    players[0].age = 34
    players[0].contractUntil = '2026-12-31'
    const result = simulateWorldDay('2026-12-20', 'academy-test', clubs, players, 'user')
    expect(result.retirements.length).toBeGreaterThanOrEqual(0)
    expect(result.youth.length).toBeGreaterThan(0)
    expect(result.youth.every(player => player.age >= 17 && player.age <= 19)).toBe(true)
    expect(result.youth.every(player => player.potential >= 74)).toBe(true)
  })

  it('clubes da IA contratam jogadores livres para recompor o elenco', () => {
    const clubs = [club('user', 1000000), club('ai-a', 5000000), club('ai-b', 5000000)]
    const free = basePlayer('free', '', 'ST')
    free.clubId = ''
    free.contractUntil = null
    free.marketValue = 500000
    free.age = 22
    const squad = Array.from({ length: 15 }, (_, i) => basePlayer('squad-' + i, 'ai-a', i === 0 ? 'GK' : 'CB'))
    const result = simulateWorldDay('2026-06-15', 'free-agent-test', clubs, [free, ...squad], 'user')
    expect(result.freeAgentSignings.length).toBeGreaterThanOrEqual(1)
    expect(free.clubId).not.toBe('')
    expect(result.transfers.some(item => item.playerId === 'free' && item.fromClubId === null)).toBe(true)
  })

})


it('connects individual performance to market value signals', () => {
  const standout = basePlayer('standout', 'a')
  standout.seasonGoals = 10
  standout.seasonAssists = 5
  standout.seasonAverageRating = 7.65

  const ordinary = basePlayer('ordinary', 'a')
  ordinary.seasonGoals = 1
  ordinary.seasonAssists = 1
  ordinary.seasonAverageRating = 6.5

  expect(playerMarketPerformanceFactor(standout)).toBeGreaterThan(playerMarketPerformanceFactor(ordinary))
  expect(playerMarketPerformanceFactor(standout)).toBeGreaterThan(1)
})
