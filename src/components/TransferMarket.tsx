import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search, ShoppingBag, Tag, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { playerOverall } from '../engine/match'
import { getActiveLoan } from '../engine/loans'
import { canAddPlayer } from '../engine/roster'
import { applyTransfer, calculateAskingPrice, canCompleteTransfer, createTransferRecord, negotiateTransfer, type TransferRecord, type TransferState } from '../engine/transfers'
import type { Club, Player } from '../types/game'

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

type MarketPlayer = {
  player: Player
  club: Club
  marketValue: number
  salary: number
  contractUntil: string | null
}

type TransferMarketProps = {
  club: Club
  clubs: Club[]
  balance: number
  today: string
  state: TransferState
  loanState: import('../engine/loans').LoanState
  currentSquadSize: number
  onTransfer: (record: TransferRecord, nextState: TransferState, nextBalance: number) => void
  back: () => void
}

export default function TransferMarket({ club, clubs, balance, today, state, loanState, currentSquadSize, onTransfer, back }: TransferMarketProps) {
  const [marketPlayers, setMarketPlayers] = useState<MarketPlayer[]>([])
  const [position, setPosition] = useState('ALL')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MarketPlayer | null>(null)
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [buyerId, setBuyerId] = useState('')
  const [offer, setOffer] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function loadMarket() {
      setLoading(true)
      const { data, error } = await supabase
        .from('club_players')
        .select('club_id,squad_number,contract_until,salary,market_value,players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale)')
        .order('squad_number')

      if (!active) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const byId = new Map(clubs.map(item => [item.id, item]))
      const rows = (data ?? []).flatMap((row: any) => {
        const player = Array.isArray(row.players) ? row.players[0] : row.players
        const currentClubId = state.playerClubOverrides[player.id] ?? row.club_id
        if (getActiveLoan(player.id, today, loanState)) return []
        const seller = byId.get(currentClubId)
        if (!seller) return []
        return [{
          player: { ...player, squad_number: row.squad_number } as Player,
          club: seller,
          marketValue: Number(row.market_value ?? 0),
          salary: Number(row.salary ?? 0),
          contractUntil: row.contract_until ?? null,
        }]
      })

      if (active) {
        setMarketPlayers(rows)
        setLoading(false)
      }
    }
    loadMarket()
    return () => { active = false }
  }, [club.id, clubs, state.playerClubOverrides, loanState, today])

  const myPlayers = useMemo(() => marketPlayers.filter(item => item.club.id === club.id), [marketPlayers, club.id])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return marketPlayers.filter(item => item.club.id !== club.id).filter(item => {
      const matchesPosition = position === 'ALL' || item.player.position === position
      const matchesSearch = !term || `${item.player.first_name} ${item.player.last_name}`.toLowerCase().includes(term) || item.club.name.toLowerCase().includes(term)
      return matchesPosition && matchesSearch
    }).sort((a, b) => playerOverall(b.player) - playerOverall(a.player))
  }, [marketPlayers, position, search, club.id])

  const selectedAsking = selected ? calculateAskingPrice(selected.player, selected.marketValue) : 0
  const negotiation = selected ? negotiateTransfer(selectedAsking, offer) : null

  function openPlayer(item: MarketPlayer, nextMode: 'buy' | 'sell') {
    setSelected(item)
    setMode(nextMode)
    setOffer(calculateAskingPrice(item.player, item.marketValue))
    setBuyerId(clubs.find(item => item.id !== club.id)?.id ?? '')
    setMessage(null)
  }

  function submitTransfer() {
    if (!selected || !negotiation || saving) return
    if (!negotiation.accepted) {
      setMessage(`A proposta foi recusada. O mínimo aceito é ${money(negotiation.minimum)}.`)
      return
    }
    if (mode === 'buy' && !canAddPlayer(currentSquadSize)) {
      setMessage('O elenco já atingiu o limite de 25 jogadores. Libere uma vaga antes de contratar.')
      return
    }
    if (mode === 'buy' && !canCompleteTransfer(club, offer)) {
      setMessage('O orçamento disponível não é suficiente para esta proposta.')
      return
    }
    if (mode === 'sell' && !buyerId) {
      setMessage('Escolha um clube comprador.')
      return
    }

    setSaving(true)
    const fromClubId = mode === 'buy' ? selected.club.id : club.id
    const toClubId = mode === 'buy' ? club.id : buyerId
    const record = createTransferRecord(today, selected.player, fromClubId, toClubId, offer, mode === 'buy' ? 'purchase' : 'sale')
    const nextState = applyTransfer(state, record)
    onTransfer(record, nextState, mode === 'buy' ? balance - offer : balance + offer)
    setMessage(mode === 'buy' ? `${selected.player.first_name} ${selected.player.last_name} agora faz parte do elenco.` : `${selected.player.first_name} ${selected.player.last_name} foi vendido.`)
    setSelected(null)
    setSaving(false)
  }

  return <main className="min-h-screen">
    <header className="flex h-20 items-center justify-between border-b border-white/6 px-6 md:px-10">
      <button onClick={back} className="flex items-center gap-3 text-sm font-semibold text-white/60 hover:text-white"><ArrowLeft size={18} /> MERCADO</button>
      <div className="flex items-center gap-3 text-xs text-white/35"><span>Caixa</span><span className="font-bold text-emerald-300">{money(balance)}</span></div>
    </header>

    <section className="px-6 py-8 md:px-10">
      <div className="flex flex-col justify-between gap-6 border-b border-white/6 pb-8 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-white/35">{club.name}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">Mercado de transferências</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/35">Encontre jogadores, faça uma proposta e monte seu elenco sem comprometer o caixa.</p>
        </div>
        <div className="rounded-xl border border-white/7 bg-white/[0.025] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">Movimentações</p>
          <p className="mt-1 text-lg font-bold">{state.records.length}</p>
        </div>
      </div>

      <div className="mt-6 flex gap-2 rounded-xl border border-white/6 bg-white/[0.02] p-1"><button onClick={() => { setMode('buy'); setSelected(null) }} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold ${mode === 'buy' ? 'bg-emerald-400 text-[#06100c]' : 'text-white/40'}`}>Comprar</button><button onClick={() => { setMode('sell'); setSelected(null) }} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold ${mode === 'sell' ? 'bg-emerald-400 text-[#06100c]' : 'text-white/40'}`}>Vender</button></div>

      {mode === 'buy' && (
        <div className="mt-6 flex flex-col gap-3 md:flex-row">
          <label className="flex flex-1 items-center gap-3 rounded-xl border border-white/7 bg-white/[0.02] px-4">
            <Search size={16} className="text-white/30" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar jogador ou clube" className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-white/20" />
          </label>
          <div className="flex gap-2 overflow-x-auto">
            {['ALL','GK','RB','CB','LB','DM','CM','AM','RW','LW','ST'].map(item => <button key={item} onClick={() => setPosition(item)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${position === item ? 'bg-emerald-400 text-[#06100c]' : 'border border-white/7 bg-white/[0.02] text-white/40'}`}>{item === 'ALL' ? 'Todos' : item}</button>)}
          </div>
        </div>
      )}

      {mode === 'sell' && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/6">
          <div className="bg-white/[0.03] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/25">Seu elenco · {myPlayers.length} jogadores</div>
          {myPlayers.map(item => (
            <button key={item.player.id} onClick={() => openPlayer(item, 'sell')} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-t border-white/5 px-4 py-4 text-left hover:bg-white/[0.025] md:grid-cols-[1.8fr_1fr_70px_70px_110px]">
              <div><p className="text-sm font-semibold">{item.player.first_name} {item.player.last_name}</p><p className="text-xs text-white/30">{item.player.age} anos · Pot. {item.player.potential}</p></div>
              <span className="text-xs text-white/40">Seu elenco</span>
              <span className="hidden text-xs font-bold text-emerald-300 md:block">{item.player.position}</span>
              <span className="hidden text-sm font-bold md:block">{playerOverall(item.player)}</span>
              <span className="text-xs text-white/35">{money(item.marketValue)}</span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="mt-6 rounded-xl border border-red-400/15 bg-red-400/5 p-4 text-sm text-red-200">Não foi possível carregar o mercado. {error}</div>}
      {loading && <div className="py-20 text-center text-sm text-white/35">Carregando mercado...</div>}
      {!loading && !error && <div className="mt-5 overflow-hidden rounded-2xl border border-white/6">
        <div className="hidden grid-cols-[1.8fr_1fr_70px_70px_110px] bg-white/[0.03] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/25 md:grid">
          <span>Jogador</span><span>Clube</span><span>Pos.</span><span>GER</span><span>Valor</span>
        </div>
        {filtered.map(item => <button key={item.player.id} onClick={() => openPlayer(item, 'buy')} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-t border-white/5 px-4 py-4 text-left hover:bg-white/[0.025] md:grid-cols-[1.8fr_1fr_70px_70px_110px]">
          <div><p className="text-sm font-semibold">{item.player.first_name} {item.player.last_name}</p><p className="text-xs text-white/30">{item.player.age} anos · Pot. {item.player.potential}</p></div>
          <span className="text-xs text-white/40">{item.club.short_name}</span>
          <span className="hidden text-xs font-bold text-emerald-300 md:block">{item.player.position}</span>
          <span className="hidden text-sm font-bold md:block">{playerOverall(item.player)}</span>
          <span className="text-xs text-white/35 md:block">{money(item.marketValue)}</span>
        </button>)}
      </div>}
      {!loading && !error && !filtered.length && <div className="mt-8 rounded-2xl border border-white/6 bg-white/[0.02] p-8 text-center text-sm text-white/35">Nenhum jogador encontrado com esses filtros.</div>}

      {state.records.length > 0 && <section className="mt-8 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Histórico da carreira</p>
        <div className="mt-4 space-y-2">{state.records.slice().reverse().slice(0, 8).map(record => {
          const from = clubs.find(item => item.id === record.fromClubId)?.short_name ?? 'Mercado'
          const to = clubs.find(item => item.id === record.toClubId)?.short_name ?? 'Mercado'
          return <div key={record.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><p className="text-sm font-semibold">{record.playerName}</p><p className="text-xs text-white/30">{from} → {to} · {record.kind === 'purchase' ? 'Compra' : 'Venda'}</p></div><span className={`text-sm font-bold ${record.kind === 'sale' ? 'text-emerald-300' : 'text-red-300'}`}>{record.kind === 'sale' ? '+' : '-'}{money(record.fee)}</span></div>
        })}</div>
      </section>}
    </section>

    {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-6" onClick={() => setSelected(null)}>
      <section className="w-full max-w-xl rounded-t-3xl border border-white/8 bg-[#10141b] p-6 md:rounded-3xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/70">{selected.club.short_name} · {selected.player.position}</p><h2 className="mt-2 text-3xl font-bold">{selected.player.first_name} {selected.player.last_name}</h2><p className="mt-2 text-sm text-white/35">{selected.player.age} anos · GER {playerOverall(selected.player)} · Potencial {selected.player.potential}</p></div>
          <button onClick={() => setSelected(null)} className="rounded-lg p-2 text-white/35 hover:bg-white/5 hover:text-white"><X size={20} /></button>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/5 bg-black/10 p-4"><p className="text-xs text-white/25">Valor de mercado</p><p className="mt-1 font-semibold">{money(selected.marketValue)}</p></div>
          <div className="rounded-xl border border-white/5 bg-black/10 p-4"><p className="text-xs text-white/25">Preço pedido</p><p className="mt-1 font-semibold">{money(selectedAsking)}</p></div>
          <div className="rounded-xl border border-white/5 bg-black/10 p-4"><p className="text-xs text-white/25">Salário atual</p><p className="mt-1 font-semibold">{money(selected.salary)}/mês</p></div>
          <div className="rounded-xl border border-white/5 bg-black/10 p-4"><p className="text-xs text-white/25">Contrato</p><p className="mt-1 font-semibold">{selected.contractUntil ? new Intl.DateTimeFormat('pt-BR').format(new Date(selected.contractUntil + 'T00:00:00')) : '—'}</p></div>
        </div>
        <div className="mt-5 rounded-2xl border border-white/6 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Sua proposta</p><p className="mt-2 text-sm text-white/35">O clube aceita propostas a partir de 90% do preço pedido.</p></div><Tag size={20} className="text-emerald-300/50" /></div>
          {mode === 'sell' && <label className="mt-4 block text-xs text-white/35">Clube comprador<select value={buyerId} onChange={e => setBuyerId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/8 bg-[#0d1015] px-4 py-3 text-sm text-white outline-none">{clubs.filter(item => item.id !== club.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <input type="range" min={calculateAskingPrice(selected.player, selected.marketValue) * 0.75} max={calculateAskingPrice(selected.player, selected.marketValue) * 1.15} step={10000} value={offer} onChange={e => setOffer(Number(e.target.value))} className="mt-5 w-full" />
          <div className="mt-3 flex items-center justify-between text-sm"><span className="text-white/30">Oferta</span><span className="font-bold text-emerald-300">{money(offer)}</span></div>
          {negotiation && <p className={`mt-3 text-xs ${negotiation.accepted ? 'text-emerald-300/70' : 'text-amber-200/70'}`}>{negotiation.accepted ? 'Oferta dentro da margem de negociação.' : `Abaixo do mínimo de ${money(negotiation.minimum)}.`}</p>}
          {message && <p className="mt-3 rounded-lg border border-white/6 bg-black/10 px-3 py-2 text-xs text-white/45">{message}</p>}
          <button onClick={submitTransfer} disabled={saving || !negotiation?.accepted || (mode === 'buy' && !canCompleteTransfer(club, offer))} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-[#06100c] disabled:cursor-not-allowed disabled:opacity-30"><ShoppingBag size={16} /> {mode === 'sell' ? 'Aceitar proposta e vender' : canCompleteTransfer(club, offer) ? 'Enviar proposta e contratar' : 'Orçamento insuficiente'}</button>
        </div>
      </section>
    </div>}
  </main>
}
