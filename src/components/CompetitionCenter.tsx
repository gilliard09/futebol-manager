import { useEffect, useMemo, useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Club, Fixture, PlayedMatch } from '../types/game'
import { buildStandings, getCompetitionStageLabel, BRAZIL_CUP_RULES, BRAZIL_LEAGUE_RULES, BRAZIL_SERIE_B_RULES } from '../engine/competitions'
import { buildPlayerCompetitionStats } from '../engine/competitionStats'

function normalizeFixture(row: any): Fixture {
  return {
    id: row.id, competition_id: row.competition_id, competition_name: row.competitions?.name ?? null, round: Number(row.round), scheduled_at: row.scheduled_at,
    status: row.status, home_club_id: row.home_club_id, away_club_id: row.away_club_id,
    home_score: row.home_score, away_score: row.away_score, winner_club_id: row.winner_club_id ?? null,
    home_club: Array.isArray(row.home_club) ? (row.home_club[0] ?? null) : (row.home_club ?? null),
    away_club: Array.isArray(row.away_club) ? (row.away_club[0] ?? null) : (row.away_club ?? null),
  }
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/5 bg-black/10 p-4"><p className="text-xs text-white/25">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>
}

export default function CompetitionCenter({ clubs, currentClubId, playedMatches, seasonName, seasonId: careerSeasonId, back }: {
  clubs: Club[]
  currentClubId: string
  playedMatches: PlayedMatch[]
  seasonName: string
  seasonId?: string
  back: () => void
}) {
  const [competition, setCompetition] = useState<'Liga Nacional do Brasil' | 'Série B do Brasil' | 'Copa Nacional do Brasil'>('Liga Nacional do Brasil')
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [loading, setLoading] = useState(true)
  const [round, setRound] = useState(1)
  const [statsMetric, setStatsMetric] = useState<'goals' | 'assists' | 'averageRating' | 'appearances'>('goals')
  const [statsScope, setStatsScope] = useState<'all' | 'club'>('all')
  const [seasonStatus, setSeasonStatus] = useState<'upcoming' | 'active' | 'completed' | null>(null)
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [officialHistory, setOfficialHistory] = useState<any>(null)
  const [seasonHistory, setSeasonHistory] = useState<Array<{ season: string; year: number; leagueChampion: string; serieBChampion: string; cupChampion: string; status: string }>>([])
  const [clubHistory, setClubHistory] = useState<Array<{ season: string; competition: string; position: number; points: number; division: number }>>([])
  const [competitionRecords, setCompetitionRecords] = useState<Array<{ record_type: string; value: number; description: string; club_id: string | null }>>([])
  const roundNavRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: season } = careerSeasonId
        ? await supabase.from('seasons').select('id,status').eq('id', careerSeasonId).maybeSingle()
        : await supabase.from('seasons').select('id,status').eq('name', seasonName).maybeSingle()
      const { data: allSeasons } = await supabase.from('seasons').select('id,name,year,status').order('year', { ascending: false })
      const seasonIds = (allSeasons ?? []).map(item => item.id)
      const { data: allHistory } = seasonIds.length
        ? await supabase.from('competition_history').select('season_id,competition_id,champion_club_id').in('season_id', seasonIds)
        : { data: [] as any[] }
      const championIds = [...new Set((allHistory ?? []).map(item => item.champion_club_id).filter(Boolean))]
      const { data: championClubs } = championIds.length
        ? await supabase.from('clubs').select('id,short_name,name').in('id', championIds)
        : { data: [] as any[] }
      const clubName = new Map((championClubs ?? []).map(item => [item.id, item.short_name ?? item.name]))
      const { data: competitionRows } = await supabase.from('competitions').select('id,name').in('name', ['Liga Nacional do Brasil', 'Série B do Brasil', 'Copa Nacional do Brasil'])
      const historyBySeason = new Map<string, { leagueChampion: string; serieBChampion: string; cupChampion: string }>()
      const leagueId = competitionRows?.find(item => item.name === 'Liga Nacional do Brasil')?.id
      const cupId = competitionRows?.find(item => item.name === 'Copa Nacional do Brasil')?.id
      for (const row of allHistory ?? []) {
        const current = historyBySeason.get(row.season_id) ?? { leagueChampion: '—', serieBChampion: '—', cupChampion: '—' }
        if (row.competition_id === leagueId) current.leagueChampion = clubName.get(row.champion_club_id) ?? '—'
        if (row.competition_id === cupId) current.cupChampion = clubName.get(row.champion_club_id) ?? '—'
        const serieBId = competitionRows?.find(item => item.name === 'Série B do Brasil')?.id
        if (row.competition_id === serieBId) current.serieBChampion = clubName.get(row.champion_club_id) ?? '—'
        historyBySeason.set(row.season_id, current)
      }
      if (active) {
        setSeasonHistory((allSeasons ?? []).map(item => ({ season: item.name, year: Number(item.year), status: item.status, ...(historyBySeason.get(item.id) ?? { leagueChampion: '—', serieBChampion: '—', cupChampion: '—' }) })))
      }
      const selectedCompetitionId = (competitionRows ?? []).find(item => item.name === competition)?.id
      if (selectedCompetitionId) {
        const { data: recordRows } = await supabase
          .from('competition_records')
          .select('record_type,value,description,club_id')
          .eq('competition_id', selectedCompetitionId)
        if (active) setCompetitionRecords((recordRows ?? []).map((row: any) => ({
          record_type: String(row.record_type),
          value: Number(row.value ?? 0),
          description: String(row.description ?? 'Recorde'),
          club_id: row.club_id ?? null,
        })))
      }

      const { data: clubHistoryRows } = await supabase
        .from('season_club_standings')
        .select('season_id,position,points,division,seasons(name),competitions(name)')
        .eq('club_id', currentClubId)
        .order('season_id', { ascending: false })
        .limit(30)
      if (active) {
        setClubHistory((clubHistoryRows ?? []).map((row: any) => ({
          season: String(row.seasons?.name ?? row.season_id),
          competition: String(row.competitions?.name ?? 'Competição'),
          position: Number(row.position ?? 0),
          points: Number(row.points ?? 0),
          division: Number(row.division ?? 1),
        })))
      }
      if (season) {
        setSeasonId(season.id)
        const { data: historyRows } = await supabase.from('competition_history').select('competition_id,champion_club_id,runner_up_club_id,top_scorer_player_id,top_scorer_goals').eq('season_id', season.id)
        if (active) { setSeasonStatus(season.status); setOfficialHistory(historyRows ?? []) }
      }
      setLoading(true)
      const { data } = await supabase
        .from('fixtures')
        .select('id,season_id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,winner_club_id,home_club:clubs!fixtures_home_club_id_fkey(name,short_name,city,stadium,logo_url),away_club:clubs!fixtures_away_club_id_fkey(name,short_name,city,stadium,logo_url),competitions!inner(name)')
        .eq('competitions.name', competition)
        .eq('season_id', season?.id ?? '')
        .order('round')
        .order('scheduled_at')
      if (!active) return
      const next = (data ?? []).map(normalizeFixture)
      setFixtures(next)
      setRound(next.find(item => item.status === 'scheduled')?.round ?? next[next.length - 1]?.round ?? 1)
      setLoading(false)
    })()
    return () => { active = false }
  }, [competition, seasonName, careerSeasonId, currentClubId])

  const brazilianFirstDivision = clubs.filter(c => c.country === 'Brasil' && Number(c.division ?? 1) === 1)
  const brazilianSecondDivision = clubs.filter(c => c.country === 'Brasil' && Number(c.division ?? 1) === 2)

  const table = competition === 'Liga Nacional do Brasil'
    ? buildStandings(brazilianFirstDivision.map(c => ({ id: c.id, name: c.short_name })), fixtures)
    : competition === 'Série B do Brasil'
      ? buildStandings(brazilianSecondDivision.map(c => ({ id: c.id, name: c.short_name })), fixtures)
      : []
  const rounds = [...new Set(fixtures.map(item => item.round))].sort((a, b) => a - b)
  const roundFixtures = fixtures.filter(item => item.round === round)

  useEffect(() => {
    const active = roundNavRef.current?.querySelector<HTMLElement>(`[data-round="${round}"]`)
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [round])
  const position = table.findIndex(item => item.id === currentClubId) + 1
  const rules = competition === 'Liga Nacional do Brasil'
    ? BRAZIL_LEAGUE_RULES
    : competition === 'Série B do Brasil'
      ? BRAZIL_SERIE_B_RULES
      : BRAZIL_CUP_RULES
  const competitionId = fixtures[0]?.competition_id
  const stats = useMemo(() => buildPlayerCompetitionStats(playedMatches, competitionId, seasonId ?? undefined), [playedMatches, competitionId, seasonId])
  const filteredStats = useMemo(() => {
    const scoped = statsScope === 'club' ? stats.filter(player => player.clubId === currentClubId) : stats
    return [...scoped].sort((a, b) => {
      const value = (player: typeof a) => player[statsMetric]
      return (value(b) as number) - (value(a) as number) || b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name)
    }).slice(0, 10)
  }, [stats, statsScope, statsMetric, currentClubId])
  const currentStage = competition === 'Copa Nacional do Brasil' ? getCompetitionStageLabel(round, rounds.length, true) : `Rodada ${round}`
  const stageRounds = competition === 'Copa Nacional do Brasil'
    ? [
        { label: 'Oitavas de final', rounds: [1, 2] },
        { label: 'Quartas de final', rounds: [3, 4] },
        { label: 'Semifinal', rounds: [5, 6] },
        { label: 'Final', rounds: [7] },
      ]
    : []

  const history = useMemo(() => {
    const completed = fixtures.filter(item => item.status === 'completed')
    const seasonFinished = fixtures.length > 0 && completed.length === fixtures.length
    if (competition === 'Liga Nacional do Brasil' || competition === 'Série B do Brasil') {
      const teams = competition === 'Liga Nacional do Brasil' ? brazilianFirstDivision : brazilianSecondDivision
      const standings = buildStandings(teams.map(c => ({ id: c.id, name: c.short_name })), fixtures)
      if (!seasonFinished) return { champion: null, runnerUp: null, completed: false }
      return { champion: clubs.find(c => c.id === standings[0]?.id) ?? null, runnerUp: clubs.find(c => c.id === standings[1]?.id) ?? null, completed: true }
    }
    const final = fixtures.find(item => item.round === 7 && item.status === 'completed')
    if (!final) return { champion: null, runnerUp: null, completed: false }
    const championId = final.winner_club_id ?? (final.home_score != null && final.away_score != null ? (final.home_score > final.away_score ? final.home_club_id : final.away_score > final.home_score ? final.away_club_id : null) : null)
    const runnerUpId = championId ? (championId === final.home_club_id ? final.away_club_id : final.home_club_id) : null
    return { champion: clubs.find(c => c.id === championId) ?? null, runnerUp: clubs.find(c => c.id === runnerUpId) ?? null, completed: true }
  }, [competition, fixtures, clubs])

  const champion = competition === 'Copa Nacional do Brasil'
    ? fixtures.find(item => item.round === 7 && item.status === 'completed')?.home_club_id && fixtures.find(item => item.round === 7 && item.status === 'completed')?.away_club_id
      ? (() => {
          const final = fixtures.find(item => item.round === 7 && item.status === 'completed')!
          if (final.winner_club_id === final.home_club_id) return final.home_club
          if (final.winner_club_id === final.away_club_id) return final.away_club
          if ((final.home_score ?? 0) > (final.away_score ?? 0)) return final.home_club
          if ((final.away_score ?? 0) > (final.home_score ?? 0)) return final.away_club
          return null
        })()
      : null
    : null

  return <main className="min-h-screen">
    <header className="flex h-20 items-center justify-between border-b border-white/6 px-6 md:px-10">
      <button onClick={back} className="text-sm font-semibold text-white/60">← FUTEBOL MANAGER</button>
      <span className="text-xs uppercase tracking-[0.18em] text-white/30">COMPETIÇÕES</span>
    </header>
    <section className="px-6 py-8 md:px-10">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-white/35">{seasonName}</p>
          <h1 className="mt-2 text-4xl font-bold">Competições</h1>
          <p className="mt-3 text-sm text-white/35">Acompanhe a temporada, os resultados e a situação do seu clube.</p>
          <p className="mt-2 text-xs text-white/25">Formato adaptado ao universo de 16 clubes.</p>
        </div>
        <div className="flex rounded-xl border border-white/6 p-1">
          <button onClick={() => setCompetition('Liga Nacional do Brasil')} className={`rounded-lg px-4 py-2.5 text-xs font-bold ${competition === 'Liga Nacional do Brasil' ? 'bg-emerald-400 text-[#06100c]' : 'text-white/40'}`}>Liga</button>
          <button onClick={() => setCompetition('Série B do Brasil')} className={`rounded-lg px-4 py-2.5 text-xs font-bold ${competition === 'Série B do Brasil' ? 'bg-emerald-400 text-[#06100c]' : 'text-white/40'}`}>Série B</button>
          <button onClick={() => setCompetition('Copa Nacional do Brasil')} className={`rounded-lg px-4 py-2.5 text-xs font-bold ${competition === 'Copa Nacional do Brasil' ? 'bg-emerald-400 text-[#06100c]' : 'text-white/40'}`}>Copa</button>
        </div>
      </div>

      {loading ? <div className="py-20 text-center text-sm text-white/35">Carregando competição...</div> : <>
        <div className="mt-8 grid gap-3 md:grid-cols-4">
          <Info label="Competição" value={competition} />
          <Info label="Partidas do seu clube" value={String(fixtures.filter(x => x.home_club_id === currentClubId || x.away_club_id === currentClubId).length)} />
          <Info label="Realizadas pelo seu clube" value={String(fixtures.filter(x => (x.home_club_id === currentClubId || x.away_club_id === currentClubId) && x.status === 'completed').length)} />
          <Info label={competition === 'Liga Nacional do Brasil' ? 'Sua posição' : 'Fase atual'} value={competition === 'Liga Nacional do Brasil' ? (position ? `#${position}` : '—') : currentStage} />
        </div>

        {competition === 'Copa Nacional do Brasil' && <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-white/30">Caminho do título</p><h2 className="mt-2 text-2xl font-bold">Chaveamento</h2></div><Trophy className="text-emerald-300/50" /></div>
          <div className="mt-6 overflow-x-auto pb-3"><div className="grid min-w-[1080px] grid-cols-4 gap-4">
            {[
              { label: 'Oitavas', rounds: [1, 2] },
              { label: 'Quartas', rounds: [3, 4] },
              { label: 'Semifinal', rounds: [5, 6] },
              { label: 'Final', rounds: [7] },
            ].map(stage => {
              const stageFixtures = fixtures.filter(item => stage.rounds.includes(item.round))
              const ties = new Map<string, Fixture[]>()
              for (const item of stageFixtures) {
                const key = [item.home_club_id, item.away_club_id].sort().join(':')
                const tie = ties.get(key) ?? []
                tie.push(item)
                ties.set(key, tie)
              }
              const cards = [...ties.values()].sort((a,b) => (a[0]?.scheduled_at ?? '').localeCompare(b[0]?.scheduled_at ?? ''))
              return <div key={stage.label} className="flex flex-col">
                <button onClick={() => setRound(stage.rounds.find(r => fixtures.some(f => f.round === r)) ?? stage.rounds[0])} className="mb-3 text-left"><p className="text-xs uppercase tracking-[0.16em] text-white/25">{stage.label}</p><p className="mt-1 text-sm font-bold">{stage.rounds.length === 1 ? 'Jogo único' : 'Ida e volta'}</p></button>
                <div className="flex flex-1 flex-col justify-around gap-3">
                  {cards.map((tie, index) => {
                    const first = tie.find(item => item.round === stage.rounds[0])
                    const second = tie.find(item => item.round === stage.rounds[1])
                    const home = first?.home_club ?? second?.away_club
                    const away = first?.away_club ?? second?.home_club
                    const homeId = first?.home_club_id ?? second?.away_club_id
                    const awayId = first?.away_club_id ?? second?.home_club_id
                    const firstHome = first?.home_score
                    const firstAway = first?.away_score
                    const secondHome = second?.home_score
                    const secondAway = second?.away_score
                    const homeAggregate = (first ? (first.home_club_id === homeId ? first.home_score ?? 0 : first.away_score ?? 0) : 0) + (second ? (second.home_club_id === homeId ? second.home_score ?? 0 : second.away_score ?? 0) : 0)
                    const awayAggregate = (first ? (first.home_club_id === awayId ? first.home_score ?? 0 : first.away_score ?? 0) : 0) + (second ? (second.home_club_id === awayId ? second.home_score ?? 0 : second.away_score ?? 0) : 0)
                    const winnerId = second?.winner_club_id ?? first?.winner_club_id ?? (stage.rounds.length === 1 && first && first.home_score != null && first.away_score != null ? (first.home_score > first.away_score ? first.home_club_id : first.away_score > first.home_score ? first.away_club_id : null) : null)
                    const completed = tie.filter(item => item.status === 'completed').length
                    const score = (clubId?: string) => stage.rounds.length === 1 ? (first?.home_club_id === clubId ? firstHome : firstAway) : (first?.home_club_id === clubId ? firstHome : firstAway) + ' / ' + (second ? (second.home_club_id === clubId ? secondHome : secondAway) : '—')
                    return <div key={index} className="relative rounded-xl border border-white/6 bg-black/15 p-3">
                      <div className="space-y-1"><div className={winnerId === homeId ? 'font-bold text-emerald-300' : 'font-medium'}><span className="inline-block w-[68%] truncate align-middle">{home?.short_name ?? 'A definir'}</span><span className="float-right">{score(homeId) ?? '—'}</span></div><div className={winnerId === awayId ? 'font-bold text-emerald-300' : 'font-medium'}><span className="inline-block w-[68%] truncate align-middle">{away?.short_name ?? 'A definir'}</span><span className="float-right">{score(awayId) ?? '—'}</span></div></div>
                      {stage.rounds.length > 1 && <p className="mt-2 border-t border-white/5 pt-2 text-[11px] text-white/30">Agregado <span className="font-bold text-white/65">{homeAggregate} × {awayAggregate}</span>{completed === 2 && winnerId ? <span className="ml-2 text-emerald-300">classificado</span> : ''}</p>}
                      {stage.rounds.length === 1 && completed === 1 && winnerId && <p className="mt-2 border-t border-white/5 pt-2 text-[11px] text-emerald-300">Classificado</p>}
                    </div>
                  })}
                  {cards.length === 0 && <div className="rounded-xl border border-dashed border-white/6 p-4 text-xs text-white/25">Aguardando definição</div>}
                </div>
              </div>
            })}
          </div></div>
        </section>}

        <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-white/30">{competition === 'Copa Nacional do Brasil' ? 'Fase' : 'Rodadas'}</p><h2 className="mt-2 text-2xl font-bold">{currentStage}</h2></div><Trophy className="text-emerald-300/50" /></div>
          <div className="relative mt-5">
            <div ref={roundNavRef} className="round-scroller flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2">
              {rounds.map(r => <button key={r} data-round={r} onClick={() => setRound(r)} className={`shrink-0 snap-center rounded-lg px-3 py-2 text-xs font-bold ${round === r ? 'bg-emerald-400 text-[#06100c]' : 'border border-white/6 text-white/45'}`}>{competition === 'Copa Nacional do Brasil' ? getCompetitionStageLabel(r, rounds.length, true) : `Rodada ${r}`}</button>)}
            </div>
            <span className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#131b2a] to-transparent" />
            <span className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#131b2a] to-transparent" />
          </div>
          <div className="mt-5 space-y-2">
            {roundFixtures.map(item => {
              const code = (club: typeof item.home_club) => {
                const name = club?.short_name ?? club?.name ?? '—'
                const known: Record<string, string> = { 'Corinthians': 'COR', 'Atlético-MG': 'CAM', 'Red Bull Bragantino': 'RBB', 'Athletico-PR': 'CAP', 'Flamengo': 'FLA', 'Palmeiras': 'PAL', 'São Paulo': 'SAO', 'Santos': 'SAN', 'Cruzeiro': 'CRU', 'Grêmio': 'GRE', 'Internacional': 'INT', 'Fluminense': 'FLU', 'Botafogo': 'BOT', 'Bahia': 'BAH', 'Vasco': 'VAS', 'Vitória': 'VIT' }
                return known[name] ?? name.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase()
              }
              const current = item.home_club_id === currentClubId || item.away_club_id === currentClubId
              return <div key={item.id} className={`grid grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] items-center gap-2 rounded-xl border px-3 py-3 ${current ? 'border-emerald-400/15 bg-emerald-400/[0.03]' : 'border-white/5 bg-black/10'}`}>
                <div className="min-w-0 flex items-center justify-end gap-2 text-right">
                  <span className="min-w-0 truncate text-xs font-semibold sm:text-sm"><span className="sm:hidden">{code(item.home_club)}</span><span className="hidden sm:inline">{item.home_club?.short_name ?? 'Casa'}</span></span>
                  <span className="hidden h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-1 sm:flex">{item.home_club?.logo_url ? <img src={item.home_club.logo_url} alt="" className="h-full w-full object-contain" /> : <span className="text-[7px] font-black text-slate-700">{code(item.home_club)}</span>}</span>
                </div>
                <span className="text-center text-sm font-black tabular-nums">{item.status === 'completed' ? `${item.home_score}–${item.away_score}` : '–'}</span>
                <div className="min-w-0 flex items-center gap-2">
                  <span className="hidden h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-1 sm:flex">{item.away_club?.logo_url ? <img src={item.away_club.logo_url} alt="" className="h-full w-full object-contain" /> : <span className="text-[7px] font-black text-slate-700">{code(item.away_club)}</span>}</span>
                  <span className="min-w-0 truncate text-xs font-semibold sm:text-sm"><span className="sm:hidden">{code(item.away_club)}</span><span className="hidden sm:inline">{item.away_club?.short_name ?? 'Fora'}</span></span>
                </div>
                <p className="col-span-3 truncate text-center text-[10px] text-white/25 sm:hidden">{dateLabel(item.scheduled_at)}</p>
                <p className="col-span-3 hidden text-xs text-white/25 sm:block">{dateLabel(item.scheduled_at)} · {item.home_club?.city ?? 'Cidade a definir'} · {item.home_club?.stadium ?? 'Estádio a definir'}</p>
              </div>
            })}
          </div>
        </section>

        {(competition === 'Liga Nacional do Brasil' || competition === 'Série B do Brasil') && <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-white/30">Classificação</p><h2 className="mt-2 text-2xl font-bold">{competition}</h2>
          <div className="mt-5 overflow-x-auto rounded-xl border border-white/5"><table className="w-full min-w-[720px] text-sm"><thead className="bg-white/[0.03] text-xs text-white/25"><tr>{['#','Clube','P','J','V','E','D','SG'].map(x => <th key={x} className="px-3 py-3 text-left">{x}</th>)}</tr></thead><tbody>
            {table.map((team, i) => <tr key={team.id} className={`border-t border-white/5 ${team.id === currentClubId ? 'bg-emerald-400/5' : ''}`}><td className="px-3 py-3">{i + 1}</td><td className="px-3 py-3 font-medium">{team.name}</td><td className="px-3 py-3 font-bold">{team.points}</td><td className="px-3 py-3">{team.played}</td><td className="px-3 py-3">{team.wins}</td><td className="px-3 py-3">{team.draws}</td><td className="px-3 py-3">{team.losses}</td><td className="px-3 py-3">{team.gf - team.ga}</td></tr>)}
          </tbody></table></div>
          <p className="mt-3 text-xs text-white/25">{competition === 'Liga Nacional do Brasil' ? 'Os quatro últimos clubes descem para a Série B.' : 'Os dois primeiros sobem diretamente; 3º a 6º disputam os dois acessos restantes em playoffs; os quatro últimos são rebaixados quando a divisão inferior existir.'}</p>
        </section>}

        <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-white/30">Histórico</p>
          <h2 className="mt-2 text-2xl font-bold">{seasonName}</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Info label="Campeão" value={history.champion?.short_name ?? 'Em aberto'} />
            <Info label="Vice-campeão" value={history.runnerUp?.short_name ?? 'Em aberto'} />
            <Info label="Status" value={seasonStatus === 'completed' ? 'Temporada encerrada' : history.completed ? 'Competição encerrada' : 'Em andamento'} />
          </div>
          <p className="mt-3 text-xs text-white/35">{seasonStatus === 'completed' ? `Registro oficial salvo no histórico · ${officialHistory.length} competição(ões) consolidada(s).` : history.completed ? 'A competição foi concluída e o campeão está definido.' : 'Nenhum campeão é exibido até a competição terminar.'}</p>
        </section>

        {competitionRecords.length > 0 && <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-white/30">Recordes da competição</p>
          <h2 className="mt-2 text-2xl font-bold">Marcas históricas</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {competitionRecords.map(record => {
              const holder = clubs.find(club => club.id === record.club_id)
              return <div key={record.record_type} className="rounded-xl border border-white/5 bg-black/10 p-4">
                <p className="text-xs text-white/30">{record.description}</p>
                <p className="mt-3 text-2xl font-bold">{record.value}</p>
                <p className="mt-1 text-[10px] text-white/25">{holder?.short_name ?? 'Clube'} · marca histórica</p>
              </div>
            })}
          </div>
        </section>}

        {clubHistory.length > 0 && <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-white/30">Histórico do clube</p>
          <h2 className="mt-2 text-2xl font-bold">Evolução ao longo das temporadas</h2>
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {clubHistory.map((item, index) => <div key={item.season + item.competition + index} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-4 py-3">
              <div><p className="text-sm font-semibold">{item.season}</p><p className="mt-1 text-[10px] text-white/30">{item.competition} · Divisão {item.division}</p></div>
              <div className="text-right"><p className="text-sm font-bold">#{item.position}</p><p className="mt-1 text-[10px] text-white/30">{item.points} pts</p></div>
            </div>)}
          </div>
        </section>}

        {seasonHistory.length > 0 && <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-white/30">Histórico de campeões</p>
          <h2 className="mt-2 text-2xl font-bold">Temporadas anteriores</h2>
          <div className="mt-5 overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-white/[0.03] text-xs text-white/25"><tr><th className="px-4 py-3 text-left">Temporada</th><th className="px-4 py-3 text-left">Série A</th><th className="px-4 py-3 text-left">Série B</th><th className="px-4 py-3 text-left">Copa</th><th className="px-4 py-3 text-left">Status</th></tr></thead>
              <tbody>{seasonHistory.map(item => <tr key={item.season} className="border-t border-white/5"><td className="px-4 py-3 font-semibold">{item.season}</td><td className="px-4 py-3">{item.leagueChampion}</td><td className="px-4 py-3">{item.serieBChampion}</td><td className="px-4 py-3">{item.cupChampion}</td><td className="px-4 py-3 text-white/40">{item.status === 'completed' ? 'Encerrada' : item.status === 'active' ? 'Em andamento' : item.status}</td></tr>)}</tbody>
            </table>
          </div>
        </section>}

        {stats.length > 0 && <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div><p className="text-xs uppercase tracking-[0.18em] text-white/30">Estatísticas</p><h2 className="mt-2 text-2xl font-bold">Jogadores da competição</h2><p className="mt-2 text-sm text-white/30">Acompanhe quem está produzindo mais nesta temporada.</p></div>
            <div className="flex rounded-xl border border-white/6 p-1">
              {[
                ['all', 'Todos'],
                ['club', 'Meu clube'],
              ].map(([value, label]) => <button key={value} onClick={() => setStatsScope(value as 'all' | 'club')} className={`rounded-lg px-3 py-2 text-xs font-bold ${statsScope === value ? 'bg-emerald-400 text-[#06100c]' : 'text-white/40'}`}>{label}</button>)}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              ['goals', 'Gols'],
              ['assists', 'Assistências'],
              ['averageRating', 'Média'],
              ['appearances', 'Jogos'],
            ].map(([value, label]) => <button key={value} onClick={() => setStatsMetric(value as typeof statsMetric)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${statsMetric === value ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-white/6 text-white/35'}`}>{label}</button>)}
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-white/5">
            <div className="grid grid-cols-[40px_minmax(180px,1fr)_90px_90px_90px_90px] gap-3 bg-white/[0.03] px-4 py-3 text-[11px] uppercase tracking-wider text-white/25">
              <span>#</span><span>Jogador</span><span className="text-right">Gols</span><span className="text-right">Assist.</span><span className="text-right">Jogos</span><span className="text-right">Média</span>
            </div>
            {filteredStats.map((player, index) => {
              const club = clubs.find(item => item.id === player.clubId)
              return <div key={player.playerId} className="grid grid-cols-[40px_minmax(180px,1fr)_90px_90px_90px_90px] gap-3 border-t border-white/5 px-4 py-3 text-sm">
                <span className="text-white/30">{index + 1}</span>
                <div className="min-w-0"><p className="truncate font-semibold">{player.name}</p><p className="truncate text-xs text-white/25">{club?.short_name ?? 'Clube'}</p></div>
                <span className={`text-right font-semibold ${statsMetric === 'goals' ? 'text-emerald-300' : ''}`}>{player.goals}</span>
                <span className={`text-right font-semibold ${statsMetric === 'assists' ? 'text-emerald-300' : ''}`}>{player.assists}</span>
                <span className={`text-right font-semibold ${statsMetric === 'appearances' ? 'text-emerald-300' : ''}`}>{player.appearances}</span>
                <span className={`text-right font-semibold ${statsMetric === 'averageRating' ? 'text-emerald-300' : ''}`}>{player.averageRating.toFixed(1)}</span>
              </div>
            })}
            {filteredStats.length === 0 && <div className="px-4 py-8 text-center text-sm text-white/30">Nenhum jogador com estatísticas nesta competição.</div>}
          </div>
        </section>}
      </>}
    </section>
  </main>
}
