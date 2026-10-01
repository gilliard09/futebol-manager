import type { StandingRow } from './competitions'

export type ContinentalQualification = {
  clubId: string
  competition: 'libertadores' | 'sudamericana'
  targetStage: 'group'
  source: 'league' | 'cup' | 'continental_holder'
  sourcePosition: number | null
  slotOrder: number
  notes: string
}

export type ContinentalQualificationInput = {
  leagueStandings: StandingRow[]
  cupChampionId?: string | null
  clubDivisions: Record<string, number>
  relegatedClubIds?: string[]
  libertadoresHolderId?: string | null
  sudamericanaHolderId?: string | null
}

function isEligibleBrazilianClub(
  clubId: string,
  clubDivisions: Record<string, number>,
  relegatedClubIds: Set<string>,
) {
  return clubDivisions[clubId] === 1 && !relegatedClubIds.has(clubId)
}

export function resolveBrazilianContinentalQualifications(
  input: ContinentalQualificationInput,
): ContinentalQualification[] {
  const relegated = new Set(input.relegatedClubIds ?? [])
  const standings = input.leagueStandings
  const result: ContinentalQualification[] = []
  const assigned = new Set<string>()

  const add = (
    clubId: string,
    competition: ContinentalQualification['competition'],
    source: ContinentalQualification['source'],
    sourcePosition: number | null,
    slotOrder: number,
    notes: string,
  ) => {
    if (assigned.has(clubId)) return false
    assigned.add(clubId)
    result.push({
      clubId,
      competition,
      targetStage: 'group',
      source,
      sourcePosition,
      slotOrder,
      notes,
    })
    return true
  }

  let libertadoresSlot = 1

  if (input.libertadoresHolderId && isEligibleBrazilianClub(input.libertadoresHolderId, input.clubDivisions, relegated)) {
    add(
      input.libertadoresHolderId,
      'libertadores',
      'continental_holder',
      null,
      libertadoresSlot++,
      'Vaga extra pelo título da Libertadores da temporada anterior.',
    )
  }

  const topFour = standings.slice(0, 4)
  for (const [index, team] of topFour.entries()) {
    if (!isEligibleBrazilianClub(team.id, input.clubDivisions, relegated)) continue
    add(
      team.id,
      'libertadores',
      'league',
      index + 1,
      libertadoresSlot++,
      `Classificação pela Liga Nacional: ${index + 1}º lugar.`,
    )
  }

  if (
    input.cupChampionId &&
    isEligibleBrazilianClub(input.cupChampionId, input.clubDivisions, relegated) &&
    !assigned.has(input.cupChampionId)
  ) {
    add(
      input.cupChampionId,
      'libertadores',
      'cup',
      null,
      libertadoresSlot++,
      'Classificação pelo título da Copa Nacional do Brasil.',
    )
  }

  // A Libertadores precisa preservar as cinco vagas brasileiras de base.
  // Se o campeão da Copa já estiver no G4, ou estiver inelegível, a vaga
  // correspondente é preenchida pelo próximo clube elegível da Liga.
  while (result.filter(item => item.competition === 'libertadores').length < 5) {
    const next = standings.find(
      team =>
        !assigned.has(team.id) &&
        isEligibleBrazilianClub(team.id, input.clubDivisions, relegated),
    )
    if (!next) break

    const position = standings.findIndex(team => team.id === next.id) + 1
    add(
      next.id,
      'libertadores',
      'league',
      position,
      libertadoresSlot++,
      `Vaga redistribuída pela Liga Nacional: ${position}º lugar.`,
    )
  }

  let sudamericanaSlot = 1

  if (input.sudamericanaHolderId && isEligibleBrazilianClub(input.sudamericanaHolderId, input.clubDivisions, relegated)) {
    add(
      input.sudamericanaHolderId,
      'sudamericana',
      'continental_holder',
      null,
      sudamericanaSlot++,
      'Vaga extra pelo título da Sul-Americana da temporada anterior.',
    )
  }

  // A base brasileira da Sul-Americana é formada por seis clubes.
  // Começamos no 6º colocado e descemos pela tabela sempre que uma vaga
  // precisar ser deslocada por duplicidade ou inelegibilidade.
  for (let index = 5; index < standings.length && result.filter(item => item.competition === 'sudamericana').length < 6; index++) {
    const team = standings[index]
    if (!isEligibleBrazilianClub(team.id, input.clubDivisions, relegated)) continue
    if (assigned.has(team.id)) continue

    add(
      team.id,
      'sudamericana',
      'league',
      index + 1,
      sudamericanaSlot++,
      `Classificação pela Liga Nacional: ${index + 1}º lugar.`,
    )
  }

  return result.sort(
    (a, b) =>
      a.competition.localeCompare(b.competition) ||
      a.slotOrder - b.slotOrder,
  )
}
