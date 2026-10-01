import type { Club } from '../types/game'
import type { StandingRow } from './competitions'

export const SERIE_B_NAME = 'Série B do Brasil'

export type SerieBClubSeed = {
  name: string
  shortName: string
  city: string
  state: string
  stadium: string
  capacity: number
  reputation: number
  strength: number
  budget: number
}

export const SERIE_B_2026_CLUBS: SerieBClubSeed[] = [
  { name: 'América-MG', shortName: 'América-MG', city: 'Belo Horizonte', state: 'MG', stadium: 'Independência', capacity: 23018, reputation: 67, strength: 67, budget: 28000000 },
  { name: 'Athletic Club', shortName: 'Athletic', city: 'São João del-Rei', state: 'MG', stadium: 'Arena Sicredi', capacity: 12000, reputation: 55, strength: 57, budget: 12000000 },
  { name: 'Atlético-GO', shortName: 'Atlético-GO', city: 'Goiânia', state: 'GO', stadium: 'Antônio Accioly', capacity: 12500, reputation: 66, strength: 66, budget: 26000000 },
  { name: 'Avaí', shortName: 'Avaí', city: 'Florianópolis', state: 'SC', stadium: 'Ressacada', capacity: 17800, reputation: 64, strength: 63, budget: 22000000 },
  { name: 'Botafogo-SP', shortName: 'Botafogo-SP', city: 'Ribeirão Preto', state: 'SP', stadium: 'Santa Cruz', capacity: 29292, reputation: 58, strength: 58, budget: 14000000 },
  { name: 'Ceará', shortName: 'Ceará', city: 'Fortaleza', state: 'CE', stadium: 'Arena Castelão', capacity: 63903, reputation: 72, strength: 73, budget: 42000000 },
  { name: 'CRB', shortName: 'CRB', city: 'Maceió', state: 'AL', stadium: 'Rei Pelé', capacity: 20000, reputation: 58, strength: 60, budget: 13000000 },
  { name: 'Criciúma', shortName: 'Criciúma', city: 'Criciúma', state: 'SC', stadium: 'Heriberto Hülse', capacity: 19300, reputation: 66, strength: 66, budget: 23000000 },
  { name: 'Cuiabá', shortName: 'Cuiabá', city: 'Cuiabá', state: 'MT', stadium: 'Arena Pantanal', capacity: 42968, reputation: 70, strength: 70, budget: 35000000 },
  { name: 'Fortaleza', shortName: 'Fortaleza', city: 'Fortaleza', state: 'CE', stadium: 'Arena Castelão', capacity: 63903, reputation: 78, strength: 78, budget: 50000000 },
  { name: 'Goiás', shortName: 'Goiás', city: 'Goiânia', state: 'GO', stadium: 'Hailé Pinheiro', capacity: 13200, reputation: 72, strength: 71, budget: 30000000 },
  { name: 'Juventude', shortName: 'Juventude', city: 'Caxias do Sul', state: 'RS', stadium: 'Alfredo Jaconi', capacity: 19924, reputation: 68, strength: 67, budget: 27000000 },
  { name: 'Londrina', shortName: 'Londrina', city: 'Londrina', state: 'PR', stadium: 'Vitorino Gonçalves Dias', capacity: 10500, reputation: 56, strength: 57, budget: 11000000 },
  { name: 'Náutico', shortName: 'Náutico', city: 'Recife', state: 'PE', stadium: 'Aflitos', capacity: 22000, reputation: 63, strength: 62, budget: 18000000 },
  { name: 'Novorizontino', shortName: 'Novorizontino', city: 'Novo Horizonte', state: 'SP', stadium: 'Jorge Ismael de Biasi', capacity: 16800, reputation: 61, strength: 66, budget: 17000000 },
  { name: 'Operário-PR', shortName: 'Operário-PR', city: 'Ponta Grossa', state: 'PR', stadium: 'Germano Krüger', capacity: 10300, reputation: 61, strength: 62, budget: 15000000 },
  { name: 'Ponte Preta', shortName: 'Ponte Preta', city: 'Campinas', state: 'SP', stadium: 'Moisés Lucarelli', capacity: 17728, reputation: 68, strength: 65, budget: 21000000 },
  { name: 'São Bernardo FC', shortName: 'São Bernardo', city: 'São Bernardo do Campo', state: 'SP', stadium: 'Primeiro de Maio', capacity: 17000, reputation: 57, strength: 59, budget: 13000000 },
  { name: 'Sport', shortName: 'Sport', city: 'Recife', state: 'PE', stadium: 'Ilha do Retiro', capacity: 32000, reputation: 78, strength: 75, budget: 45000000 },
  { name: 'Vila Nova', shortName: 'Vila Nova', city: 'Goiânia', state: 'GO', stadium: 'Onésio Brasileiro Alvarenga', capacity: 11788, reputation: 64, strength: 65, budget: 20000000 },
]

export type SerieBPlayoff = { first: string; second: string; winner: string }

export type DivisionMovementResult = {
  promotedClubIds: string[]
  relegatedClubIds: string[]
  playoffWinners: string[]
  playoffs: SerieBPlayoff[]
}

export function resolveSerieBPromotion(
  standings: StandingRow[],
  strengthByClub: Record<string, number> = {},
): { promotedClubIds: string[]; playoffs: SerieBPlayoff[] } {
  if (standings.length < 6) return { promotedClubIds: [], playoffs: [] }
  const direct = standings.slice(0, 2).map(row => row.id)
  const pairs: Array<[StandingRow, StandingRow]> = [[standings[2], standings[5]], [standings[3], standings[4]]]
  const playoffs = pairs.map(([higher, lower]) => {
    const higherStrength = Number(strengthByClub[higher.id] ?? 50) + 6
    const lowerStrength = Number(strengthByClub[lower.id] ?? 50)
    const winner = higherStrength >= lowerStrength ? higher.id : lower.id
    return { first: higher.id, second: lower.id, winner }
  })
  return { promotedClubIds: [...direct, ...playoffs.map(item => item.winner)], playoffs }
}

export function resolveDivisionMovement(
  topDivision: StandingRow[],
  secondDivision: StandingRow[],
  strengthByClub: Record<string, number> = {},
): DivisionMovementResult {
  return {
    promotedClubIds: resolveSerieBPromotion(secondDivision, strengthByClub).promotedClubIds,
    relegatedClubIds: topDivision.slice(-4).map(row => row.id),
    playoffWinners: resolveSerieBPromotion(secondDivision, strengthByClub).playoffs.map(item => item.winner),
    playoffs: resolveSerieBPromotion(secondDivision, strengthByClub).playoffs,
  }
}

export function swapDivisions(clubs: Club[], promotedClubIds: string[], relegatedClubIds: string[]) {
  const promoted = new Set(promotedClubIds)
  const relegated = new Set(relegatedClubIds)
  return clubs.map(club => {
    if (promoted.has(club.id)) return { ...club, division: 1 }
    if (relegated.has(club.id)) return { ...club, division: 2 }
    return club
  })
}

export function getDivisionClubIds(clubs: Club[], division: number) {
  return clubs.filter(club => Number(club.division ?? 1) === division).map(club => club.id)
}

export function getHistoricalPosition(standings: StandingRow[], clubId: string) {
  const index = standings.findIndex(row => row.id === clubId)
  return index >= 0 ? index + 1 : null
}
