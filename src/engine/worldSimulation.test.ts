import { describe, expect, it } from 'vitest'
import { simulateWorldDay } from './worldSimulation'
import type { Club, Player } from '../types/game'

const basePlayer = (id: string, clubId: string, position = 'ST'): Player & { clubId: string; marketValue: number; salary: number; contractUntil: string | null; clubPlayerId: string; seasonMinutes?: number; seasonAppearances?: number } => ({
  id, clubId, first_name: id, last_name: 'Player', age: 21, nationality: 'Brasil', position,
  pace: 70, shooting: 70, passing: 65, dribbling: 68, defending: 40, physical: 65, goalkeeping: 30, mental: 70,
  potential: 88, form: 70, morale: 70, squad_number: 9, marketValue: 1000000, salary: 30000, contractUntil: '2027-12-31', clubPlayerId: 'cp-' + id,
})

const club = (id: string, budget: number, strength = 70): Club & { strength: number } => ({
  id, name: id, short_name: id, city: 'Brasil', country: 'Brasil', division: 1, budget, reputation: 70, strength,
})

describe('world simulation', () => {
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
    const starter = basePlayer('starter-growth', 'ST')
    starter.seasonAppearances = 12
    starter.seasonStarts = 10
    starter.seasonMinutes = 1000
    starter.seasonAverageRating = 7.5
    const backup = basePlayer('backup-growth', 'ST')
    backup.seasonAppearances = 1
    backup.seasonStarts = 0
    backup.seasonMinutes = 45
    backup.seasonAverageRating = 5.8
    const score = (p: Player) => p.shooting + p.pace + p.mental + p.dribbling + p.passing + p.physical + p.defending
    const beforeStarter = score(starter)
    const beforeBackup = score(backup)
    for (let i = 0; i < 30; i++) {
      simulateWorldDay('2026-01-01', 'season-' + i, clubs, [starter], 'user')
      simulateWorldDay('2026-01-01', 'season-' + i, clubs, [backup], 'user')
    }
    expect(score(starter)).toBeGreaterThanOrEqual(beforeStarter)
    expect(score(starter) - beforeStarter).toBeGreaterThanOrEqual(score(backup) - beforeBackup)
  })

  it('role and morale influence transfer need', () => {
    const clubs = [club('user', 1000000), club('ai-a', 7000000), club('ai-b', 7000000)]
    const starter = basePlayer('starter-market', 'ST')
    starter.seasonAppearances = 12
    starter.seasonStarts = 10
    starter.seasonMinutes = 1000
    starter.seasonAverageRating = 7.5
    starter.morale = 90
    const unhappyBackup = basePlayer('backup-market', 'ST')
    unhappyBackup.seasonAppearances = 1
    unhappyBackup.seasonStarts = 0
    unhappyBackup.seasonMinutes = 30
    unhappyBackup.seasonAverageRating = 5.8
    unhappyBackup.morale = 35

    simulateWorldDay('2026-01-10', 'season', clubs, [starter, unhappyBackup], 'user')

    expect(unhappyBackup.morale).toBeLessThan(35)
    expect(starter.morale).toBeGreaterThanOrEqual(90)
  })

  it('can evolve young players on development days', () => {
    const clubs = [club('user', 1000000), club('ai', 5000000)]
    const players = Array.from({ length: 6 }, (_, i) => basePlayer('p' + i, 'ai', i === 0 ? 'GK' : 'ST'))
    const before = players.map(player => ({ ...player }))
    simulateWorldDay('2026-01-01', 'season', clubs, players, 'user')
    expect(players.some((player, index) => player.shooting > before[index].shooting || player.pace > before[index].pace || player.passing > before[index].passing || player.dribbling > before[index].dribbling || player.mental > before[index].mental || player.physical > before[index].physical || player.defending > before[index].defending)).toBe(true)
  })
})
