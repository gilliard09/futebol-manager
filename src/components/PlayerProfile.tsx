import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { playerOverall } from '../engine/match'
import type { Club, Player } from '../types/game'

type Contract = {
  contract_until: string | null
  salary: number | null
  market_value: number | null
  joined_at: string | null
}

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

export default function PlayerProfile({ player, club, close }: { player: Player; club: Club; close: () => void }) {
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function loadContract() {
      const { data, error } = await supabase
        .from('club_players')
        .select('contract_until,salary,market_value,joined_at')
        .eq('club_id', club.id)
        .eq('player_id', player.id)
        .maybeSingle()

      if (active) {
        setContract(error ? null : data)
        setLoading(false)
      }
    }
    loadContract()
    return () => { active = false }
  }, [club.id, player.id])

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
