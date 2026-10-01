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

function pickNext(standings: StandingRow[], used: Set<string>, eligible: Set<string>, startPosition: number) {
  for (let index = Math.max(0, startPosition - 1); index < standings.length; index++) {
    const row = standings[index]
    if (eligible.has(row.id) && !used.has(row.id)) return row
  }
  return null
}

/**
 * Resolve as vagas brasileiras para a temporada seguinte.
 *
 * Base do jogo:
 * - Libertadores: 5 vagas nacionais, 1º-4º da Liga + campeão da Copa.
 * - Se o campeão da Copa já estiver entre os 4 primeiros, a vaga da Copa
 *   roda para o próximo clube elegível da Liga.
 * - Clubes da Série B/rebaixados nunca podem receber vaga brasileira.
 * - Sul-Americana: 6º-11º, com redistribuição para baixo em caso de acúmulo
 *   com a Libertadores ou inelegibilidade.
 * - Campeões continentais vigentes recebem uma vaga adicional se ainda não
 *   estiverem classificados por uma vaga nacional.
 *
 * A vaga do vice da Copa não é criada separadamente: o próprio jogo possui
 * uma única vaga nacional pela Copa, destinada ao campeão.
 */
export function resolveBrazilianContinentalQualifications(input: BrazilianContinentalInput): ContinentalQualification[] {
  const eligible = eligibleSerieA(input.clubs)
  const result: ContinentalQualification[] = []

  const libBase = new Set<string>()
  const addLibBase = (clubId: string, source: 'league' | 'copa', slot: number, note: string, sourcePosition?: number) => {
    if (!eligible.has(clubId) || libBase.has(clubId)) return false
    libBase.add(clubId)
    result.push({ clubId, competition: 'libertadores', source, sourcePosition, targetStage: 'group_stage', slot, note })
    return true
  }

  for (let position = 1; position <= 4; position++) {
    const row = input.leagueStandings[position - 1]
    if (row) addLibBase(row.id, 'league', position, 'Classificação pelo Campeonato Brasileiro', position)
  }

  if (input.copaChampionId) {
    addLibBase(input.copaChampionId, 'copa', 0, 'Campeão da Copa Nacional do Brasil')
  }

  // Completa as 5 vagas nacionais. Isso cobre tanto o caso em que o campeão
  // da Copa está no G-4 quanto qualquer clube inelegível/rebaixado.
  let cursor = 5
  while (libBase.size < 5) {
    const row = pickNext(input.leagueStandings, libBase, eligible, cursor)
    if (!row) break
    const position = input.leagueStandings.findIndex(item => item.id === row.id) + 1
    addLibBase(row.id, 'league', position, 'Vaga nacional repassada pela classificação da Liga', position)
    cursor = position + 1
  }

  // Os campeões vigentes não consomem uma das 5 vagas nacionais. Se o clube
  // já estiver entre os classificados, não duplicamos a vaga.
  const continentalChampions = [
    { id: input.previousLibertadoresChampionId, note: 'Campeão vigente da Libertadores' },
    { id: input.previousSudamericanaChampionId, note: 'Campeão vigente da Sul-Americana' },
  ]
  for (const champion of continentalChampions) {
    if (!champion.id || !eligible.has(champion.id) || libBase.has(champion.id)) continue
    result.push({
      clubId: champion.id,
      competition: 'libertadores',
      source: 'continental_title',
      targetStage: 'group_stage',
      slot: result.filter(item => item.competition === 'libertadores').length + 1,
      note: champion.note,
    })
  }

  const libIds = new Set(result.filter(item => item.competition === 'libertadores').map(item => item.clubId))
  const sulaIds = new Set<string>()

  const addSula = (row: StandingRow) => {
    if (!eligible.has(row.id) || libIds.has(row.id) || sulaIds.has(row.id)) return false
    sulaIds.add(row.id)
    result.push({
      clubId: row.id,
      competition: 'sudamericana',
      source: 'league',
      sourcePosition: input.leagueStandings.findIndex(item => item.id === row.id) + 1,
      targetStage: 'group_stage',
      slot: sulaIds.size,
      note: 'Classificação pelo Campeonato Brasileiro; vaga preenchida para baixo em caso de acúmulo',
    })
    return true
  }

  for (let position = 6; position <= 11; position++) {
    const row = input.leagueStandings[position - 1]
    if (row) addSula(row)
  }

  cursor = 12
  while (sulaIds.size < 6) {
    const row = pickNext(input.leagueStandings, new Set([...libIds, ...sulaIds]), eligible, cursor)
    if (!row) break
    addSula(row)
    cursor = input.leagueStandings.findIndex(item => item.id === row.id) + 2
  }

  return result
}

export function continentalQualificationIds(result: ContinentalQualification[], competition: ContinentalQualification['competition']) {
  return result.filter(item => item.competition === competition).map(item => item.clubId)
}
