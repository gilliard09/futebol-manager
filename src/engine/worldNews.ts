import { getSquadRole, playerOverall } from './matchCore'
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

  for (const loan of result.loans ?? []) {
    const player = playerById.get(loan.playerId)
    if (!player) continue
    const parent = clubName(loan.parentClubId)
    const destination = clubName(loan.loanClubId)
    const months = Math.max(1, Math.round((new Date(loan.endDate).getTime() - new Date(loan.startDate).getTime()) / (30 * 86400000)))
    push({
      date: result.date,
      title: 'Empréstimo confirmado',
      message: `${playerName(loan.playerId)} foi emprestado pelo ${parent} ao ${destination} por ${months} meses.`,
      tone: 'neutral',
      category: 'market',
      priority: 58,
      id: `loan:${result.date}:${loan.playerId}:${loan.loanClubId}`,
    })
  }
  for (const negotiation of result.negotiationEvents ?? []) {
    const player = playerById.get(negotiation.playerId)
    const buyer = clubName(negotiation.buyerId)
    const seller = clubName(negotiation.sellerId)
    const amount = negotiation.offer.toLocaleString('pt-BR')
    const counter = negotiation.counterOffer ? ` A contraproposta chegou a R$ ${negotiation.counterOffer.toLocaleString('pt-BR')}.` : ''
    const isUserSeller = negotiation.sellerId === userClubId
    const title = negotiation.action === 'accepted'
      ? 'Negociação concluída'
      : negotiation.action === 'countered'
        ? (isUserSeller ? 'Seu clube recebeu uma contraproposta' : 'Clube fez contraproposta')
        : negotiation.action === 'rejected'
          ? 'Proposta recusada'
          : 'Clube desistiu da negociação'
    const message = negotiation.action === 'accepted'
      ? `${buyer} e ${seller} chegaram a um acordo por ${playerName(negotiation.playerId)} após uma proposta de R$ ${amount}.`
      : negotiation.action === 'countered'
        ? `${seller} respondeu à proposta de R$ ${amount} por ${playerName(negotiation.playerId)}.${counter}`
        : `${seller} ${negotiation.action === 'rejected' ? 'recusou' : 'encerrou'} as conversas por ${playerName(negotiation.playerId)}. ${negotiation.reason}`
    push({
      date: result.date,
      title,
      message,
      tone: negotiation.action === 'accepted' ? 'positive' : negotiation.action === 'countered' ? 'neutral' : 'warning',
      category: 'market',
      priority: isUserSeller ? 94 : negotiation.action === 'accepted' ? 58 : 68,
      id: `negotiation:${result.date}:${negotiation.playerId}:${negotiation.buyerId}:${negotiation.round}:${negotiation.action}`,
    })
  }

  const offersByPlayer = new Map<string, typeof result.offers>()
  for (const offer of result.offers) {
    const current = offersByPlayer.get(offer.playerId) ?? []
    current.push(offer)
    offersByPlayer.set(offer.playerId, current)
  }

  for (const interest of result.marketInterest ?? []) {
    if (!interest.stageChanged) continue
    const player = playerById.get(interest.playerId)
    const interestedClubs = interest.clubIds.map(clubName)
    const isUserPlayer = player?.clubId === userClubId
    const stageLabel = interest.stage === 'monitoring'
      ? 'entrou no radar'
      : interest.stage === 'scouting'
        ? 'passou a ser acompanhado de perto'
        : 'está pronto para receber propostas'
    push({
      date: result.date,
      title: isUserPlayer
        ? (interest.stage === 'proposal_ready' ? 'Seu jogador está na mira do mercado' : 'Seu jogador ganhou novos interessados')
        : (interest.stage === 'proposal_ready' ? 'Jogador entra na fase de propostas' : 'Vários clubes monitoram o mesmo jogador'),
      message: `${playerName(interest.playerId)} ${stageLabel} por ${interestedClubs.join(', ')}. A concorrência aumenta o valor e aproxima o jogador de uma possível negociação.`,
      tone: 'neutral',
      category: 'market',
      priority: isUserPlayer ? 91 : 74,
      id: `market-interest:${result.date}:${interest.playerId}:${interest.clubIds.join('-')}`,
    })
  }

  for (const [playerId, playerOffers] of offersByPlayer) {
    if (playerOffers.length < 2) continue
    const player = playerById.get(playerId)
    const isUserDeal = playerOffers.some(offer => offer.fromClubId === userClubId)
    const buyers = playerOffers.map(offer => clubName(offer.toClubId))
    const highestOffer = Math.max(...playerOffers.map(offer => offer.fee))
    push({
      date: result.date,
      title: isUserDeal ? 'Disputa pelo seu jogador esquenta' : 'Disputa pelo jogador esquenta',
      message: `${playerName(playerId)} recebeu interesse de ${buyers.join(', ')}. A maior proposta chegou a R$ ${highestOffer.toLocaleString('pt-BR')}.`,
      tone: 'neutral',
      category: 'market',
      priority: isUserDeal ? 99 : 82,
      id: `market-race:${result.date}:${playerId}:${playerOffers.length}`,
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
        category: 'match',
        priority: 92,
        id: `form-warning:${result.date}:${clubId}`,
      })
    } else if (performance.position <= 4 && performance.recentPoints >= 10) {
      push({
        date: result.date,
        title: 'Clube em grande fase',
        message: `${club} está entre os quatro primeiros e somou ${performance.recentPoints} pontos nos últimos cinco jogos.`,
        tone: 'positive',
        category: 'match',
        priority: 68,
        id: `form-positive:${result.date}:${clubId}`,
      })
    }
  }

  if (pressDay) {
    const activePlayers = players.filter(player => player.clubId !== '' && (player.seasonAppearances ?? 0) >= 3)
    const topScorer = [...activePlayers].sort((a, b) => (b.seasonGoals ?? 0) - (a.seasonGoals ?? 0))[0]
    if (topScorer && (topScorer.seasonGoals ?? 0) >= 5) {
      const isUser = topScorer.clubId === userClubId
      const alreadyOffered = result.offers.some(offer => offer.playerId === topScorer.id)
      if (!alreadyOffered && (topScorer.seasonGoals ?? 0) >= 7) {
        push({
          date: result.date,
          title: isUser ? 'Artilheiro entra no radar do mercado' : 'Artilheiro desperta interesse',
          message: playerName(topScorer.id) + ' vive uma temporada de destaque e começa a chamar atenção de outros clubes após marcar ' + topScorer.seasonGoals + ' gol(s).',
          tone: 'neutral',
          category: 'market',
          priority: isUser ? 89 : 66,
          id: 'market-scorer:' + result.date + ':' + topScorer.id + ':' + topScorer.seasonGoals,
        })
      }
      push({
        date: result.date,
        title: isUser ? 'Seu jogador é destaque na artilharia' : 'Artilheiro começa a chamar atenção',
        message: `${playerName(topScorer.id)} já marcou ${topScorer.seasonGoals} gol(s) na temporada pelo ${clubName(topScorer.clubId)}.`,
        tone: 'positive',
        category: 'career',
        priority: isUser ? 97 : 73,
        id: `top-scorer:${result.date}:${topScorer.id}:${topScorer.seasonGoals}`,
      })
    }

    const topRated = [...activePlayers].filter(player => (player.seasonAverageRating ?? 0) >= 7).sort((a, b) => (b.seasonAverageRating ?? 0) - (a.seasonAverageRating ?? 0))[0]
    if (topRated && (topRated.seasonAverageRating ?? 0) >= 7.4) {
      const isUser = topRated.clubId === userClubId
      push({
        date: result.date,
        title: isUser ? 'Um dos seus jogadores vive grande fase' : 'Jogador vira destaque da temporada',
        message: `${playerName(topRated.id)} tem média ${topRated.seasonAverageRating?.toFixed(2)} nas últimas atuações pelo ${clubName(topRated.clubId)}.`,
        tone: 'positive',
        category: 'career',
        priority: isUser ? 93 : 69,
        id: `top-rated:${result.date}:${topRated.id}`,
      })
    }

    const youngBreakout = [...activePlayers]
      .filter(player => player.age <= 23 && (player.seasonStarts ?? 0) >= 5 && (player.seasonAverageRating ?? 0) >= 7)
      .sort((a, b) => (b.seasonAverageRating ?? 0) - (a.seasonAverageRating ?? 0))[0]
    if (youngBreakout) {
      const isUser = youngBreakout.clubId === userClubId
      push({
        date: result.date,
        title: isUser ? 'Jovem do seu elenco ganha destaque' : 'Jovem revelação começa a aparecer',
        message: `${playerName(youngBreakout.id)}, de ${youngBreakout.age} anos, vem sendo titular e mantém média ${youngBreakout.seasonAverageRating?.toFixed(2)} pelo ${clubName(youngBreakout.clubId)}.`,
        tone: 'positive',
        category: 'academy',
        priority: isUser ? 95 : 71,
        id: `young-breakout:${result.date}:${youngBreakout.id}`,
      })
    }

    const strugglingStarter = [...activePlayers]
      .filter(player => (player.seasonStarts ?? 0) >= 5 && (player.seasonAverageRating ?? 0) > 0 && (player.seasonAverageRating ?? 0) < 5.9)
      .sort((a, b) => (a.seasonAverageRating ?? 0) - (b.seasonAverageRating ?? 0))[0]
    if (strugglingStarter) {
      const isUser = strugglingStarter.clubId === userClubId
      push({
        date: result.date,
        title: isUser ? 'Titular do seu clube vive má fase' : 'Titular entra na mira das críticas',
        message: `${playerName(strugglingStarter.id)} tem média ${strugglingStarter.seasonAverageRating?.toFixed(2)} e começa a ser questionado após ${strugglingStarter.seasonStarts} titularidades.`,
        tone: 'warning',
        category: 'squad',
        priority: isUser ? 90 : 65,
        id: `struggling-player:${result.date}:${strugglingStarter.id}`,
      })
    }
  }

  if (pressDay) {
    const ranked = Object.entries(performanceByClub)
      .filter(([, performance]) => performance.played >= 5)
      .sort((a, b) => a[1].position - b[1].position)

    const leader = ranked[0]
    const runnerUp = ranked[1]
    if (leader && runnerUp && leader[1].points - runnerUp[1].points <= 3) {
      const leaderName = clubName(leader[0])
      const runnerUpName = clubName(runnerUp[0])
      const userInRace = leader[0] === userClubId || runnerUp[0] === userClubId
      push({ date: result.date, title: userInRace ? 'Seu clube entrou na briga pelo título' : 'Disputa pelo título esquenta', message: `${leaderName} lidera com ${leader[1].points} ponto(s), mas ${runnerUpName} está a apenas ${leader[1].points - runnerUp[1].points} ponto(s) da liderança.`, tone: 'positive', category: 'match', priority: userInRace ? 96 : 78, id: `title-race:${result.date}:${leader[0]}:${runnerUp[0]}` })
    }

    const fourth = ranked.find(([, performance]) => performance.position === 4)
    const fifth = ranked.find(([, performance]) => performance.position === 5)
    if (fourth && fifth && fourth[1].points - fifth[1].points <= 3) {
      push({ date: result.date, title: 'Briga pelo G4 ganha tensão', message: `${clubName(fourth[0])} ocupa o 4º lugar, mas ${clubName(fifth[0])} está a apenas ${fourth[1].points - fifth[1].points} ponto(s) da vaga.`, tone: 'neutral', category: 'match', priority: fourth[0] === userClubId || fifth[0] === userClubId ? 91 : 62, id: `top-four:${result.date}:${fourth[0]}:${fifth[0]}` })
    }

    for (const [clubId, performance] of ranked) {
      const club = clubs.find(item => item.id === clubId)
      if (!club) continue
      const results = performance.recentResults
      let streak = 0
      const streakResult = results[results.length - 1]
      for (let i = results.length - 1; i >= 0 && results[i] === streakResult; i--) streak++
      if (streak < 3) continue
      const isUser = clubId === userClubId
      if (streakResult === 'W') push({ date: result.date, title: isUser ? 'Seu clube vive uma sequência de vitórias' : 'Sequência de vitórias chama atenção', message: `${club.name} venceu os últimos ${streak} jogos da Liga Nacional do Brasil e ganhou força na classificação.`, tone: 'positive', category: 'match', priority: isUser ? 94 : 70, id: `streak-win:${result.date}:${clubId}:${streak}` })
      else if (streakResult === 'L') push({ date: result.date, title: isUser ? 'A pressão aumenta no seu clube' : 'Jejum começa a preocupar', message: `${club.name} perdeu os últimos ${streak} jogos da Liga Nacional do Brasil e começa a perder terreno.`, tone: 'warning', category: 'match', priority: isUser ? 98 : 76, id: `streak-loss:${result.date}:${clubId}:${streak}` })
    }

    for (const [clubId, performance] of ranked) {
      const club = clubs.find(item => item.id === clubId)
      if (!club || clubId === userClubId) continue
      if (club.reputation < 78 || performance.position < 9 || performance.recentPoints > 5) continue
      push({ date: result.date, title: 'Grande clube vive momento difícil', message: `${club.name}, um dos clubes de maior reputação do campeonato, ocupa a ${performance.position}ª posição e somou apenas ${performance.recentPoints} ponto(s) nos últimos cinco jogos.`, tone: 'warning', category: 'club', priority: 84, id: `big-club-crisis:${result.date}:${clubId}` })
    }
  }
  const evolved = result.evolvedPlayerIds
    .map(id => playerById.get(id))
    .filter((player): player is WorldPlayer => Boolean(player))
    .filter(player => player.clubId !== '')
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
