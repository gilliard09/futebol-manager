import type { WorldClub, WorldPlayer, WorldSimulationResult } from './worldSimulation'

export type WorldNewsTone = 'positive' | 'neutral' | 'warning'

export type WorldNews = {
  id: string
  date: string
  title: string
  message: string
  tone: WorldNewsTone
}

export function buildWorldNews(
  result: WorldSimulationResult,
  clubs: WorldClub[],
  players: WorldPlayer[],
): WorldNews[] {
  const clubName = (id: string | null | undefined) =>
    clubs.find(club => club.id === id)?.name ?? 'Clube'

  const playerName = (id: string) => {
    const player = players.find(item => item.id === id)
    return player ? `${player.first_name} ${player.last_name}` : 'Jogador'
  }

  const news: WorldNews[] = []

  for (const transfer of result.transfers.slice(0, 3)) {
    const name = playerName(transfer.playerId)
    const destination = clubName(transfer.toClubId)
    const origin = transfer.fromClubId ? clubName(transfer.fromClubId) : 'mercado de jogadores livres'
    news.push({
      id: `transfer:${result.date}:${transfer.playerId}:${transfer.toClubId}`,
      date: result.date,
      title: 'Mercado em movimento',
      message: transfer.fee > 0
        ? `${destination} contratou ${name}, que deixou ${origin}, por R$ ${transfer.fee.toLocaleString('pt-BR')}.`
        : `${destination} contratou ${name} sem pagar taxa de transferência.`,
      tone: 'neutral',
    })
  }

  for (const renewal of result.renewals.slice(0, 2)) {
    if (!players.some(player => player.id === renewal.playerId)) continue
    news.push({
      id: `renewal:${result.date}:${renewal.playerId}`,
      date: result.date,
      title: 'Contrato renovado',
      message: `${clubName(renewal.clubId)} renovou com ${playerName(renewal.playerId)} até ${renewal.contractUntil}.`,
      tone: 'positive',
    })
  }

  for (const retirement of result.retirements.slice(0, 2)) {
    news.push({
      id: `retirement:${result.date}:${retirement.playerId}`,
      date: result.date,
      title: 'Fim de carreira',
      message: `${playerName(retirement.playerId)} decidiu encerrar a carreira no futebol profissional.`,
      tone: 'neutral',
    })
  }

  for (const expired of result.expiredContracts.slice(0, 2)) {
    news.push({
      id: `free:${result.date}:${expired.playerId}`,
      date: result.date,
      title: 'Jogador disponível no mercado',
      message: `${playerName(expired.playerId)} ficou sem clube após o fim do contrato com ${clubName(expired.clubId)}.`,
      tone: 'neutral',
    })
  }

  for (const prospect of result.youth.slice(0, 2)) {
    news.push({
      id: `youth:${result.date}:${prospect.firstName}:${prospect.lastName}:${prospect.clubId}`,
      date: result.date,
      title: 'Base revelou um novo talento',
      message: `${clubName(prospect.clubId)} promoveu ${prospect.firstName} ${prospect.lastName}, ${prospect.age} anos, ${prospect.position}, com potencial ${prospect.potential}.`,
      tone: 'positive',
    })
  }

  const evolved = result.evolvedPlayerIds
    .map(id => players.find(player => player.id === id))
    .filter((player): player is WorldPlayer => Boolean(player) && player.clubId !== '')
    .slice(0, 2)

  for (const player of evolved) {
    news.push({
      id: `development:${result.date}:${player.id}`,
      date: result.date,
      title: 'Jogador em evolução',
      message: `${playerName(player.id)} vem ganhando espaço e evoluindo no elenco do ${clubName(player.clubId)}.`,
      tone: 'positive',
    })
  }

  return news.slice(0, 6)
}
