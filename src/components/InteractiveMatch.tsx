import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Shield, Square } from 'lucide-react'
import type { Fixture, Formation, ManagerProfile, Player } from '../types/game'
import {
  advanceInteractiveMinute,
  changeInteractiveTactics,
  createInteractiveMatch,
  interactiveMatchResult,
  makeInteractiveSubstitution,
  type InteractiveMatchState,
  type InteractiveTactic,
  type InteractiveTeam,
} from '../engine/interactiveMatch'
import { getAiCoachProfile, playerOverall } from '../engine/match'
import type { MatchResult } from '../engine/match'
import { formatSeasonDate, toDateKey } from '../engine/calendar'

type Props = {
  fixture: Fixture
  userClubId: string
  homePlayers: Player[]
  awayPlayers: Player[]
  tactic: InteractiveTactic
  formation: Formation
  coachStyle: ManagerProfile['style']
  coachPersonality: ManagerProfile['personality']
  back: (result: MatchResult) => void
}

function playerName(player: Player) {
  return player.first_name + ' ' + player.last_name
}

function teamName(fixture: Fixture, team: InteractiveTeam) {
  return team === 'home' ? fixture.home_club?.name ?? 'Mandante' : fixture.away_club?.name ?? 'Visitante'
}

function eventLabel(type: string) {
  if (type === 'goal') return 'GOL'
  if (type === 'red_card') return 'VERMELHO'
  if (type === 'card') return 'AMARELO'
  if (type === 'injury') return 'LESÃO'
  if (type === 'substitution') return 'SUBSTITUIÇÃO'
  if (type === 'offside') return 'IMPEDIMENTO'
  if (type === 'corner') return 'ESCANTEIO'
  if (type === 'save') return 'DEFESA'
  return 'LANCE'
}

function MatchHeader({ session, fixture }: { session: InteractiveMatchState; fixture: Fixture }) {
  return <div className="overflow-hidden rounded-3xl border border-white/8 bg-[#131b2a]">
    <div className="bg-[linear-gradient(135deg,#7c3aed_0%,#2563eb_52%,#a3e635_100%)] px-5 py-4 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/75">{fixture.competition_name ?? 'Competição'} · Rodada {fixture.round}</p>
    </div>
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-7 text-center md:px-10">
      <div>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04]"><Shield size={24} className="text-emerald-300/70" /></div>
        <p className="mt-3 text-sm font-bold">{teamName(fixture, 'home')}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/25">CASA</p>
      </div>
      <div>
        <p className="font-mono text-5xl font-bold tabular-nums">{session.homeScore}<span className="mx-2 text-white/20">:</span>{session.awayScore}</p>
        <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${session.finished ? 'border-white/10 text-white/50' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'}`}>{session.finished ? 'FIM' : session.minute + "'"}</span>
      </div>
      <div>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04]"><Shield size={24} className="text-orange-300/70" /></div>
        <p className="mt-3 text-sm font-bold">{teamName(fixture, 'away')}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/25">FORA</p>
      </div>
    </div>
  </div>
}

function TacticControls({ session, userTeam }: { session: InteractiveMatchState; userTeam: InteractiveTeam }) {
  const team = userTeam === 'home' ? session.home : session.away
  const setTactic = (value: InteractiveTactic) => {
    // A mudança é deliberadamente registrada como parte da partida: ela altera
    // o estado que será usado pelos minutos seguintes, não apenas a interface.
    return value
  }
  return <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Comando tático</p>
        <p className="mt-1 text-sm font-semibold">Ajuste sua equipe durante o jogo</p>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/25">{team.formation}</span>
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2">
      {(['defensive', 'balanced', 'offensive'] as InteractiveTactic[]).map(value => <button key={value} data-tactic={setTactic(value)} className={`rounded-xl border px-3 py-3 text-xs font-bold ${team.tactic === value ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-white/6 text-white/40 hover:text-white'}`}>{value === 'defensive' ? 'Defensivo' : value === 'offensive' ? 'Ofensivo' : 'Equilibrado'}</button>)}
    </div>
    <div className="mt-3 grid grid-cols-4 gap-2">
      {(['4-3-3', '4-4-2', '4-2-3-1', '3-5-2'] as Formation[]).map(value => <button key={value} className={`rounded-lg border px-2 py-2 text-[10px] font-bold ${team.formation === value ? 'border-white/15 bg-white/8 text-white' : 'border-white/5 text-white/30'}`}>{value}</button>)}
    </div>
    <p className="mt-3 text-[10px] leading-4 text-white/25">Use os controles abaixo durante a partida. A alteração será aplicada ao próximo minuto simulado.</p>
  </section>
}

function SubstitutionPanel({ session, userTeam, onSubstitute }: { session: InteractiveMatchState; userTeam: InteractiveTeam; onSubstitute: (outgoingId: string, incomingId: string) => void }) {
  const team = userTeam === 'home' ? session.home : session.away
  const [outgoing, setOutgoing] = useState('')
  const [incoming, setIncoming] = useState('')
  return <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Substituições</p>
        <p className="mt-1 text-sm font-semibold">{team.substitutions}/5 utilizadas</p>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/25">{team.bench.length} no banco</span>
    </div>
    <div className="mt-4 grid gap-2 md:grid-cols-2">
      <select value={outgoing} onChange={event => setOutgoing(event.target.value)} className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-xs text-white outline-none">
        <option value="">Sai jogador...</option>
        {team.lineup.filter(item => item.player.position !== 'GK').map(item => <option key={item.player.id} value={item.player.id}>{playerName(item.player)} · {playerOverall(item.player)}</option>)}
      </select>
      <select value={incoming} onChange={event => setIncoming(event.target.value)} className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-xs text-white outline-none">
        <option value="">Entra jogador...</option>
        {team.bench.map(player => <option key={player.id} value={player.id}>{playerName(player)} · {playerOverall(player)}</option>)}
      </select>
    </div>
    <button disabled={!outgoing || !incoming || team.substitutions >= 5} onClick={() => { onSubstitute(outgoing, incoming); setOutgoing(''); setIncoming('') }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-xs font-bold text-[#06100c] disabled:cursor-not-allowed disabled:opacity-30">Confirmar substituição <ArrowRight size={15} /></button>
  </section>
}

export default function InteractiveMatch({ fixture, userClubId, homePlayers, awayPlayers, tactic, formation, coachStyle, coachPersonality, back }: Props) {
  const userIsHome = fixture.home_club_id === userClubId
  const userTeam: InteractiveTeam = userIsHome ? 'home' : 'away'
  const [phase, setPhase] = useState<'pregame' | 'live' | 'postgame'>('pregame')
  const [paused, setPaused] = useState(false)
  const [session, setSession] = useState<InteractiveMatchState | null>(null)
  const [postgameTab, setPostgameTab] = useState<'events' | 'stats'>('events')
  const [lastEventCount, setLastEventCount] = useState(0)

  const savedLineup = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('futebol-manager:tactic') ?? '{}').lineup ?? {}
    } catch {
      return {}
    }
  }, [])

  const start = () => {
    const homeCoach = getAiCoachProfile(fixture.home_club_id)
    const awayCoach = getAiCoachProfile(fixture.away_club_id)
    const userConfig = { tactic, formation, coachStyle, coachPersonality }
    const homeConfig = userIsHome ? userConfig : homeCoach
    const awayConfig = userIsHome ? awayCoach : userConfig
    const next = createInteractiveMatch(
      fixture,
      homePlayers,
      awayPlayers,
      homeConfig,
      awayConfig,
      userIsHome ? savedLineup : {},
      userIsHome ? {} : savedLineup,
    )
    setSession(next)
    setPhase('live')
    setPaused(false)
  }

  useEffect(() => {
    if (!session || phase !== 'live' || paused || session.finished) return
    const timer = window.setTimeout(() => {
      setSession(current => current ? advanceInteractiveMinute(current) : current)
    }, 85)
    return () => window.clearTimeout(timer)
  }, [session, phase, paused])

  useEffect(() => {
    if (!session) return
    if (session.events.length > lastEventCount) setLastEventCount(session.events.length)
    if (session.finished && phase === 'live') {
      setPaused(true)
      setPhase('postgame')
      setPostgameTab('events')
    }
  }, [session, phase, lastEventCount])

  const result = session?.finished ? interactiveMatchResult(session) : null
  const visibleEvents = session?.events ?? []
  const liveStats = session ? { home: session.homeStats, away: session.awayStats } : null
  const user = session ? (userTeam === 'home' ? session.home : session.away) : null

  const applyTactic = (nextTactic: InteractiveTactic, nextFormation?: Formation) => {
    if (!session) return
    setSession(current => current ? changeInteractiveTactics(current, userTeam, nextTactic, nextFormation) : current)
  }

  const applySubstitution = (outgoingId: string, incomingId: string) => {
    if (!session) return
    setSession(current => current ? makeInteractiveSubstitution(current, userTeam, outgoingId, incomingId) : current)
  }

  const skipToEnd = () => {
    if (!session) return
    setPaused(true)
    setSession(current => {
      if (!current) return current
      let next = current
      while (!next.finished) next = advanceInteractiveMinute(next)
      return next
    })
  }

  const restart = () => {
    setSession(null)
    setPhase('pregame')
    setPaused(false)
  }

  return <main className="min-h-screen bg-[#0a0f1a]">
    <header className="sticky top-0 z-20 border-b border-white/6 bg-[#0a0f1a]/95 px-4 py-4 backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <button onClick={() => session && phase === 'live' ? setPaused(true) : back(result ?? session ? (result ?? interactiveMatchResult(session!)) : ({ homeScore: 0, awayScore: 0 } as MatchResult))} className="flex items-center gap-2 text-xs font-semibold text-white/45 hover:text-white"><ArrowLeft size={16} /> Sair</button>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">PARTIDA INTERATIVA</p>
        <span className="font-mono text-xs font-bold tabular-nums text-white/50">{formatSeasonDate(toDateKey(fixture.scheduled_at))}</span>
      </div>
    </header>

    <section className="mx-auto max-w-6xl px-4 py-5 md:px-8">
      {phase === 'pregame' && <section className="space-y-4">
        <MatchHeader session={{ fixture, minute: 0, homeScore: 0, awayScore: 0, events: [], homeStats: { possession: 50, shots: 0, shotsOnTarget: 0, chances: 0, tackles: 0, corners: 0, fouls: 0, yellowCards: 0, xg: 0 }, awayStats: { possession: 50, shots: 0, shotsOnTarget: 0, chances: 0, tackles: 0, corners: 0, fouls: 0, yellowCards: 0, xg: 0 }, timeline: [], home: {} as any, away: {} as any, finished: false, rng: Math.random } as InteractiveMatchState} fixture={fixture} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Sua equipe</p>
            <p className="mt-2 text-xl font-bold">{teamName(fixture, userTeam)}</p>
            <p className="mt-1 text-xs text-white/30">{formation} · {tactic === 'offensive' ? 'Ofensivo' : tactic === 'defensive' ? 'Defensivo' : 'Equilibrado'}</p>
          </div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Adversário</p>
            <p className="mt-2 text-xl font-bold">{teamName(fixture, userTeam === 'home' ? 'away' : 'home')}</p>
            <p className="mt-1 text-xs text-white/30">IA do clube · escalação e estratégia próprias</p>
          </div>
        </div>
        <button onClick={start} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-bold text-[#06100c]">Começar partida <Play size={17} /></button>
      </section>}

      {phase === 'live' && session && <section className="space-y-4">
        <MatchHeader session={session} fixture={fixture} />
        <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs font-bold text-white/50">{session.minute}'</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/6"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: (session.minute / 90) * 100 + '%' }} /></div>
            <span className="font-mono text-xs text-white/25">90'</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setPaused(value => !value)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#06100c]">{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? 'Continuar' : 'Pausar'}</button>
            <button onClick={skipToEnd} className="flex items-center gap-2 rounded-xl border border-white/8 px-4 py-2.5 text-xs font-bold text-white/60"><Square size={13} /> Pular para o fim</button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
            <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Lance a lance</p><span className="text-[10px] font-bold text-white/20">{visibleEvents.length} eventos</span></div>
            <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {visibleEvents.length ? visibleEvents.slice().reverse().map((event, index) => <div key={event.minute + '-' + index} className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${event.type === 'goal' ? 'border-emerald-400/20 bg-emerald-400/[0.06]' : event.type === 'red_card' || event.type === 'injury' ? 'border-red-400/20 bg-red-400/[0.04]' : 'border-white/5 bg-black/10'}`}>
                <span className="w-8 shrink-0 font-mono text-xs font-bold text-white/35">{event.minute}'</span>
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[9px] font-bold uppercase tracking-wider text-white/25">{eventLabel(event.type)}</span><span className={`h-1.5 w-1.5 rounded-full ${event.team === 'home' ? 'bg-emerald-400' : 'bg-orange-400'}`} /></div><p className="mt-1 text-sm font-semibold">{event.player}</p><p className="mt-1 text-xs leading-5 text-white/35">{event.text}</p></div>
              </div>) : <p className="py-8 text-center text-sm text-white/30">A partida começou. Aguardando o primeiro lance...</p>}
            </div>
          </section>

          <aside className="space-y-4">
            <TacticControls session={session} userTeam={userTeam} />
            <SubstitutionPanel session={session} userTeam={userTeam} onSubstitute={applySubstitution} />
            {user && <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Estado da equipe</p><div className="mt-4 grid grid-cols-2 gap-2">{[['Ataque', user.metrics.attack.toFixed(0)],['Meio', user.metrics.midfield.toFixed(0)],['Defesa', user.metrics.defense.toFixed(0)],['Moral', user.metrics.morale.toFixed(0)]].map(([label,value]) => <div key={label} className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="text-[9px] uppercase tracking-wider text-white/25">{label}</p><p className="mt-1 font-mono text-lg font-bold">{value}</p></div>)}</div></section>}
          </aside>
        </div>
      </section>}

      {phase === 'postgame' && session && result && <section className="space-y-4">
        <MatchHeader session={session} fixture={fixture} />
        <div className="flex rounded-xl border border-white/6 bg-[#131b2a] p-1">
          <button onClick={() => setPostgameTab('events')} className={`flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider ${postgameTab === 'events' ? 'bg-white/8 text-white' : 'text-white/35'}`}>Lances</button>
          <button onClick={() => setPostgameTab('stats')} className={`flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider ${postgameTab === 'stats' ? 'bg-white/8 text-white' : 'text-white/35'}`}>Estatísticas</button>
        </div>
        {postgameTab === 'events' && <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><div className="max-h-[560px] space-y-2 overflow-y-auto">{result.events.slice().reverse().map((event, index) => <div key={event.minute + '-' + index} className="flex gap-3 rounded-xl border border-white/5 bg-black/10 px-3 py-3"><span className="w-8 font-mono text-xs font-bold text-white/30">{event.minute}'</span><div><p className="text-sm font-semibold">{event.player}</p><p className="text-xs text-white/35">{event.text}</p></div></div>)}</div></section>}
        {postgameTab === 'stats' && <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-white/25">{teamName(fixture, 'home')}</p><div className="mt-4 space-y-2">{[['Posse', result.homeStats.possession + '%'],['Finalizações', String(result.homeStats.shots)],['No alvo', String(result.homeStats.shotsOnTarget)],['xG', result.homeStats.xg.toFixed(1)],['Cartões', String(result.homeStats.yellowCards)],['Vermelhos', String(result.homeStats.redCards ?? 0)],['Impedimentos', String(result.homeStats.offsides ?? 0)],['Lesões', String(result.homeStats.injuries ?? 0)]].map(([label,value]) => <div key={label} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2.5"><span className="text-xs text-white/35">{label}</span><span className="font-mono text-xs font-bold">{value}</span></div>)}</div></div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-white/25">{teamName(fixture, 'away')}</p><div className="mt-4 space-y-2">{[['Posse', result.awayStats.possession + '%'],['Finalizações', String(result.awayStats.shots)],['No alvo', String(result.awayStats.shotsOnTarget)],['xG', result.awayStats.xg.toFixed(1)],['Cartões', String(result.awayStats.yellowCards)],['Vermelhos', String(result.awayStats.redCards ?? 0)],['Impedimentos', String(result.awayStats.offsides ?? 0)],['Lesões', String(result.awayStats.injuries ?? 0)]].map(([label,value]) => <div key={label} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2.5"><span className="text-xs text-white/35">{label}</span><span className="font-mono text-xs font-bold">{value}</span></div>)}</div></div>
        </section>}
        <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-white/25">Notas dos jogadores</p><div className="mt-4 grid gap-2 md:grid-cols-2">{result.playerRatings.sort((a,b) => b.rating-a.rating).map(player => <div key={player.playerId + player.team} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-3 py-3"><div><p className="text-sm font-semibold">{player.name}</p><p className="text-xs text-white/30">{player.team === 'home' ? teamName(fixture, 'home') : teamName(fixture, 'away')} · {player.position}</p></div><span className="rounded-lg bg-emerald-400/10 px-2.5 py-1.5 font-mono text-xs font-bold text-emerald-300">{player.rating.toFixed(1)}</span></div>)}</div></section>
        <button onClick={() => back(result)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-4 text-sm font-bold text-[#06100c]">Voltar ao clube <ArrowLeft size={16} /></button>
        <button onClick={restart} className="mx-auto flex items-center gap-2 text-xs font-semibold text-white/30 hover:text-white"><RotateCcw size={14} /> Repetir partida</button>
      </section>}
    </section>
  </main>
}
