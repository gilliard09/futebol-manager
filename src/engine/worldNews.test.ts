import { describe, expect, it } from 'vitest'
import { buildWorldNews } from './worldNews'
import type { WorldClub, WorldPlayer, WorldSimulationResult } from './worldSimulation'

const club = (id: string, name = id): WorldClub => ({
  id, name, short_name: id, city: 'Brasil', country: 'Brasil', division: 1, budget: 1000000, reputation: 70, strength: 70,
})

const player = (id: string, clubId: string): WorldPlayer => ({
  id, first_name: 'Lucas', last_name: 'Silva', age: 21, nationality: 'Brasil', position: 'ST',
  pace: 70, shooting: 70, passing: 65, dribbling: 68, defending: 40, physical: 65, goalkeeping: 30, mental: 70,
  potential: 88, form: 70, morale: 70, squad_number: 9, marketValue: 1000000, salary: 30000,
  contractUntil: '2027-12-31', clubId, clubPlayerId: 'cp-' + id,
})

const result = (): WorldSimulationResult => ({
  date: '2026-06-10',
  transfers: [],
  offers: [],
  expiredContracts: [],
  renewals: [],
  retirements: [],
  youth: [],
  evolvedPlayers: 0,
  evolvedPlayerIds: [],
  changedClubs: [],
})

describe('world news', () => {
  it('turns important world changes into readable stories', () => {
    const clubs = [club('a', 'Clube A'), club('b', 'Clube B')]
    const players = [player('p1', 'a'), player('p2', 'b')]
    const simulation = result()
    simulation.transfers.push({ playerId: 'p1', fromClubId: 'a', toClubId: 'b', fee: 1500000 })
    simulation.renewals.push({ playerId: 'p2', clubId: 'b', salary: 40000, contractUntil: '2028-06-10' })
    simulation.evolvedPlayerIds.push('p2')
    simulation.evolvedPlayers = 1

    const news = buildWorldNews(simulation, clubs, players)

    expect(news.some(item => item.title === 'Mercado em movimento')).toBe(true)
    expect(news.some(item => item.title === 'Contrato renovado')).toBe(true)
    expect(news.some(item => item.title === 'Jogador em evolução')).toBe(true)
    expect(news.every(item => item.date === simulation.date)).toBe(true)
  })
})
