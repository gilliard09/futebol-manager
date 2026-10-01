import type { Club } from '../types/game'

export type SeasonFixtureInsert = {
  season_id: string
  competition_id: string
  round: number
  scheduled_at: string
  status: 'scheduled'
  home_club_id: string
  away_club_id: string
  home_score: null
  away_score: null
  winner_club_id: null
}

function dateAt(start: string, days: number, hour = 19) {
  const date = new Date(start + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(hour, 0, 0, 0)
  return date.toISOString()
}

function roundRobin(clubs: Club[]) {
  const ordered = [...clubs].sort((a, b) => a.id.localeCompare(b.id))
  if (ordered.length % 2 !== 0) return []
  const rotation = [...ordered]
  const rounds: Array<Array<[Club, Club]>> = []
  const half = rotation.length / 2

  for (let round = 0; round < rotation.length - 1; round++) {
    const pairings: Array<[Club, Club]> = []
    for (let i = 0; i < half; i++) {
      const left = rotation[i]
      const right = rotation[rotation.length - 1 - i]
      pairings.push(round % 2 === 0 ? [left, right] : [right, left])
    }
    rounds.push(pairings)

    const fixed = rotation[0]
    const rest = rotation.slice(1)
    rest.unshift(rest.pop()!)
    rotation.splice(0, rotation.length, fixed, ...rest)
  }

  return rounds
}

export function buildLeagueFixtures(seasonId: string, startDate: string, clubs: Club[], competitionId: string, daysPerRound = 7): SeasonFixtureInsert[] {
  const firstHalf = roundRobin(clubs)
  const rows: SeasonFixtureInsert[] = []

  firstHalf.forEach((pairings, roundIndex) => {
    pairings.forEach(([home, away], matchIndex) => {
      rows.push({
        season_id: seasonId,
        competition_id: competitionId,
        round: roundIndex + 1,
        scheduled_at: dateAt(startDate, roundIndex * daysPerRound, 19 + (matchIndex % 3)),
        status: 'scheduled',
        home_club_id: home.id,
        away_club_id: away.id,
        home_score: null,
        away_score: null,
        winner_club_id: null,
      })
    })
  })

  const secondHalfStartRound = firstHalf.length + 1
  firstHalf.forEach((pairings, roundIndex) => {
    pairings.forEach(([home, away], matchIndex) => {
      rows.push({
        season_id: seasonId,
        competition_id: competitionId,
        round: secondHalfStartRound + roundIndex,
        scheduled_at: dateAt(startDate, (roundIndex + firstHalf.length) * daysPerRound, 19 + (matchIndex % 3)),
        status: 'scheduled',
        home_club_id: away.id,
        away_club_id: home.id,
        home_score: null,
        away_score: null,
        winner_club_id: null,
      })
    })
  })

  return rows
}

export function buildCupFixtures(seasonId: string, startDate: string, clubs: Club[], competitionId: string): SeasonFixtureInsert[] {
  const ordered = [...clubs].sort((a, b) =>
    Number(b.strength ?? b.reputation ?? 50) - Number(a.strength ?? a.reputation ?? 50) ||
    a.name.localeCompare(b.name),
  )

  // Com 36 participantes, os 8 clubes de menor força disputam a fase
  // preliminar em jogo único. Os 4 vencedores se juntam aos outros 28
  // na segunda fase, totalizando 32 clubes.
  const preliminary = ordered.slice(-8)
  const rows: SeasonFixtureInsert[] = []

  for (let i = 0; i < preliminary.length / 2; i++) {
    const home = preliminary[i * 2]
    const away = preliminary[i * 2 + 1]
    rows.push({
      season_id: seasonId,
      competition_id: competitionId,
      round: 1,
      scheduled_at: dateAt(startDate, i % 2, 19),
      status: 'scheduled',
      home_club_id: home.id,
      away_club_id: away.id,
      home_score: null,
      away_score: null,
      winner_club_id: null,
    })
  }

  return rows
}
