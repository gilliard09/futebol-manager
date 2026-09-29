import type { Player } from '../types/game'

export const MIN_SQUAD_SIZE = 16
export const MAX_SQUAD_SIZE = 25
export const LOW_MORALE_THRESHOLD = 40

export type SquadAlertKind = 'full' | 'short' | 'morale' | 'contracts' | 'budget'

export type SquadAlert = {
  kind: SquadAlertKind
  severity: 'warning' | 'critical'
  title: string
  description: string
  playerIds?: string[]
}

export function canAddPlayer(currentSize: number, amount = 1) {
  return currentSize + amount <= MAX_SQUAD_SIZE
}

export function canReleasePlayer(currentSize: number, amount = 1) {
  return currentSize - amount >= MIN_SQUAD_SIZE
}

export function getLowMoralePlayers(players: Player[]) {
  return players.filter(player => player.morale <= LOW_MORALE_THRESHOLD)
}

export function getSquadAlerts(players: Player[], contractAttentionCount: number, budget: number, monthlyPayroll: number): SquadAlert[] {
  const alerts: SquadAlert[] = []
  if (players.length >= MAX_SQUAD_SIZE) alerts.push({ kind: 'full', severity: 'critical', title: 'Elenco cheio', description: `Você atingiu o limite de ${MAX_SQUAD_SIZE} jogadores. Para contratar, será preciso liberar espaço.` })
  else if (players.length >= MAX_SQUAD_SIZE - 2) alerts.push({ kind: 'full', severity: 'warning', title: 'Poucas vagas no elenco', description: `Restam ${MAX_SQUAD_SIZE - players.length} vagas antes do limite de ${MAX_SQUAD_SIZE}.` })
  if (players.length < MIN_SQUAD_SIZE) alerts.push({ kind: 'short', severity: 'critical', title: 'Elenco curto', description: `Seu elenco tem ${players.length} jogadores. O mínimo recomendado é ${MIN_SQUAD_SIZE}.` })
  const lowMorale = getLowMoralePlayers(players)
  if (lowMorale.length) alerts.push({ kind: 'morale', severity: 'warning', title: `${lowMorale.length} jogador${lowMorale.length === 1 ? '' : 'es'} com moral baixa`, description: 'Jogadores com moral baixa podem precisar de atenção antes das próximas partidas.', playerIds: lowMorale.map(player => player.id) })
  if (contractAttentionCount) alerts.push({ kind: 'contracts', severity: contractAttentionCount > 2 ? 'critical' : 'warning', title: `${contractAttentionCount} contrato${contractAttentionCount === 1 ? '' : 's'} exige atenção`, description: 'Renove, venda ou aceite o risco de perder esses jogadores.' })
  if (monthlyPayroll > 0 && budget < monthlyPayroll) alerts.push({ kind: 'budget', severity: 'warning', title: 'Folha acima do caixa disponível', description: 'O saldo atual não cobre uma folha mensal completa. Controle salários ou aumente as receitas.' })
  return alerts
}