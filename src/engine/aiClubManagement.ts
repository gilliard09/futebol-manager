import type { WorldClub, WorldClubPerformance } from './worldSimulation'

export type AIManagerStyle = 'ambitious' | 'balanced' | 'youth' | 'defensive' | 'development'

export type AIClubManager = {
  clubId: string
  name: string
  style: AIManagerStyle
  confidence: number
  contractEndSeason: string
  seasonsAtClub: number
}

export type AIBoardDecision = {
  clubId: string
  action: 'hire_manager' | 'dismiss_manager' | 'renew_manager' | 'change_strategy' | 'financial_control' | 'sporting_investment'
  message: string
}

export type AIClubManagementResult = {
  managers: AIClubManager[]
  decisions: AIBoardDecision[]
}

const firstNames = ['André', 'Bruno', 'Carlos', 'Daniel', 'Eduardo', 'Fábio', 'Henrique', 'Marcelo', 'Paulo', 'Ricardo', 'Rodrigo', 'Victor']
const lastNames = ['Alves', 'Barros', 'Campos', 'Dias', 'Freitas', 'Moura', 'Nogueira', 'Ramos', 'Rezende', 'Santos', 'Teixeira', 'Vieira']
const styles: AIManagerStyle[] = ['ambitious', 'balanced', 'youth', 'defensive', 'development']

function hash(input: string) {
  let value = 2166136261
  for (const char of input) {
    value ^= char.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function seasonYear(seasonName: string) {
  return Number(seasonName.match(/\d{4}/)?.[0] ?? new Date().getFullYear())
}

function seasonName(year: number) {
  return 'Temporada ' + year
}

export function createAIManager(club: WorldClub, currentSeasonName: string): AIClubManager {
  const style = styles[hash('manager:style:' + club.id) % styles.length]
  const first = firstNames[hash('manager:first:' + club.id) % firstNames.length]
  const last = lastNames[hash('manager:last:' + club.id) % lastNames.length]
  return { clubId: club.id, name: first + ' ' + last, style, confidence: 62, contractEndSeason: seasonName(seasonYear(currentSeasonName) + 1), seasonsAtClub: 0 }
}

function preferredStyle(club: WorldClub, performance?: WorldClubPerformance): AIManagerStyle {
  if (club.budget < 600_000) return 'development'
  if (performance && performance.position <= 4 && club.strength >= 70) return 'ambitious'
  if (performance && performance.position >= 13) return club.strength >= 65 ? 'defensive' : 'youth'
  if (club.reputation >= 75) return 'ambitious'
  return 'balanced'
}

function replacementManager(club: WorldClub, currentSeasonName: string, style: AIManagerStyle, seed: string): AIClubManager {
  return {
    clubId: club.id,
    name: firstNames[hash(seed + ':first:' + club.id) % firstNames.length] + ' ' + lastNames[hash(seed + ':last:' + club.id) % lastNames.length],
    style,
    confidence: 55,
    contractEndSeason: seasonName(seasonYear(currentSeasonName) + 1),
    seasonsAtClub: 0,
  }
}

export function simulateAIClubManagement(
  date: string,
  currentSeasonName: string,
  clubs: WorldClub[],
  performanceByClub: Record<string, WorldClubPerformance>,
  previousManagers: AIClubManager[] = [],
): AIClubManagementResult {
  const byId = new Map(previousManagers.map(manager => [manager.clubId, manager]))
  const managers: AIClubManager[] = []
  const decisions: AIBoardDecision[] = []
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  const endOfSeason = month === 12 && day >= 20
  const year = seasonYear(currentSeasonName)

  for (const club of clubs) {
    let manager = byId.get(club.id)
    if (!manager) {
      manager = createAIManager(club, currentSeasonName)
      decisions.push({ clubId: club.id, action: 'hire_manager', message: club.name + ' contratou ' + manager.name + ' para iniciar a temporada.' })
    }

    const performance = performanceByClub[club.id]
    const poor = Boolean(performance && performance.played >= 5 && performance.recentPoints <= 3)
    const excellent = Boolean(performance && performance.position <= 4 && performance.recentPoints >= 8)
    const financialPressure = club.budget < 500_000
    const targetStyle = preferredStyle(club, performance)

    if (performance && (day === 1 || day === 15)) {
      manager.confidence = Math.max(0, Math.min(100, manager.confidence + (excellent ? 4 : poor ? -7 : financialPressure ? -3 : 1)))
    }

    const shouldDismiss = !endOfSeason && performance !== undefined && performance.played >= 10 && manager.confidence <= 18 && poor
    const seasonDismissal = endOfSeason && performance !== undefined && performance.played >= 20 && manager.confidence <= 25 && (poor || financialPressure)

    if (shouldDismiss || seasonDismissal) {
      decisions.push({ clubId: club.id, action: 'dismiss_manager', message: club.name + ' demitiu ' + manager.name + ' após avaliar o momento do clube.' })
      manager = replacementManager(club, currentSeasonName, targetStyle, date + ':dismissal')
      decisions.push({ clubId: club.id, action: 'hire_manager', message: club.name + ' contratou ' + manager.name + ' com perfil ' + manager.style + '.' })
    } else if (endOfSeason) {
      if (excellent && manager.confidence >= 65) {
        manager.contractEndSeason = seasonName(year + 2)
        manager.seasonsAtClub += 1
        decisions.push({ clubId: club.id, action: 'renew_manager', message: club.name + ' renovou com ' + manager.name + ' após uma boa temporada.' })
      } else if (poor && manager.confidence <= 35) {
        decisions.push({ clubId: club.id, action: 'dismiss_manager', message: club.name + ' encerrou o trabalho de ' + manager.name + ' ao fim da temporada.' })
        manager = replacementManager(club, currentSeasonName, targetStyle, date + ':endseason')
        decisions.push({ clubId: club.id, action: 'hire_manager', message: club.name + ' iniciou um novo ciclo com ' + manager.name + '.' })
      } else {
        manager.contractEndSeason = seasonName(year + 1)
        manager.seasonsAtClub += 1
      }
    }

    if (performance && (day === 1 || day === 15) && manager.style !== targetStyle && (poor || financialPressure)) {
      manager.style = targetStyle
      decisions.push({ clubId: club.id, action: 'change_strategy', message: club.name + ' mudou a estratégia para ' + targetStyle + ' após avaliar o desempenho.' })
    }

    if (financialPressure && (day === 1 || day === 15)) {
      decisions.push({ clubId: club.id, action: 'financial_control', message: club.name + ' entrou em modo de controle financeiro e passou a priorizar equilíbrio de caixa.' })
    } else if (excellent && club.budget > 2_000_000 && (day === 1 || day === 15)) {
      decisions.push({ clubId: club.id, action: 'sporting_investment', message: club.name + ' autorizou investimento esportivo após bons resultados.' })
    }

    managers.push({ ...manager })
  }

  return { managers, decisions }
}
