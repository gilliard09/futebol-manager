import type { StandingRow } from './competitions'

export type BrazilianClubForContinental = {
  id: string
  division: number
}

export type ContinentalQualification = {
  clubId: string
  competition: 'libertadores' | 'sudamericana'
  source: 'league' | 'copa' | 'continental_title'
  sourcePosition?: number
  targetStage: 'group_stage' | 'preliminary'
  slot: number
  note: string
}

export type BrazilianContinentalInput = {
  leagueStandings: StandingRow[]
  clubs: BrazilianClubForContinental[]
  copaChampionId?: string | null
  previousLibertadoresChampionId?: string | null
  previousSudamericanaChampionId?: string | null
}

function eligibleSerieA(clubs: BrazilianClubForContinental[]) {
  return new Set(clubs.filter(club => club.division === 1).map(club => club.id))
}

function pickNext(
  standings: StandingRow[],
  used: Set<string>,
  eligible: Set<string>,
  startPosition: number,
) {
  for (let index = Math.max(0, startPosition - 1); index < standings.length; index++) {
    const row = standings[index]
    if (eligible.has(row.id) && !used.has(row.id)) return row
  }
  return null
}

/**
 * Resolve as vagas brasileiras para a temporada seguinte.
 *
 * Regra do jogo:
 * - Libertadores: 5 vagas via Brasil. 1º-4º pela liga + campeão da Copa.
 * - Se o campeão da Copa já estiver entre os quatro primeiros, a vaga da
 *   Copa roda para o próximo elegível da liga, mantendo cinco brasileiros.
 * - Rebaixados/Série B nunca entram.
 * - Sul-Americana: 6º-11º, preenchendo para baixo quando houver acúmulo
 *   com Libertadores ou inelegibilidade.
 * - Campeões continentais anteriores têm vaga continental própria. Se já
 *   estiverem classificados pela liga, a vaga nacional é liberada para o
 *   próximo clube elegível.
 *
 * A posição do vice da Copa não cria uma vaga adicional: a única vaga
 * nacional da Copa é a do campeão.
 */
export function resolveBrazilianContinentalQualifications(input: BrazilianContinentalInput): ContinentalQualification[] {
  const eligible = eligibleSerieA(input.clubs)
  const result: ContinentalQualification[] = []
  const libUsed = new Set<string>()

  const addLib = (clubId: string, source: ContinentalQualification['source'], slot: number, note: string, sourcePosition?: number) => {
    if (!eligible.has(clubId) || libUsed.has(clubId)) return false
    libUsed.add(clubId)
    result.push({ clubId, competition: 'libertadores', source, sourcePosition, targetStage: 'group_stage', slot, note })
    return true
  }

  // Título continental anterior ocupa uma vaga própria. Quando o campeão
  // também se classifica pela liga, a vaga da liga é redistribuída abaixo.
  if (input.previousLibertadoresChampionId) {
    addLib(input.previousLibertadoresChampionId, 'continental_title', 0, 'Campeão vigente da Libertadores')
  }
  if (input.previousSudamericanaChampionId) {
    addLib(input.previousSudamericanaChampionId, 'continental_title', 0, 'Campeão vigente da Sul-Americana')
  }

  for (let position = 1; position <= 4; position++) {
    const row = input.leagueStandings[position - 1]
    if (row) addLib(row.id, 'league', position, 'Classificação pelo Campeonato Brasileiro', position)
  }

  if (input.copaChampionId) {
    addLib(input.copaChampionId, 'copa', 0, 'Campeão da Copa Nacional do Brasil')
  }

  let nextLeaguePosition = 5
  while (libUsed.size < 5) {
    const row = pickNext(input.leagueStandings, libUsed, eligible, nextLeaguePosition)
    if (!row) break
    addLib(row.id, 'league', row.id === input.leagueStandings[4]?.id ? 5 : 0, 'Vaga repassada por acúmulo ou inelegibilidade', row.id === input.leagueStandings[4]?.id ? 5 : undefined)
    nextLeaguePosition = input.leagueStandings.findIndex(item => item.id === row.id) + 2
  }

  const sulaUsed = new Set(libUsed)
  const addSula = (row: StandingRow) => {
    if (!eligible.has(row.id) || sulaUsed.has(row.id)) return false
    sulaUsed.add(row.id)
    result.push({
      clubId: row.id,
      competition: 'sudamericana',
      source: 'league',
      sourcePosition: row === input.leagueStandings.find(item => item.id === row.id) ? input.leagueStandings.findIndex(item => item.id === row.id) + 1 : undefined,
      targetStage: 'group_stage',
      slot: result.filter(item => item.competition === 'sudamericana').length + 1,
      note: 'Classificação pelo Campeonato Brasileiro; vaga preenchida para baixo em caso de acúmulo',
    })
    return true
  }

  for (let position = 6; position <= 11; position++) {
    const row = input.leagueStandings[position - 1]
    if (row) addSula(row)
  }

  let cursor = 12
  while (result.filter(item => item.competition === 'sudamericana').length < 6) {
    const row = pickNext(input.leagueStandings, sulaUsed, eligible, cursor)
    if (!row) break
    addSula(row)
    cursor = input.leagueStandings.findIndex(item => item.id === row.id) + 2
  }

  return result
}

export function continentalQualificationIds(result: ContinentalQualification[], competition: ContinentalQualification['competition']) {
  return result.filter(item => item.competition === competition).map(item => item.clubId)
}
