import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Handshake, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { applyLoan, calculateLoanFee, calculateLoanSalaryCost, canCompleteLoan, createLoanRecord, getActiveLoan, type LoanRecord, type LoanState } from '../engine/loans'
import { playerOverall } from '../engine/match'
import type { Club, Player } from '../types/game'

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

type MarketPlayer = { player: Player; club: Club; marketValue: number; salary: number; contractUntil: string | null }

type Props = {
  club: Club
  clubs: Club[]
  balance: number
  today: string
  transferOverrides: Record<string, string>
  state: LoanState
  onLoan: (record: LoanRecord, nextState: LoanState, nextBalance: number) => void
  back: () => void
}

export default function LoanMarket({ club, clubs, balance, today, transferOverrides, state, onLoan, back }: Props) {
  const [players, setPlayers] = useState<MarketPlayer[]>([])
  const [mode, setMode] = useState<'receive' | 'send'>('receive')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MarketPlayer | null>(null)
  const [months, setMonths] = useState(6)
  const [salaryShare, setSalaryShare] = useState(60)
  const [fee, setFee] = useState(0)
  const [destinationId, setDestinationId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const { data, error } = await supabase.from('club_players').select('club_id,squad_number,contract_until,salary,market_value,players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale)').order('squad_number')
      if (!active) return
      if (error) { setError(error.message); setLoading(false); return }
      const byId = new Map(clubs.map(item => [item.id, item]))
      const rows = (data ?? []).flatMap((row: any) => {
        const player = Array.isArray(row.players) ? row.players[0] : row.players
        if (!player) return []
        const baseClubId = row.club_id
        const currentClubId = transferOverrides[player.id] ?? baseClubId
        const owner = byId.get(baseClubId)
        const currentClub = byId.get(currentClubId)
        if (!owner || !currentClub) return []
        if (getActiveLoan(player.id, today, state)) return []
        return [{ player: { ...player, squad_number: row.squad_number } as Player, club: currentClub, marketValue: Number(row.market_value ?? 0), salary: Number(row.salary ?? 0), contractUntil: row.contract_until ?? null }]
      })
      setPlayers(rows)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [clubs, state, today, transferOverrides])

  const available = useMemo(() => {
    const term = search.trim().toLowerCase()
    return players.filter(item => mode === 'receive' ? item.club.id !== club.id : item.club.id === club.id)
      .filter(item => !term || (item.player.first_name + ' ' + item.player.last_name).toLowerCase().includes(term) || item.club.name.toLowerCase().includes(term))
      .sort((a, b) => playerOverall(b.player) - playerOverall(a.player))
  }, [players, mode, club.id, search])

  function open(item: MarketPlayer) {
    setSelected(item)
    setMonths(6)
    setSalaryShare(60)
    setFee(calculateLoanFee(item.player, item.marketValue, 6))
    setDestinationId(clubs.find(clubItem => clubItem.id !== item.club.id)?.id ?? '')
  }

  function updateMonths(value: number) {
    setMonths(value)
    if (selected) setFee(calculateLoanFee(selected.player, selected.marketValue, value))
  }

  function submit() {
    if (!selected) return
    const parentClubId = selected.club.id
    const loanClubId = mode === 'receive' ? club.id : destinationId
    if (!loanClubId || parentClubId === loanClubId) return
    if (mode === 'receive' && !canCompleteLoan(club, fee)) return
    const record = createLoanRecord(today, selected.player, parentClubId, loanClubId, fee, selected.salary, salaryShare, months)
    const nextState = applyLoan(state, record)
    onLoan(record, nextState, mode === 'receive' ? balance - fee : balance + fee)
    setSelected(null)
  }

  const selectedLoanClub = mode === 'receive' ? club : clubs.find(item => item.id === destinationId)
  const monthlyCost = selected ? calculateLoanSalaryCost(selected.salary, salaryShare, mode === 'receive') : 0

  return <main className="min-h-screen">
    <header className="flex h-20 items-center justify-between border-b border-white/6 px-6 md:px-10">
      <button onClick={back} className="flex items-center gap-3 text-sm font-semibold text-white/60 hover:text-white"><ArrowLeft size={18} /> EMPRÉSTIMOS</button>
      <span className="text-xs text-white/35">Caixa <b className="text-emerald-300">{money(balance)}</b></span>
    </header>
    <section className="px-6 py-8 md:px-10">
      <p className="text-sm text-white/35">{club.name}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">Empréstimos</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/35">Traga jogadores por um período ou empreste atletas que precisam de mais minutos.</p>

      <div className="mt-6 flex gap-2 rounded-xl border border-white/6 bg-white/[0.02] p-1">
        <button onClick={() => { setMode('receive'); setSelected(null) }} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold ${mode === 'receive' ? 'bg-emerald-400 text-[#06100c]' : 'text-white/40'}`}>Receber jogador</button>
        <button onClick={() => { setMode('send'); setSelected(null) }} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold ${mode === 'send' ? 'bg-emerald-400 text-[#06100c]' : 'text-white/40'}`}>Emprestar jogador</button>
      </div>

      <label className="mt-5 flex items-center gap-3 rounded-xl border border-white/7 bg-white/[0.02] px-4">
        <Search size={16} className="text-white/30" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar jogador ou clube" className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-white/20" />
      </label>

      {error && <div className="mt-5 rounded-xl border border-red-400/15 bg-red-400/5 p-4 text-sm text-red-200">Não foi possível carregar os jogadores. {error}</div>}
      {loading && <div className="py-20 text-center text-sm text-white/35">Carregando jogadores...</div>}
      {!loading && !error && <div className="mt-5 overflow-hidden rounded-2xl border border-white/6">
        {available.map(item => <button key={item.player.id} onClick={() => open(item)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-t border-white/5 px-4 py-4 text-left hover:bg-white/[0.025] md:grid-cols-[1.8fr_1fr_70px_70px_120px]">
          <div><p className="text-sm font-semibold">{item.player.first_name} {item.player.last_name}</p><p className="text-xs text-white/30">{item.player.age} anos · Pot. {item.player.potential}</p></div>
          <span className="text-xs text-white/40">{item.club.short_name}</span>
          <span className="hidden text-xs font-bold text-emerald-300 md:block">{item.player.position}</span>
          <span className="hidden text-sm font-bold md:block">{playerOverall(item.player)}</span>
          <span className="text-xs text-white/35">{money(item.marketValue)}</span>
        </button>)}
      </div>}
      {!loading && !error && !available.length && <div className="mt-6 rounded-2xl border border-white/6 p-8 text-center text-sm text-white/35">Nenhum jogador disponível para esta modalidade.</div>}

      {state.records.length > 0 && <section className="mt-8 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Empréstimos da carreira</p>
        <div className="mt-4 space-y-2">{state.records.slice().reverse().slice(0, 8).map(record => {
          const from = clubs.find(item => item.id === record.parentClubId)?.short_name ?? 'Origem'
          const to = clubs.find(item => item.id === record.loanClubId)?.short_name ?? 'Destino'
          const active = record.startDate <= today && today < record.endDate
          return <div key={record.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><p className="text-sm font-semibold">{record.playerName}</p><p className="text-xs text-white/30">{from} → {to} · {record.startDate} até {record.endDate}</p></div><span className={`text-xs font-bold ${active ? 'text-emerald-300' : 'text-white/30'}`}>{active ? 'Ativo' : 'Encerrado'}</span></div>
        })}</div>
      </section>}
    </section>

    {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-6" onClick={() => setSelected(null)}>
      <section className="w-full max-w-xl rounded-t-3xl border border-white/8 bg-[#10141b] p-6 md:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/70">{selected.club.short_name} · {selected.player.position}</p><h2 className="mt-2 text-3xl font-bold">{selected.player.first_name} {selected.player.last_name}</h2><p className="mt-2 text-sm text-white/35">{selected.player.age} anos · GER {playerOverall(selected.player)}</p></div><button onClick={() => setSelected(null)} className="rounded-lg p-2 text-white/35 hover:bg-white/5"><X size={20} /></button></div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Info label="Valor de mercado" value={money(selected.marketValue)} />
          <Info label="Salário" value={money(selected.salary) + '/mês'} />
          <Info label="Duração" value={months + (months === 1 ? ' mês' : ' meses')} />
          <Info label={mode === 'receive' ? 'Custo mensal para você' : 'Salário restante no clube'} value={money(monthlyCost)} />
        </div>
        <div className="mt-5 rounded-2xl border border-white/6 bg-white/[0.02] p-5">
          <label className="block text-xs text-white/35">Duração
            <input type="range" min="1" max="12" step="1" value={months} onChange={e => updateMonths(Number(e.target.value))} className="mt-4 w-full" />
          </label>
          <label className="mt-5 block text-xs text-white/35">Percentual do salário pago pelo clube de destino · {salaryShare}%
            <input type="range" min="0" max="100" step="10" value={salaryShare} onChange={e => setSalaryShare(Number(e.target.value))} className="mt-4 w-full" />
          </label>
          <div className="mt-5 rounded-xl border border-white/5 bg-black/10 p-4">
            <p className="text-xs text-white/25">Taxa do empréstimo</p>
            <p className="mt-1 text-xl font-bold text-emerald-300">{money(fee)}</p>
            <p className="mt-1 text-xs text-white/30">{mode === 'receive' ? `Você paga a taxa ao clube ${selected.club.short_name}.` : `Você recebe a taxa de ${money(fee)} do clube de destino.`}</p>
          </div>
          {mode === 'send' && <label className="mt-4 block text-xs text-white/35">Clube de destino<select className="mt-2 w-full rounded-xl border border-white/8 bg-[#0d1015] px-4 py-3 text-sm text-white" value={destinationId} onChange={e => setDestinationId(e.target.value)}>{clubs.filter(item => item.id !== club.id && item.id !== selected.club.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <button onClick={submit} disabled={mode === 'receive' && !canCompleteLoan(club, fee)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-[#06100c] disabled:cursor-not-allowed disabled:opacity-30"><Handshake size={16} /> {mode === 'receive' ? (canCompleteLoan(club, fee) ? 'Fechar empréstimo' : 'Orçamento insuficiente') : 'Emprestar jogador'}</button>
        </div>
      </section>
    </div>}
  </main>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/5 bg-black/10 p-4"><p className="text-xs text-white/25">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>
}
