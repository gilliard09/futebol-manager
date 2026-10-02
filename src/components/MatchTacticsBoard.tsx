import { useState } from 'react'
import { ArrowRight, GripVertical, SlidersHorizontal } from 'lucide-react'
import type { Formation, Player } from '../types/game'
import type { InteractiveMatchState, InteractiveTactic, InteractiveTeam } from '../engine/interactiveMatch'
import { playerOverall } from '../engine/matchCore'
import { playerPositionLabel } from '../engine/playerPositions'

type Props = {
  session: InteractiveMatchState
  userTeam: InteractiveTeam
  onSubstitution: (outgoingId: string, incomingId: string) => void
  onTactic: (tactic: InteractiveTactic, formation?: Formation) => void
  compact?: boolean
}

const FORMATION_POSITIONS: Record<Formation, Array<{ x: number; y: number }>> = {
  '4-3-3': [
    { x: 50, y: 92 }, { x: 14, y: 77 }, { x: 38, y: 80 }, { x: 62, y: 80 }, { x: 86, y: 77 },
    { x: 28, y: 61 }, { x: 50, y: 65 }, { x: 72, y: 61 },
    { x: 18, y: 40 }, { x: 50, y: 29 }, { x: 82, y: 40 },
  ],
  '4-4-2': [
    { x: 50, y: 92 }, { x: 14, y: 77 }, { x: 38, y: 80 }, { x: 62, y: 80 }, { x: 86, y: 77 },
    { x: 18, y: 57 }, { x: 38, y: 60 }, { x: 62, y: 60 }, { x: 82, y: 57 },
    { x: 39, y: 31 }, { x: 61, y: 31 },
  ],
  '4-2-3-1': [
    { x: 50, y: 92 }, { x: 14, y: 77 }, { x: 38, y: 80 }, { x: 62, y: 80 }, { x: 86, y: 77 },
    { x: 37, y: 65 }, { x: 63, y: 65 },
    { x: 18, y: 46 }, { x: 50, y: 45 }, { x: 82, y: 46 }, { x: 50, y: 28 },
  ],
  '3-5-2': [
    { x: 50, y: 92 }, { x: 28, y: 79 }, { x: 50, y: 81 }, { x: 72, y: 79 },
    { x: 12, y: 56 }, { x: 34, y: 64 }, { x: 50, y: 56 }, { x: 66, y: 64 }, { x: 88, y: 56 },
    { x: 40, y: 30 }, { x: 60, y: 30 },
  ],
}

export function formationFieldPosition(formation: Formation, slot: number, team: InteractiveTeam) {
  const point = FORMATION_POSITIONS[formation][slot] ?? { x: 50, y: 50 }
  return { x: point.x, y: team === 'home' ? point.y : 100 - point.y }
}

function name(player: Player) {
  return player.first_name + ' ' + player.last_name
}

function shortName(player: Player) {
  return player.last_name
}

export default function MatchTacticsBoard({ session, userTeam, onSubstitution, onTactic, compact = false }: Props) {
  const team = userTeam === 'home' ? session.home : session.away
  const [dragged, setDragged] = useState<{ kind: 'starter' | 'bench'; id: string } | null>(null)
  const [dragOverId, setDragOverId] = useState('')
  const [selectedOutgoing, setSelectedOutgoing] = useState('')

  const beginDrag = (kind: 'starter' | 'bench', id: string) => {
    setDragged({ kind, id })
    if (kind === 'starter') setSelectedOutgoing(id)
  }

  const finishDrag = () => {
    setDragged(null)
    setDragOverId('')
  }

  const handleDrop = (outgoingId: string) => {
    if (!dragged || dragged.kind !== 'bench' || team.substitutions >= 5) {
      finishDrag()
      return
    }
    onSubstitution(outgoingId, dragged.id)
    setSelectedOutgoing('')
    finishDrag()
  }

  const handleBenchClick = (id: string) => {
    if (selectedOutgoing && team.substitutions < 5) {
      onSubstitution(selectedOutgoing, id)
      setSelectedOutgoing('')
      return
    }
    setSelectedOutgoing('')
  }

  return <section className={compact ? 'rounded-2xl border border-white/8 bg-[#131b2a] p-3' : 'rounded-3xl border border-white/8 bg-[#131b2a] p-4'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Escalação e substituições</p>
        <p className="mt-1 text-xs text-white/40">Arraste um reserva sobre o jogador que deseja substituir.</p>
      </div>
      <span className="rounded-full border border-white/8 px-2.5 py-1 font-mono text-[9px] font-bold text-white/40">{team.formation} · {team.substitutions}/5</span>
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(240px,0.72fr)]">
      <div className="rounded-2xl border border-white/8 bg-[#0e2f25] p-2.5">
        <div className="relative mx-auto aspect-[4/5] max-w-[440px] overflow-hidden rounded-xl border border-white/10 bg-[#145139]">
          <div className="absolute inset-3 rounded-lg border border-white/30" />
          <div className="absolute left-1/2 top-1/2 h-px w-[calc(100%-24px)] -translate-x-1/2 bg-white/20" />
          <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
          <div className="absolute left-1/2 top-3 h-11 w-28 -translate-x-1/2 border border-t-0 border-white/20" />
          <div className="absolute bottom-3 left-1/2 h-11 w-28 -translate-x-1/2 border border-b-0 border-white/20" />

          {team.lineup.map(item => {
            const pos = formationFieldPosition(team.formation, item.slot, userTeam)
            const isTarget = dragOverId === item.player.id
            return <div
              key={item.player.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
              style={{ left: pos.x + '%', top: pos.y + '%' }}
              onDragOver={event => {
                if (dragged?.kind === 'bench') {
                  event.preventDefault()
                  setDragOverId(item.player.id)
                }
              }}
              onDragLeave={() => setDragOverId('')}
              onDrop={event => {
                event.preventDefault()
                handleDrop(item.player.id)
              }}
            >
              <div
                draggable
                onDragStart={() => beginDrag('starter', item.player.id)}
                onDragEnd={finishDrag}
                onClick={() => setSelectedOutgoing(selectedOutgoing === item.player.id ? '' : item.player.id)}
                className={`group mx-auto flex h-10 w-10 cursor-grab items-center justify-center rounded-full border-2 bg-emerald-500 text-[9px] font-black text-[#04110c] shadow-lg transition active:cursor-grabbing md:h-11 md:w-11 ${isTarget ? 'scale-125 border-white ring-4 ring-white/30' : selectedOutgoing === item.player.id ? 'border-red-300 ring-2 ring-red-400/30' : 'border-emerald-300'}`}
                title={name(item.player)}
              >
                {item.player.first_name[0]}{item.player.last_name[0]}
              </div>
              <span className="mt-1 block min-w-16 rounded bg-black/65 px-1 py-0.5 text-[8px] font-bold text-white">{shortName(item.player)}</span>
              <span className="block text-[7px] font-bold uppercase tracking-wider text-white/55">{item.role} · {playerPositionLabel(item.player.position)}</span>
            </div>
          })}

          <span className="absolute left-2 top-2 rounded bg-black/30 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white/55">{userTeam === 'home' ? 'Casa' : 'Fora'}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-white/6 bg-black/10 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="label-mono text-white/30">Banco</p>
              <p className="mt-1 text-[10px] text-white/35">{selectedOutgoing ? 'Agora clique ou arraste o reserva para o titular selecionado.' : 'Arraste um jogador do banco para dentro do titular.'}</p>
            </div>
            <GripVertical size={15} className="text-white/20" />
          </div>
          <div className="mt-3 space-y-2">
            {team.bench.slice(0, 9).map(player => <button
              key={player.id}
              draggable={team.substitutions < 5}
              disabled={team.substitutions >= 5}
              onDragStart={() => beginDrag('bench', player.id)}
              onDragEnd={finishDrag}
              onClick={() => handleBenchClick(player.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/6 bg-[#131b2a] p-2.5 text-left transition hover:border-emerald-400/30 disabled:opacity-35"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] font-black">{player.first_name[0]}{player.last_name[0]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold">{name(player)}</span>
                <span className="mt-0.5 block text-[8px] uppercase tracking-wider text-white/35">{playerPositionLabel(player.position)} · OVR {playerOverall(player)}</span>
              </span>
              <ArrowRight size={13} className="text-white/20" />
            </button>)}
          </div>
        </div>

        <div className="rounded-2xl border border-white/6 bg-black/10 p-3">
          <div className="flex items-center gap-2"><SlidersHorizontal size={14} className="text-white/25" /><p className="label-mono text-white/30">Formação</p></div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(['4-3-3','4-4-2','4-2-3-1','3-5-2'] as Formation[]).map(value => <button key={value} onClick={() => onTactic(team.tactic, value)} className={team.formation === value ? 'rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-2 font-mono text-[9px] font-bold text-emerald-300' : 'rounded-lg border border-white/5 px-2 py-2 font-mono text-[9px] font-bold text-white/35'}>{value}</button>)}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {(['defensive','balanced','offensive'] as InteractiveTactic[]).map(value => <button key={value} onClick={() => onTactic(value)} className={team.tactic === value ? 'rounded-lg border border-white/15 bg-white/8 px-2 py-2 text-[9px] font-bold text-white' : 'rounded-lg border border-white/5 px-2 py-2 text-[9px] font-bold text-white/35'}>{value === 'defensive' ? 'Defensivo' : value === 'offensive' ? 'Ofensivo' : 'Equilibrado'}</button>)}
          </div>
        </div>
      </div>
    </div>
  </section>
}
