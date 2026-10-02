import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Square, Goal, HeartPulse, CreditCard, Users, Zap, SlidersHorizontal } from 'lucide-react'
import type { Fixture, Formation, LineupPlayer, ManagerProfile, Player } from '../types/game'
import {
  advanceInteractiveMinute,
  changeInteractiveTactics,
  createInteractiveMatch,
  interactiveMatchResult,
  makeInteractiveSubstitution,
  changeInteractiveInstruction,
  changeInteractivePlayerInstruction,
  changeInteractiveRisk,
  resolveInteractivePenalty,
  type InteractiveMatchState,
  type InteractiveTactic,
  type InteractiveTeam,
  type TacticalInstruction,
} from '../engine/interactiveMatch'
import { getAiCoachProfile, playerOverall, selectStartingLineup } from '../engine/matchCore'
import { playerPositionLabel } from '../engine/playerPositions'
import type { MatchEvent, MatchResult } from '../engine/match'
import { formatSeasonDate, toDateKey } from '../engine/calendar'
import { playMatchSound } from '../engine/matchAudio'
import MatchTacticsBoard, { formationFieldPosition } from './MatchTacticsBoard'


type Props = {
  fixture: Fixture
  userClubId: string
  homePlayers: Player[]
  awayPlayers: Player[]
  tactic: InteractiveTactic
  formation: Formation
  coachStyle: ManagerProfile['style']
  coachPersonality: ManagerProfile['personality']
  boardConfidence?: number
  leaguePosition?: number | null
  leaguePoints?: number | null
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

function crestLabel(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
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
  if (type === 'penalty') return 'PÊNALTI'
  return 'LANCE'
}

function MatchHeader({ fixture, homeScore, awayScore, minute, finished }: { fixture: Fixture; homeScore: number; awayScore: number; minute: number; finished: boolean }) {
  return <div className="overflow-hidden rounded-3xl border border-white/8 bg-[#131b2a]">
    <div className="match-gradient px-5 py-4 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/75">{fixture.competition_name ?? 'Competição'} · Rodada {fixture.round}</p>
      {fixture.neutral_venue && <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">Campo neutro · {fixture.venue_name ?? 'Estádio Nacional'}</p>}
    </div>
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-7 text-center md:px-10">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/8 bg-black/10 p-2.5">{fixture.home_club?.logo_url ? <img src={fixture.home_club.logo_url} alt="" className="h-full w-full object-contain drop-shadow-lg" /> : <span className="text-sm font-black text-white/70">{crestLabel(teamName(fixture, 'home'))}</span>}</div>
        <p className="mt-3 text-sm font-bold">{teamName(fixture, 'home')}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/25">CASA</p>
      </div>
      <div>
        <p key={homeScore + '-' + awayScore} className="score-pulse font-mono text-5xl font-bold tabular-nums">{homeScore}<span className="mx-2 text-white/20">:</span>{awayScore}</p>
        <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${finished ? 'border-white/10 text-white/50' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'}`}>{finished ? 'FIM' : minute + "'"}</span>
      </div>
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/8 bg-black/10 p-2.5">{fixture.away_club?.logo_url ? <img src={fixture.away_club.logo_url} alt="" className="h-full w-full object-contain drop-shadow-lg" /> : <span className="text-sm font-black text-white/70">{crestLabel(teamName(fixture, 'away'))}</span>}</div>
        <p className="mt-3 text-sm font-bold">{teamName(fixture, 'away')}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/25">FORA</p>
      </div>
    </div>
  </div>
}


function playerFieldPosition(role: string, team: InteractiveTeam, occurrence: number, formation?: Formation, slot?: number) {
  if (formation && slot !== undefined) return formationFieldPosition(formation, slot, team)
  const home = team === 'home'
  const map: Record<string, { x: number; y: number }[]> = {
    GK: [{ x: 50, y: 92 }], CB: [{ x: 38, y: 80 }, { x: 62, y: 80 }, { x: 50, y: 81 }], LB: [{ x: 14, y: 77 }], RB: [{ x: 86, y: 77 }],
    DM: [{ x: 50, y: 65 }, { x: 38, y: 65 }], CM: [{ x: 28, y: 61 }, { x: 50, y: 61 }, { x: 72, y: 61 }],
    AM: [{ x: 50, y: 45 }], LW: [{ x: 18, y: 42 }], RW: [{ x: 82, y: 42 }], ST: [{ x: 50, y: 30 }, { x: 60, y: 30 }],
  }
  const point = map[role]?.[occurrence] ?? map.CM[0]
  return { x: point.x, y: home ? point.y : 100 - point.y }
}

function Pitch({ session, userTeam, compact = false }: { session: InteractiveMatchState; userTeam: InteractiveTeam; compact?: boolean }) {
  const renderTeam = (teamNameValue: InteractiveTeam) => {
    const team = teamNameValue === 'home' ? session.home : session.away
    const counts: Record<string, number> = {}
    return team.lineup.map(item => {
      const occurrence = counts[item.role] ?? 0
      counts[item.role] = occurrence + 1
      const pos = playerFieldPosition(item.role, teamNameValue, occurrence, team.formation, item.slot)
      const userSide = teamNameValue === userTeam
      return <div key={item.player.id} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: pos.x + '%', top: pos.y + '%' }}>
        <div className={userSide ? 'mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 border-emerald-300 bg-emerald-500 text-[#04110c] shadow-lg md:h-8 md:w-8' : 'mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 border-orange-300 bg-orange-500 text-[#1a0b00] shadow-lg md:h-8 md:w-8'}>
          <span className="text-[10px] font-black">{item.player.first_name[0]}{item.player.last_name[0]}</span>
        </div>
        <span className="mt-1 block max-w-20 truncate rounded bg-black/55 px-1 text-[8px] font-bold text-white">{item.player.last_name}</span>
      </div>
    })
  }
  return <section className={compact ? "rounded-2xl border border-white/8 bg-[#131b2a] p-2" : "rounded-3xl border border-white/8 bg-[#131b2a] p-3 md:p-4"}>
    <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Escalação em campo</p><p className="mt-1 text-xs text-white/35">Verde = sua equipe · laranja = adversário</p></div><span className="rounded-full border border-white/8 px-2.5 py-1 font-mono text-[9px] font-bold text-white/35">{session.home.formation} · {session.away.formation}</span></div>
    <div className={(compact ? "relative mx-auto aspect-[5/4] max-w-[340px]" : "relative mx-auto aspect-[4/5] max-w-[470px]") + " overflow-hidden rounded-2xl border border-white/10 bg-[#123b2d]"}>
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

function ProjectedPitch({ lineup, team, formation, compact = false }: { lineup: LineupPlayer[]; team: InteractiveTeam; formation?: Formation; compact?: boolean }) {
  const counts: Record<string, number> = {}
  const starters = lineup
  return <div className={compact ? 'rounded-2xl border border-white/8 bg-[#131b2a] p-2' : 'rounded-3xl border border-white/8 bg-[#131b2a] p-3 md:p-4'}>
    <div className="mb-2 flex items-center justify-between"><div><p className="label-mono text-white/30">Formação em campo</p><p className="mt-1 text-xs text-white/35">{compact ? 'Escalação atual' : 'Posições projetadas para o início da partida'}</p></div><span className="rounded-full border border-white/8 px-2.5 py-1 font-mono text-[9px] font-bold text-white/30">{starters.length}/11</span></div>
    <div className={(compact ? 'relative mx-auto aspect-[5/4] max-w-[320px]' : 'relative mx-auto aspect-[4/5] max-w-[420px]') + ' overflow-hidden rounded-2xl border border-white/10 bg-[#123b2d]'}>
      <div className="absolute inset-3 rounded-xl border border-white/30" />
      <div className="absolute left-1/2 top-1/2 h-px w-[calc(100%-24px)] -translate-x-1/2 bg-white/20" />
      <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
      <div className="absolute left-1/2 top-3 h-10 w-28 -translate-x-1/2 border border-t-0 border-white/20" />
      <div className="absolute bottom-3 left-1/2 h-10 w-28 -translate-x-1/2 border border-b-0 border-white/20" />
      {starters.map(item => {
        const occurrence = counts[item.role] ?? 0
        counts[item.role] = occurrence + 1
        const pos = playerFieldPosition(item.role, team, occurrence, formation, item.slot)
        return <div key={item.player.id} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: pos.x + '%', top: pos.y + '%' }}>
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 border-emerald-300 bg-emerald-500 text-[9px] font-black text-[#04110c] shadow-lg md:h-10 md:w-10">{item.player.first_name[0]}{item.player.last_name[0]}</div>
          <span className="mt-1 block max-w-16 truncate rounded bg-black/55 px-1 text-[8px] font-bold text-white">{item.player.last_name}</span>
        </div>
      })}
    </div>
  </div>
}

function Bench({ session, userTeam, selectedOutgoing, onSelectIncoming }: { session: InteractiveMatchState; userTeam: InteractiveTeam; selectedOutgoing: string; onSelectIncoming: (id: string) => void }) {
  const team = userTeam === 'home' ? session.home : session.away
  return <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
    <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Banco</p><p className="mt-1 text-sm font-semibold">Escolha quem entra</p></div><span className="font-mono text-xs font-bold text-white/35">{team.substitutions}/5</span></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {team.bench.slice(0, 9).map(player => <button key={player.id} disabled={team.substitutions >= 5 || !selectedOutgoing} onClick={() => onSelectIncoming(player.id)} className="flex items-center gap-3 rounded-xl border border-white/6 bg-black/10 p-3 text-left transition hover:border-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-30">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] font-black">{player.first_name[0]}{player.last_name[0]}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{playerName(player)}</span><span className="mt-0.5 block text-[9px] uppercase tracking-wider text-white/25">{playerPositionLabel(player.position)} · OVR {playerOverall(player)}</span></span>
        <ArrowRight size={14} className="text-white/20" />
      </button>)}
    </div>
    {selectedOutgoing && <p className="mt-3 rounded-lg bg-emerald-400/8 px-3 py-2 text-[10px] font-bold text-emerald-300">Jogador de saída selecionado. Escolha um reserva.</p>}
  </section>
}

export default function InteractiveMatch({ fixture, userClubId, homePlayers, awayPlayers, tactic, formation, coachStyle, coachPersonality, boardConfidence = 0, leaguePosition = null, leaguePoints = null, back, cancel }: Props) {
  const userIsHome = fixture.home_club_id === userClubId
  const userTeam: InteractiveTeam = userIsHome ? 'home' : 'away'
  const [phase, setPhase] = useState<'pregame' | 'live' | 'halftime' | 'postgame'>('pregame')
  const [paused, setPaused] = useState(false)
  const [session, setSession] = useState<InteractiveMatchState | null>(null)
  const [postgameTab, setPostgameTab] = useState<'events' | 'stats' | 'manager'>('events')
  const [lastEventCount, setLastEventCount] = useState(0)
  const [selectedOutgoing, setSelectedOutgoing] = useState('')
  const [eventFilter, setEventFilter] = useState<'all' | 'goal' | 'discipline' | 'injury' | 'substitution' | 'chance' | 'corner' | 'save'>('all')
  const [pregameTab, setPregameTab] = useState<'preview' | 'lineup' | 'confrontation'>('preview')
  const [highlightEvent, setHighlightEvent] = useState<MatchEvent | null>(null)
  const [handledHighlightKey, setHandledHighlightKey] = useState('')
  const [pendingIncident, setPendingIncident] = useState<'injury' | 'red_card' | null>(null)
  const [penaltyResolution, setPenaltyResolution] = useState('')


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
      playMatchSound('whistle')
      setPaused(true)
      setPhase('postgame')
      setPostgameTab('events')
    }
  }, [session, phase, lastEventCount])

  const eventKey = (event: MatchEvent) => [event.minute, event.type, event.team, event.player, event.text].join('|')

  useEffect(() => {
    if (!session || phase !== 'live') return
    const latest = session.events[session.events.length - 1]
    const latestKey = latest ? eventKey(latest) : ''
    if (latest && latestKey !== handledHighlightKey && ['goal','injury','red_card','penalty'].includes(latest.type)) {
      setHighlightEvent(latest)
      if (['goal', 'injury', 'red_card'].includes(latest.type)) {
        setPaused(true)
        if (latest.type === 'injury' || latest.type === 'red_card') {
          if (latest.team === userTeam) setPendingIncident(latest.type)
        }
      }
      if (latest.type === 'penalty') {
        setPaused(true)
        setPenaltyResolution('')
      }
    }
    if (session.minute === 45 && !paused) {
      playMatchSound('whistle')
      setPaused(true)
      setPhase('halftime')
    }
  }, [session, phase, paused, highlightEvent])

  useEffect(() => {
    if (!highlightEvent) return
    if (highlightEvent.type === 'goal') playMatchSound(highlightEvent.team === userTeam ? 'goal_home' : 'goal_away')
    if (highlightEvent.type === 'red_card') playMatchSound('red_card')
    if (highlightEvent.type === 'injury') playMatchSound('injury')
    if (highlightEvent.type === 'penalty') playMatchSound('penalty')
  }, [highlightEvent, userTeam])

  const result = session?.finished ? interactiveMatchResult(session) : null
  const visibleEvents = session?.events ?? []
  const incidentEvent = pendingIncident ? [...visibleEvents].reverse().find(event => event.type === pendingIncident && event.team === userTeam) : null
  const previewHomeLineup = useMemo(() => {
    const coach = getAiCoachProfile(fixture.home_club_id)
    return selectStartingLineup(homePlayers, userIsHome ? formation : coach.formation, userIsHome ? coachStyle : coach.style, userIsHome ? coachPersonality : coach.personality, awayPlayers, userIsHome ? savedLineup : {}, 1)
  }, [homePlayers, awayPlayers, formation, userIsHome, savedLineup, coachStyle, coachPersonality, fixture.home_club_id])
  const previewAwayLineup = useMemo(() => {
    const coach = getAiCoachProfile(fixture.away_club_id)
    return selectStartingLineup(awayPlayers, userIsHome ? coach.formation : formation, userIsHome ? coach.style : coachStyle, userIsHome ? coach.personality : coachPersonality, homePlayers, userIsHome ? {} : savedLineup, 1)
  }, [homePlayers, awayPlayers, formation, userIsHome, savedLineup, coachStyle, coachPersonality, fixture.away_club_id])
  const user = session ? (userTeam === 'home' ? session.home : session.away) : null
  const userSquad = userIsHome ? homePlayers : awayPlayers
  const averageCondition = userSquad.length
    ? Math.round(userSquad.reduce((sum, player) => sum + (100 - (player.fatigue ?? 0)), 0) / userSquad.length)
    : 0
  const averageMorale = userSquad.length
    ? Math.round(userSquad.reduce((sum, player) => sum + (player.morale ?? 0), 0) / userSquad.length)
    : 0
  const userResult = result
    ? (userIsHome
      ? result.homeScore > result.awayScore ? 'VITÓRIA' : result.homeScore < result.awayScore ? 'DERROTA' : 'EMPATE'
      : result.awayScore > result.homeScore ? 'VITÓRIA' : result.awayScore < result.homeScore ? 'DERROTA' : 'EMPATE')
    : null
  const userRatingRows = result?.playerRatings.filter(player => player.team === userTeam) ?? []
  const managerScore = userRatingRows.length
    ? Math.round(userRatingRows.reduce((sum, player) => sum + player.rating, 0) / userRatingRows.length * 10) / 10
    : 0
  const usedSubstitutions = user?.substitutions ?? 0
  const tacticalChanges = result?.events.filter(event => event.team === userTeam && event.type === 'tactical_change').length ?? 0

  const applyTactic = (nextTactic: InteractiveTactic, nextFormation?: Formation) => {
    if (!session) return
    setSession(current => current ? changeInteractiveTactics(current, userTeam, nextTactic, nextFormation) : current)
  }

  const applyInstruction = (sector: 'defense' | 'midfield' | 'attack', instruction: TacticalInstruction) => {
    if (!session) return
    setSession(current => current ? changeInteractiveInstruction(current, userTeam, sector, instruction) : current)
  }

  const applyPlayerInstruction = (playerId: string, instruction: TacticalInstruction) => {
    if (!session) return
    setSession(current => current ? changeInteractivePlayerInstruction(current, userTeam, playerId, instruction) : current)
  }

  const applyRisk = (risk: number) => {
    if (!session) return
    setSession(current => current ? changeInteractiveRisk(current, userTeam, risk) : current)
  }

  const applySubstitution = (outgoingId: string, incomingId: string) => {
    if (!session) return
    setSession(current => current ? makeInteractiveSubstitution(current, userTeam, outgoingId, incomingId) : current)
  }

  const resolvePenalty = (kickerId: string) => {
    if (!session) return
    const next = resolveInteractivePenalty(session, userTeam, kickerId)
    const resolution = next.events[next.events.length - 1] ?? null
    setSession(next)
    setHighlightEvent(resolution?.type === 'goal' ? resolution : session.events.find(event => event.type === 'penalty' && event.minute === session.minute) ?? null)
    setPenaltyResolution(resolution?.text ?? '')
    setPaused(true)
  }

  const resolveOpponentPenalty = () => {
    if (!session) return
    const opponentTeam: InteractiveTeam = userTeam === 'home' ? 'away' : 'home'
    const opponent = opponentTeam === 'home' ? session.home : session.away
    const kicker = [...opponent.lineup]
      .filter(item => ['ST', 'LW', 'RW', 'AM'].includes(item.role))
      .sort((a, b) => b.player.shooting - a.player.shooting)[0] ?? opponent.lineup[0]
    if (!kicker) return
    const next = resolveInteractivePenalty(session, opponentTeam, kicker.player.id)
    const resolution = next.events[next.events.length - 1] ?? null
    setSession(next)
    setHighlightEvent(resolution?.type === 'goal' ? resolution : session.events.find(event => event.type === 'penalty' && event.minute === session.minute) ?? null)
    setPenaltyResolution(resolution?.text ?? '')
    setPaused(true)
  }

  const dismissHighlight = () => {
    if (highlightEvent) setHandledHighlightKey(eventKey(highlightEvent))
    setHighlightEvent(null)
    setPenaltyResolution('')
    setPendingIncident(null)
    setPaused(false)
  }

  const returnFromIncident = () => {
    if (highlightEvent) setHandledHighlightKey(eventKey(highlightEvent))
    setPendingIncident(null)
    setHighlightEvent(null)
    setPenaltyResolution('')
    setPaused(false)
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
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> AO VIVO</p>
        <span className="font-mono text-xs font-bold tabular-nums text-white/50">{formatSeasonDate(toDateKey(fixture.scheduled_at))}</span>
      </div>
    </header>

    <section className="mx-auto max-w-6xl px-4 py-5 md:px-8">
      {phase === 'pregame' && <section className="space-y-4">
        <MatchHeader fixture={fixture} homeScore={0} awayScore={0} minute={0} finished={false} />
        <div className="flex overflow-x-auto rounded-xl border border-white/6 bg-[#131b2a] p-1">
          {([['preview','Prévia'],['lineup','Escalação'],['confrontation','Confronto']] as const).map(([id,label]) => <button key={id} onClick={() => setPregameTab(id)} className={`min-w-[110px] flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider ${pregameTab === id ? 'bg-white/8 text-white' : 'text-white/35'}`}>{label}</button>)}
        </div>
        {pregameTab === 'preview' && <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Competição</p><p className="mt-2 text-sm font-bold">{fixture.competition_name ?? 'Competição'}</p><p className="mt-1 text-xs text-white/30">Rodada {fixture.round}</p></div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Data</p><p className="mt-2 text-sm font-bold">{formatSeasonDate(toDateKey(fixture.scheduled_at))}</p><p className="mt-1 text-xs text-white/30">{fixture.home_club?.stadium ?? 'Estádio não informado'}</p></div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Mando</p><p className="mt-2 text-sm font-bold">{userIsHome ? 'Você joga em casa' : 'Você joga fora'}</p><p className="mt-1 text-xs text-white/30">{userIsHome ? teamName(fixture,'home') : teamName(fixture,'away')}</p></div>
        </div>}
        {pregameTab === 'lineup' && <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <ProjectedPitch lineup={userIsHome ? previewHomeLineup : previewAwayLineup} team={userTeam} formation={formation} compact />
            <ProjectedPitch lineup={userIsHome ? previewAwayLineup : previewHomeLineup} team={userTeam === 'home' ? 'away' : 'home'} formation={userTeam === 'home' ? getAiCoachProfile(fixture.away_club_id).formation : getAiCoachProfile(fixture.home_club_id).formation} compact />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Sua equipe</p><p className="mt-2 text-xl font-bold">{teamName(fixture, userTeam)}</p><p className="mt-1 text-xs text-white/30">{formation} · {tactic === 'offensive' ? 'Ofensivo' : tactic === 'defensive' ? 'Defensivo' : 'Equilibrado'}</p><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{(userIsHome ? previewHomeLineup : previewAwayLineup).map(item => <div key={item.player.id} className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="truncate text-xs font-bold">{playerName(item.player)}</p><p className="mt-1 text-[9px] text-white/30">{item.role} · OVR {playerOverall(item.player)}</p></div>)}</div></div>
            <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Adversário</p><p className="mt-2 text-xl font-bold">{teamName(fixture, userTeam === 'home' ? 'away' : 'home')}</p><p className="mt-1 text-xs text-white/30">Escalação controlada pela IA do clube.</p></div>
          </div>
        </div>}
        {pregameTab === 'confrontation' && <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Seu OVR</p><p className="mt-2 font-mono text-3xl font-bold">{Math.round((userIsHome ? homePlayers : awayPlayers).reduce((sum,p) => sum + playerOverall(p),0) / Math.max(1,(userIsHome ? homePlayers : awayPlayers).length))}</p></div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Adversário OVR</p><p className="mt-2 font-mono text-3xl font-bold">{Math.round((userIsHome ? awayPlayers : homePlayers).reduce((sum,p) => sum + playerOverall(p),0) / Math.max(1,(userIsHome ? awayPlayers : homePlayers).length))}</p></div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Estratégia</p><p className="mt-2 text-sm font-bold">{tactic === 'offensive' ? 'Pressão ofensiva' : tactic === 'defensive' ? 'Bloco defensivo' : 'Equilíbrio'}</p><p className="mt-1 text-xs text-white/30">A IA usará sua própria configuração.</p></div>
        </div>}
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">Condição média</p><p className="mt-2 font-mono text-2xl font-bold">{averageCondition}%</p><p className="mt-1 text-[10px] text-white/30">Quanto maior, mais preparado o elenco.</p></div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">Moral média</p><p className="mt-2 font-mono text-2xl font-bold">{averageMorale}%</p><p className="mt-1 text-[10px] text-white/30">Confiança do grupo antes do jogo.</p></div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">Sua decisão</p><p className="mt-2 text-sm font-bold">{formation} · {tactic === 'offensive' ? 'Ofensivo' : tactic === 'defensive' ? 'Defensivo' : 'Equilibrado'}</p><p className="mt-1 text-[10px] text-white/30">A configuração será levada para o motor da partida.</p></div>
        </section>
        <button onClick={start} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-bold text-[#06100c]">Confirmar escalação e começar <Play size={17} /></button>
      </section>}


      {phase === 'halftime' && session && <section className="space-y-4">
        <MatchHeader fixture={fixture} homeScore={session.homeScore} awayScore={session.awayScore} minute={45} finished={false} />
        <div className="game-panel"><div className="flex items-center justify-between"><div><p className="label-mono text-amber-200/60">INTERVALO</p><h2 className="mt-1 font-display text-2xl font-bold">45 minutos concluídos</h2><p className="mt-1 text-sm text-white/40">Confira a energia do elenco antes de voltar para o segundo tempo.</p></div><span className="font-display text-4xl font-bold">45'</span></div>
          <MatchTacticsBoard session={session} userTeam={userTeam} onSubstitution={(outgoingId, incomingId) => { applySubstitution(outgoingId, incomingId); setSelectedOutgoing('') }} onTactic={applyTactic} onInstruction={applyInstruction} onPlayerInstruction={applyPlayerInstruction} onRisk={applyRisk} />
          <div className="mt-4 rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Intervalo</p><p className="mt-1 text-sm text-white/45">Você pode trocar jogadores e mudar a formação agora. As alterações entram no segundo tempo.</p></div>
          <button type="button" onClick={() => {
            setPaused(false)
            setSession(current => current ? advanceInteractiveMinute(current, userTeam) : current)
            setPhase('live')
          }} className="relative z-10 mt-5 flex min-h-14 w-full touch-manipulation items-center justify-center gap-1 rounded-xl bg-emerald-400 px-5 py-4 text-sm font-bold text-[#06100c] active:scale-[0.99]">Voltar ao segundo tempo <ArrowRight size={16} /></button>
        </div>
      </section>}

      {phase === 'live' && session && <section className="space-y-4">
        <MatchHeader fixture={fixture} homeScore={session.homeScore} awayScore={session.awayScore} minute={session.minute} finished={session.finished} />
        <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
          <div className="flex items-center justify-between gap-3"><span className="font-mono text-xs font-bold text-white/50">{session.minute}'</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/6"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: (session.minute / 90) * 100 + '%' }} /></div><span className="font-mono text-xs text-white/25">90'</span></div>
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setPaused(value => !value)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#06100c]">{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? 'Continuar' : 'Pausar'}</button><button onClick={skipToEnd} className="flex items-center gap-2 rounded-xl border border-white/8 px-4 py-2.5 text-xs font-bold text-white/60"><Square size={13} /> Pular para o fim</button><span className="ml-auto flex items-center gap-1.5 rounded-xl border border-white/6 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-white/25"><Zap size={12} /> {paused ? 'Pausado' : 'Ao vivo'}</span></div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-4">
            <MatchTacticsBoard session={session} userTeam={userTeam} onSubstitution={(outgoingId, incomingId) => { applySubstitution(outgoingId, incomingId); setSelectedOutgoing('') }} onTactic={applyTactic} onInstruction={applyInstruction} onPlayerInstruction={applyPlayerInstruction} onRisk={applyRisk} />
            <Pitch session={session} userTeam={userTeam} compact />
          </div>
          <aside className="space-y-4">
            <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Comando tático</p><p className="mt-1 text-sm font-semibold">Ajuste sem sair da partida</p></div><SlidersHorizontal size={16} className="text-white/25" /></div>
              <div className="mt-4 grid grid-cols-3 gap-2">{(['defensive','balanced','offensive'] as InteractiveTactic[]).map(value => <button key={value} onClick={() => applyTactic(value)} className={user?.tactic === value ? 'rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-2.5 text-[10px] font-bold text-emerald-300' : 'rounded-xl border border-white/6 bg-black/10 p-2.5 text-[10px] font-bold text-white/45'}>{value === 'defensive' ? 'Defensivo' : value === 'offensive' ? 'Ofensivo' : 'Equilibrado'}</button>)}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">{(['4-3-3','4-4-2','4-2-3-1','3-5-2'] as Formation[]).map(value => <button key={value} onClick={() => user && applyTactic(user.tactic, value)} className={user?.formation === value ? 'rounded-lg border border-white/20 bg-white/8 px-2.5 py-2 font-mono text-[9px] font-bold text-white' : 'rounded-lg border border-white/5 px-2.5 py-2 font-mono text-[9px] font-bold text-white/30'}>{value}</button>)}</div>
            </section>
            <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Lance a lance</p><p className="mt-1 text-xs text-white/25">Eventos em tempo real</p></div><span className="font-mono text-[9px] text-white/20">{visibleEvents.length}</span></div>
              <div className="mt-3 flex flex-wrap gap-1.5">{([['all','Tudo'],['goal','Gols'],['discipline','Cartões'],['injury','Lesões'],['substitution','Substituições'],['corner','Escanteios'],['save','Defesas'],['chance','Chances']] as const).map(([id,label]) => <button key={id} onClick={() => setEventFilter(id)} className={eventFilter === id ? 'rounded-lg border border-white/15 bg-white/8 px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-white' : 'rounded-lg border border-white/5 px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider text-white/25'}>{label}</button>)}</div>
              <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {visibleEvents.slice().reverse().filter(event => eventFilter === 'all' || (eventFilter === 'goal' ? event.type === 'goal' : eventFilter === 'discipline' ? ['card','red_card'].includes(event.type) : eventFilter === 'injury' ? event.type === 'injury' : eventFilter === 'substitution' ? event.type === 'substitution' : eventFilter === 'corner' ? event.type === 'corner' : eventFilter === 'save' ? event.type === 'save' : ['chance','shot'].includes(event.type))).map((event, index) => {
                  const goal = event.type === 'goal'
                  const danger = event.type === 'red_card' || event.type === 'injury'
                  const icon = goal ? <Goal size={14} /> : event.type === 'injury' ? <HeartPulse size={14} /> : event.type === 'red_card' || event.type === 'card' ? <CreditCard size={14} /> : event.type === 'substitution' ? <Users size={14} /> : <Zap size={14} />
                  const cardClass = goal ? 'border-emerald-400/25 bg-emerald-400/8' : danger ? 'border-red-400/25 bg-red-400/7' : event.type === 'card' ? 'border-yellow-400/15 bg-yellow-400/5' : 'border-white/5 bg-black/10'
                  const iconClass = goal ? 'bg-emerald-400/15 text-emerald-300' : danger ? 'bg-red-400/15 text-red-300' : event.type === 'card' ? 'bg-yellow-400/10 text-yellow-300' : 'bg-white/5 text-white/35'
                  return <div key={event.minute + '-' + index} className={'event-slide-in flex items-start gap-2 rounded-xl border p-3 ' + cardClass}>
                    <span className={'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ' + iconClass}>{icon}</span><span className="w-7 shrink-0 font-mono text-[10px] font-bold text-white/35">{event.minute}'</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[8px] font-bold uppercase tracking-wider text-white/25">{eventLabel(event.type)}</span><span className={event.team === 'home' ? 'h-1.5 w-1.5 rounded-full bg-emerald-400' : 'h-1.5 w-1.5 rounded-full bg-orange-400'} /></div><p className="mt-1 text-xs font-bold">{event.player}</p><p className="mt-1 text-[10px] leading-4 text-white/35">{event.text}</p></div>
                  </div>
                })}
                {!visibleEvents.length && <p className="py-8 text-center text-xs text-white/25">A partida começou. O próximo lance aparecerá aqui.</p>}
              </div>
            </section>
          </aside>
        </div>
      </section>}

      {phase === 'live' && !pendingIncident && highlightEvent && (highlightEvent.type === 'goal' || highlightEvent.type === 'penalty' || highlightEvent.type === 'injury' || highlightEvent.type === 'red_card') && <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-lg"><div className={highlightEvent.team === userTeam && highlightEvent.type === 'goal' ? 'rounded-2xl border border-emerald-400/40 bg-emerald-950/95 p-5 shadow-2xl' : 'rounded-2xl border border-red-400/40 bg-red-950/95 p-5 shadow-2xl'}><div className="flex items-center gap-3"><span className="font-display text-2xl font-black">{eventLabel(highlightEvent.type)}</span><span className="font-mono text-xs">{highlightEvent.minute}'</span></div><p className="mt-2 text-lg font-bold">{highlightEvent.player}</p><p className="mt-1 text-sm text-white/65">{highlightEvent.text}</p>{highlightEvent.type === 'penalty' && !penaltyResolution && highlightEvent.team === userTeam && <div className="mt-4 space-y-2"><p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Escolha o batedor</p>{user?.lineup.filter(item => ['ST', 'LW', 'RW', 'AM'].includes(item.role)).map(item => <button key={item.player.id} onClick={() => resolvePenalty(item.player.id)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-xs font-bold"><span>{playerName(item.player)}</span><span className="text-white/40">Bater</span></button>)}</div>}
      {highlightEvent.type === 'penalty' && !penaltyResolution && highlightEvent.team !== userTeam && <button onClick={resolveOpponentPenalty} className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 text-xs font-bold">Continuar cobrança</button>}
      {highlightEvent.type === 'penalty' && penaltyResolution && <div className="mt-4"><p className="label-mono text-white/35">NARRAÇÃO DA COBRANÇA</p><p className="mt-2 rounded-xl bg-black/20 p-3 text-sm font-semibold leading-5">{penaltyResolution}</p><button onClick={() => { dismissHighlight() }} className="mt-3 w-full rounded-xl bg-emerald-400 px-4 py-3 text-xs font-bold text-[#06100c]">Voltar ao jogo</button></div>}
      {highlightEvent.type !== 'penalty' && <button onClick={() => { dismissHighlight() }} className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 text-xs font-bold">{highlightEvent.type === 'goal' ? 'Continuar jogo' : 'Continuar'}</button>}</div></div>}
      {phase === 'live' && session && pendingIncident && <div className="fixed inset-0 z-40 overflow-y-auto bg-[#0a0f1a]/98 px-4 py-6"><div className="mx-auto max-w-4xl"><div className="mb-4 flex items-center justify-between"><div><p className="label-mono text-red-300/70">{pendingIncident === 'injury' ? 'LESÃO' : 'EXPULSÃO'}</p><h2 className="mt-1 font-display text-2xl font-bold">{incidentEvent?.player ?? 'Ajuste sua equipe'}</h2><p className="mt-1 text-sm text-white/45">{incidentEvent?.text ?? 'Você pode substituir o jogador ou reorganizar a equipe.'}</p></div><span className="font-mono text-xs text-white/30">{session.minute}'</span></div><MatchTacticsBoard session={session} userTeam={userTeam} onSubstitution={(outgoingId, incomingId) => { applySubstitution(outgoingId, incomingId); setSelectedOutgoing(''); setPendingIncident(null); setHighlightEvent(null); setPaused(false) }} onTactic={applyTactic} onInstruction={applyInstruction} onPlayerInstruction={applyPlayerInstruction} onRisk={applyRisk} /><button onClick={returnFromIncident} className="mt-4 w-full rounded-xl bg-emerald-400 px-5 py-4 text-sm font-bold text-[#06100c]">Voltar ao jogo <ArrowRight size={16} className="inline ml-1" /></button></div></div>}
      {phase === 'postgame' && session && result && <section className="space-y-4">
        <MatchHeader fixture={fixture} homeScore={session.homeScore} awayScore={session.awayScore} minute={session.minute} finished={session.finished} />
        <div className="flex rounded-xl border border-white/6 bg-[#131b2a] p-1">
          <button onClick={() => setPostgameTab('events')} className={`flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider ${postgameTab === 'events' ? 'bg-white/8 text-white' : 'text-white/35'}`}>Lances</button>
          <button onClick={() => setPostgameTab('stats')} className={`flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider ${postgameTab === 'stats' ? 'bg-white/8 text-white' : 'text-white/35'}`}>Estatísticas</button>
          <button onClick={() => setPostgameTab('manager')} className={`flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider ${postgameTab === 'manager' ? 'bg-white/8 text-white' : 'text-white/35'}`}>Relatório</button>
        </div>
        {postgameTab === 'events' && <section className="space-y-4">
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><div className="max-h-[560px] space-y-2 overflow-y-auto">{result.events.slice().reverse().map((event, index) => <div key={event.minute + '-' + index} className="flex gap-3 rounded-xl border border-white/5 bg-black/10 px-3 py-3"><span className="w-8 font-mono text-xs font-bold text-white/30">{event.minute}'</span><div><p className="text-sm font-semibold">{event.player}</p><p className="text-xs text-white/35">{event.text}</p></div></div>)}</div></div>
          <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-white/25">Notas dos jogadores</p><div className="mt-4 grid gap-2 md:grid-cols-2">{result.playerRatings.sort((a,b) => b.rating-a.rating).map(player => <div key={player.playerId + player.team} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-3 py-3"><div><p className="text-sm font-semibold">{player.name}</p><p className="text-xs text-white/30">{player.team === 'home' ? teamName(fixture, 'home') : teamName(fixture, 'away')} · {playerPositionLabel(player.position)}</p></div><span className="rounded-lg bg-emerald-400/10 px-2.5 py-1.5 font-mono text-xs font-bold text-emerald-300">{player.rating.toFixed(1)}</span></div>)}</div></section>
        </section>}
        {postgameTab === 'manager' && <section className="space-y-4">
          <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-5">
            <p className="label-mono text-emerald-300/60">RELATÓRIO DO TREINADOR</p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div><h3 className="font-display text-2xl font-bold">{userResult}</h3><p className="mt-1 text-xs text-white/35">{teamName(fixture, userTeam)} · nota média {managerScore.toFixed(1)}</p></div>
              <span className="font-mono text-3xl font-black text-emerald-300">{userIsHome ? result.homeScore : result.awayScore}–{userIsHome ? result.awayScore : result.homeScore}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="label-mono text-white/25">Substituições</p><p className="mt-1 font-mono text-xl font-bold">{usedSubstitutions}/5</p></div>
              <div className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="label-mono text-white/25">Ajustes táticos</p><p className="mt-1 font-mono text-xl font-bold">{tacticalChanges}</p></div>
              <div className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="label-mono text-white/25">Condição atual</p><p className="mt-1 font-mono text-xl font-bold">{averageCondition}%</p></div>
              <div className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="label-mono text-white/25">Moral atual</p><p className="mt-1 font-mono text-xl font-bold">{averageMorale}%</p></div>
            </div>
          </section>
          <section className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="label-mono text-white/25">Diretoria</p><p className="mt-2 text-sm font-bold">{boardConfidence}% de confiança</p><p className="mt-1 text-xs leading-5 text-white/35">{userResult === 'VITÓRIA' ? 'O resultado tende a aliviar a pressão.' : userResult === 'DERROTA' ? 'O resultado aumenta a cobrança sobre o trabalho.' : 'O empate mantém a avaliação dependente do contexto da temporada.'}</p></div>
            <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="label-mono text-white/25">Tabela</p><p className="mt-2 text-sm font-bold">{leaguePosition ? leaguePosition + 'º lugar' : 'Posição não disponível'}</p><p className="mt-1 text-xs leading-5 text-white/35">{leaguePoints != null ? leaguePoints + ' pontos antes desta partida.' : 'A classificação será atualizada ao retornar ao clube.'}</p></div>
            <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="label-mono text-white/25">Próximo impacto</p><p className="mt-2 text-sm font-bold">Condição e moral</p><p className="mt-1 text-xs leading-5 text-white/35">A atuação será aplicada ao elenco ao finalizar o relatório. Cartões e lesões também afetam a disponibilidade.</p></div>
          </section>
          <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-5">
            <p className="label-mono text-white/25">AVALIAÇÃO INDIVIDUAL</p>
            <div className="mt-4 space-y-2">
              {[...userRatingRows].sort((a,b) => b.rating - a.rating).map(player => <div key={player.playerId} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-3 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{player.name}</p><p className="mt-1 text-[10px] text-white/30">{playerPositionLabel(player.position)} · {player.minutes}'{player.goals ? ' · ' + player.goals + 'G' : ''}{player.assists ? ' · ' + player.assists + 'A' : ''}</p></div>
                <span className={`shrink-0 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold ${player.rating >= 7 ? 'bg-emerald-400/10 text-emerald-300' : player.rating < 5.8 ? 'bg-red-400/10 text-red-300' : 'bg-white/5 text-white/60'}`}>{player.rating.toFixed(1)}</span>
              </div>)}
            </div>
          </section>
          <button onClick={() => back(result)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-4 text-sm font-bold text-[#06100c]">Aplicar resultado e voltar ao clube <ArrowLeft size={16} /></button>
        </section>}
        {postgameTab === 'stats' && <section className="space-y-4">
          <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-5">
            <div className="mb-4"><p className="label-mono text-emerald-300/60">MELHOR EM CAMPO</p><h3 className="mt-1 font-display text-2xl font-bold">{result.analysis.standout.name}</h3><p className="mt-1 text-xs text-white/35">{result.analysis.standout.team === 'home' ? teamName(fixture,'home') : teamName(fixture,'away')} · {playerPositionLabel(result.analysis.standout.position)}</p></div>
            <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="label-mono text-white/25">Nota</p><p className="mt-1 font-mono text-2xl font-bold text-emerald-300">{result.analysis.standout.rating.toFixed(1)}</p></div><div className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="label-mono text-white/25">Gols</p><p className="mt-1 font-mono text-2xl font-bold">{result.analysis.standout.goals}</p></div><div className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="label-mono text-white/25">Assistências</p><p className="mt-1 font-mono text-2xl font-bold">{result.analysis.standout.assists}</p></div></div>
            <p className="mt-4 text-sm leading-6 text-white/45">Foi o destaque pela combinação de nota, participação ofensiva e impacto na partida. {result.analysis.standout.goals > 0 ? 'Também marcou ' + result.analysis.standout.goals + ' gol' + (result.analysis.standout.goals > 1 ? 's' : '') + '.' : 'Mesmo sem marcar, sustentou uma atuação consistente nos principais indicadores.'}</p>
          </section>
          <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-5">
          <div className="mb-5 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wider text-white/25">Estatísticas da partida</p><span className="text-[9px] text-white/25">Casa · Fora</span></div>
          <div className="space-y-3">{[['Posse', result.homeStats.possession + '%', result.awayStats.possession + '%'],['Finalizações', String(result.homeStats.shots), String(result.awayStats.shots)],['No alvo', String(result.homeStats.shotsOnTarget), String(result.awayStats.shotsOnTarget)],['xG', result.homeStats.xg.toFixed(1), result.awayStats.xg.toFixed(1)],['Cartões', String(result.homeStats.yellowCards), String(result.awayStats.yellowCards)],['Vermelhos', String(result.homeStats.redCards ?? 0), String(result.awayStats.redCards ?? 0)],['Impedimentos', String(result.homeStats.offsides ?? 0), String(result.awayStats.offsides ?? 0)],['Lesões', String(result.homeStats.injuries ?? 0), String(result.awayStats.injuries ?? 0)]].map(([label,home,away]) => { const h = parseFloat(home); const a = parseFloat(away); const total = h + a || 1; const hp = Math.max(5, Math.min(95, h / total * 100)); return <div key={label}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-mono font-bold text-emerald-300">{home}</span><span className="text-white/35">{label}</span><span className="font-mono font-bold text-orange-300">{away}</span></div><div className="flex h-2 gap-1 overflow-hidden rounded-full bg-white/5"><div className="rounded-full bg-emerald-400" style={{width: hp + '%'}} /><div className="rounded-full bg-orange-400" style={{width: (100-hp) + '%'}} /></div></div>})}</div>
        </section>        </section>}
        <button onClick={() => back(result)} className="safe-bottom sticky bottom-3 z-10 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-4 text-sm font-bold text-[#06100c] shadow-2xl shadow-black/30">Voltar ao clube <ArrowLeft size={16} /></button>
        <button onClick={restart} className="mx-auto flex items-center gap-2 text-xs font-semibold text-white/30 hover:text-white"><RotateCcw size={14} /> Repetir partida</button>
      </section>}
    </section>
  </main>
}
