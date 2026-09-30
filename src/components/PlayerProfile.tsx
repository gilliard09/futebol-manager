import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { playerOverall } from '../engine/match'
import { addContractYears, calculateRenewalSalary, daysUntilContractEnd, getContractStatus } from '../engine/contracts'
import type { Club, Player } from '../types/game'

type Contract = {
  contract_until: string | null
  salary: number | null
  market_value: number | null
  joined_at: string | null
}
type SavedContract = { contract_until: string | null; salary: number; market_value: number }
type SeasonStats = { appearances: number; starts: number; minutes: number; goals: number; assists: number; avg_rating: number }

function money(value: number | null) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function date(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR').format(new Date(value + (value.length === 10 ? 'T00:00:00' : '')))
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/5 bg-black/10 p-4">
    <p className="text-xs text-white/25">{label}</p>
    <p className="mt-1 text-sm font-semibold">{value}</p>
  </div>
}

export default function PlayerProfile({ player, club, today, close, onContractChange }: { player: Player; club: Club; today: string; close: () => void; onContractChange?: (oldSalary: number, newSalary: number) => void }) {
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [renewing, setRenewing] = useState(false)
  const [years, setYears] = useState(2)
  const [seasonStats, setSeasonStats] = useState<SeasonStats | null>(null)

  useEffect(() => {
    let active = true
    async function loadContract() {
      const [contractResult, seasonResult] = await Promise.all([
        supabase
          .from('club_players')
          .select('contract_until,salary,market_value,joined_at')
          .eq('player_id', player.id)
          .maybeSingle(),
        supabase
          .from('seasons')
          .select('id')
          .eq('year', Number(today.slice(0, 4)))
          .maybeSingle(),
      ])

      if (active) {
        let next = contractResult.error ? null : contractResult.data as Contract
        try {
          const saved = JSON.parse(localStorage.getItem('futebol-manager:contracts') ?? '{}')
          const override = saved[player.id] as SavedContract | undefined
          if (override) next = { ...(next ?? { contract_until: null, salary: 0, market_value: 0, joined_at: null }), contract_until: override.contract_until, salary: override.salary, market_value: override.market_value }
        } catch {}
        setContract(next)

        if (seasonResult.data?.id) {
          const { data: stats } = await supabase
            .from('player_season_stats')
            .select('appearances,starts,minutes,goals,assists,avg_rating')
            .eq('season_id', seasonResult.data.id)
            .eq('player_id', player.id)
            .maybeSingle()
          setSeasonStats(stats ? {
            appearances: Number(stats.appearances ?? 0),
            starts: Number(stats.starts ?? 0),
            minutes: Number(stats.minutes ?? 0),
            goals: Number(stats.goals ?? 0),
            assists: Number(stats.assists ?? 0),
            avg_rating: Number(stats.avg_rating ?? 0),
          } : null)
        } else {
          setSeasonStats(null)
        }
        setLoading(false)
      }
    }
    loadContract()
    return () => { active = false }
  }, [club.id, player.id])

  const status = getContractStatus(contract?.contract_until ?? null, today)
  const remaining = daysUntilContractEnd(contract?.contract_until ?? null, today)
  const renewalSalary = calculateRenewalSalary(Number(contract?.salary ?? 0), Number(contract?.market_value ?? 0), years)

  function renew() {
    if (!contract || renewing) return
    setRenewing(true)
    const base = contract.contract_until && contract.contract_until > today ? contract.contract_until : today
    const until = addContractYears(base, years)
    const saved = JSON.parse(localStorage.getItem('futebol-manager:contracts') ?? '{}')
    saved[player.id] = { contract_until: until, salary: renewalSalary, market_value: contract.market_value ?? 0 }
    localStorage.setItem('futebol-manager:contracts', JSON.stringify(saved))
    setContract({ ...contract, contract_until: until, salary: renewalSalary })
    onContractChange?.(Number(contract.salary ?? 0), renewalSalary)
    setRenewing(false)
  }

  const statusLabel = status === 'expired' ? 'Contrato vencido' : status === 'critical' ? `Vence em ${remaining} dias` : status === 'attention' ? `Vence em ${remaining} dias` : remaining === null ? 'Sem data definida' : `Válido por ${remaining} dias`

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-6" onClick={close}>
    <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/8 bg-[#10141b] p-6 shadow-2xl md:rounded-3xl md:p-8" onClick={event => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/70">{club.short_name} · #{player.squad_number}</p>
          <h2 className="mt-2 text-3xl font-bold">{player.first_name} {player.last_name}</h2>
          <p className="mt-2 text-sm text-white/35">{player.position} · {player.age} anos · {player.nationality}</p>
        </div>
        <button onClick={close} className="rounded-lg p-2 text-white/35 hover:bg-white/5 hover:text-white"><X size={20} /></button>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Info label="GER" value={String(playerOverall(player))} />
        <Info label="Potencial" value={String(player.potential)} />
        <Info label="Forma" value={String(player.form)} />
        <Info label="Moral" value={String(player.morale)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Info label="Valor de mercado" value={loading ? 'Carregando...' : money(contract?.market_value ?? null)} />
        <Info label="Salário" value={loading ? 'Carregando...' : money(contract?.salary ?? null)} />
        <Info label="Contrato até" value={loading ? 'Carregando...' : date(contract?.contract_until ?? null)} />
        <Info label="No clube desde" value={loading ? 'Carregando...' : date(contract?.joined_at ?? null)} />
      </div>

      <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${status === 'expired' || status === 'critical' ? 'border-amber-400/20 bg-amber-400/5 text-amber-200' : 'border-white/6 bg-black/10 text-white/45'}`}><div className="flex items-center justify-between gap-3"><span>{statusLabel}</span>{status !== 'safe' && <span className="text-xs font-semibold">Renovação necessária</span>}</div></div>

      <div className="mt-5 rounded-2xl border border-white/6 bg-white/[0.02] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Renovar contrato</p><p className="mt-2 text-sm text-white/40">Nova duração e salário proposto para esta carreira.</p></div><span className="text-sm font-bold text-emerald-300">{money(renewalSalary)}/mês</span></div><div className="mt-4 flex flex-col gap-3 sm:flex-row"><select value={years} onChange={e => setYears(Number(e.target.value))} className="rounded-xl border border-white/8 bg-[#0d1015] px-4 py-3 text-sm outline-none"><option value={1}>1 ano</option><option value={2}>2 anos</option><option value={3}>3 anos</option><option value={4}>4 anos</option></select><button onClick={renew} disabled={renewing || loading} className="flex-1 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-[#06100c] disabled:opacity-40">{renewing ? 'Renovando...' : `Renovar por ${years} anos`}</button></div></div>

      <div className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Temporada atual</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Info label="Jogos" value={String(seasonStats?.appearances ?? 0)} />
          <Info label="Titular" value={String(seasonStats?.starts ?? 0)} />
          <Info label="Minutos" value={String(seasonStats?.minutes ?? 0)} />
          <Info label="Gols" value={String(seasonStats?.goals ?? 0)} />
          <Info label="Assistências" value={String(seasonStats?.assists ?? 0)} />
          <Info label="Nota média" value={seasonStats ? seasonStats.avg_rating.toFixed(1) : '—'} />
        </div>
      </div>

      <div className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Atributos</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Velocidade', player.pace],
            ['Finalização', player.shooting],
            ['Passe', player.passing],
            ['Drible', player.dribbling],
            ['Defesa', player.defending],
            ['Físico', player.physical],
            ['Goleiro', player.goalkeeping],
            ['Mental', player.mental],
          ].map(([label, value]) => <Info key={label} label={String(label)} value={String(value)} />)}
        </div>
      </div>
    </section>
  </div>
}
