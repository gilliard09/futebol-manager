import type { StandingRow } from './competitions'
import type { Club } from '../types/game'

export type ContinentalQualification = {
  clubId: string
  competition: 'libertadores' | 'sudamericana'
  targetStage: 'group_stage'
  source: 'league' | 'copa' | 'continental_title'
  sourcePosition?: number
  slot: number
  note: string
}

export type BrazilianContinentalInput = {
  leagueStandings: StandingRow[]
  clubs: Pick<Club, 'id' | 'division'>[]
  copaChampionId?: string | null
  previousLibertadoresChampionId?: string | null
  previousSudamericanaChampionId?: string | null
}

function eligibleSerieA(clubs: Pick<Club, 'id' | 'division'>[]) {
  return new Set(clubs.filter(club => Number(club.division ?? 1) === 1).map(club => club.id))
}

function pickNext(standings: StandingRow[], used: Set<string>, eligible: Set<string>, startPosition: number) {
  for (let index = Math.max(0, startPosition - 1); index < standings.length; index++) {
    const row = standings[index]
    if (eligible.has(row.id) && !used.has(row.id)) return row
  }
  return null
}

export function resolveBrazilianContinentalQualifications(input: BrazilianContinentalInput): ContinentalQualification[] {
  const eligible = eligibleSerieA(input.clubs)
  const result: ContinentalQualification[] = []

  const libIds = new Set<string>()
  const addLib = (clubId: string, source: ContinentalQualification['source'], slot: number, note: string, sourcePosition?: number) => {
    if (!eligible.has(clubId) || libIds.has(clubId)) return false
    libIds.add(clubId)
    result.push({ clubId, competition: 'libertadores', source, sourcePosition, targetStage: 'group_stage', slot, note })
    return true
  }

  for (let position = 1; position <= 4; position++) {
    const row = input.leagueStandings[position - 1]
    if (row) addLib(row.id, 'league', position, `Classificação pela Liga Nacional: ${position}º lugar.`, position)
  }

  if (input.copaChampionId) {
    addLib(input.copaChampionId, 'copa', 5, 'Classificação pelo título da Copa Nacional do Brasil.')
  }

  let cursor = 5
  while (libIds.size < 5) {
    const row = pickNext(input.leagueStandings, libIds, eligible, cursor)
    if (!row) break
    const position = input.leagueStandings.findIndex(item => item.id === row.id) + 1
    addLib(row.id, 'league', position, `Vaga da Libertadores redistribuída pela Liga: ${position}º lugar.`, position)
    cursor = position + 1
  }

  // O campeão da Libertadores defende o título na própria Libertadores.
  // O campeão da Sul-Americana mantém sua vaga na Sul-Americana. Nenhum dos
  // dois consome uma das vagas nacionais se já estiver classificado.
  if (input.previousLibertadoresChampionId && eligible.has(input.previousLibertadoresChampionId) && !libIds.has(input.previousLibertadoresChampionId)) {
    addLib(
      input.previousLibertadoresChampionId,
      'continental_title',
      libIds.size + 1,
      'Campeão vigente da Libertadores.',
    )
  }

  const sulaIds = new Set<string>()
  const addSula = (clubId: string, source: ContinentalQualification['source'], slot: number, note: string, sourcePosition?: number) => {
    if (!eligible.has(clubId) || sulaIds.has(clubId) || libIds.has(clubId)) return false
    sulaIds.add(clubId)
    result.push({ clubId, competition: 'sudamericana', source, sourcePosition, targetStage: 'group_stage', slot, note })
    return true
  }

  if (input.previousSudamericanaChampionId && eligible.has(input.previousSudamericanaChampionId)) {
    addSula(
      input.previousSudamericanaChampionId,
      'continental_title',
      1,
      'Campeão vigente da Sul-Americana.',
    )
  }

  for (let position = 6; position <= 11 && sulaIds.size < 6; position++) {
    const row = input.leagueStandings[position - 1]
    if (row) {
      addSula(
        row.id,
        'league',
        sulaIds.size + 1,
        `Classificação pela Liga Nacional: ${position}º lugar.`,
        position,
      )
    }
  }

  cursor = 12
  while (sulaIds.size < 6) {
    const row = pickNext(input.leagueStandings, new Set([...libIds, ...sulaIds]), eligible, cursor)
    if (!row) break
    const position = input.leagueStandings.findIndex(item => item.id === row.id) + 1
    addSula(
      row.id,
      'league',
      sulaIds.size + 1,
      `Vaga da Sul-Americana redistribuída pela Liga: ${position}º lugar.`,
      position,
    )
    cursor = position + 1
  }

  return result
}

export function continentalQualificationIds(
  result: ContinentalQualification[],
  competition: ContinentalQualification['competition'],
) {
  return result.filter(item => item.competition === competition).map(item => item.clubId)
}

export type ContinentalField = {
  competition: 'libertadores' | 'sudamericana'
  clubs: Club[]
  groups: Club[][]
}

function clubRank(a: Club, b: Club) {
  return Number(b.strength ?? b.reputation ?? 0) - Number(a.strength ?? a.reputation ?? 0)
    || Number(b.reputation ?? 0) - Number(a.reputation ?? 0)
    || a.name.localeCompare(b.name)
}

export function selectForeignContinentalClubs(
  allClubs: Club[],
  excludedClubIds: Set<string>,
  count: number,
) {
  return allClubs
    .filter(club => club.country !== 'Brasil' && !excludedClubIds.has(club.id))
    .sort(clubRank)
    .slice(0, count)
}

function drawGroups(clubs: Club[]) {
  const ordered = [...clubs].sort(clubRank)
  const pots = Array.from({ length: 4 }, (_, index) => ordered.slice(index * 8, index * 8 + 8))
  const groups: Club[][] = Array.from({ length: 8 }, () => [])

  function placePot(potIndex: number): boolean {
    if (potIndex === pots.length) return true
    const pot = pots[potIndex]

    function placeClub(index: number, usedGroups: Set<number>): boolean {
      if (index === pot.length) return placePot(potIndex + 1)
      const club = pot[index]
      const candidates = groups
        .map((group, groupIndex) => ({ group, groupIndex }))
        .filter(({ groupIndex }) => !usedGroups.has(groupIndex))
        .filter(({ group }) => !group.some(item => item.country === club.country))
        .sort((a, b) => a.group.length - b.group.length || a.groupIndex - b.groupIndex)

      for (const candidate of candidates) {
        candidate.group.push(club)
        usedGroups.add(candidate.groupIndex)
        if (placeClub(index + 1, usedGroups)) return true
        usedGroups.delete(candidate.groupIndex)
        candidate.group.pop()
      }
      return false
    }

    return placeClub(0, new Set())
  }

  if (!placePot(0)) throw new Error('Não foi possível montar os grupos continentais sem repetir país.')
  return groups
}

export function buildContinentalGroups(
  competition: ContinentalField['competition'],
  clubs: Club[],
): ContinentalField {
  if (clubs.length !== 32) {
    throw new Error(`${competition} precisa de exatamente 32 clubes; recebeu ${clubs.length}.`)
  }
  return { competition, clubs: [...clubs], groups: drawGroups(clubs) }
}

export type ContinentalFixture = {
  competitionId: string
  seasonId: string
  round: number
  homeClubId: string
  awayClubId: string
  scheduledAt: string
  stage: 'group_stage'
}

export function buildContinentalGroupFixtures(
  seasonId: string,
  competitionId: string,
  groups: Club[][],
  seasonYear: number,
): ContinentalFixture[] {
  const dates = [
    `${seasonYear}-04-07T19:00:00.000Z`,
    `${seasonYear}-04-14T19:00:00.000Z`,
    `${seasonYear}-04-28T19:00:00.000Z`,
    `${seasonYear}-05-05T19:00:00.000Z`,
    `${seasonYear}-05-19T19:00:00.000Z`,
    `${seasonYear}-05-26T19:00:00.000Z`,
  ]
  const fixtures: ContinentalFixture[] = []

  groups.forEach(group => {
    const [a, b, c, d] = group
    const rounds = [
      [[d, b], [c, a]],
      [[b, c], [a, d]],
      [[b, a], [d, c]],
      [[a, c], [b, d]],
      [[a, b], [c, d]],
      [[c, a], [d, b]],
    ]

    rounds.forEach((matches, roundIndex) => {
      for (const [home, away] of matches) {
        fixtures.push({
          competitionId,
          seasonId,
          round: roundIndex + 1,
          homeClubId: home.id,
          awayClubId: away.id,
          scheduledAt: dates[roundIndex],
          stage: 'group_stage',
        })
      }
    })
  })

  return fixtures
}
