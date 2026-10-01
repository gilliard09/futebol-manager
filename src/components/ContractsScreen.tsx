import { useMemo, useState } from 'react'
import { ArrowLeft, FileText } from 'lucide-react'
import type { Club, Player } from '../types/game'
import { daysUntilContractEnd, getContractStatus } from '../engine/contracts'
import PlayerProfile from './PlayerProfile'
import { playerOverall } from '../engine/matchCore'

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}
function statusLabel(status: ReturnType<typeof getContractStatus>, days: number | null) {
  if (status === 'expired') return 'Vencido'
  if (status === 'critical') return 'Vence em ' + (days ?? 0) + ' dias'
  if (status === 'attention') return 'Vence em ' + (days ?? 0) + ' dias'
  return days === null ? 'Sem prazo' : 'Válido por ' + days + ' dias'
}
export default function ContractsScreen({ players, club, today, onContractChange, back }: { players: Player[]; club: Club; today: string; onContractChange?: (oldSalary: number, newSalary: number) => void; back: () => void }) {
  const [selected, setSelected] = useState<Player | null>(null)
  const rows = useMemo(() => {
    let saved: Record<string, { contract_until?: string | null; salary?: number }> = {}
    try { saved = JSON.parse(localStorage.getItem('futebol-manager:contracts') ?? '{}') } catch {}
    return players.map(player => {
      const override = saved[player.id]
      const effectivePlayer = override
        ? { ...player, contractUntil: override.contract_until ?? player.contractUntil, salary: Number(override.salary ?? player.salary ?? 0) }
        : player
      const until = effectivePlayer.contractUntil ?? null
      return { player: effectivePlayer, status: getContractStatus(until, today), days: daysUntilContractEnd(until, today) }
    }).sort((a, b) => (a.days ?? 999999) - (b.days ?? 999999))
  }, [players, today])
  const critical = rows.filter(row => row.status === 'critical' || row.status === 'expired').length
  const attention = rows.filter(row => row.status === 'attention').length
  return <main className="min-h-screen bg-[#0a0f1a] px-4 py-5 sm:px-6 lg:px-8">
    <button onClick={back} className="mb-6 flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white"><ArrowLeft size={15} /> Voltar</button>
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="label-mono text-white/30">Clube · Elenco</p><h1 className="mt-1 font-display text-3xl font-bold">Contratos</h1><p className="mt-2 text-sm text-white/40">Controle salários, prazos e renovações antes que o mercado decida por você.</p></div><FileText size={28} className="text-emerald-300/45" /></div>
    <div className="grid gap-3 md:grid-cols-3"><div className="game-panel"><p className="label-mono text-white/30">Contratos</p><p className="mt-2 font-display text-2xl font-bold">{rows.length}</p><p className="mt-1 text-xs text-white/30">jogadores no elenco</p></div><div className="game-panel"><p className="label-mono text-white/30">Atenção</p><p className="mt-2 font-display text-2xl font-bold text-amber-200">{attention}</p><p className="mt-1 text-xs text-white/30">até 90 dias</p></div><div className="game-panel"><p className="label-mono text-white/30">Urgentes</p><p className="mt-2 font-display text-2xl font-bold text-red-300">{critical}</p><p className="mt-1 text-xs text-white/30">vencidos ou até 30 dias</p></div></div>
    <section className="game-panel mt-4 overflow-hidden p-0"><div className="hidden grid-cols-[1.8fr_80px_120px_150px_170px] bg-white/[0.03] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/25 md:grid"><span>Jogador</span><span>GER</span><span>Salário</span><span>Contrato</span><span>Status</span></div>
      {rows.map(({ player, status, days }) => <button key={player.id} onClick={() => setSelected(player)} className="grid w-full grid-cols-[1fr_auto] gap-3 border-t border-white/5 px-4 py-4 text-left hover:bg-white/[0.025] md:grid-cols-[1.8fr_80px_120px_150px_170px]"><div><p className="text-sm font-semibold">{player.first_name} {player.last_name}</p><p className="mt-1 text-xs text-white/30">{player.position} · {player.age} anos</p></div><span className="hidden text-sm font-bold text-emerald-300 md:block">{playerOverall(player)}</span><span className="text-xs font-semibold text-white/55">{money(player.salary ?? 0)}/mês</span><span className="hidden text-xs text-white/45 md:block">{player.contractUntil ?? '—'}</span><span className={'text-xs font-bold ' + (status === 'expired' || status === 'critical' ? 'text-red-300' : status === 'attention' ? 'text-amber-200' : 'text-emerald-300/70')}>{statusLabel(status, days)}</span></button>)}
    </section>
    {selected && <PlayerProfile player={selected} club={club} today={today} onContractChange={onContractChange} close={() => setSelected(null)} />}
  </main>
}
