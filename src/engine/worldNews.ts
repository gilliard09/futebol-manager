import { getSquadRole, playerOverall } from './match'
import type { WorldClub, WorldClubPerformance, WorldPlayer, WorldSimulationResult } from './worldSimulation'

export type WorldNewsTone = 'positive' | 'neutral' | 'warning'
export type WorldNewsCategory = 'match' | 'market' | 'squad' | 'academy' | 'career' | 'club'

export type WorldNews = {
  id: string
  date: string
  title: string
  message: string
  tone: WorldNewsTone
  category: WorldNewsCategory
  priority: number
}

export function buildWorldNews(
  result: WorldSimulationResult,
  clubs: WorldClub[],
  players: WorldPlayer[],
  performanceByClub: Record<string, WorldClubPerformance> = {},
  userClubId?: string,
): WorldNews[] {
  const clubName = (id: string | null | undefined) =>
    clubs.find(club => club.id === id)?.name ?? 'Clube'

  const playerById = new Map(players.map(player => [player.id, player]))
  const playerName = (id: string) => {
    const player = playerById.get(id)
    return player ? `${player.first_name} ${player.last_name}` : 'Jogador'
  }

  const news: WorldNews[] = []

  const push = (item: Omit<WorldNews, 'id'> & { id?: string }) => {
    news.push({
      ...item,
      id: item.id ?? `${item.category}:${result.date}:${news.length}`,
    })
  }

  for (const transfer of result.transfers) {
    const player = playerById.get(transfer.playerId)
    const name = playerName(transfer.playerId)
    const destination = clubName(transfer.toClubId)
    const origin = transfer.fromClubId ? clubName(transfer.fromClubId) : 'mercado de jogadores livres'
    const bigTransfer = transfer.fee >= 2000000 || Boolean(player && playerOverall(player) >= 78)
    push({
      date: result.date,
      title: bigTransfer ? 'Grande negócio no mercado' : 'Mercado em movimento',
      message: transfer.fee > 0
        ? `${destination} contratou ${name}, que deixou ${origin}, por R$ ${transfer.fee.toLocaleString('pt-BR')}.`
        : `${destination} contratou ${name} sem pagar taxa de transferência.`,
      tone: bigTransfer ? 'positive' : 'neutral',
      category: 'market',
      priority: bigTransfer ? 88 : 42,
      id: `transfer:${result.date}:${transfer.playerId}:${transfer.toClubId}`,
    })
  }

  for (const offer of result.offers) {
    const name = playerName(offer.playerId)
    const buyer = clubName(offer.toClubId)
    const isUserDeal = offer.fromClubId === userClubId
    push({
      date: result.date,
      title: isUserDeal ? 'Seu clube recebeu uma proposta' : 'Negociação em andamento',
      message: isUserDeal
        ? `${buyer} apresentou uma proposta de R$ ${offer.fee.toLocaleString('pt-BR')} por ${name}.`
        : `${buyer} abriu negociação por ${name}, com uma proposta de R$ ${offer.fee.toLocaleString('pt-BR')}.`,
      tone: isUserDeal ? 'warning' : 'neutral',
      category: 'market',
      priority: isUserDeal ? 100 : 58,
      id: `offer:${result.date}:${offer.playerId}:${offer.toClubId}`,
    })
  }

  for (const renewal of result.renewals) {
    const player = playerById.get(renewal.playerId)
    const important = Boolean(player && (getSquadRole(player) === 'starter' || player.potential >= 86))
    push({
      date: result.date,
      title: important ? 'Clube segurou uma peça importante' : 'Contrato renovado',
      message: `${clubName(renewal.clubId)} renovou com ${playerName(renewal.playerId)} até ${renewal.contractUntil}.`,
      tone: 'positive',
      category: 'squad',
      priority: important ? 72 : 38,
      id: `renewal:${result.date}:${renewal.playerId}`,
    })
  }

  for (const retirement of result.retirements) {
    const player = playerById.get(retirement.playerId)
    const important = Boolean(player && (playerOverall(player) >= 75 || player.age >= 36))
    push({
      date: result.date,
      title: important ? 'Um nome importante se despede' : 'Fim de carreira',
      message: `${playerName(retirement.playerId)} decidiu encerrar a carreira profissional após defender ${clubName(retirement.clubId)}.`,
      tone: 'neutral',
      category: 'career',
      priority: important ? 82 : 48,
      id: `retirement:${result.date}:${retirement.playerId}`,
    })
  }

  for (const expired of result.expiredContracts) {
    push({
      date: result.date,
      title: 'Jogador disponível no mercado',
      message: `${playerName(expired.playerId)} ficou sem clube após o fim do contrato com ${clubName(expired.clubId)}.`,
      tone: 'neutral',
      category: 'market',
      priority: 45,
      id: `free:${result.date}:${expired.playerId}`,
    })
  }

  for (const prospect of result.youth) {
    const standout = prospect.potential >= 88
    push({
      date: result.date,
      title: standout ? 'Base revelou um novo talento' : 'Novo talento promovido',
      message: `${clubName(prospect.clubId)} promoveu ${prospect.firstName} ${prospect.lastName}, ${prospect.age} anos, ${prospect.position}, com potencial ${prospect.potential}.`,
      tone: 'positive',
      category: 'academy',
      priority: standout ? 86 : 52,
      id: `youth:${result.date}:${prospect.firstName}:${prospect.lastName}:${prospect.clubId}`,
    })
  }

  const pressDay = [5, 10, 15, 20, 25].includes(Number(result.date.slice(8, 10)))
  for (const [clubId, performance] of Object.entries(performanceByClub)) {
    if (!pressDay || performance.played < 3) continue
    const club = clubName(clubId)
    if (performance.position >= 13 && performance.recentPoints <= 4) {
      push({
        date: result.date,
        title: 'Crise de resultados',
        message: `${club} vive uma sequência preocupante: posição ${performance.position} e apenas ${performance.recentPoints} ponto(s) nos últimos cinco jogos.`,
        tone: 'warning',
        category: 'club',
        priority: 92,
        id: `form-warning:${result.date}:${clubId}`,
      })
    } else if (performance.position <= 4 && performance.recentPoints >= 10) {
      push({
        date: result.date,
        title: 'Clube em grande fase',
        message: `${club} está entre os quatro primeiros e somou ${performance.recentPoints} pontos nos últimos cinco jogos.`,
        tone: 'positive',
        category: 'club',
        priority: 68,
        id: `form-positive:${result.date}:${clubId}`,
      })
    }
  }

  const evolved = result.evolvedPlayerIds
    .map(id => playerById.get(id))
    .filter((player): player is WorldPlayer => Boolean(player) && player.clubId !== '')
    .filter(player => player.age <= 23 && (getSquadRole(player) === 'starter' || (player.seasonMinutes ?? 0) >= 900))
    .slice(0, 3)

  for (const player of evolved) {
    push({
      date: result.date,
      title: 'Jovem ganha espaço',
      message: `${playerName(player.id)} vem ganhando espaço no ${clubName(player.clubId)} e sua evolução começa a chamar atenção.`,
      tone: 'positive',
      category: 'career',
      priority: 64,
      id: `development:${result.date}:${player.id}`,
    })
  }

  return news
    .sort((a, b) => b.priority - a.priority || b.id.localeCompare(a.id))
    .slice(0, 8)
}
