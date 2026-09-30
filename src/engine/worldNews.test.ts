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
    players[1].seasonMinutes = 900
    players[1].seasonAppearances = 10
    players[1].seasonStarts = 8


    const news = buildWorldNews(simulation, clubs, players, {}, 'a')

    expect(news.some(item => item.title === 'Mercado em movimento')).toBe(true)
    expect(news.some(item => item.title === 'Clube segurou uma peça importante')).toBe(true)
    expect(news.some(item => item.title === 'Jovem ganha espaço')).toBe(true)
    expect(news.every(item => item.date === simulation.date)).toBe(true)
    expect(news.find(item => item.title === 'Mercado em movimento')?.priority).toBe(42)
  })
})


it('prioritizes news involving the user club and major events', () => {
  const clubs = [club('a', 'Clube A'), club('b', 'Clube B')]
  const players = [player('p1', 'a'), player('p2', 'b')]
  const simulation = result()
  simulation.offers.push({ playerId: 'p1', fromClubId: 'a', toClubId: 'b', fee: 3500000 })
  simulation.transfers.push({ playerId: 'p2', fromClubId: 'a', toClubId: 'b', fee: 3500000 })

  const news = buildWorldNews(simulation, clubs, players, {
    b: { position: 15, points: 8, goalDifference: -4, played: 8, recentPoints: 3, recentResults: ['L', 'L', 'D', 'L', 'L'] },
  }, 'a')

  expect(news[0].title).toBe('Seu clube recebeu uma proposta')
  expect(news[0].priority).toBe(100)
  expect(news.some(item => item.title === 'Crise de resultados')).toBe(true)
})
