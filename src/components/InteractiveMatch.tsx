import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Play, RotateCcw, Goal, HeartPulse, CreditCard, Users, Activity, SlidersHorizontal } from 'lucide-react'
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

export default function InteractiveMatch({ fixture, userClubId, homePlayers, awayPlayers, tactic, formation, coachStyle, coachPersonality, boardConfidence = 0, leaguePosition = null, leaguePoints = null, back, cancel }: Props) {
  const userIsHome = fixture.home_club_id === userClubId
  const userTeam: InteractiveTeam = userIsHome ? 'home' : 'away'
  const [phase, setPhase] = useState<'pregame' | 'live' | 'halftime' | 'postgame'>('pregame')
  const [paused, setPaused] = useState(false)
  const [session, setSession] = useState<InteractiveMatchState | null>(null)
  const [lastEventCount, setLastEventCount] = useState(0)
  const [selectedOutgoing, setSelectedOutgoing] = useState('')
  const [showPregameDetails, setShowPregameDetails] = useState(false)
  const [livePanel, setLivePanel] = useState<'plan' | 'reading' | 'squad' | null>(null)
  const [postgameDetails, setPostgameDetails] = useState<'events' | 'stats' | 'ratings' | null>(null)
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
        <div className="overflow-hidden rounded-3xl border border-white/8 bg-[#131b2a]">
          <div className="px-5 pt-5 text-center">
            <p className="label-mono text-white/30">{fixture.competition_name ?? 'Competição'} · Rodada {fixture.round}</p>
            <p className="mt-2 text-xs text-white/35">{formatSeasonDate(toDateKey(fixture.scheduled_at))} · {userIsHome ? 'Casa' : 'Fora'}</p>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-7 text-center">
            <div><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-black/10 p-2">{fixture.home_club?.logo_url ? <img src={fixture.home_club.logo_url} alt="" className="h-full w-full object-contain" /> : <span className="text-xs font-black">{crestLabel(teamName(fixture,'home'))}</span>}</div><p className="mt-2 text-sm font-bold">{teamName(fixture,'home')}</p></div>
            <span className="text-xs font-bold text-white/20">×</span>
            <div><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-black/10 p-2">{fixture.away_club?.logo_url ? <img src={fixture.away_club.logo_url} alt="" className="h-full w-full object-contain" /> : <span className="text-xs font-black">{crestLabel(teamName(fixture,'away'))}</span>}</div><p className="mt-2 text-sm font-bold">{teamName(fixture,'away')}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-white/6 p-4">
            <div className="rounded-xl bg-black/10 p-3 text-center"><p className="label-mono text-white/25">Condição</p><p className="mt-1 font-mono text-lg font-bold">{averageCondition}%</p></div>
            <div className="rounded-xl bg-black/10 p-3 text-center"><p className="label-mono text-white/25">Moral</p><p className="mt-1 font-mono text-lg font-bold">{averageMorale}%</p></div>
            <div className="rounded-xl bg-black/10 p-3 text-center"><p className="label-mono text-white/25">Plano</p><p className="mt-1 text-xs font-bold">{formation}</p><p className="text-[9px] text-white/30">{tactic === 'offensive' ? 'Ofensivo' : tactic === 'defensive' ? 'Defensivo' : 'Equilibrado'}</p></div>
          </div>
        </div>
        <section className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
          <p className="label-mono text-emerald-300/60">LEITURA DO ADVERSÁRIO</p>
          <p className="mt-1 text-sm font-semibold">{(() => { const coach = getAiCoachProfile(userIsHome ? fixture.away_club_id : fixture.home_club_id); return coach.tactic === 'offensive' ? 'Deve buscar o jogo desde o início.' : coach.tactic === 'defensive' ? 'Deve proteger espaços e explorar transições.' : 'Deve começar de forma equilibrada.' })()}</p>
          <p className="mt-1 text-xs leading-5 text-white/35">É uma referência para sua preparação. A IA pode ajustar o plano durante o jogo.</p>
        </section>
        <button onClick={() => setShowPregameDetails(value => !value)} className="flex w-full items-center justify-between rounded-2xl border border-white/6 bg-[#131b2a] px-4 py-3 text-left">
          <span><span className="block text-xs font-bold">Detalhes da partida</span><span className="mt-1 block text-[10px] text-white/30">Escalação, confronto e estádio</span></span>
          <ArrowRight size={15} className={showPregameDetails ? 'rotate-90 text-white/50' : 'text-white/30'} />
        </button>
        {showPregameDetails && <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
            <p className="label-mono text-white/25">SUA ESCALAÇÃO</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{(userIsHome ? previewHomeLineup : previewAwayLineup).map(item => <div key={item.player.id} className="rounded-xl border border-white/5 bg-black/10 p-2.5"><p className="truncate text-[11px] font-bold">{playerName(item.player)}</p><p className="mt-1 text-[9px] text-white/30">{item.role} · OVR {playerOverall(item.player)}</p></div>)}</div>
          </div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4">
            <p className="label-mono text-white/25">CONFRONTO</p>
            <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-black/10 p-3"><p className="text-[9px] text-white/25">Seu OVR</p><p className="mt-1 font-mono text-xl font-bold">{Math.round(userSquad.reduce((sum,p) => sum + playerOverall(p),0) / Math.max(1,userSquad.length))}</p></div><div className="rounded-xl bg-black/10 p-3"><p className="text-[9px] text-white/25">Adversário</p><p className="mt-1 font-mono text-xl font-bold">{Math.round((userIsHome ? awayPlayers : homePlayers).reduce((sum,p) => sum + playerOverall(p),0) / Math.max(1,(userIsHome ? awayPlayers : homePlayers).length))}</p></div></div>
            <p className="mt-3 text-xs leading-5 text-white/35">Estádio: {fixture.home_club?.stadium ?? 'não informado'}.</p>
          </div>
        </div>}
        <button onClick={start} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-bold text-[#06100c]">Preparar escalação e começar <Play size={17} /></button>
      </section>

      {phase === 'halftime' && session && <section className="space-y-4">
        <MatchHeader fixture={fixture} homeScore={session.homeScore} awayScore={session.awayScore} minute={45} finished={false} />
        <div className="game-panel"><div className="flex items-center justify-between"><div><p className="label-mono text-amber-200/60">INTERVALO</p><h2 className="mt-1 font-display text-2xl font-bold">Hora da decisão</h2><p className="mt-1 text-sm text-white/40">Faça os ajustes que realmente precisam entrar no segundo tempo.</p></div><span className="font-display text-4xl font-bold">45'</span></div>
          <MatchTacticsBoard session={session} userTeam={userTeam} onSubstitution={(outgoingId, incomingId) => { applySubstitution(outgoingId, incomingId); setSelectedOutgoing('') }} onTactic={applyTactic} onInstruction={applyInstruction} onPlayerInstruction={applyPlayerInstruction} onRisk={applyRisk} compact />
          <button type="button" onClick={() => {
            setPaused(false)
            setSession(current => current ? advanceInteractiveMinute(current, userTeam) : current)
            setPhase('live')
          }} className="relative z-10 mt-5 flex min-h-14 w-full touch-manipulation items-center justify-center gap-1 rounded-xl bg-emerald-400 px-5 py-4 text-sm font-bold text-[#06100c] active:scale-[0.99]">Voltar ao segundo tempo <ArrowRight size={16} /></button>
        </div>
      </section>}

      {phase === 'live' && session && <section className="space-y-4">
        <div className="rounded-3xl border border-white/8 bg-[#131b2a] p-4 text-center">
          <p className="label-mono text-white/30">{fixture.competition_name ?? 'Competição'} · {formatSeasonDate(toDateKey(fixture.scheduled_at))}</p>
          <div className="mt-3 flex items-center justify-center gap-4"><span className="min-w-0 flex-1 truncate text-right text-sm font-bold">{teamName(fixture,'home')}</span><span className="font-mono text-4xl font-black">{session.homeScore}<span className="mx-2 text-white/20">:</span>{session.awayScore}</span><span className="min-w-0 flex-1 truncate text-left text-sm font-bold">{teamName(fixture,'away')}</span></div>
          <div className="mt-3 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/6"><div className="h-full rounded-full bg-emerald-400" style={{width:(session.minute/90)*100+'%'}} /></div><span className="font-mono text-[10px] font-bold text-emerald-300">{session.minute}'</span></div>
        </div>
        <div className="rounded-3xl border border-white/8 bg-[#131b2a] p-3"><Pitch session={session} userTeam={userTeam} /><div className="mt-3 rounded-2xl border border-white/6 bg-black/10 px-3 py-3"><p className="label-mono text-white/25">ÚLTIMO LANCE</p><p className="mt-1 text-xs font-semibold">{(() => { const event = [...visibleEvents].reverse().find(item => ['goal','penalty','red_card','injury','substitution','chance','shot'].includes(item.type)) ?? visibleEvents[visibleEvents.length - 1]; return event ? event.text : 'A partida começou.' })()}</p></div></div>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setLivePanel('plan')} className="rounded-2xl border border-white/7 bg-[#131b2a] p-3 text-left"><SlidersHorizontal size={16} className="text-emerald-300" /><p className="mt-2 text-xs font-bold">Plano</p><p className="mt-1 text-[9px] text-white/30">Tática e risco</p></button>
          <button onClick={() => setLivePanel('reading')} className="rounded-2xl border border-white/7 bg-[#131b2a] p-3 text-left"><Activity size={16} className="text-emerald-300" /><p className="mt-2 text-xs font-bold">Leitura</p><p className="mt-1 text-[9px] text-white/30">Contexto do jogo</p></button>
          <button onClick={() => setLivePanel('squad')} className="rounded-2xl border border-white/7 bg-[#131b2a] p-3 text-left"><Users size={16} className="text-emerald-300" /><p className="mt-2 text-xs font-bold">Elenco</p><p className="mt-1 text-[9px] text-white/30">{user?.substitutions ?? 0}/5 substituições</p></button>
        </div>
        <div className="flex gap-2"><button onClick={() => setPaused(value => !value)} className="flex-1 rounded-xl bg-emerald-400 px-4 py-3 text-xs font-bold text-[#06100c]">{paused ? 'Continuar' : 'Pausar'}</button><button onClick={skipToEnd} className="rounded-xl border border-white/8 px-4 py-3 text-xs font-bold text-white/50">Pular para o fim</button></div>
        {(livePanel === 'plan' || livePanel === 'squad') && <section className="rounded-3xl border border-white/8 bg-[#131b2a] p-2"><div className="flex items-center justify-between px-3 py-2"><div><p className="label-mono text-white/25">{livePanel === 'plan' ? 'PLANO DE JOGO' : 'ELENCO'}</p><p className="mt-1 text-[10px] text-white/35">Ajustes disponíveis sob demanda.</p></div><button onClick={() => setLivePanel(null)} className="rounded-lg border border-white/7 px-3 py-1.5 text-[10px] font-bold text-white/45">Fechar</button></div><MatchTacticsBoard session={session} userTeam={userTeam} compact onSubstitution={(outgoingId, incomingId) => { applySubstitution(outgoingId, incomingId); setSelectedOutgoing('') }} onTactic={applyTactic} onInstruction={applyInstruction} onPlayerInstruction={applyPlayerInstruction} onRisk={applyRisk} /></section>}
        {livePanel === 'reading' && <section className="rounded-3xl border border-white/8 bg-[#131b2a] p-5"><p className="label-mono text-emerald-300/60">LEITURA DO TREINADOR</p><p className="mt-2 text-lg font-bold">{(userTeam === 'home' ? session.homeScore - session.awayScore : session.awayScore - session.homeScore) < 0 ? 'Você está atrás. Avalie aumentar o risco.' : (userTeam === 'home' ? session.homeScore - session.awayScore : session.awayScore - session.homeScore) > 0 ? 'Você está na frente. Proteja a vantagem.' : 'O jogo está equilibrado. Um ajuste pode mudar o ritmo.'}</p><p className="mt-2 text-xs leading-5 text-white/35">A IA também ajusta formação, postura e substituições durante a partida.</p><button onClick={() => setLivePanel(null)} className="mt-4 w-full rounded-xl bg-white/7 px-4 py-3 text-xs font-bold">Fechar leitura</button></section>}
      </section>

      {phase === 'live' && !pendingIncident && highlightEvent && (highlightEvent.type === 'goal' || highlightEvent.type === 'penalty' || highlightEvent.type === 'injury' || highlightEvent.type === 'red_card') && <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-lg"><div className={highlightEvent.team === userTeam && highlightEvent.type === 'goal' ? 'rounded-2xl border border-emerald-400/40 bg-emerald-950/95 p-5 shadow-2xl' : 'rounded-2xl border border-red-400/40 bg-red-950/95 p-5 shadow-2xl'}><div className="flex items-center gap-3"><span className="font-display text-2xl font-black">{eventLabel(highlightEvent.type)}</span><span className="font-mono text-xs">{highlightEvent.minute}'</span></div><p className="mt-2 text-lg font-bold">{highlightEvent.player}</p><p className="mt-1 text-sm text-white/65">{highlightEvent.text}</p>{highlightEvent.type === 'penalty' && !penaltyResolution && highlightEvent.team === userTeam && <div className="mt-4 space-y-2"><p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Escolha o batedor</p>{user?.lineup.filter(item => ['ST', 'LW', 'RW', 'AM'].includes(item.role)).map(item => <button key={item.player.id} onClick={() => resolvePenalty(item.player.id)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-xs font-bold"><span>{playerName(item.player)}</span><span className="text-white/40">Bater</span></button>)}</div>}
      {highlightEvent.type === 'penalty' && !penaltyResolution && highlightEvent.team !== userTeam && <button onClick={resolveOpponentPenalty} className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 text-xs font-bold">Continuar cobrança</button>}
      {highlightEvent.type === 'penalty' && penaltyResolution && <div className="mt-4"><p className="label-mono text-white/35">NARRAÇÃO DA COBRANÇA</p><p className="mt-2 rounded-xl bg-black/20 p-3 text-sm font-semibold leading-5">{penaltyResolution}</p><button onClick={() => { dismissHighlight() }} className="mt-3 w-full rounded-xl bg-emerald-400 px-4 py-3 text-xs font-bold text-[#06100c]">Voltar ao jogo</button></div>}
      {highlightEvent.type !== 'penalty' && <button onClick={() => { dismissHighlight() }} className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 text-xs font-bold">{highlightEvent.type === 'goal' ? 'Continuar jogo' : 'Continuar'}</button>}</div></div>}
      {phase === 'live' && session && pendingIncident && <div className="fixed inset-0 z-40 overflow-y-auto bg-[#0a0f1a]/98 px-4 py-6"><div className="mx-auto max-w-4xl"><div className="mb-4 flex items-center justify-between"><div><p className="label-mono text-red-300/70">{pendingIncident === 'injury' ? 'LESÃO · SUBSTITUIÇÃO OBRIGATÓRIA' : 'EXPULSÃO'}</p><h2 className="mt-1 font-display text-2xl font-bold">{incidentEvent?.player ?? 'Ajuste sua equipe'}</h2><p className="mt-1 text-sm text-white/45">{incidentEvent?.text ?? 'Você pode substituir o jogador ou reorganizar a equipe.'}</p></div><span className="font-mono text-xs text-white/30">{session.minute}'</span></div><MatchTacticsBoard session={session} userTeam={userTeam} onSubstitution={(outgoingId, incomingId) => { applySubstitution(outgoingId, incomingId); setSelectedOutgoing(''); setPendingIncident(null); setHighlightEvent(null); setPaused(false) }} onTactic={applyTactic} onInstruction={applyInstruction} onPlayerInstruction={applyPlayerInstruction} onRisk={applyRisk} forcedOutgoingId={pendingIncident === 'injury' ? incidentEvent?.playerId : undefined} />{pendingIncident === 'red_card' || !incidentEvent?.playerId || !user?.bench.length || (user?.substitutions ?? 0) >= 5 ? <button onClick={returnFromIncident} className="mt-4 w-full rounded-xl bg-emerald-400 px-5 py-4 text-sm font-bold text-[#06100c]">Voltar ao jogo <ArrowRight size={16} className="inline ml-1" /></button> : <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-center text-xs font-semibold text-amber-200">Escolha um reserva acima para substituir o lesionado e voltar ao jogo.</p>}</div></div>}
      {phase === 'postgame' && session && result && <section className="space-y-4">
        <div className="rounded-3xl border border-white/8 bg-[#131b2a] p-6 text-center">
          <p className="label-mono text-white/30">{fixture.competition_name ?? 'Competição'} · FIM DE JOGO</p>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-emerald-300">{userResult}</p>
          <div className="mt-2 flex items-center justify-center gap-4"><span className="max-w-[32%] truncate text-sm font-bold">{teamName(fixture,'home')}</span><span className="font-mono text-4xl font-black">{result.homeScore}–{result.awayScore}</span><span className="max-w-[32%] truncate text-sm font-bold">{teamName(fixture,'away')}</span></div>
          <p className="mt-3 text-xs text-white/35">Nota média do seu time: {managerScore.toFixed(1)} · {usedSubstitutions} substituições</p>
        </div>
        <section className="rounded-3xl border border-white/8 bg-[#131b2a] p-5">
          <p className="label-mono text-emerald-300/60">COMO JOGAMOS</p>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-xl bg-black/10 p-3"><p className="label-mono text-white/25">Posse</p><p className="mt-1 font-mono text-xl font-bold">{userIsHome ? result.homeStats.possession : result.awayStats.possession}%</p></div>
            <div className="rounded-xl bg-black/10 p-3"><p className="label-mono text-white/25">Finalizações</p><p className="mt-1 font-mono text-xl font-bold">{userIsHome ? result.homeStats.shots : result.awayStats.shots}</p></div>
            <div className="rounded-xl bg-black/10 p-3"><p className="label-mono text-white/25">No alvo</p><p className="mt-1 font-mono text-xl font-bold">{userIsHome ? result.homeStats.shotsOnTarget : result.awayStats.shotsOnTarget}</p></div>
            <div className="rounded-xl bg-black/10 p-3"><p className="label-mono text-white/25">xG</p><p className="mt-1 font-mono text-xl font-bold">{(userIsHome ? result.homeStats.xg : result.awayStats.xg).toFixed(1)}</p></div>
          </div>
        </section>
        <section className="rounded-3xl border border-white/8 bg-[#131b2a] p-5">
          <div className="flex items-center justify-between"><div><p className="label-mono text-white/25">DESTAQUES</p><p className="mt-1 text-xs text-white/35">As melhores atuações do seu time</p></div><span className="font-mono text-lg font-black text-emerald-300">{result.analysis.standout.rating.toFixed(1)}</span></div>
          <div className="mt-4 space-y-2">{[...userRatingRows].sort((a,b)=>b.rating-a.rating).slice(0,3).map(player => <div key={player.playerId} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-3 py-3"><div><p className="text-sm font-semibold">{player.name}</p><p className="mt-1 text-[10px] text-white/30">{playerPositionLabel(player.position)} · {player.minutes}'{player.goals ? ' · '+player.goals+'G' : ''}{player.assists ? ' · '+player.assists+'A' : ''}</p></div><span className="font-mono text-sm font-bold text-emerald-300">{player.rating.toFixed(1)}</span></div>)}</div>
        </section>
        <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="label-mono text-white/25">Diretoria</p><p className="mt-2 text-sm font-bold">{boardConfidence}%</p><p className="mt-1 text-[10px] text-white/30">confiança atual</p></div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="label-mono text-white/25">Tabela</p><p className="mt-2 text-sm font-bold">{leaguePosition ? leaguePosition + 'º' : '—'}</p><p className="mt-1 text-[10px] text-white/30">{leaguePoints != null ? leaguePoints + ' pts antes' : 'atualiza ao voltar'}</p></div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="label-mono text-white/25">Condição</p><p className="mt-2 text-sm font-bold">{averageCondition}%</p></div>
          <div className="rounded-2xl border border-white/6 bg-[#131b2a] p-4"><p className="label-mono text-white/25">Moral</p><p className="mt-2 text-sm font-bold">{averageMorale}%</p></div>
        </section>
        <div className="grid grid-cols-3 gap-2">
          {([['ratings','Notas dos jogadores'],['events','Lances'],['stats','Estatísticas']] as const).map(([id,label]) => <button key={id} onClick={() => setPostgameDetails(postgameDetails === id ? null : id)} className="rounded-2xl border border-white/7 bg-[#131b2a] px-3 py-3 text-xs font-bold">{label}</button>)}
        </div>
        {postgameDetails === 'ratings' && <section className="rounded-3xl border border-white/8 bg-[#131b2a] p-5"><div className="space-y-2">{[...userRatingRows].sort((a,b)=>b.rating-a.rating).map(player => <div key={player.playerId} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-3 py-3"><div><p className="text-sm font-semibold">{player.name}</p><p className="mt-1 text-[10px] text-white/30">{playerPositionLabel(player.position)} · {player.minutes}'</p></div><span className="font-mono text-sm font-bold text-emerald-300">{player.rating.toFixed(1)}</span></div>)}</div></section>}
        {postgameDetails === 'events' && <section className="rounded-3xl border border-white/8 bg-[#131b2a] p-5"><div className="max-h-[480px] space-y-2 overflow-y-auto">{result.events.slice().reverse().map((event,index)=><div key={event.minute+'-'+index} className="flex gap-3 rounded-xl border border-white/5 bg-black/10 px-3 py-3"><span className="w-8 font-mono text-xs font-bold text-white/30">{event.minute}'</span><div><p className="text-sm font-semibold">{event.player}</p><p className="text-xs leading-5 text-white/35">{event.text}</p></div></div>)}</div></section>}
        {postgameDetails === 'stats' && <section className="rounded-3xl border border-white/8 bg-[#131b2a] p-5"><div className="space-y-2">{[['Posse',result.homeStats.possession+'%',result.awayStats.possession+'%'],['Finalizações',String(result.homeStats.shots),String(result.awayStats.shots)],['No alvo',String(result.homeStats.shotsOnTarget),String(result.awayStats.shotsOnTarget)],['xG',result.homeStats.xg.toFixed(1),result.awayStats.xg.toFixed(1)],['Cartões',String(result.homeStats.yellowCards),String(result.awayStats.yellowCards)],['Lesões',String(result.homeStats.injuries??0),String(result.awayStats.injuries??0)]].map(([label,home,away])=><div key={label} className="flex items-center justify-between border-b border-white/5 py-2.5 text-xs"><span className="font-mono font-bold text-emerald-300">{userIsHome?home:away}</span><span className="text-white/35">{label}</span><span className="font-mono font-bold text-orange-300">{userIsHome?away:home}</span></div>)}</div></section>}
        <button onClick={() => back(result)} className="safe-bottom sticky bottom-3 z-10 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-bold text-[#06100c] shadow-2xl shadow-black/30">Voltar ao clube <ArrowLeft size={16} /></button>
        <button onClick={restart} className="mx-auto flex items-center gap-2 text-xs font-semibold text-white/30 hover:text-white"><RotateCcw size={14} /> Repetir partida</button>
      </section>}
    </section>
  </main>
}
