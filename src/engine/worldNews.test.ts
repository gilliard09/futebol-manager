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
  marketInterest: [],
  expiredContracts: [],
  renewals: [],
  retirements: [],
  youth: [],
  evolvedPlayers: 0,
  evolvedPlayerIds: [],
  changedClubs: [],
  loans: [],
  negotiationEvents: [],
  aiManagers: [],
  boardDecisions: [],
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


it('creates contextual season narratives from the table and streaks', () => {
  const clubs = [
    { ...club('a', 'Clube A'), reputation: 82 },
    { ...club('b', 'Clube B'), reputation: 80 },
    { ...club('c', 'Clube C'), reputation: 79 },
    { ...club('d', 'Clube D'), reputation: 78 },
    { ...club('e', 'Clube E'), reputation: 72 },
  ]
  const simulation = result()
  const news = buildWorldNews(simulation, clubs, [], {
    a: { position: 1, points: 21, goalDifference: 8, played: 7, recentPoints: 13, recentResults: ['W', 'W', 'W', 'W', 'W'] },
    b: { position: 2, points: 19, goalDifference: 7, played: 7, recentPoints: 12, recentResults: ['W', 'W', 'W', 'D', 'W'] },
    c: { position: 3, points: 17, goalDifference: 4, played: 7, recentPoints: 8, recentResults: ['D', 'W', 'D', 'W', 'L'] },
    d: { position: 4, points: 16, goalDifference: 2, played: 7, recentPoints: 5, recentResults: ['L', 'L', 'W', 'L', 'L'] },
    e: { position: 5, points: 14, goalDifference: 0, played: 7, recentPoints: 7, recentResults: ['W', 'D', 'L', 'W', 'D'] },
  }, 'a')

  expect(news.some(item => item.title === 'Seu clube entrou na briga pelo título')).toBe(true)
  expect(news.some(item => item.title === 'Seu clube vive uma sequência de vitórias')).toBe(true)
  expect(news.some(item => item.title === 'Briga pelo G4 ganha tensão')).toBe(true)
  expect(news.find(item => item.title === 'Seu clube entrou na briga pelo título')?.priority).toBe(96)
})

it('creates a contextual crisis story for a high-reputation club', () => {
  const clubs = [
    { ...club('a', 'Clube A'), reputation: 82 },
    { ...club('b', 'Clube B'), reputation: 80 },
  ]
  const simulation = result()
  const news = buildWorldNews(simulation, clubs, [], {
    a: { position: 10, points: 8, goalDifference: -5, played: 7, recentPoints: 3, recentResults: ['L', 'L', 'D', 'L', 'L'] },
    b: { position: 1, points: 18, goalDifference: 8, played: 7, recentPoints: 12, recentResults: ['W', 'W', 'W', 'D', 'W'] },
  }, 'b')

  expect(news.some(item => item.title === 'Grande clube vive momento difícil')).toBe(true)
})


it('creates player-focused stories from individual season stats', () => {
  const clubs = [club('a', 'Clube A'), club('b', 'Clube B')]
  const players = [player('p1', 'a'), player('p2', 'b')]
  players[0].seasonAppearances = 8
  players[0].seasonStarts = 7
  players[0].seasonMinutes = 700
  players[0].seasonGoals = 7
  players[0].seasonAverageRating = 7.65
  players[1].seasonAppearances = 8
  players[1].seasonStarts = 7
  players[1].seasonMinutes = 700
  players[1].seasonGoals = 2
  players[1].seasonAverageRating = 5.6

  const simulation = result()
  const news = buildWorldNews(simulation, clubs, players, {
    a: { position: 2, points: 18, goalDifference: 6, played: 7, recentPoints: 10, recentResults: ['W', 'W', 'D', 'W', 'L'] },
    b: { position: 8, points: 9, goalDifference: -2, played: 7, recentPoints: 4, recentResults: ['L', 'W', 'L', 'D', 'L'] },
  }, 'a')

  expect(news.some(item => item.title === 'Seu jogador é destaque na artilharia')).toBe(true)
  expect(news.some(item => item.title === 'Um dos seus jogadores vive grande fase')).toBe(true)
  expect(news.some(item => item.title === 'Titular entra na mira das críticas')).toBe(true)
  expect(news.some(item => item.title === 'Artilheiro entra no radar do mercado')).toBe(true)
})
