import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Square, Goal, HeartPulse, CreditCard, Users, Zap, SlidersHorizontal } from 'lucide-react'
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
  cancel: () => void
}

function addDaysLocal(date: string, days: number) {
  const value = new Date(date + 'T00:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
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
  if (type === 'tactical_change') return 'TÁTICA'
  if (type === 'offside') return 'IMPEDIMENTO'
  if (type === 'corner') return 'ESCANTEIO'
  if (type === 'save') return 'DEFESA'
  return 'LANCE'
}

function MatchHeader({ fixture, homeScore, awayScore, minute, finished }: { fixture: Fixture; homeScore: number; awayScore: number; minute: number; finished: boolean }) {
  return <div className="overflow-hidden rounded-3xl border border-white/8 bg-[#131b2a]">
    <div className="bg-[linear-gradient(135deg,#7c3aed_0%,#2563eb_52%,#a3e635_100%)] px-5 py-4 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/75">{fixture.competition_name ?? 'Competição'} · Rodada {fixture.round}</p>
    </div>
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-7 text-center md:px-10">
      <div>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04]">{crestLabel(teamName(fixture, 'home'))}</div>
        <p className="mt-3 text-sm font-bold">{teamName(fixture, 'home')}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/25">CASA</p>
      </div>
      <div>
        <p className="font-mono text-5xl font-bold tabular-nums">{homeScore}<span className="mx-2 text-white/20">:</span>{awayScore}</p>
        <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${finished ? 'border-white/10 text-white/50' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'}`}>{finished ? 'FIM' : minute + "'"}</span>
      </div>
      <div>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04]">{crestLabel(teamName(fixture, 'away'))}</div>
        <p className="mt-3 text-sm font-bold">{teamName(fixture, 'away')}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/25">FORA</p>
      </div>
    </div>
  </div>
}


function playerFieldPosition(role: string, team: InteractiveTeam, occurrence: number) {
  const home = team === 'home'
  const map: Record<string, { x: number; y: number }[]> = {
    GK: [{ x: 50, y: 94 }], CB: [{ x: 35, y: 78 }, { x: 65, y: 78 }], LB: [{ x: 14, y: 80 }], RB: [{ x: 86, y: 80 }],
    DM: [{ x: 50, y: 67 }, { x: 38, y: 66 }], CM: [{ x: 50, y: 57 }, { x: 34, y: 59 }, { x: 66, y: 59 }],
    AM: [{ x: 50, y: 46 }], LW: [{ x: 18, y: 43 }], RW: [{ x: 82, y: 43 }], ST: [{ x: 50, y: 30 }, { x: 42, y: 31 }],
  }
  const point = map[role]?.[occurrence] ?? map[role]?.[0] ?? map.CM[0]
  return { x: point.x, y: home ? point.y : 100 - point.y }
}

function Pitch({ session, userTeam }: { session: InteractiveMatchState; userTeam: InteractiveTeam }) {
  const renderTeam = (teamNameValue: InteractiveTeam) => {
    const team = teamNameValue === 'home' ? session.home : session.away
    const counts: Record<string, number> = {}
    return team.lineup.map(item => {
      const occurrence = counts[item.role] ?? 0
      counts[item.role] = occurrence + 1
      const pos = playerFieldPosition(item.role, teamNameValue, occurrence)
      const userSide = teamNameValue === userTeam
      return <div key={item.player.id} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: pos.x + '%', top: pos.y + '%' }}>
        <div className={userSide ? 'mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 border-emerald-300 bg-emerald-500 text-[#04110c] shadow-lg md:h-10 md:w-10' : 'mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 border-orange-300 bg-orange-500 text-[#1a0b00] shadow-lg md:h-10 md:w-10'}>
          <span className="text-[10px] font-black">{item.player.first_name[0]}{item.player.last_name[0]}</span>
        </div>
        <span className="mt-1 block max-w-20 truncate rounded bg-black/55 px-1 text-[8px] font-bold text-white">{item.player.last_name}</span>
      </div>
    })
  }
  return <section className="rounded-3xl border border-white/8 bg-[#131b2a] p-3 md:p-4">
    <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Escalação em campo</p><p className="mt-1 text-xs text-white/35">Verde = sua equipe · laranja = adversário</p></div><span className="rounded-full border border-white/8 px-2.5 py-1 font-mono text-[9px] font-bold text-white/35">{session.home.formation} · {session.away.formation}</span></div>
    <div className="relative mx-auto aspect-[4/5] max-w-[470px] overflow-hidden rounded-2xl border border-white/10 bg-[#123b2d]">
      <div className="absolute inset-3 rounded-xl border border-white/35" />
      <div className="absolute left-1/2 top-1/2 h-px w-[calc(100%-24px)] -translate-x-1/2 bg-white/25" />
      <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
      <div className="absolute left-1/2 top-3 h-12 w-32 -translate-x-1/2 border border-t-0 border-white/25" />
      <div className="absolute bottom-3 left-1/2 h-12 w-32 -translate-x-1/2 border border-b-0 border-white/25" />
      {renderTeam('away')}{renderTeam('home')}
      <span className="absolute left-2 top-2 rounded bg-black/30 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white/55">Fora</span>
      <span className="absolute bottom-2 left-2 rounded bg-black/30 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white/55">Casa</span>
    </div>
  </section>
}

function Bench({ session, userTeam, selectedOutgoing, onSelectIncoming }: { session: InteractiveMatchState; userTeam: InteractiveTeam; selectedOutgoing: string; onSelectIncoming: (id: string) => void }) {
  const team = userTeam === 'home' ? session.home : session.away
  return <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
    <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Banco</p><p className="mt-1 text-sm font-semibold">Escolha quem entra</p></div><span className="font-mono text-xs font-bold text-white/35">{team.substitutions}/5</span></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {team.bench.slice(0, 9).map(player => <button key={player.id} disabled={team.substitutions >= 5 || !selectedOutgoing} onClick={() => onSelectIncoming(player.id)} className="flex items-center gap-3 rounded-xl border border-white/6 bg-black/10 p-3 text-left transition hover:border-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-30">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] font-black">{player.first_name[0]}{player.last_name[0]}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{playerName(player)}</span><span className="mt-0.5 block text-[9px] uppercase tracking-wider text-white/25">{player.position} · OVR {playerOverall(player)}</span></span>
        <ArrowRight size={14} className="text-white/20" />
      </button>)}
    </div>
    {selectedOutgoing && <p className="mt-3 rounded-lg bg-emerald-400/8 px-3 py-2 text-[10px] font-bold text-emerald-300">Jogador de saída selecionado. Escolha um reserva.</p>}
  </section>
}

export default function InteractiveMatch({ fixture, userClubId, homePlayers, awayPlayers, tactic, formation, coachStyle, coachPersonality, back, cancel }: Props) {
  const userIsHome = fixture.home_club_id === userClubId
  const userTeam: InteractiveTeam = userIsHome ? 'home' : 'away'
  const [phase, setPhase] = useState<'pregame' | 'live' | 'postgame'>('pregame')
  const [paused, setPaused] = useState(false)
  const [session, setSession] = useState<InteractiveMatchState | null>(null)
  const [postgameTab, setPostgameTab] = useState<'events' | 'stats'>('events')
  const [lastEventCount, setLastEventCount] = useState(0)
  const [selectedOutgoing, setSelectedOutgoing] = useState('')
  const [eventFilter, setEventFilter] = useState<'all' | 'goal' | 'discipline' | 'injury' | 'substitution' | 'chance'>('all')

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
    const homeAiConfig = { tactic: homeCoach.tactic, formation: homeCoach.formation, coachStyle: homeCoach.style, coachPersonality: homeCoach.personality }
    const awayAiConfig = { tactic: awayCoach.tactic, formation: awayCoach.formation, coachStyle: awayCoach.style, coachPersonality: awayCoach.personality }
    const homeConfig = userIsHome ? userConfig : homeAiConfig
    const awayConfig = userIsHome ? awayAiConfig : userConfig
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
      setSession(current => current ? advanceInteractiveMinute(current, userTeam) : current)
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
      while (!next.finished) next = advanceInteractiveMinute(next, userTeam)
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
        <button onClick={() => {
          if (phase === 'pregame') { cancel(); return }
          if (phase === 'live') { setPaused(true); return }
          if (result) back(result)
        }} className="flex items-center gap-2 text-xs font-semibold text-white/45 hover:text-white"><ArrowLeft size={16} /> {phase === 'pregame' ? 'Voltar' : 'Sair'}</button>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">PARTIDA INTERATIVA</p>
        <span className="font-mono text-xs font-bold tabular-nums text-white/50">{formatSeasonDate(toDateKey(fixture.scheduled_at))}</span>
      </div>
    </header>

    <section className="mx-auto max-w-6xl px-4 py-5 md:px-8">
      {phase === 'pregame' && <section className="space-y-4">
        <MatchHeader fixture={fixture} homeScore={0} awayScore={0} minute={0} finished={false} />
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
        <MatchHeader fixture={fixture} homeScore={session.homeScore} awayScore={session.awayScore} minute={session.minute} finished={session.finished} />
        <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
          <div className="flex items-center justify-between gap-3"><span className="font-mono text-xs font-bold text-white/50">{session.minute}'</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/6"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: (session.minute / 90) * 100 + '%' }} /></div><span className="font-mono text-xs text-white/25">90'</span></div>
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setPaused(value => !value)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#06100c]">{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? 'Continuar' : 'Pausar'}</button><button onClick={skipToEnd} className="flex items-center gap-2 rounded-xl border border-white/8 px-4 py-2.5 text-xs font-bold text-white/60"><Square size={13} /> Pular para o fim</button><span className="ml-auto flex items-center gap-1.5 rounded-xl border border-white/6 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-white/25"><Zap size={12} /> {paused ? 'Pausado' : 'Ao vivo'}</span></div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-4">
            <Pitch session={session} userTeam={userTeam} />
            <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Sua escalação</p><p className="mt-1 text-xs text-white/30">Selecione um titular para preparar a substituição.</p></div><span className="font-mono text-[9px] text-white/25">{user?.lineup.length ?? 0} em campo</span></div>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">{user?.lineup.map(item => <button key={item.player.id} disabled={item.player.position === 'GK'} onClick={() => setSelectedOutgoing(item.player.id)} className={selectedOutgoing === item.player.id ? 'flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/8 p-2.5 text-left' : 'flex items-center gap-2 rounded-xl border border-white/5 bg-black/10 p-2.5 text-left'}><span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-[8px] font-black">{item.player.first_name[0]}{item.player.last_name[0]}</span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold">{playerName(item.player)}</span><span className="block text-[8px] uppercase tracking-wider text-white/25">{item.role} · OVR {playerOverall(item.player)}</span></span></button>)}</div>
            </section>
            <Bench session={session} userTeam={userTeam} selectedOutgoing={selectedOutgoing} onSelectIncoming={(incomingId) => { if (selectedOutgoing) { applySubstitution(selectedOutgoing, incomingId); setSelectedOutgoing('') } }} />
          </div>
          <aside className="space-y-4">
            <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Comando tático</p><p className="mt-1 text-sm font-semibold">Ajuste sem sair da partida</p></div><SlidersHorizontal size={16} className="text-white/25" /></div>
              <div className="mt-4 grid grid-cols-3 gap-2">{(['defensive','balanced','offensive'] as InteractiveTactic[]).map(value => <button key={value} onClick={() => applyTactic(value)} className={user.tactic === value ? 'rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-2.5 text-[10px] font-bold text-emerald-300' : 'rounded-xl border border-white/6 bg-black/10 p-2.5 text-[10px] font-bold text-white/45'}>{value === 'defensive' ? 'Defensivo' : value === 'offensive' ? 'Ofensivo' : 'Equilibrado'}</button>)}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">{(['4-3-3','4-4-2','4-2-3-1','3-5-2'] as Formation[]).map(value => <button key={value} onClick={() => applyTactic(user.tactic, value)} className={user.formation === value ? 'rounded-lg border border-white/20 bg-white/8 px-2.5 py-2 font-mono text-[9px] font-bold text-white' : 'rounded-lg border border-white/5 px-2.5 py-2 font-mono text-[9px] font-bold text-white/30'}>{value}</button>)}</div>
            </section>
            <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Lance a lance</p><p className="mt-1 text-xs text-white/25">Eventos em tempo real</p></div><span className="font-mono text-[9px] text-white/20">{visibleEvents.length}</span></div>
              <div className="mt-3 flex flex-wrap gap-1.5">{([['all','Tudo'],['goal','Gols'],['discipline','Cartões'],['injury','Lesões'],['substitution','Substituições'],['chance','Chances']] as const).map(([id,label]) => <button key={id} onClick={() => setEventFilter(id)} className={eventFilter === id ? 'rounded-lg border border-white/15 bg-white/8 px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-white' : 'rounded-lg border border-white/5 px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-white/25'}>{label}</button>)}</div>
              <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {visibleEvents.slice().reverse().filter(event => eventFilter === 'all' || (eventFilter === 'goal' ? event.type === 'goal' : eventFilter === 'discipline' ? ['card','red_card'].includes(event.type) : eventFilter === 'injury' ? event.type === 'injury' : eventFilter === 'substitution' ? event.type === 'substitution' : event.type === 'chance')).map((event, index) => {
                  const goal = event.type === 'goal'
                  const danger = event.type === 'red_card' || event.type === 'injury'
                  const icon = goal ? <Goal size={14} /> : event.type === 'injury' ? <HeartPulse size={14} /> : event.type === 'red_card' || event.type === 'card' ? <CreditCard size={14} /> : event.type === 'substitution' ? <Users size={14} /> : <Zap size={14} />
                  const cardClass = goal ? 'border-emerald-400/25 bg-emerald-400/8' : danger ? 'border-red-400/25 bg-red-400/7' : event.type === 'card' ? 'border-yellow-400/15 bg-yellow-400/5' : 'border-white/5 bg-black/10'
                  const iconClass = goal ? 'bg-emerald-400/15 text-emerald-300' : danger ? 'bg-red-400/15 text-red-300' : event.type === 'card' ? 'bg-yellow-400/10 text-yellow-300' : 'bg-white/5 text-white/35'
                  return <div key={event.minute + '-' + index} className={'flex items-start gap-2 rounded-xl border p-3 ' + cardClass}>
                    <span className={'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ' + iconClass}>{icon}</span><span className="w-7 shrink-0 font-mono text-[10px] font-bold text-white/35">{event.minute}'</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[8px] font-bold uppercase tracking-wider text-white/25">{eventLabel(event.type)}</span><span className={event.team === 'home' ? 'h-1.5 w-1.5 rounded-full bg-emerald-400' : 'h-1.5 w-1.5 rounded-full bg-orange-400'} /></div><p className="mt-1 text-xs font-bold">{event.player}</p><p className="mt-1 text-[10px] leading-4 text-white/35">{event.text}</p></div>
                  </div>
                })}
                {!visibleEvents.length && <p className="py-8 text-center text-xs text-white/25">A partida começou. O próximo lance aparecerá aqui.</p>}
              </div>
            </section>
          </aside>
        </div>
      </section>}

      {phase === 'postgame' && session && result && <section className="space-y-4">
        <MatchHeader fixture={fixture} homeScore={session.homeScore} awayScore={session.awayScore} minute={session.minute} finished={session.finished} />
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
