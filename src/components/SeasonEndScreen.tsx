import { ArrowRight, Award, CalendarDays, Crown, Medal, Trophy } from 'lucide-react'
import type { Club, Player } from '../types/game'
import type { SeasonCompletion } from '../engine/seasonHistory'
import { managerContractSalary, managerContractYears, type BoardState } from '../engine/management'

export type SeasonAward = {
  award_type: string
  club_id: string | null
  player_id: string | null
  value: number
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export default function SeasonEndScreen({
  completion,
  clubs,
  players,
  awards,
  currentClubId,
  nextSeasonName,
  onNextSeason,
  managerOffers = [],
  onManagerOffer,
  onRenewManager,
  onEndManagerContract,
}: {
  completion: SeasonCompletion
  clubs: Club[]
  players: Player[]
  awards: SeasonAward[]
  currentClubId: string
  nextSeasonName: string
  onNextSeason: () => void
  managerOffers?: Array<{ id: string; from_club_id: string; offer_level: string; message: string; status: string }>
  onManagerOffer?: (offer: { id: string; from_club_id: string }) => void
  board: BoardState
  onRenewManager: () => void
  onEndManagerContract: () => void
}) {
  const clubName = (id: string | null) => clubs.find(club => club.id === id)?.name ?? 'Clube'
  const playerName = (id: string | null) => {
    const player = players.find(item => item.id === id)
    return player ? player.first_name + ' ' + player.last_name : 'Jogador'
  }
  const award = (type: string) => awards.find(item => item.award_type === type)
  const leagueChampion = completion.league.championClubId
  const cupChampion = completion.cup.championClubId
  const userIsChampion = leagueChampion === currentClubId || cupChampion === currentClubId
  const topScorer = award('top_scorer')

  return <main className="min-h-screen bg-[#0a0f1a] px-5 py-8 text-white sm:px-8 lg:px-12">
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <p className="label-mono text-emerald-300/65">Temporada encerrada</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">{completion.seasonName}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">O calendário terminou. Os resultados foram registrados e a história da temporada agora faz parte do mundo do jogo.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="game-panel">
          <div className="flex items-center gap-3 text-amber-300"><Crown size={20} /><span className="label-mono">Campeão da Liga</span></div>
          <h2 className="mt-5 text-2xl font-bold">{clubName(leagueChampion)}</h2>
          <p className="mt-2 text-sm text-white/40">Vice-campeão: {clubName(completion.league.runnerUpClubId)}</p>
        </article>
        <article className="game-panel">
          <div className="flex items-center gap-3 text-violet-300"><Trophy size={20} /><span className="label-mono">Campeão da Copa</span></div>
          <h2 className="mt-5 text-2xl font-bold">{clubName(cupChampion)}</h2>
          <p className="mt-2 text-sm text-white/40">Vice-campeão: {clubName(completion.cup.runnerUpClubId)}</p>
        </article>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-3">
        <article className="game-panel">
          <div className="flex items-center gap-3 text-emerald-300"><Award size={18} /><span className="label-mono">Artilheiro da Liga</span></div>
          <p className="mt-5 text-lg font-bold">{playerName(completion.league.topScorerPlayerId)}</p>
          <p className="mt-1 text-sm text-white/40">{completion.league.topScorerGoals} gols</p>
        </article>
        <article className="game-panel">
          <div className="flex items-center gap-3 text-emerald-300"><Award size={18} /><span className="label-mono">Artilheiro da Copa</span></div>
          <p className="mt-5 text-lg font-bold">{playerName(completion.cup.topScorerPlayerId)}</p>
          <p className="mt-1 text-sm text-white/40">{completion.cup.topScorerGoals} gols</p>
        </article>
        <article className="game-panel">
          <div className="flex items-center gap-3 text-sky-300"><Medal size={18} /><span className="label-mono">Prêmio individual</span></div>
          <p className="mt-5 text-lg font-bold">{topScorer ? playerName(topScorer.player_id) : playerName(completion.league.topScorerPlayerId)}</p>
          <p className="mt-1 text-sm text-white/40">{topScorer ? 'Artilheiro da temporada' : 'Destaque ofensivo'}</p>
        </article>
      </section>

      <section className="mt-4 rounded-2xl border border-white/6 bg-[#111927] p-6 sm:p-8">
        <p className="label-mono text-white/30">Contrato do treinador</p>
        <h2 className="mt-2 text-2xl font-bold">{board.managerStatus === 'dismissed' ? 'Vínculo encerrado pela diretoria' : board.renewalOffered ? 'A diretoria quer renovar' : board.managerStatus === 'contract_ended' ? 'Você está sem clube' : 'Vínculo atual'}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">{board.managerStatus === 'dismissed' ? 'A diretoria encerrou seu trabalho antes da renovação. Você poderá avaliar as propostas recebidas.' : board.renewalOffered ? <>Sua confiança terminou em {board.confidence}/100. A diretoria oferece {managerContractYears(board.confidence)} ano(s), com salário de {money(managerContractSalary(Number(clubs.find(club => club.id === currentClubId)?.reputation ?? 50), board.confidence))} por mês.</> : board.managerStatus === 'contract_ended' ? 'O vínculo terminou. Você pode assumir uma nova oportunidade.' : 'O vínculo segue ativo para a próxima temporada.'}</p>
        {board.renewalOffered && <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button onClick={onRenewManager} className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06100c]">Renovar contrato</button>
          <button onClick={onEndManagerContract} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/65 hover:border-white/20 hover:text-white">Encerrar vínculo</button>
        </div>}
      </section>

      {managerOffers.length > 0 && <section className="mt-4 rounded-2xl border border-violet-400/15 bg-violet-400/[0.04] p-6 sm:p-8">
        <p className="label-mono text-violet-300/70">Mercado de treinadores</p>
        <h2 className="mt-2 text-2xl font-bold">Seu desempenho abriu novas portas</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">Outros clubes acompanharam sua temporada e fizeram propostas compatíveis com sua reputação atual.</p>
        <div className="mt-5 space-y-2">{managerOffers.map(offer => <div key={offer.id} className="rounded-xl border border-white/5 bg-black/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">{clubs.find(club => club.id === offer.from_club_id)?.name ?? 'Outro clube'}</p><p className="mt-1 text-xs uppercase tracking-wider text-violet-300/60">{offer.offer_level}</p></div>
            {offer.status === 'pending' && onManagerOffer && <button onClick={() => onManagerOffer({ id: offer.id, from_club_id: offer.from_club_id })} className="rounded-lg bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#06100c]">Aceitar proposta</button>}
          </div>
          <p className="mt-3 text-xs leading-5 text-white/40">{offer.message}</p>
        </div>)}</div>
      </section>}

      <section className="mt-8 rounded-2xl border border-white/6 bg-[#111927] p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><CalendarDays size={21} /></div>
          <div>
            <p className="label-mono text-white/35">Próxima temporada</p>
            <h2 className="mt-2 text-2xl font-bold">{nextSeasonName}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">A nova temporada mantém os clubes e o mundo evoluído. Estatísticas, calendário, finanças e histórico passam a pertencer ao novo ciclo.</p>
            {userIsChampion && <p className="mt-3 text-sm font-semibold text-amber-200">Seu clube terminou a temporada com um título.</p>}
          </div>
        </div>
        <button disabled={board.managerStatus !== 'renewed'} onClick={onNextSeason} className="mt-7 flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06100c] hover:bg-emerald-300">
          Começar {nextSeasonName} <ArrowRight size={17} />
        </button>
      </section>

      <p className="mt-6 text-xs text-white/25">Premiações financeiras já foram incorporadas ao caixa do clube quando aplicáveis.</p>
    </div>
  </main>
}
