import type { Club, Player } from '../types/game'

export type TransferKind = 'purchase' | 'sale'

export type TransferRecord = {
  id: string
  date: string
  playerId: string
  playerName: string
  fromClubId: string
  toClubId: string
  fee: number
  kind: TransferKind
}

export type TransferState = {
  playerClubOverrides: Record<string, string>
  records: TransferRecord[]
}

export const EMPTY_TRANSFER_STATE: TransferState = {
  playerClubOverrides: {},
  records: [],
}

export function getCurrentClubId(baseClubId: string, playerId: string, state: TransferState) {
  return state.playerClubOverrides[playerId] ?? baseClubId
}

export function calculateAskingPrice(player: Player, marketValue: number) {
  const value = Math.max(0, marketValue)
  const ageFactor = player.age <= 21 ? 1.12 : player.age >= 31 ? 0.9 : 1
  const potentialFactor = 1 + Math.max(0, player.potential - 70) * 0.004
  const formFactor = 1 + (player.form - 50) * 0.002
  return Math.max(100000, Math.round((value * ageFactor * potentialFactor * formFactor) / 10000) * 10000)
}

export function calculateMinimumOffer(askingPrice: number) {
  return Math.max(0, Math.round(askingPrice * 0.9 / 10000) * 10000)
}

export function negotiateTransfer(askingPrice: number, offer: number, personality?: string) {
  const asking = Math.max(0, askingPrice)
  const proposed = Math.max(0, offer)
  const baseMinimum = calculateMinimumOffer(asking)
  const minimum = personality === 'negotiator' ? Math.max(0, Math.round(baseMinimum * 0.94 / 10000) * 10000) : baseMinimum
  return {
    accepted: proposed >= minimum,
    minimum,
    counterOffer: Math.max(minimum, Math.round(asking * 0.97 / 10000) * 10000),
  }
}

export function canCompleteTransfer(club: Club, fee: number) {
  return fee >= 0 && fee <= club.budget
}

export function createTransferRecord(
  date: string,
  player: Player,
  fromClubId: string,
  toClubId: string,
  fee: number,
  kind: TransferKind,
  id = crypto.randomUUID(),
): TransferRecord {
  return {
    id,
    date,
    playerId: player.id,
    playerName: `${player.first_name} ${player.last_name}`,
    fromClubId,
    toClubId,
    fee: Math.max(0, fee),
    kind,
  }
}

export function applyTransfer(
  state: TransferState,
  record: TransferRecord,
): TransferState {
  return {
    playerClubOverrides: {
      ...state.playerClubOverrides,
      [record.playerId]: record.toClubId,
    },
    records: [...state.records, record],
  }
}
