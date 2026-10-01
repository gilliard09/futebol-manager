import { ArrowLeft, BriefcaseBusiness, Crown, Medal, Star, Trophy, TrendingUp } from 'lucide-react'
import type { Club } from '../types/game'
import type { ManagerPopularity } from '../engine/managerCareer'
import { chooseBoardObjective, managerContractSalary, managerContractYears } from '../engine/management'

type History = {
  id: string
  season_name: string
  club_name: string
  club_id?: string | null
  final_position: number | null
  points: number
  wins: number
  draws: number
  losses: number
  league_title: boolean
  cup_title: boolean
}

type TrophyRow = {
  id: string
  season_name: string
  competition_name: string
  club_name: string
}

type RecordRow = {
  id: string
  record_type: string
  record_value: number
  description: string
}

type Offer = {
  id: string
  from_club_id: string
  offered_at: string
  expires_at: string | null
  offer_level: string
  message: string
  status: string
}

export default function ManagerCareerScreen({
  managerName,
  popularity,
  history,
  trophies,
  records,
  offers,
  clubs,
  careerStatus = 'active',
  currentClubId,
  contractEndSeason,
  contractYears = 1,
  back,
  onOffer,
  onRejectOffer,
  onRetire,
}: {
  managerName: string
  popularity: ManagerPopularity
  history: History[]
  trophies: TrophyRow[]
  records: RecordRow[]
  offers: Offer[]
  clubs: Club[]
  careerStatus?: 'active' | 'unemployed' | 'retired'
  currentClubId?: string | null
  contractEndSeason?: string
  contractYears?: number
  back: () => void
  onOffer: (offer: Offer) => void
  onRejectOffer?: (offer: Offer) => void
  onRetire?: () => void
}) {
  const clubName = (id: string) => clubs.find(club => club.id === id)?.name ?? 'Clube'
  const currentClub = currentClubId ? clubs.find(club => club.id === currentClubId) : null
  const uniqueClubs = [...new Map(history.map(row => [row.club_id ?? row.club_name, row.club_name])).values()]
  const popularityItems = [
    ['Regional', popularity.regional],
    ['Nacional', popularity.national],
    ['Internacional', popularity.international],
  ] as const

  return <main className="min-h-screen bg-[#0a0f1a] px-4 py-6 sm:px-6 lg:px-8">
    <button onClick={back} className="mb-6 flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white"><ArrowLeft size={15} /> Voltar</button>

    <div className="mb-7">
      <p className="label-mono text-emerald-300/65">Carreira do treinador</p>
      <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{managerName}</h1>
      <p className="mt-2 text-sm text-white/40">Desempenho, contratos, clubes treinados, reputação e oportunidades ficam registrados ao longo da carreira.</p>
    </div>

    {careerStatus === 'unemployed' && <section className="mb-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-6">
      <div className="flex items-start gap-4"><BriefcaseBusiness size={22} className="mt-0.5 text-amber-200" /><div>
        <p className="label-mono text-amber-200/70">Sem clube</p>
        <h2 className="mt-2 text-2xl font-bold">Você está no mercado</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">Enquanto estiver sem clube, você não disputa partidas nem administra um elenco. Aguarde propostas ou escolha uma das oportunidades disponíveis.</p>
      </div></div>
    </section>}

    {careerStatus === 'retired' && <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <p className="label-mono text-white/35">Fim da carreira</p>
      <h2 className="mt-2 text-2xl font-bold">Treinador aposentado</h2>
      <p className="mt-2 text-sm leading-6 text-white/45">Sua história foi encerrada. O histórico, os títulos e os recordes permanecem registrados.</p>
    </section>}

    {careerStatus === 'active' && <section className="mb-4 grid gap-4 md:grid-cols-3">
      <article className="game-panel"><p className="label-mono text-white/30">Clube atual</p><p className="mt-3 text-lg font-bold">{currentClub?.name ?? 'Clube'}</p><p className="mt-1 text-xs text-white/35">{contractEndSeason ? 'Contrato até ' + contractEndSeason : 'Contrato em andamento'}</p></article>
      <article className="game-panel"><p className="label-mono text-white/30">Duração</p><p className="mt-3 text-lg font-bold">{contractYears} ano{contractYears === 1 ? '' : 's'}</p><p className="mt-1 text-xs text-white/35">Vínculo atual</p></article>
      <article className="game-panel"><p className="label-mono text-white/30">Objetivo</p><p className="mt-3 text-lg font-bold">{currentClub ? chooseBoardObjective(Number(currentClub.reputation ?? 50), Number(currentClub.budget ?? 0), Number(currentClub.strength ?? currentClub.reputation ?? 50)).label : '—'}</p><p className="mt-1 text-xs text-white/35">Expectativa da diretoria</p></article>
    </section>}

    <section className="grid gap-4 lg:grid-cols-3">
      {popularityItems.map(([label, value]) => <article key={label} className="game-panel">
        <div className="flex items-center justify-between"><span className="label-mono text-white/35">{label}</span><Star size={16} className="text-amber-300/70" /></div>
        <p className="mt-5 font-display text-4xl font-bold">{value}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-400" style={{ width: value + '%' }} /></div>
        <p className="mt-2 text-xs text-white/30">{value >= 80 ? 'Muito alta' : value >= 60 ? 'Alta' : value >= 40 ? 'Consolidada' : value >= 20 ? 'Em ascensão' : 'Inicial'}</p>
      </article>)}
    </section>

    <section className="mt-4 grid gap-4 lg:grid-cols-2">
      <article className="game-panel">
        <div className="flex items-center gap-3"><TrendingUp size={18} className="text-emerald-300" /><div><p className="label-mono text-white/30">Histórico</p><h2 className="mt-1 font-display text-xl font-bold">Clubes treinados</h2></div></div>
        <p className="mt-2 text-xs text-white/30">{uniqueClubs.length ? uniqueClubs.length + ' clube' + (uniqueClubs.length === 1 ? '' : 's') + ' registrado' + (uniqueClubs.length === 1 ? '' : 's') : 'Nenhum clube encerrado ainda.'}</p>
        <div className="mt-5 space-y-2">{history.length ? history.map(row => <div key={row.id} className="rounded-xl border border-white/5 bg-black/10 p-3">
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{row.season_name}</p><p className="mt-1 text-xs text-white/35">{row.club_name}</p></div><span className="text-xs font-bold text-white/60">{row.final_position ? row.final_position + 'º lugar' : 'Saída durante a temporada'}</span></div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-[10px] text-white/35"><span>{row.points} pts</span><span>{row.wins} V</span><span>{row.draws} E</span><span>{row.losses} D</span></div>
          {(row.league_title || row.cup_title) && <div className="mt-3 flex gap-2">{row.league_title && <span className="rounded-full bg-amber-300/10 px-2 py-1 text-[10px] font-bold text-amber-200">Liga</span>}{row.cup_title && <span className="rounded-full bg-violet-300/10 px-2 py-1 text-[10px] font-bold text-violet-200">Copa</span>}</div>}
        </div>) : <p className="text-sm text-white/30">A primeira temporada ainda está em andamento.</p>}</div>
      </article>

      <article className="game-panel">
        <div className="flex items-center gap-3"><Trophy size={18} className="text-amber-300" /><div><p className="label-mono text-white/30">Sala de Troféus</p><h2 className="mt-1 font-display text-xl font-bold">Títulos conquistados</h2></div></div>
        <div className="mt-5 space-y-2">{trophies.length ? trophies.map(trophy => <div key={trophy.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/10 p-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-300/10 text-amber-200"><Crown size={16} /></div><div><p className="text-sm font-semibold">{trophy.competition_name}</p><p className="mt-1 text-xs text-white/35">{trophy.season_name} · {trophy.club_name}</p></div></div>) : <p className="text-sm text-white/30">Nenhum título conquistado ainda.</p>}</div>
      </article>
    </section>

    <section className="mt-4 grid gap-4 lg:grid-cols-2">
      <article className="game-panel">
        <div className="flex items-center gap-3"><Medal size={18} className="text-sky-300" /><div><p className="label-mono text-white/30">Recordes</p><h2 className="mt-1 font-display text-xl font-bold">Marcas da carreira</h2></div></div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">{records.length ? records.map(record => <div key={record.id} className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="text-xs text-white/35">{record.description}</p><p className="mt-1 text-xl font-bold">{record.record_type === 'best_finish' ? record.record_value + 'º' : Math.round(record.record_value)}</p></div>) : <p className="text-sm text-white/30">Os recordes serão registrados ao final da primeira temporada.</p>}</div>
      </article>

      <article className="game-panel">
        <div className="flex items-center gap-3"><Star size={18} className="text-violet-300" /><div><p className="label-mono text-white/30">Mercado de treinadores</p><h2 className="mt-1 font-display text-xl font-bold">Propostas recebidas</h2></div></div>
        <div className="mt-5 space-y-2">{offers.length ? offers.map(offer => {
          const club = clubs.find(item => item.id === offer.from_club_id)
          const target = club ? chooseBoardObjective(Number(club.reputation ?? 50), Number(club.budget ?? 0), Number(club.strength ?? club.reputation ?? 50)) : null
          const years = target ? managerContractYears(Number(club?.reputation ?? 50)) : 1
          return <div key={offer.id} className="rounded-xl border border-white/5 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3"><p className="font-semibold">{clubName(offer.from_club_id)}</p><span className="label-mono text-violet-300/70">{offer.offer_level}</span></div>
            <p className="mt-2 text-xs leading-5 text-white/40">{offer.message}</p>
            {target && <p className="mt-3 text-xs text-white/35">Objetivo: <span className="font-semibold text-white/60">{target.label}</span> · contrato estimado: {years} ano{years === 1 ? '' : 's'} · {money(managerContractSalary(Number(club?.reputation ?? 50), popularity.national + popularity.regional > 80 ? 75 : 60))}/mês</p>}
            {offer.status === 'pending' && careerStatus !== 'retired' && <div className="mt-3 flex gap-2"><button onClick={() => onOffer(offer)} className="rounded-lg bg-emerald-400 px-4 py-2 text-xs font-bold text-[#06100c]">Aceitar proposta</button>{onRejectOffer && <button onClick={() => onRejectOffer(offer)} className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-white/55 hover:text-white">Recusar</button>}</div>}
            {offer.status !== 'pending' && <p className="mt-3 text-[10px] uppercase tracking-wider text-white/25">{offer.status}</p>}
          </div>
        }) : <p className="text-sm text-white/30">As propostas surgirão conforme sua carreira ganhar relevância.</p>}</div>
      </article>
    </section>

    {onRetire && careerStatus !== 'retired' && <button onClick={onRetire} className="mt-6 rounded-xl border border-red-300/10 px-4 py-2.5 text-xs font-semibold text-white/35 hover:text-red-200">Encerrar carreira</button>}
  </main>
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}
