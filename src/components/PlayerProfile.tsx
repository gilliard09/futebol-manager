import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { playerOverall } from '../engine/matchCore'
import { playerPositionLabel } from '../engine/playerPositions'
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

export function PlayerInfoCard({ player, compact = false }: { player: Player; compact?: boolean }) {
  const condition = Math.max(0, 100 - (player.fatigue ?? 0))
  const attributes = [
    ['Velocidade', player.pace],
    ['Finalização', player.shooting],
    ['Passe', player.passing],
    ['Drible', player.dribbling],
    ['Defesa', player.defending],
    ['Físico', player.physical],
    ['Mental', player.mental],
    ['Goleiro', player.goalkeeping],
  ]

  return <section className={compact ? 'rounded-2xl border border-white/8 bg-[#10141b] p-4' : 'rounded-2xl border border-white/8 bg-[#10141b] p-5'}>
    <div className="flex items-center gap-3 border-b border-white/6 pb-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-sm font-black text-emerald-300">
        {player.first_name[0]}{player.last_name[0]}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-black leading-none text-emerald-300">{playerOverall(player)}</p>
        <h3 className="mt-1 truncate text-base font-bold">{player.first_name} {player.last_name}</h3>
        <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/35">{playerPositionLabel(player.position)} · {player.age} anos · {player.nationality}</p>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-3 gap-2">
      <div className="rounded-xl bg-black/15 p-3"><p className="text-[9px] uppercase tracking-wider text-white/25">Fôlego</p><p className="mt-1 text-sm font-bold text-emerald-300">{condition}%</p></div>
      <div className="rounded-xl bg-black/15 p-3"><p className="text-[9px] uppercase tracking-wider text-white/25">Forma</p><p className="mt-1 text-sm font-bold">{player.form}</p></div>
      <div className="rounded-xl bg-black/15 p-3"><p className="text-[9px] uppercase tracking-wider text-white/25">Moral</p><p className="mt-1 text-sm font-bold">{player.morale}</p></div>
    </div>

    <div className="mt-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">Informações de atleta</p>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2.5">
        {attributes.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-2 border-b border-white/[0.04] pb-2">
          <span className="text-[10px] text-white/35">{label}</span>
          <span className={Number(value) >= 85 ? 'text-xs font-bold text-white' : 'text-xs font-semibold text-white/65'}>{String(value)}</span>
        </div>)}
      </div>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2">
      <div className="rounded-xl border border-white/6 bg-black/10 px-3 py-2.5"><p className="text-[9px] text-white/25">Potencial</p><p className="mt-1 text-xs font-bold">{player.potential}</p></div>
      <div className="rounded-xl border border-white/6 bg-black/10 px-3 py-2.5"><p className="text-[9px] text-white/25">Treinador</p><p className="mt-1 text-xs font-bold">{player.coachRelationship ?? 50}</p></div>
    </div>
  </section>
}

export default function PlayerProfile({ player, club, today, close, onContractChange }: { player: Player; club: Club; today: string; close: () => void; onContractChange?: (oldSalary: number, newSalary: number) => void }) {
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [renewing, setRenewing] = useState(false)
  const [years, setYears] = useState(2)
  const [seasonStats, setSeasonStats] = useState<SeasonStats | null>(null)
  const [lastPerformance, setLastPerformance] = useState<{ date: string; result: string; score: string; rating: number; formDelta: number; moraleDelta: number; fatigueDelta: number } | null>(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('futebol-manager:last-match-impact') ?? 'null')
      const performance = saved?.clubId === club.id ? saved.players?.find((item: { name?: string }) => item.name === `${player.first_name} ${player.last_name}`) : null
      setLastPerformance(performance ? { date: saved.date, result: saved.result, score: saved.score, rating: Number(performance.rating ?? 0), formDelta: Number(performance.formDelta ?? 0), moraleDelta: Number(performance.moraleDelta ?? 0), fatigueDelta: Number(performance.fatigueDelta ?? 0) } : null)
    } catch {
      setLastPerformance(null)
    }
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
  }, [club.id, player.id, today])

  const status = getContractStatus(contract?.contract_until ?? null, today)
  const remaining = daysUntilContractEnd(contract?.contract_until ?? null, today)
  const renewalSalary = calculateRenewalSalary(Number(contract?.salary ?? 0), Number(contract?.market_value ?? 0), years)

  async function renew() {
    if (!contract || renewing) return
    setRenewing(true)
    const base = contract.contract_until && contract.contract_until > today ? contract.contract_until : today
    const until = addContractYears(base, years)
    const saved = JSON.parse(localStorage.getItem('futebol-manager:contracts') ?? '{}')
    saved[player.id] = { contract_until: until, salary: renewalSalary, market_value: contract.market_value ?? 0 }
    const { error } = await supabase
      .from('club_players')
      .update({ contract_until: until, salary: renewalSalary })
      .eq('player_id', player.id)
      .eq('club_id', club.id)
    if (error) {
      setRenewing(false)
      return
    }
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
          <p className="mt-2 text-sm text-white/35">{playerPositionLabel(player.position)} · {player.age} anos · {player.nationality}</p>
        </div>
        <button onClick={close} className="rounded-lg p-2 text-white/35 hover:bg-white/5 hover:text-white"><X size={20} /></button>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Info label="GER" value={String(playerOverall(player))} />
        <Info label="Potencial" value={String(player.potential)} />
        <Info label="Forma" value={String(player.form)} />
        <Info label="Moral" value={String(player.morale)} />
      </div>

      <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Estado para o próximo jogo</p>
            <p className="mt-2 text-sm text-white/40">Condição física, forma e moral entram na decisão de escalação.</p>
          </div>
          <span className="font-display text-2xl font-black text-emerald-300">{Math.max(0, 100 - (player.fatigue ?? 0))}%</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: (Math.max(0, 100 - (player.fatigue ?? 0))) + '%' }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div><p className="text-[9px] uppercase tracking-[0.12em] text-white/25">Condição</p><p className="mt-1 text-xs font-bold">{Math.max(0, 100 - (player.fatigue ?? 0))}%</p></div>
          <div><p className="text-[9px] uppercase tracking-[0.12em] text-white/25">Forma</p><p className="mt-1 text-xs font-bold">{player.form}</p></div>
          <div><p className="text-[9px] uppercase tracking-[0.12em] text-white/25">Moral</p><p className="mt-1 text-xs font-bold">{player.morale}</p></div>
        </div>
      </div>

      {lastPerformance && <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-5">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Última atuação</p><p className="mt-2 text-sm font-semibold">{lastPerformance.result} · {lastPerformance.score}</p><p className="mt-1 text-xs text-white/30">{date(lastPerformance.date)}</p></div>
          <span className="font-display text-3xl font-black text-emerald-300">{lastPerformance.rating.toFixed(1)}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2"><Info label="Forma" value={lastPerformance.formDelta > 0 ? '+' + lastPerformance.formDelta : String(lastPerformance.formDelta)} /><Info label="Moral" value={lastPerformance.moraleDelta > 0 ? '+' + lastPerformance.moraleDelta : String(lastPerformance.moraleDelta)} /><Info label="Fôlego" value={'-' + Math.max(0, lastPerformance.fatigueDelta)} /></div>
      </div>}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Info label="Relação com treinador" value={String(player.coachRelationship ?? 50)} />
        <Info label="Insatisfação" value={String(player.dissatisfaction ?? 0)} />
        <Info label="Pedidos de saída" value={player.transferRequested ? 'Sim' : 'Não'} />
        <Info label="Lesões na carreira" value={String(player.injuries ?? 0)} />
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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Carreira</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Info label="Jogos" value={String(player.careerAppearances ?? 0)} />
          <Info label="Titular" value={String(player.careerStarts ?? 0)} />
          <Info label="Minutos" value={String(player.careerMinutes ?? 0)} />
          <Info label="Gols" value={String(player.careerGoals ?? 0)} />
          <Info label="Assistências" value={String(player.careerAssists ?? 0)} />
          <Info label="Nota média" value={player.careerAverageRating ? player.careerAverageRating.toFixed(2) : '—'} />
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
