import { describe, expect, it } from 'vitest'
import { buildLeagueFixtures, buildCupFixtures } from './seasonSchedule'
import { buildStandings } from './competitions'
import { createSeasonHistory } from './seasonHistory'
import {
  buildManagerOfferCandidates,
  buildManagerRecords,
  initialManagerPopularity,
  managerPerformanceScore,
  updateManagerPopularity,
} from './managerCareer'
import { simulateWorldDay, type WorldClub, type WorldPlayer } from './worldSimulation'
import type { Club, Player } from '../types/game'

function club(id: string, division = 1, strength = 75): WorldClub {
  return {
    id,
    name: id.toUpperCase(),
    short_name: id.toUpperCase(),
    city: id,
    country: 'Brasil',
    division,
    budget: 8_000_000,
    reputation: strength,
    strength,
  }
}

function player(id: string, clubId: string, age = 22, position: Player['position'] = 'ST'): WorldPlayer {
  const base: Player = {
    id,
    first_name: id,
    last_name: 'Player',
    age,
    nationality: 'Brasil',
    position,
    pace: 70,
    shooting: 70,
    passing: 65,
    dribbling: 68,
    defending: 40,
    physical: 65,
    goalkeeping: 30,
    mental: 70,
    potential: 88,
    form: 70,
    morale: 70,
    squad_number: 9,
    salary: 30_000,
    marketValue: 1_000_000,
    contractUntil: '2032-12-31',
  }

  return {
    ...base,
    clubId,
    marketValue: 1_000_000,
    salary: 30_000,
    contractUntil: '2032-12-31',
    clubPlayerId: 'cp-' + id,
  }
}

function completeLeagueFixtures(year: number, clubs: Club[]) {
  const seasonId = 'season-' + year
  return buildLeagueFixtures(seasonId, year + '-01-28', clubs, 'liga').map((fixture, index) => ({
    ...fixture,
    status: 'completed',
    home_score: index % 3 === 0 ? 2 : 1,
    away_score: index % 3 === 1 ? 1 : 0,
    winner_club_id: fixture.home_club_id,
  }))
}

describe('multi-season simulation', () => {
  it('mantém continuidade de 2026 a 2030 sem resetar a carreira do treinador', () => {
    const seasons = Array.from({ length: 5 }, (_, index) => 2026 + index)
    const leagueClubs = Array.from({ length: 16 }, (_, index) => club('A' + String(index + 1).padStart(2, '0'), 1, 90 - index))
    const userClubId = 'A01'

    let popularity = initialManagerPopularity(leagueClubs[0].reputation)
    const initialPopularity = { ...popularity }
    let previousBudget = leagueClubs[0].budget
    let managerSeasons = 0
    let managerTitles = 0
    let totalTransfers = 0
    let totalAIManagers = 0
    let totalNegotiations = 0
    let totalManagerOffers = 0
    const history: Array<{ final_position: number | null; points: number; wins: number }> = []
    const champions: string[] = []
    const cupChampions: string[] = []

    const players: WorldPlayer[] = [
      ...leagueClubs.flatMap(clubItem =>
        Array.from({ length: 18 }, (_, index) => {
          const positions: Player['position'][] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST']
          return player(
            clubItem.id + '-p' + index,
            clubItem.id,
            20 + (index % 10),
            positions[index % positions.length],
          )
        }),
      ),
      player('free-agent', '', 21, 'ST'),
    ]

    // Um zagueiro da IA começa a carreira explicitamente pedindo transferência.
    // Como o elenco de teste tem carência de zagueiros, o alvo entra no mercado
    // de forma determinística e permite validar a negociação entre clubes da IA.
    const transferTarget = players.find(player => player.id === 'A02-p1')!
    transferTarget.transferRequested = true
    transferTarget.transferRequestDate = '2026-01-01'
    transferTarget.dissatisfaction = 80

    for (const year of seasons) {
      const seasonId = 'season-' + year
      const leagueFixtures = completeLeagueFixtures(year, leagueClubs)
      const standings = buildStandings(leagueClubs, leagueFixtures)
      const cupRows = buildCupFixtures(seasonId, year + '-02-18', leagueClubs, 'copa')
      const cupFixtures = cupRows.map((fixture, index) => ({
        ...fixture,
        status: 'completed',
        home_score: index % 2 === 0 ? 1 : 0,
        away_score: index % 2 === 0 ? 0 : 1,
        winner_club_id: index % 2 === 0 ? fixture.home_club_id : fixture.away_club_id,
      }))

      const historyEntry = createSeasonHistory(
        String(year),
        standings,
        { id: cupFixtures.at(-1)!.winner_club_id!, name: cupFixtures.at(-1)!.winner_club_id! },
      )

      expect(historyEntry.season).toBe(String(year))
      expect(historyEntry.leagueChampionId).toBeTruthy()
      expect(historyEntry.cupChampionId).toBeTruthy()
      champions.push(historyEntry.leagueChampionId!)
      cupChampions.push(historyEntry.cupChampionId!)
      const userPosition = standings.findIndex(row => row.id === userClubId) + 1
      const userStanding = standings.find(row => row.id === userClubId)!
      const managerPerformance = {
        position: userPosition,
        points: userStanding.points,
        wins: userStanding.wins,
        draws: userStanding.draws,
        losses: userStanding.losses,
        clubReputation: leagueClubs[0].reputation,
        leagueTitle: userPosition === 1,
        cupTitle: historyEntry.cupChampionId === userClubId,
        boardConfidence: 90,
        fanSatisfaction: 90,
      }
      const score = managerPerformanceScore(managerPerformance)
      popularity = updateManagerPopularity(popularity, managerPerformance)
      expect(score).toBeGreaterThan(0)
      expect(popularity.regional).toBeGreaterThanOrEqual(0)
      expect(popularity.national).toBeGreaterThanOrEqual(0)
      expect(popularity.international).toBeGreaterThanOrEqual(0)
      expect(popularity.regional).toBeLessThanOrEqual(100)
      expect(popularity.national).toBeLessThanOrEqual(100)
      expect(popularity.international).toBeLessThanOrEqual(100)

      if (historyEntry.leagueChampionId === userClubId) managerTitles += 1
      if (historyEntry.cupChampionId === userClubId) managerTitles += 1

      const offers = buildManagerOfferCandidates(
        popularity,
        score,
        leagueClubs.map(item => ({
          id: item.id,
          name: item.name,
          reputation: item.reputation,
          budget: item.budget,
          strength: item.strength,
        })),
        userClubId,
        3,
      )
      totalManagerOffers += offers.length

      const ageBefore = players[0].age
      const budgetBefore = leagueClubs[0].budget

      const janFirst = simulateWorldDay(
        year + '-01-01',
        seasonId,
        leagueClubs,
        players,
        userClubId,
      )
      expect(leagueClubs[0].budget).toBeLessThan(budgetBefore)

      simulateWorldDay(
        year + '-01-10',
        seasonId,
        leagueClubs,
        players,
        userClubId,
        {},
        janFirst.marketInterest,
        janFirst.loans,
        janFirst.aiManagers,
      )
      expect(players[0].age).toBe(ageBefore + 1)

      const januaryWindow = simulateWorldDay(
        year + '-01-20',
        seasonId,
        leagueClubs,
        players,
        userClubId,
        {},
        janFirst.marketInterest,
        janFirst.loans,
        janFirst.aiManagers,
      )

      const januaryFreeAgents = simulateWorldDay(
        year + '-01-25',
        seasonId,
        leagueClubs,
        players,
        userClubId,
        {},
        januaryWindow.marketInterest,
        januaryWindow.loans,
        januaryWindow.aiManagers,
      )

      const february = simulateWorldDay(
        year + '-02-20',
        seasonId,
        leagueClubs,
        players,
        userClubId,
        {},
        januaryFreeAgents.marketInterest,
        januaryFreeAgents.loans,
        januaryFreeAgents.aiManagers,
      )
      totalTransfers += januaryWindow.transfers.length + januaryWindow.freeAgentSignings.length
      totalTransfers += januaryFreeAgents.transfers.length + januaryFreeAgents.freeAgentSignings.length
      totalTransfers += february.transfers.length + february.freeAgentSignings.length
      totalAIManagers += januaryWindow.aiManagers.length + januaryFreeAgents.aiManagers.length + february.aiManagers.length
      totalNegotiations += januaryWindow.negotiationEvents.length + januaryFreeAgents.negotiationEvents.length + february.negotiationEvents.length

      managerSeasons += 1
      history.push({
        final_position: userPosition,
        points: managerPerformance.points,
        wins: managerPerformance.wins,
      })

      previousBudget = leagueClubs[0].budget
      expect(previousBudget).toBeGreaterThanOrEqual(0)
      expect(managerSeasons).toBe(year - 2025)
    }

    const records = buildManagerRecords({ history, trophies: managerTitles })

    expect(champions).toHaveLength(5)
    expect(cupChampions).toHaveLength(5)
    expect(history).toHaveLength(5)
    expect(records.bestFinish).toBeGreaterThanOrEqual(1)
    expect(records.bestFinish).toBeLessThanOrEqual(16)
    expect(records.mostPoints).toBeGreaterThan(0)
    expect(records.mostWins).toBeGreaterThan(0)
    expect(records.titles).toBe(managerTitles)
    expect(managerTitles).toBeGreaterThanOrEqual(0)
    expect(popularity.regional).toBeGreaterThanOrEqual(initialPopularity.regional - 10)
    expect(popularity.national).toBeGreaterThanOrEqual(initialPopularity.national - 10)
    expect(totalAIManagers).toBeGreaterThan(0)
    expect(totalTransfers + totalNegotiations).toBeGreaterThan(0)
    expect(totalManagerOffers).toBeGreaterThan(0)
    expect(popularity.regional).toBeGreaterThan(popularity.national)
    expect(popularity.international).toBeGreaterThanOrEqual(0)

    console.log('\\n=== MULTI-SEASON SIMULATION 2026-2030 ===')
    console.log(JSON.stringify({
      seasons: seasons.length,
      years: seasons,
      historicalLeagueChampions: champions,
      historicalCupChampions: cupChampions,
      managerSeasons,
      managerPopularity: popularity,
      initialManagerPopularity: initialPopularity,
      managerTitles,
      managerRecords: records,
      aiManagersProcessed: totalAIManagers,
      aiTransfers: totalTransfers,
      aiNegotiations: totalNegotiations,
      managerOffers: totalManagerOffers,
      finalBudget: previousBudget,
    }, null, 2))
    console.log('RESULTADO: PASS')
  })
})
