import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Banknote, CalendarDays, ChevronRight, CircleUserRound, Dumbbell, MapPin, Newspaper, Shield, ShoppingBag, Trophy, Users, Handshake } from 'lucide-react'
import { supabase } from './lib/supabase'
import type { Club, Fixture, Formation, LineupPlayer, ManagerProfile, Player, Screen } from './types/game'
import { getAiCoachProfile, getSquadRole, lineupFromPlayerIds, playerOverall, selectStartingLineup, type MatchResult } from './engine/match'
import type { PlayedMatch } from './types/game'
import PlayerProfile from './components/PlayerProfile'
import TransferMarket from './components/TransferMarket'
import LoanMarket from './components/LoanMarket'
import CompetitionCenter from './components/CompetitionCenter'
import PressCenter from './components/PressCenter'
import { TRAINING_FOCUSES, type TrainingFocus, trainSquad, recoverPlayers, applyMatchFatigue } from './engine/training'
import { calculateMonthlyPayroll } from './engine/economy'
import { applyTransaction, calculateMatchRevenue, calculateMonthlySalaryExpense, createTransaction, estimateAttendance, type FinanceTransaction } from './engine/finance'
import { daysUntilContractEnd, getContractStatus } from './engine/contracts'
import { applyTransfer, type TransferRecord, type TransferState } from './engine/transfers'
import { getCurrentClubId as getLoanClubId, type LoanState } from './engine/loans'
import { getSquadAlerts } from './engine/roster'
import { buildStandings, resolveCompletedKnockoutStage, getCompetitionStage, resolveTwoLegTie, choosePenaltyWinner, resolveSingleMatch } from './engine/competitions'
import { buildCompetitionHistoryResult, buildSeasonCompletion } from './engine/seasonHistory'
import { simulateWorldDay, type WorldClub, type WorldClubPerformance, type WorldPlayer, type WorldSimulationResult } from './engine/worldSimulation'
import { buildWorldNews, type WorldNews } from './engine/worldNews'
import { advanceSeasonDay, canAdvanceDay, createSeasonClock, daysBetween, formatSeasonDate, toDateKey, type SeasonClock } from './engine/calendar'

const CAREER_KEY = 'futebol-manager:career'
const MATCHES_KEY = 'futebol-manager:matches'
const TACTIC_KEY = 'futebol-manager:tactic'
const TRAINING_KEY = 'futebol-manager:training'
const CLOCK_KEY = 'futebol-manager:season-clock'
const CONTRACTS_KEY = 'futebol-manager:contracts'
const FINANCE_KEY = 'futebol-manager:finance'
const INITIAL_SEASON_YEAR = 2026
const SEASON_NAME = `Temporada ${INITIAL_SEASON_YEAR}`
const seasonName = (year: number) => `Temporada ${year}`
const SEASON_START = '2026-01-01'
const TRANSFERS_KEY = 'futebol-manager:transfers'
const LOANS_KEY = 'futebol-manager:loans'
const WORLD_NEWS_KEY = 'futebol-manager:world-news'

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function normalizeFixture(row: any): Fixture {
  return {
    id: row.id,
    competition_id: row.competition_id,
    season_id: row.season_id ?? undefined,
    round: Number(row.round),
    scheduled_at: row.scheduled_at,
    status: row.status,
    home_club_id: row.home_club_id,
    away_club_id: row.away_club_id,
    home_score: row.home_score,
    away_score: row.away_score,
    winner_club_id: row.winner_club_id ?? null,
    home_club: Array.isArray(row.home_club) ? (row.home_club[0] ?? null) : (row.home_club ?? null),
    away_club: Array.isArray(row.away_club) ? (row.away_club[0] ?? null) : (row.away_club ?? null),
    competition_name: Array.isArray(row.competitions) ? (row.competitions[0]?.name ?? null) : (row.competitions?.name ?? null),
  }
}

function normalizePlayer(row: any): Player {
  const source = Array.isArray(row.players) ? row.players[0] : row.players
  return { ...source, squad_number: row.squad_number } as Player
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [clubs, setClubs] = useState<Club[]>([])
  const [managerName, setManagerName] = useState('')
  const [nationality, setNationality] = useState('Brasil')
  const [birthDate, setBirthDate] = useState('')
  const [managerStyle, setManagerStyle] = useState<ManagerProfile['style']>('high_press')
  const [managerPersonality, setManagerPersonality] = useState<ManagerProfile['personality']>('motivator')
  const [selectedClub, setSelectedClub] = useState<Club | null>(null)
  const [career, setCareer] = useState<ManagerProfile | null>(() => {
    const saved = localStorage.getItem(CAREER_KEY)
    return saved ? JSON.parse(saved) : null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (clubs.length > 0) return
    let active = true
    async function loadClubs() {
      setLoading(true); setError(null)
      const { data, error } = await supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation,stadium,logo_url').order('name')
      if (!active) return
      if (error) setError(error.message); else setClubs(data ?? [])
      setLoading(false)
    }
    loadClubs()
    return () => { active = false }
  }, [clubs.length])

  const canContinue = managerName.trim().length >= 2 && Boolean(birthDate)

  function confirmCareer() {
    if (!selectedClub || !canContinue) return
    const next: ManagerProfile = { name: managerName.trim(), nationality, birthDate, style: managerStyle, personality: managerPersonality, club: { ...selectedClub, budget: Math.max(0, Number(selectedClub.budget ?? 0)) }, season: SEASON_NAME }
    localStorage.setItem(CAREER_KEY, JSON.stringify(next))
    localStorage.setItem(FINANCE_KEY, JSON.stringify([createTransaction(SEASON_START, 'other', 'Capital inicial da carreira', next.club.budget, undefined, 'career:initial-budget')]))
    setCareer(next); setScreen('dashboard')
  }

  async function resetSeasonForNewCareer() {
    if (!career) return
    // Uma nova carreira nunca herda o estado esportivo da carreira anterior.
    // A temporada 2026 volta ao estado pré-rodada e a Copa é reduzida às
    // partidas-base; as fases seguintes serão recriadas pelo motor conforme o avanço.
    const { data: season } = await supabase.from('seasons').select('id').eq('name', career.season).maybeSingle()
    if (!season?.id) return

    const { data: competitions } = await supabase
      .from('competitions')
      .select('id,name')
      .in('name', ['Liga Nacional do Brasil', 'Copa Nacional do Brasil'])

    const cupId = competitions?.find(item => item.name === 'Copa Nacional do Brasil')?.id
    if (cupId) {
      await supabase
        .from('fixtures')
        .delete()
        .eq('season_id', season.id)
        .eq('competition_id', cupId)
        .gt('round', 2)
    }

    await supabase
      .from('fixtures')
      .update({
        status: 'scheduled',
        home_score: null,
        away_score: null,
        winner_club_id: null,
      })
      .eq('season_id', season.id)

    await supabase.from('competition_history').delete().eq('season_id', season.id)
    await supabase.from('world_transfers').delete().eq('season_id', season.id)
    await supabase.from('player_season_stats').delete().eq('season_id', season.id)
    await supabase.rpc('reset_world_state')
    await supabase.from('season_club_movements').delete().eq('season_id', season.id)
    await supabase.from('seasons').update({ status: 'active', end_date: null, start_date: SEASON_START }).eq('id', season.id).eq('status', 'completed')
  }

  async function startNextSeason() {
    const currentYear = Number(career?.season.match(/\d{4}/)?.[0] ?? INITIAL_SEASON_YEAR)
    const nextYear = currentYear + 1
    const nextSeasonName = seasonName(nextYear)

    const { data: currentSeason } = await supabase.from('seasons').select('id,status').eq('name', career?.season ?? SEASON_NAME).maybeSingle()
    if (!currentSeason?.id || currentSeason.status !== 'completed') return
    const { data: competitions } = await supabase.from('competitions').select('id,name').in('name', ['Liga Nacional do Brasil', 'Copa Nacional do Brasil'])
    const leagueId = competitions?.find(item => item.name === 'Liga Nacional do Brasil')?.id
    const cupId = competitions?.find(item => item.name === 'Copa Nacional do Brasil')?.id
    if (!leagueId || !cupId) return

    const { data: existing } = await supabase.from('seasons').select('id').eq('name', nextSeasonName).maybeSingle()
    if (existing?.id) {
      if (career) { const nextCareer = { ...career, season: nextSeasonName }; localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer)); setCareer(nextCareer) }
      window.location.reload(); return
    }

    const { data: clubsForSeason } = await supabase.from('clubs').select('id,name').eq('division', 1).order('name')
    if (!clubsForSeason || clubsForSeason.length !== 16) return
    const { data: newSeason, error: seasonError } = await supabase.from('seasons').insert({ name: nextSeasonName, year: nextYear, status: 'active', start_date: `${nextYear}-01-10`, end_date: `${nextYear}-08-01` }).select('id').single()
    if (seasonError || !newSeason?.id) { console.error('Não foi possível criar a próxima temporada', seasonError); return }

    const rotation = [...clubsForSeason]
    const fixed = rotation.shift()!
    const firstLeg: Array<Record<string, unknown>> = []
    for (let round = 0; round < 15; round += 1) {
      const order = [fixed, ...rotation]
      for (let index = 0; index < 8; index += 1) {
        const home = round % 2 === 0 ? order[index] : order[15 - index]
        const away = round % 2 === 0 ? order[15 - index] : order[index]
        const date = new Date(Date.UTC(nextYear, 0, 10 + round * 7, 22, 0, 0))
        firstLeg.push({ competition_id: leagueId, season_id: newSeason.id, round: round + 1, home_club_id: home.id, away_club_id: away.id, scheduled_at: date.toISOString(), status: 'scheduled', stage: 'league', leg: 1 })
      }
      const last = rotation.pop()!
      rotation.unshift(last)
    }
    const secondLeg = firstLeg.map(fixture => ({ ...fixture, round: Number(fixture.round) + 15, home_club_id: fixture.away_club_id, away_club_id: fixture.home_club_id, scheduled_at: new Date(Date.UTC(nextYear, 0, 10 + (Number(fixture.round) + 14) * 7, 22, 0, 0)).toISOString() }))
    const { error: leagueError } = await supabase.from('fixtures').insert([...firstLeg, ...secondLeg])
    if (leagueError) { console.error('Não foi possível criar a nova tabela da liga', leagueError); await supabase.from('seasons').delete().eq('id', newSeason.id); return }

    const { data: previousFixtures } = await supabase.from('fixtures').select('round,status,home_club_id,away_club_id,home_score,away_score,winner_club_id').eq('season_id', currentSeason.id).eq('competition_id', leagueId).eq('status', 'completed')
    const standings = buildStandings(clubsForSeason.map(club => ({ id: club.id, name: club.name })), previousFixtures as any)
    const ranked = standings.map(item => clubsForSeason.find(club => club.id === item.id)!).filter(Boolean)
    const cupFixtures: Array<Record<string, unknown>> = []
    for (let index = 0; index < 8; index += 1) {
      const first = ranked[index]; const second = ranked[15 - index]; const tieId = `r16-${nextYear}-${index + 1}`
      const date1 = new Date(Date.UTC(nextYear, 1, 7 + (index % 2), 19, 0, 0)); const date2 = new Date(Date.UTC(nextYear, 1, 21 + (index % 2), 19, 0, 0))
      cupFixtures.push({ competition_id: cupId, season_id: newSeason.id, round: 1, stage: 'round_of_16', tie_id: tieId, leg: 1, home_club_id: first.id, away_club_id: second.id, scheduled_at: date1.toISOString(), status: 'scheduled' }, { competition_id: cupId, season_id: newSeason.id, round: 2, stage: 'round_of_16', tie_id: tieId, leg: 2, home_club_id: second.id, away_club_id: first.id, scheduled_at: date2.toISOString(), status: 'scheduled' })
    }
    const { error: cupError } = await supabase.from('fixtures').insert(cupFixtures)
    if (cupError) { console.error('Não foi possível criar a nova Copa', cupError); await supabase.from('fixtures').delete().eq('season_id', newSeason.id); await supabase.from('seasons').delete().eq('id', newSeason.id); return }

    if (career) { const nextCareer = { ...career, season: nextSeasonName }; localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer)); setCareer(nextCareer) }
    localStorage.removeItem(WORLD_NEWS_KEY)
    window.location.reload()
  }
  async function newCareer() {
    await resetSeasonForNewCareer()
    localStorage.removeItem(CAREER_KEY)
    localStorage.removeItem(FINANCE_KEY)
    localStorage.removeItem(TRANSFERS_KEY)
    localStorage.removeItem(LOANS_KEY)
    localStorage.removeItem(CONTRACTS_KEY)
    localStorage.removeItem(TRAINING_KEY)
    localStorage.removeItem(TACTIC_KEY)
    localStorage.removeItem(CLOCK_KEY)
    localStorage.removeItem(MATCHES_KEY)
    localStorage.removeItem(WORLD_NEWS_KEY)
    setCareer(null); setManagerName(''); setNationality('Brasil'); setBirthDate(''); setManagerStyle('high_press'); setManagerPersonality('motivator'); setSelectedClub(null); setScreen('manager')
  }

  return <div className="min-h-screen bg-[#090b0f] text-white"><div className="mx-auto min-h-screen max-w-6xl border-x border-white/5 bg-[#0d1015]">
    {screen === 'home' && <Home career={career} start={() => setScreen('manager')} continueCareer={() => setScreen('dashboard')} newCareer={newCareer} />}
    {screen === 'manager' && <Manager name={managerName} nationality={nationality} birthDate={birthDate} style={managerStyle} personality={managerPersonality} canContinue={canContinue} onName={setManagerName} onNationality={setNationality} onBirthDate={setBirthDate} onStyle={setManagerStyle} onPersonality={setManagerPersonality} back={() => setScreen('home')} next={() => setScreen('club')} />}
    {screen === 'club' && <ClubList clubs={clubs} selected={selectedClub} loading={loading} error={error} select={setSelectedClub} back={() => setScreen('manager')} confirm={confirmCareer} />}
    {screen === 'dashboard' && career && <Dashboard career={career} clubs={clubs} newCareer={newCareer} onNextSeason={startNextSeason} onCareerUpdate={setCareer} />}
  </div></div>
}

function Top({ label, back }: { label?: string; back?: () => void }) {
  return <header className="flex h-20 items-center justify-between border-b border-white/6 px-6 md:px-10"><button onClick={back} className={back ? 'flex items-center gap-3 text-sm font-semibold text-white/60 hover:text-white' : 'pointer-events-none text-sm font-semibold'}>{back && <ArrowLeft size={18} />} FUTEBOL MANAGER</button>{label && <span className="text-xs uppercase tracking-[0.18em] text-white/30">{label}</span>}</header>
}

function Home({ career, start, continueCareer, newCareer }: { career: ManagerProfile | null; start: () => void; continueCareer: () => void; newCareer: () => void }) {
  return <main className="relative min-h-screen overflow-hidden"><div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_20%_80%,rgba(59,130,246,0.08),transparent_30%)]" /><div className="relative"><Top /><section className="flex min-h-[calc(100vh-5rem)] flex-col justify-between px-6 py-12 md:px-16 md:py-16"><div className="max-w-3xl pt-8 md:pt-16"><div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1.5 text-xs font-medium text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> TEMPORADA 2026</div><h1 className="text-5xl font-bold leading-[0.98] tracking-[-0.04em] md:text-7xl">O clube está esperando por você.</h1><p className="mt-7 max-w-xl text-base leading-7 text-white/45 md:text-lg">Monte sua carreira, escolha seu clube e comece a construir sua história no futebol.</p><div className="mt-10 flex flex-col gap-3 sm:flex-row">{career ? <><button onClick={continueCareer} className="flex items-center justify-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300">Continuar carreira <ArrowRight size={17} /></button><button onClick={newCareer} className="rounded-xl border border-white/10 px-6 py-3.5 text-sm font-semibold text-white/70 hover:border-white/20 hover:text-white">Nova carreira</button></> : <button onClick={start} className="flex items-center justify-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300">Começar carreira <ArrowRight size={17} /></button>}</div></div><div className="grid max-w-3xl grid-cols-1 gap-3 pt-16 sm:grid-cols-3"><Feature icon={<CircleUserRound size={18} />} title="Seu treinador" text="Você decide o caminho." /><Feature icon={<Shield size={18} />} title="Seu clube" text="Escolha onde começar." /><Feature icon={<Trophy size={18} />} title="Sua história" text="Cada temporada conta." /></div></section></div></main>
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="rounded-2xl border border-white/6 bg-white/[0.025] p-4"><div className="mb-8 flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-white/55">{icon}</div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-white/35">{text}</p></div> }

function Manager({ name, nationality, birthDate, style, personality, canContinue, onName, onNationality, onBirthDate, onStyle, onPersonality, back, next }: { name: string; nationality: string; birthDate: string; style: ManagerProfile['style']; personality: ManagerProfile['personality']; canContinue: boolean; onName: (v: string) => void; onNationality: (v: string) => void; onBirthDate: (v: string) => void; onStyle: (v: ManagerProfile['style']) => void; onPersonality: (v: ManagerProfile['personality']) => void; back: () => void; next: () => void }) {
  const styles: Array<[ManagerProfile['style'], string, string]> = [
    ['high_press','🔥 Pressão Alta','Recuperação rápida na zona adversária'],['possession','🎯 Posse de Bola','Controle do jogo pelo passe'],['counter_attack','⚡ Contra-Ataque','Explorar espaços na transição'],['direct','📏 Jogo Direto','Passes longos e disputa física'],['tiki_taka','🔄 Tiki-Taka','Triangulações e toque a toque'],['defensive_block','🛡️ Bloco Defensivo','Organização compacta e solidez'],['gegenpressing','💥 Gegenpressing','Pressing imediato após perda de bola'],['set_pieces','📐 Bolas Paradas','Especialista em escanteios e faltas'],['youth_focus','🌱 Foco em Jovens','Desenvolvimento e progressão de talentos'],
  ]
  const personalities: Array<[ManagerProfile['personality'], string, string]> = [
    ['motivator','🎤 Motivador','Eleva o moral nos momentos difíceis'],['disciplinarian','📏 Disciplinador','Exige compromisso máximo e respeita hierarquia'],['psychologist','🧠 Psicólogo','Entende cada jogador individualmente'],['visionary','🔭 Visionário','Enxerga talentos que outros ignoram'],['negotiator','🤝 Negociador','Fecha contratos vantajosos no mercado'],['winning_mentality','🏆 Mentalidade Vencedora','Transforma times em máquinas de ganhar'],
  ]
  return <main className="min-h-screen"><Top label="NOVA CARREIRA" back={back} /><section className="mx-auto max-w-3xl px-6 py-12 md:px-10"><span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/70">01 / 02</span><h1 className="mt-4 text-4xl font-bold tracking-[-0.03em] md:text-5xl">Quem vai comandar?</h1><p className="mt-4 max-w-lg leading-7 text-white/45">Defina o treinador, sua identidade e a forma como ele quer jogar.</p><div className="mt-10 grid gap-7 md:grid-cols-2"><Field label="Nome do treinador"><input autoFocus value={name} onChange={e => onName(e.target.value)} placeholder="Ex.: Jeferson Rocha" className="w-full border-b border-white/10 bg-transparent py-3 text-xl outline-none placeholder:text-white/20 focus:border-emerald-400" /></Field><Field label="Data de nascimento"><input type="date" value={birthDate} onChange={e => onBirthDate(e.target.value)} className="w-full border-b border-white/10 bg-transparent py-3 text-base outline-none focus:border-emerald-400" /></Field><Field label="Nacionalidade"><select value={nationality} onChange={e => onNationality(e.target.value)} className="w-full border-b border-white/10 bg-transparent py-3 text-base outline-none focus:border-emerald-400"><option>Brasil</option><option>Argentina</option><option>Portugal</option><option>Uruguai</option></select></Field></div><section className="mt-12"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Estilo de jogo</p><p className="mt-2 text-sm text-white/35">Escolha um estilo. Ele altera diretamente os modificadores usados pelo motor das partidas.</p><div className="mt-4 grid gap-2 md:grid-cols-3">{styles.map(([value,label,description]) => <button type="button" key={value} onClick={() => onStyle(value)} className={`rounded-xl border p-4 text-left ${style === value ? 'border-emerald-400/50 bg-emerald-400/8' : 'border-white/6 bg-white/[0.025]'}`}><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs leading-5 text-white/35">{description}</p></button>)}</div></section><section className="mt-10"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Personalidade</p><p className="mt-2 text-sm text-white/35">Escolha uma personalidade. Ela afeta moral, disciplina, desenvolvimento ou negociações ao longo da carreira.</p><div className="mt-4 grid gap-2 md:grid-cols-3">{personalities.map(([value,label,description]) => <button type="button" key={value} onClick={() => onPersonality(value)} className={`rounded-xl border p-4 text-left ${personality === value ? 'border-emerald-400/50 bg-emerald-400/8' : 'border-white/6 bg-white/[0.025]'}`}><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs leading-5 text-white/35">{description}</p></button>)}</div></section><button disabled={!canContinue} onClick={next} className="mt-12 flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-400 px-6 py-4 text-sm font-bold text-[#06100c] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-30">Escolher meu clube <ArrowRight size={17} /></button></section></main>
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">{label}</span><div className="mt-2">{children}</div></label> }

function ClubList({ clubs, selected, loading, error, select, back, confirm }: { clubs: Club[]; selected: Club | null; loading: boolean; error: string | null; select: (club: Club) => void; back: () => void; confirm: () => void }) {
  return <main className="min-h-screen"><Top label="ESCOLHA SEU CLUBE" back={back} /><section className="mx-auto max-w-5xl px-6 py-12 md:px-10"><span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/70">02 / 02</span><h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">Onde começa sua história?</h1><p className="mt-4 max-w-xl leading-7 text-white/45">Escolha um dos clubes disponíveis para iniciar a temporada 2026.</p>{selected && <div className="mt-6 inline-block rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-3 text-sm"><span className="text-white/35">Selecionado</span><p className="font-semibold text-emerald-300">{selected.name}</p></div>}{loading && <div className="py-20 text-center text-sm text-white/35">Carregando clubes...</div>}{error && <div className="mt-10 rounded-xl border border-red-400/15 bg-red-400/5 p-5 text-sm text-red-200">Não foi possível carregar os clubes. {error}</div>}{!loading && !error && <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{clubs.map(club => <button key={club.id} onClick={() => select(club)} className={`group rounded-2xl border p-5 text-left transition ${selected?.id === club.id ? 'border-emerald-400/50 bg-emerald-400/8' : 'border-white/6 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.045]'}`}><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1.5">{club.logo_url ? <img src={club.logo_url} alt="" className="h-full w-full object-contain" loading="lazy" /> : <span className={selected?.id === club.id ? 'text-emerald-700' : 'text-slate-500'}>{club.short_name.slice(0, 3)}</span>}</div><ChevronRight size={17} className="text-white/15 group-hover:text-white/45" /></div><h2 className="mt-5 font-semibold">{club.name}</h2><div className="mt-2 flex items-center gap-2 text-xs text-white/35"><MapPin size={13} />{club.city}</div><div className="mt-5 flex items-center justify-between border-t border-white/6 pt-4 text-xs"><span className="text-white/30">Capital inicial</span><span className="font-semibold text-emerald-300/80">{money(club.budget)}</span></div></button>)}</div>}<div className="mt-10 flex justify-end"><button disabled={!selected} onClick={confirm} className="flex items-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-30">Assumir o clube <ArrowRight size={17} /></button></div></section></main>
}

function Dashboard({ career, clubs, newCareer, onNextSeason, onCareerUpdate }: { career: ManagerProfile; clubs: Club[]; newCareer: () => void; onNextSeason: () => void; onCareerUpdate: (career: ManagerProfile) => void }) {
  const [players, setPlayers] = useState<Player[]>([])
  const [nextFixture, setNextFixture] = useState<Fixture | null>(null)
  const [opponentPlayers, setOpponentPlayers] = useState<Player[]>([])
  const [table, setTable] = useState<{ id: string; name: string; points: number; played: number; wins: number; draws: number; losses: number; gf: number; ga: number }[]>([])
  const [playedMatches, setPlayedMatches] = useState<Record<string, PlayedMatch>>(() => {
    try { return JSON.parse(localStorage.getItem(MATCHES_KEY) ?? '{}') } catch { return {} }
  })
  const [view, setView] = useState<'overview' | 'squad' | 'tactics' | 'match' | 'training' | 'market' | 'loans' | 'competitions' | 'press'>('overview')
  const [transferState, setTransferState] = useState<TransferState>(() => { try { return JSON.parse(localStorage.getItem(TRANSFERS_KEY) ?? '{"playerClubOverrides":{},"records":[]}') } catch { return { playerClubOverrides: {}, records: [] } } })
  const [loanState, setLoanState] = useState<LoanState>(() => { try { return JSON.parse(localStorage.getItem(LOANS_KEY) ?? '{"records":[]}') } catch { return { records: [] } } })
  const [selectedStarters, setSelectedStarters] = useState<Player[]>([])
  const [tactic, setTactic] = useState('balanced')
  const [formation, setFormation] = useState('4-3-3')
  const [activeMatchFixture, setActiveMatchFixture] = useState<Fixture | null>(null)
  const [loading, setLoading] = useState(true)
  const [salaryTotal, setSalaryTotal] = useState(0)
  const [financeBalance, setFinanceBalance] = useState(() => career?.club.budget ?? 0)
  const [financeTransactions, setFinanceTransactions] = useState<FinanceTransaction[]>(() => { try { return JSON.parse(localStorage.getItem(FINANCE_KEY) ?? '[]') } catch { return [] } })
  const [contractAlerts, setContractAlerts] = useState<Array<{ playerId: string; name: string; until: string | null; days: number | null; status: string }>>([])
  const [upcomingFixtures, setUpcomingFixtures] = useState<Fixture[]>([])
  const [clock, setClock] = useState<SeasonClock | null>(() => { try { const saved = localStorage.getItem(CLOCK_KEY); return saved ? JSON.parse(saved) : null } catch { return null } })
  const [seasonClosed, setSeasonClosed] = useState(false)
  const [seasonCompletion, setSeasonCompletion] = useState<any>(null)
  const [worldNews, setWorldNews] = useState<WorldNews[]>(() => {
    try { return JSON.parse(localStorage.getItem(WORLD_NEWS_KEY) ?? '[]') } catch { return [] }
  })

  async function finalizeSeasonIfComplete(seasonId: string, matches: Record<string, PlayedMatch>) {
    const { data: competitions } = await supabase.from('competitions').select('id,name').in('name', ['Liga Nacional do Brasil', 'Copa Nacional do Brasil'])
    const leagueId = competitions?.find(item => item.name === 'Liga Nacional do Brasil')?.id
    const cupId = competitions?.find(item => item.name === 'Copa Nacional do Brasil')?.id
    if (!leagueId || !cupId) return

    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('round,status,home_club_id,away_club_id,home_score,away_score,winner_club_id,competition_id')
      .eq('season_id', seasonId)
      .in('competition_id', [leagueId, cupId])

    const leagueFixtures = (fixtures ?? []).filter(item => item.competition_id === leagueId)
    const cupFixtures = (fixtures ?? []).filter(item => item.competition_id === cupId)
    const completion = buildSeasonCompletion(
      { id: seasonId, name: career.season },
      leagueId,
      cupId,
      leagueFixtures,
      cupFixtures,
      Object.values(matches),
    )
    if (!completion) return

    // O fechamento precisa ser idempotente: só a primeira chamada que encontrar
    // a temporada ativa pode aplicar os efeitos das conquistas.
    const { data: closedSeason, error } = await supabase
      .from('seasons')
      .update({ status: 'completed', end_date: toDateKey(new Date().toISOString()) })
      .eq('id', seasonId)
      .eq('status', 'active')
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('Não foi possível fechar a temporada', error)
      return
    }
    if (!closedSeason) return

    const leagueTeams = [...new Set(leagueFixtures.flatMap(item => [item.home_club_id, item.away_club_id]))]
      .map(id => ({ id, name: id }))
    const leagueStandings = buildStandings(leagueTeams, leagueFixtures as any)
    const topFour = leagueStandings.slice(0, 4).map(team => team.id)

    // Na Copa, a semifinal é a fase anterior à final (rodada 6 no calendário atual).
    const semifinalists = [...new Set(
      cupFixtures
        .filter(item => item.round === 6)
        .flatMap(item => [item.home_club_id, item.away_club_id]),
    )]

    const achievementByClub = new Map<string, {
      budgetBonus: number
      reputationBonus: number
      strengthBonus: number
      marketMultiplier: number
    }>()

    function achievement(clubId: string) {
      const current = achievementByClub.get(clubId) ?? {
        budgetBonus: 0,
        reputationBonus: 0,
        strengthBonus: 0,
        marketMultiplier: 1,
      }
      achievementByClub.set(clubId, current)
      return current
    }

    // Liga: o título tem um peso claramente maior que uma boa colocação.
    topFour.forEach((clubId, index) => {
      const current = achievement(clubId)
      if (index === 0) {
        current.budgetBonus += 3_000_000
        current.reputationBonus += 5
        current.strengthBonus += 2
        current.marketMultiplier *= 1.05
      } else if (index === 1) {
        current.budgetBonus += 1_500_000
        current.reputationBonus += 2
        current.strengthBonus += 1
        current.marketMultiplier *= 1.02
      } else {
        current.budgetBonus += 750_000
        current.reputationBonus += 1
        current.marketMultiplier *= 1.01
      }
    })

    if (completion.cup.championClubId) {
      const cupChampion = achievement(completion.cup.championClubId)
      cupChampion.budgetBonus += 2_000_000
      cupChampion.reputationBonus += 3
      cupChampion.strengthBonus += 1
      cupChampion.marketMultiplier *= 1.03
    }

    if (completion.cup.runnerUpClubId) {
      const cupRunner = achievement(completion.cup.runnerUpClubId)
      cupRunner.budgetBonus += 1_000_000
      cupRunner.reputationBonus += 1
      cupRunner.marketMultiplier *= 1.015
    }

    semifinalists.forEach(clubId => {
      if (clubId === completion.cup.championClubId || clubId === completion.cup.runnerUpClubId) return
      const current = achievement(clubId)
      current.budgetBonus += 500_000
      current.reputationBonus += 1
      current.marketMultiplier *= 1.01
    })

    // Títulos anteriores começam a construir uma "era": um novo título de um
    // clube que já ganhou antes gera um bônus adicional, sem deixar a reputação
    // escapar do teto normal do jogo.
    const { data: previousLeagueHistory } = await supabase
      .from('competition_history')
      .select('champion_club_id')
      .eq('competition_id', leagueId)
      .neq('season_id', seasonId)

    const previousLeagueTitles = new Map<string, number>()
    for (const row of previousLeagueHistory ?? []) {
      if (!row.champion_club_id) continue
      previousLeagueTitles.set(row.champion_club_id, (previousLeagueTitles.get(row.champion_club_id) ?? 0) + 1)
    }

    const currentLeagueChampion = completion.league.championClubId
    if (currentLeagueChampion) {
      const priorTitles = previousLeagueTitles.get(currentLeagueChampion) ?? 0
      if (priorTitles > 0) {
        const era = Math.min(3, priorTitles)
        const current = achievement(currentLeagueChampion)
        current.budgetBonus += era * 500_000
        current.reputationBonus += era * 2
        current.strengthBonus += era
        current.marketMultiplier *= 1 + era * 0.01
      }
    }

    // O efeito econômico chega ao elenco inteiro: títulos valorizam o ativo
    // esportivo, enquanto campanhas relevantes aumentam a capacidade financeira
    // e a reputação do clube.
    const { data: clubsToUpdate } = await supabase
      .from('clubs')
      .select('id,budget,reputation,strength')
      .in('id', [...achievementByClub.keys()])

    for (const club of clubsToUpdate ?? []) {
      const effect = achievementByClub.get(club.id)
      if (!effect) continue
      await supabase
        .from('clubs')
        .update({
          budget: Math.max(0, Number(club.budget ?? 0) + effect.budgetBonus),
          reputation: Math.max(35, Math.min(95, Number(club.reputation ?? 50) + effect.reputationBonus)),
          strength: Math.max(35, Math.min(95, Number(club.strength ?? 50) + effect.strengthBonus)),
        })
        .eq('id', club.id)
    }

    const { data: squadLinks } = await supabase
      .from('club_players')
      .select('id,club_id,market_value')
      .in('club_id', [...achievementByClub.keys()])

    for (const player of squadLinks ?? []) {
      const effect = achievementByClub.get(player.club_id)
      if (!effect) continue
      await supabase
        .from('club_players')
        .update({
          market_value: Math.max(100_000, Math.round((Number(player.market_value ?? 100_000) * effect.marketMultiplier) / 50_000) * 50_000),
        })
        .eq('id', player.id)
    }

    // Se o clube do treinador foi premiado, o mesmo efeito precisa chegar
    // imediatamente à carreira local e ao caixa exibido no dashboard.
    const userEffect = achievementByClub.get(career.club.id)
    if (userEffect) {
      const nextBudget = Math.max(0, Number(career.club.budget ?? 0) + userEffect.budgetBonus)
      const nextCareer: ManagerProfile = {
        ...career,
        club: {
          ...career.club,
          budget: nextBudget,
          reputation: Math.max(35, Math.min(95, Number(career.club.reputation ?? 50) + userEffect.reputationBonus)),
          strength: Math.max(35, Math.min(95, Number(career.club.strength ?? 50) + userEffect.strengthBonus)),
        },
      }
      onCareerUpdate(nextCareer)

      if (userEffect.budgetBonus > 0) {
        addFinanceTransaction(createTransaction(
          toDateKey(new Date().toISOString()),
          'other',
          'Premiação por desempenho da temporada',
          userEffect.budgetBonus,
          undefined,
          `season:achievement:${seasonId}`,
        ))
      }
    }

    setSeasonClosed(true)
    setSeasonCompletion(completion)
  }

  function saveFinance(nextBalance: number, nextTransactions: FinanceTransaction[]) {
    setFinanceBalance(nextBalance)
    setFinanceTransactions(nextTransactions)
    localStorage.setItem(FINANCE_KEY, JSON.stringify(nextTransactions))
  }

  function addFinanceTransaction(transaction: FinanceTransaction) {
    if (transaction.eventId && financeTransactions.some(item => item.eventId === transaction.eventId)) return
    const nextTransactions = [...financeTransactions, transaction]
    const nextBalance = applyTransaction(financeBalance, transaction)
    saveFinance(nextBalance, nextTransactions)
    return nextBalance
  }


  useEffect(() => {
    let active = true
    async function loadDashboard() {
      setLoading(true)
      const [squadResult, fixtureResult, tableResult, clubsResult, salaryResult, seasonStatsResult] = await Promise.all([
        supabase.from('club_players').select('club_id,squad_number, players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale)').order('squad_number'),
        supabase.from('fixtures').select('id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,home_club:clubs!fixtures_home_club_id_fkey(name,short_name,city,stadium,logo_url),away_club:clubs!fixtures_away_club_id_fkey(name,short_name,city,stadium,logo_url),competitions(name)').or(`home_club_id.eq.${career.club.id},away_club_id.eq.${career.club.id}`).eq('status','scheduled').order('scheduled_at'),
        supabase.from('fixtures').select('id,competition_id,home_club_id,away_club_id,home_score,away_score,status,competitions!inner(name)').eq('status','completed').eq('competitions.name','Liga Nacional do Brasil'),
        supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation,stadium,logo_url').order('name'),
        supabase.from('club_players').select('player_id,club_id,salary,contract_until,players!inner(first_name,last_name)').order('player_id'),
        supabase.from('player_season_stats').select('player_id,appearances,starts,minutes,avg_rating,seasons!inner(name)').eq('seasons.name', career.season),
      ])
      if (!active) return
      if (!squadResult.error) {
        const seasonStats = new Map((seasonStatsResult.data ?? []).map((row: any) => [row.player_id, row]))
        const loaded = (squadResult.data ?? []).filter((row: any) => (getLoanClubId(row.club_id, row.players?.id ?? row.players?.[0]?.id, clock?.currentDate ?? SEASON_START, transferState.playerClubOverrides, loanState) === career.club.id)).map((row: any) => {
          const player = normalizePlayer(row)
          const stats = seasonStats.get(player.id)
          return {
            ...player,
            seasonAppearances: Number(stats?.appearances ?? 0),
            seasonStarts: Number(stats?.starts ?? 0),
            seasonMinutes: Number(stats?.minutes ?? 0),
            seasonAverageRating: Number(stats?.avg_rating ?? 0),
        seasonGoals: Number(stats?.goals ?? 0),
        seasonAssists: Number(stats?.assists ?? 0),
          }
        })
        try {
          const saved = JSON.parse(localStorage.getItem(TRAINING_KEY) ?? '{}')
          const restored = loaded.map((player: Player) => saved.players?.[player.id] ? { ...player, ...saved.players[player.id] } : player)
          setPlayers(restored)
        } catch {
          setPlayers(loaded)
        }
      }
      if (!salaryResult.error) {
        const rows = (salaryResult.data ?? []).filter((row: any) => (getLoanClubId(row.club_id, row.player_id, clock?.currentDate ?? SEASON_START, transferState.playerClubOverrides, loanState) === career.club.id))
        let total = 0
        try {
          const savedContracts = JSON.parse(localStorage.getItem(CONTRACTS_KEY) ?? '{}')
          total = rows.reduce((sum, row) => {
            const override = savedContracts[row.player_id]
            const salary = Number(override?.salary ?? row.salary ?? 0)
            const activeLoan = loanState.records.find(loan => loan.playerId === row.player_id && loan.startDate <= (clock?.currentDate ?? SEASON_START) && (clock?.currentDate ?? SEASON_START) < loan.endDate)
            if (!activeLoan) return sum + salary
            const destinationShare = Math.max(0, Math.min(100, activeLoan.salaryShare)) / 100
            const isDestination = activeLoan.loanClubId === career.club.id
            return sum + Math.round(salary * (isDestination ? destinationShare : 1 - destinationShare))
          }, 0)
        } catch {}
        setSalaryTotal(total)
        const today = clock?.currentDate ?? SEASON_START
        const alerts = rows.map((row: any) => ({ playerId: row.player_id, name: `${row.players.first_name} ${row.players.last_name}`, until: row.contract_until, days: daysUntilContractEnd(row.contract_until, today), status: getContractStatus(row.contract_until, today) })).filter(item => item.status !== 'safe').sort((x, y) => (x.days ?? 999999) - (y.days ?? 999999))
        setContractAlerts(alerts)
      }
      if (!fixtureResult.error) {
        const scheduled = (fixtureResult.data ?? []).map(normalizeFixture).filter(item => !playedMatches[item.id])
        const fixture = scheduled[0] ?? null
        setUpcomingFixtures(scheduled)
        setNextFixture(fixture)
        if (!clock && fixture) {
          const initialClock = createSeasonClock(SEASON_START, toDateKey(fixture.scheduled_at), 3)
          setClock(initialClock)
          localStorage.setItem(CLOCK_KEY, JSON.stringify(initialClock))
        }
        if (fixture) {
          const opponentId = fixture.home_club_id === career.club.id ? fixture.away_club_id : fixture.home_club_id
          const { data: opponentSquad } = await supabase.from('club_players').select('club_id,squad_number, players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale)').order('squad_number')
          const effectiveOpponent = (opponentSquad ?? []).filter((row: any) => (getLoanClubId(row.club_id, row.players?.id ?? row.players?.[0]?.id, clock?.currentDate ?? SEASON_START, transferState.playerClubOverrides, loanState) === opponentId))
          if (active) setOpponentPlayers(effectiveOpponent.map(normalizePlayer))
        } else {
          setOpponentPlayers([])
        }
      }
      const leagueClubs = clubs.length > 0 ? clubs : (clubsResult.data ?? []) as Club[]
      const persistedFixtures = (tableResult.data ?? []).map((match: any) => ({
        id: match.id, competition_id: match.competition_id ?? '', round: 0, scheduled_at: '', status: match.status,
        home_club_id: match.home_club_id, away_club_id: match.away_club_id, home_score: match.home_score, away_score: match.away_score,
        home_club: null, away_club: null,
      }))
      const localFixtures = Object.entries(playedMatches).filter(([fixtureId]) => !persistedFixtures.some(match => match.id === fixtureId)).map(([id, match]) => ({
        id, competition_id: 'local', round: 0, scheduled_at: '', status: 'completed',
        home_club_id: match.home_club_id, away_club_id: match.away_club_id, home_score: match.homeScore, away_score: match.awayScore,
        home_club: null, away_club: null,
      }))
      setTable(buildStandings(leagueClubs.map(club => ({ id: club.id, name: club.short_name })), [...persistedFixtures, ...localFixtures]))
      setLoading(false)
    }
    loadDashboard()
    return () => { active = false }
  }, [career.club.id, clubs, playedMatches, clock?.currentDate, transferState.playerClubOverrides, loanState.records])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TACTIC_KEY) ?? '{}')
      const ids = Object.values(saved.lineup ?? {}) as string[]
      setSelectedStarters(players.filter(player => ids.includes(player.id)))
    } catch {
      setSelectedStarters([])
    }
  }, [players])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TACTIC_KEY) ?? '{}')
      setTactic(saved.tactic ?? 'balanced')
      setFormation(saved.formation ?? '4-3-3')
    } catch {}
  }, [])
  const opponent = nextFixture ? (nextFixture.home_club_id === career.club.id ? nextFixture.away_club : nextFixture.home_club) : null
  const home = nextFixture?.home_club_id === career.club.id
  const rosterAlerts = getSquadAlerts(players, contractAlerts.length, financeBalance, salaryTotal)
  const initialCapital = financeTransactions.find(transaction => transaction.eventId === 'career:initial-budget')?.amount ?? career.club.budget
  const avg = players.length ? Math.round(players.reduce((sum, player) => sum + playerOverall(player), 0) / players.length) : 0
  const nextMatchDate = nextFixture ? toDateKey(nextFixture.scheduled_at) : null
  const matchReady = Boolean(clock && nextMatchDate && clock.currentDate >= nextMatchDate)

  async function loadWorldState() {
    const { data: season } = await supabase.from('seasons').select('id').eq('name', career.season).maybeSingle()
    if (!season?.id) return null

    const [{ data: clubRows }, { data: playerRows }, { data: seasonStatRows }] = await Promise.all([
      supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation,stadium,logo_url,strength').order('name'),
      supabase.from('club_players').select('id,club_id,squad_number,contract_until,salary,market_value,players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale)'),
      supabase.from('player_season_stats').select('player_id,appearances,starts,minutes,goals,assists,avg_rating').eq('season_id', season.id),
    ])

    if (!clubRows?.length || !playerRows?.length) return null

    const worldClubs = clubRows.map((club: any) => ({
      ...club,
      budget: Number(club.budget ?? 0),
      strength: Number(club.strength ?? club.reputation ?? 60),
    })) as WorldClub[]

    const seasonStats = new Map((seasonStatRows ?? []).map((row: any) => [row.player_id, row]))
    const playersForWorld = (playerRows as any[]).map(row => {
      const player = Array.isArray(row.players) ? row.players[0] : row.players
      const stats = seasonStats.get(player.id)
      return {
        ...player,
        clubId: row.club_id ?? '',
        marketValue: Number(row.market_value ?? 0),
        salary: Number(row.salary ?? 0),
        contractUntil: row.contract_until ?? null,
        clubPlayerId: row.id,
        seasonAppearances: Number(stats?.appearances ?? 0),
        seasonStarts: Number(stats?.starts ?? 0),
        seasonMinutes: Number(stats?.minutes ?? 0),
        seasonAverageRating: Number(stats?.avg_rating ?? 0),
      }
    }) as WorldPlayer[]

    const { data: leagueFixtures } = await supabase
      .from('fixtures')
      .select('home_club_id,away_club_id,scheduled_at,status,home_score,away_score,competitions!inner(name)')
      .eq('season_id', season.id)
      .eq('competitions.name', 'Liga Nacional do Brasil')
      .eq('status', 'completed')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .order('scheduled_at')

    const stats = new Map<string, { points: number; wins: number; draws: number; losses: number; gf: number; ga: number; recentResults: Array<'W' | 'D' | 'L'> }>()
    for (const club of worldClubs) stats.set(club.id, { points: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, recentResults: [] })

    for (const fixture of leagueFixtures ?? []) {
      const home = stats.get(fixture.home_club_id)
      const away = stats.get(fixture.away_club_id)
      if (!home || !away || fixture.home_score == null || fixture.away_score == null) continue
      const homeScore = Number(fixture.home_score)
      const awayScore = Number(fixture.away_score)
      home.gf += homeScore; home.ga += awayScore
      away.gf += awayScore; away.ga += homeScore
      if (homeScore > awayScore) {
        home.wins++; home.points += 3; away.losses++
        home.recentResults.push('W'); away.recentResults.push('L')
      } else if (homeScore < awayScore) {
        away.wins++; away.points += 3; home.losses++
        home.recentResults.push('L'); away.recentResults.push('W')
      } else {
        home.draws++; away.draws++; home.points++; away.points++
        home.recentResults.push('D'); away.recentResults.push('D')
      }
    }

    const table = [...stats.entries()].sort((a, b) =>
      b[1].points - a[1].points ||
      b[1].wins - a[1].wins ||
      (b[1].gf - b[1].ga) - (a[1].gf - a[1].ga) ||
      b[1].gf - a[1].gf
    )
    const performanceByClub: Record<string, WorldClubPerformance> = {}
    for (const [index, [clubId, value]] of table.entries()) {
      const recentResults = value.recentResults.slice(-5)
      const recentPoints = recentResults.reduce((sum, result) => sum + (result === 'W' ? 3 : result === 'D' ? 1 : 0), 0)
      performanceByClub[clubId] = {
        position: index + 1,
        points: value.points,
        goalDifference: value.gf - value.ga,
        played: value.wins + value.draws + value.losses,
        recentPoints,
        recentResults,
      }
    }

    return { seasonId: season.id as string, worldClubs, playersForWorld, performanceByClub }
  }

  async function persistWorldState(
    seasonId: string,
    worldClubs: WorldClub[],
    playersForWorld: WorldPlayer[],
    results: WorldSimulationResult[],
  ) {
    const evolvedPlayerIds = new Set(results.flatMap(result => result.evolvedPlayerIds))
    const transfers = results.flatMap(result => result.transfers)
    const renewals = results.flatMap(result => result.renewals)
    const retirements = results.flatMap(result => result.retirements)
    const expiredContracts = results.flatMap(result => result.expiredContracts)
    const youth = results.flatMap(result => result.youth)
    const changedClubs = new Set(results.flatMap(result => result.changedClubs))

    const changedPlayers = playersForWorld.filter(player => evolvedPlayerIds.has(player.id))
    await Promise.all(changedPlayers.map(player =>
      supabase.from('players').update({
        age: player.age,
        pace: player.pace,
        shooting: player.shooting,
        passing: player.passing,
        dribbling: player.dribbling,
        defending: player.defending,
        physical: player.physical,
        goalkeeping: player.goalkeeping,
        mental: player.mental,
        form: player.form,
        morale: player.morale,
      }).eq('id', player.id)
      .then(() => supabase.from('club_players').update({
        market_value: player.marketValue,
      }).eq('id', player.clubPlayerId))
    ))

    const transferRows = transfers.map(transfer => ({
      season_id: seasonId,
      transfer_date: results.find(result => result.transfers.includes(transfer))?.date ?? SEASON_START,
      player_id: transfer.playerId,
      from_club_id: transfer.fromClubId,
      to_club_id: transfer.toClubId,
      fee: transfer.fee,
      reason: 'ai_market',
    }))
    if (transferRows.length) {
      await supabase.from('world_transfers').upsert(transferRows, { onConflict: 'season_id,player_id,transfer_date' })
    }

    const transferredPlayerIds = new Set(transfers.map(transfer => transfer.playerId))
    await Promise.all([...transferredPlayerIds].map(playerId => {
      const row = playersForWorld.find(player => player.id === playerId)
      return row
        ? supabase.from('club_players').update({ club_id: row.clubId }).eq('id', row.clubPlayerId)
        : Promise.resolve()
    }))

    const latestRenewals = new Map<string, typeof renewals[number]>()
    for (const renewal of renewals) latestRenewals.set(renewal.playerId, renewal)
    await Promise.all([...latestRenewals.values()].map(renewal => {
      const row = playersForWorld.find(player => player.id === renewal.playerId)
      return row
        ? supabase.from('club_players').update({ salary: renewal.salary, contract_until: renewal.contractUntil }).eq('id', row.clubPlayerId)
        : Promise.resolve()
    }))

    const retiredIds = new Set(retirements.map(item => item.playerId))
    await Promise.all([...retiredIds].map(playerId => {
      const row = playersForWorld.find(player => player.id === playerId)
      return row
        ? supabase.from('club_players').delete().eq('id', row.clubPlayerId)
        : Promise.resolve()
    }))

    const expiredIds = new Set(expiredContracts.map(item => item.playerId))
    await Promise.all([...expiredIds].map(playerId => {
      const row = playersForWorld.find(player => player.id === playerId)
      return row
        ? supabase.from('club_players').update({ club_id: null, salary: 0, contract_until: null }).eq('id', row.clubPlayerId)
        : Promise.resolve()
    }))

    await Promise.all(youth.map(async prospect => {
      const { data: createdPlayer, error: createPlayerError } = await supabase.from('players').insert({
        first_name: prospect.firstName,
        last_name: prospect.lastName,
        age: prospect.age,
        nationality: prospect.nationality,
        position: prospect.position,
        pace: prospect.pace,
        shooting: prospect.shooting,
        passing: prospect.passing,
        dribbling: prospect.dribbling,
        defending: prospect.defending,
        physical: prospect.physical,
        goalkeeping: prospect.goalkeeping,
        mental: prospect.mental,
        potential: prospect.potential,
        form: prospect.form,
        morale: prospect.morale,
      }).select('id').single()
      if (createPlayerError || !createdPlayer) return
      await supabase.from('club_players').insert({
        club_id: prospect.clubId,
        player_id: createdPlayer.id,
        squad_number: null,
        contract_until: prospect.contractUntil,
        salary: prospect.salary,
        market_value: prospect.marketValue,
      })
    }))

    const aiClubs = worldClubs.filter(club => club.id !== career.club.id)
    await Promise.all(aiClubs.map(club =>
      supabase.from('clubs').update({
        budget: club.budget,
        ...(changedClubs.has(club.id) ? { strength: club.strength, reputation: club.reputation } : {}),
      }).eq('id', club.id)
    ))
  }

  function appendWorldNews(items: WorldNews[]) {
    if (!items.length) return
    setWorldNews(current => {
      const merged = [...items, ...current]
        .filter((item, index, list) => list.findIndex(other => other.id === item.id) === index)
        .sort((a, b) => b.date.localeCompare(a.date))
         .slice(0, 80)
      localStorage.setItem(WORLD_NEWS_KEY, JSON.stringify(merged))
      return merged
    })
  }

  async function simulateOtherClubs(nextDate: string) {
    const state = await loadWorldState()
    if (!state) return []
    const result = simulateWorldDay(nextDate, state.seasonId, state.worldClubs, state.playersForWorld, career.club.id, state.performanceByClub)
    const news = buildWorldNews(result, state.worldClubs, state.playersForWorld, state.performanceByClub, career.club.id)
    await persistWorldState(state.seasonId, state.worldClubs, state.playersForWorld, [result])
    appendWorldNews(news)
    return news
  }

  async function simulateWorldUntilMatch(startDate: string, targetDate: string) {
    const state = await loadWorldState()
    if (!state) return { date: startDate, event: null as ImportantEvent | null }

    const results: WorldSimulationResult[] = []
    const news: WorldNews[] = []
    let currentDate = startDate
    let event: ImportantEvent | null = null

    while (currentDate < targetDate) {
      currentDate = advanceSeasonDay({ currentDate, seasonStart: startDate }).currentDate
      const result = simulateWorldDay(currentDate, state.seasonId, state.worldClubs, state.playersForWorld, career.club.id, state.performanceByClub)
      results.push(result)
      news.push(...buildWorldNews(result, state.worldClubs, state.playersForWorld))
      const offer = result.offers[0]
      if (offer) {
        const playerOffers = result.offers.filter(item => item.playerId === offer.playerId)
        event = { type: 'player_offer', date: result.date, ...offer, offers: playerOffers }
        break
      }
      const importantEvent = maybeCreateImportantEvent(result.date, state.performanceByClub)
      if (importantEvent) {
        event = importantEvent
        break
      }
    }

    await persistWorldState(state.seasonId, state.worldClubs, state.playersForWorld, results)
    appendWorldNews(news)
    return { date: event?.date ?? targetDate, event, news }
  }

  type ImportantEvent =
    | { type: 'player_offer'; date: string; playerId: string; fromClubId: string; toClubId: string; fee: number; offers: WorldSimulationResult['offers'] }
    | { type: 'board_message'; date: string; title: string; message: string; tone: 'positive' | 'warning' }
    | { type: 'player_message'; date: string; playerId: string; title: string; message: string }
    | { type: 'player_request'; date: string; playerId: string; request: 'renewal' | 'leave'; title: string; message: string }
    | { type: 'manager_offer'; date: string; fromClubId: string; message: string }

  const [advancingDays, setAdvancingDays] = useState(false)
  const [pendingEvent, setPendingEvent] = useState<ImportantEvent | null>(null)

  function eventHash(input: string) {
    let value = 2166136261
    for (const char of input) {
      value ^= char.charCodeAt(0)
      value = Math.imul(value, 16777619)
    }
    return value >>> 0
  }

  function maybeCreateImportantEvent(date: string, performanceByClub: Record<string, WorldClubPerformance> = {}): ImportantEvent | null {
    const day = Number(date.slice(8, 10))
    const month = Number(date.slice(5, 7))

    if (day === 1 && financeBalance < Math.max(500000, career.club.budget * 0.22)) {
      return {
        type: 'board_message',
        date,
        title: 'A diretoria está preocupada com as finanças',
        message: 'O caixa do clube entrou em uma faixa de atenção. A diretoria espera que você controle a folha e evite comprometer o orçamento nas próximas semanas.',
        tone: 'warning',
      }
    }

    const sporting = performanceByClub[career.club.id]
    if (day === 1 && sporting && sporting.played >= 3 && eventHash(date + ':sporting:' + career.club.id) % 100 < 45) {
      if (sporting.position <= 4 && sporting.recentPoints >= 8) {
        return {
          type: 'board_message',
          date,
          title: 'A diretoria está satisfeita com o momento',
          message: `O clube ocupa a ${sporting.position}ª posição e somou ${sporting.recentPoints} pontos nas últimas cinco partidas. A diretoria entende que o trabalho está colocando o time na disputa pelas primeiras posições.`,
          tone: 'positive',
        }
      }
      if (sporting.position >= 13 && sporting.recentPoints <= 4) {
        return {
          type: 'board_message',
          date,
          title: 'A diretoria quer uma reação no campeonato',
          message: `O clube está na ${sporting.position}ª posição e conquistou apenas ${sporting.recentPoints} pontos nas últimas cinco partidas. A diretoria espera uma reação esportiva e avalia que o mercado pode ser necessário para corrigir o elenco.`,
          tone: 'warning',
        }
      }
    }

    if ((day === 5 || day === 20) && players.length) {
      const concerned = [...players]
        .filter(player => player.morale <= 48 || player.form <= 45)
        .sort((a, b) => {
          const roleWeight = (role: Player) => {
            const squadRole = getSquadRole(role)
            return squadRole === 'backup' ? 2 : squadRole === 'rotation' ? 1 : 0
          }
          return roleWeight(b) - roleWeight(a) || a.morale - b.morale || a.form - b.form
        })[0]

      if (concerned) {
        const monthsToEnd = concerned.contractUntil
          ? Math.round((new Date(concerned.contractUntil).getTime() - new Date(date).getTime()) / (30 * 86400000))
          : 99

        if (monthsToEnd >= 0 && monthsToEnd <= 6 && concerned.morale <= 48 && eventHash(date + ':renew-request:' + concerned.id) % 100 < 42) {
          return {
            type: 'player_request',
            date,
            playerId: concerned.id,
            request: 'renewal',
            title: concerned.first_name + ' ' + concerned.last_name + ' quer renovar o contrato',
            message: 'Ele quer saber se faz parte dos seus planos para as próximas temporadas e espera uma definição sobre seu futuro.',
          }
        }

        const concernedRole = getSquadRole(concerned)
        const lowUsage = concernedRole === 'backup' || concernedRole === 'rotation' || concernedRole === 'prospect'
        const leaveChance = lowUsage ? 38 : 26
        if (concerned.morale <= 35 && eventHash(date + ':leave-request:' + concerned.id) % 100 < leaveChance) {
          return {
            type: 'player_request',
            date,
            playerId: concerned.id,
            request: 'leave',
            title: concerned.first_name + ' ' + concerned.last_name + ' quer deixar o clube',
            message: lowUsage
              ? 'O jogador sente que perdeu espaço no elenco e pediu para ser colocado à disposição do mercado.'
              : 'O jogador está insatisfeito com seu momento e pediu para ser colocado à disposição do mercado.',
          }
        }

        if (eventHash(date + ':player:' + concerned.id) % 100 < 28) {
          const reason = lowUsage
            ? 'Ele sente que perdeu espaço no elenco e quer entender o que precisa fazer para voltar a ser uma opção importante.'
            : concerned.morale <= 48
              ? 'Ele sente que precisa de mais atenção e quer conversar sobre seu momento no elenco.'
              : 'Ele acredita que pode render mais e quer entender como recuperar seu espaço e sua melhor forma.'
          return {
            type: 'player_message',
            date,
            playerId: concerned.id,
            title: concerned.first_name + ' ' + concerned.last_name + ' quer falar com você',
            message: reason,
          }
        }
      }
    }

    if ([3, 6, 9].includes(month) && day === 15 && eventHash(date + ':manager:' + career.club.id) % 100 < 22) {
      const candidates = clubs
        .filter(club => club.id !== career.club.id)
        .filter(club => Number(club.reputation ?? 0) <= Number(career.club.reputation ?? 0) + 8)
        .sort((a, b) => Number(b.reputation ?? 0) - Number(a.reputation ?? 0))
      const target = candidates[eventHash(date + ':manager-target') % Math.max(1, candidates.length)]
      if (target) {
        return {
          type: 'manager_offer',
          date,
          fromClubId: target.id,
          message: target.name + ' entrou em contato e gostaria de contar com você para comandar o clube.',
        }
      }
    }

    return null
  }

  async function advanceOneDay(fromClock = clock) {
    if (!fromClock || !canAdvanceDay(fromClock, nextMatchDate)) return false
    const nextClock = advanceSeasonDay(fromClock)
    await simulateOtherClubs(nextClock.currentDate)
    const nextPlayers = recoverPlayers(players, 8)
    if (nextClock.currentDate.slice(0, 7) !== fromClock.currentDate.slice(0, 7)) {
      const salaryExpense = calculateMonthlySalaryExpense(salaryTotal)
      const nextBalance = addFinanceTransaction(createTransaction(nextClock.currentDate, 'salary', `Folha salarial de ${nextClock.currentDate.slice(0, 7)}`, salaryExpense, undefined, `salary:${nextClock.currentDate.slice(0, 7)}`)) ?? financeBalance
      const nextCareer = { ...career, club: { ...career.club, budget: nextBalance } }
      localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
      onCareerUpdate(nextCareer)
    }
    setClock(nextClock)
    setPlayers(nextPlayers)
    const savedTraining = JSON.parse(localStorage.getItem(TRAINING_KEY) ?? '{}')
    localStorage.setItem(TRAINING_KEY, JSON.stringify({ ...savedTraining, players: Object.fromEntries(nextPlayers.map(player => [player.id, player])) }))
    localStorage.setItem(CLOCK_KEY, JSON.stringify(nextClock))
    return true
  }

  async function restOneDay() {
    if (!clock || !canAdvanceDay(clock, nextMatchDate) || advancingDays) return
    setAdvancingDays(true)
    try {
      await advanceOneDay(clock)
    } finally {
      setAdvancingDays(false)
    }
  }

  async function advanceToNextMatch() {
    if (!clock || !nextMatchDate || clock.currentDate >= nextMatchDate || advancingDays) return
    setAdvancingDays(true)
    try {
      const advanceResult = await simulateWorldUntilMatch(clock.currentDate, nextMatchDate)
      const targetDate = advanceResult?.date ?? nextMatchDate
      if (advanceResult?.event) setPendingEvent(advanceResult.event)

      let current = clock
      let nextPlayers = players
      let nextBalance = financeBalance
      let nextTransactions = financeTransactions

      while (current.currentDate < targetDate) {
        const nextClock = advanceSeasonDay(current)
        nextPlayers = recoverPlayers(nextPlayers, 8)

        if (nextClock.currentDate.slice(0, 7) !== current.currentDate.slice(0, 7)) {
          const salaryExpense = calculateMonthlySalaryExpense(salaryTotal)
          const transaction = createTransaction(
            nextClock.currentDate,
            'salary',
            `Folha salarial de ${nextClock.currentDate.slice(0, 7)}`,
            salaryExpense,
            undefined,
            `salary:${nextClock.currentDate.slice(0, 7)}`,
          )
          if (!nextTransactions.some(item => item.eventId === transaction.eventId)) {
            nextTransactions = [...nextTransactions, transaction]
            nextBalance = applyTransaction(nextBalance, transaction)
          }
        }

        current = nextClock
      }

      setClock(current)
      setPlayers(nextPlayers)
      setFinanceBalance(nextBalance)
      setFinanceTransactions(nextTransactions)

      localStorage.setItem(CLOCK_KEY, JSON.stringify(current))
      localStorage.setItem(FINANCE_KEY, JSON.stringify(nextTransactions))
      localStorage.setItem(CAREER_KEY, JSON.stringify({ ...career, club: { ...career.club, budget: nextBalance } }))
      localStorage.setItem(TRAINING_KEY, JSON.stringify({
        ...JSON.parse(localStorage.getItem(TRAINING_KEY) ?? '{}'),
        players: Object.fromEntries(nextPlayers.map(player => [player.id, player])),
      }))
      onCareerUpdate({ ...career, club: { ...career.club, budget: nextBalance } })
    } finally {
      setAdvancingDays(false)
    }
  }

  async function respondToPlayerOffer(
    accept: boolean,
    selectedOffer?: WorldSimulationResult['offers'][number],
  ) {
    if (!pendingEvent || pendingEvent.type !== 'player_offer') return
    if (!accept) {
      setPendingEvent(null)
      return
    }

    const offer = selectedOffer ?? {
      playerId: pendingEvent.playerId,
      fromClubId: pendingEvent.fromClubId,
      toClubId: pendingEvent.toClubId,
      fee: pendingEvent.fee,
    }
    const player = players.find(item => item.id === offer.playerId)
    if (!player) { setPendingEvent(null); return }

    const { data: row } = await supabase
      .from('club_players')
      .select('id')
      .eq('player_id', offer.playerId)
      .eq('club_id', career.club.id)
      .maybeSingle()

    const { data: buyer } = await supabase
      .from('clubs')
      .select('id,budget')
      .eq('id', offer.toClubId)
      .maybeSingle()

    const buyerBudget = Number(buyer?.budget ?? 0)
    if (row?.id && buyer && buyerBudget >= offer.fee) {
      const { error } = await supabase.from('club_players').update({ club_id: offer.toClubId }).eq('id', row.id)
      if (!error) {
        await Promise.all([
          supabase.from('clubs').update({ budget: buyerBudget - offer.fee }).eq('id', offer.toClubId),
          supabase.from('world_transfers').upsert({
            season_id: (await supabase.from('seasons').select('id').eq('name', career.season).maybeSingle()).data?.id,
            transfer_date: pendingEvent.date,
            player_id: offer.playerId,
            from_club_id: career.club.id,
            to_club_id: offer.toClubId,
            fee: offer.fee,
            reason: 'ai_offer',
          }, { onConflict: 'season_id,player_id,transfer_date' }),
        ])

        const transaction = createTransaction(
          pendingEvent.date,
          'transfer_in',
          `Venda · ${player.first_name} ${player.last_name}`,
          offer.fee,
          undefined,
          `world_offer:${offer.playerId}:${pendingEvent.date}`,
        )
        const nextBalance = addFinanceTransaction(transaction) ?? financeBalance
        const nextPlayers = players.filter(item => item.id !== offer.playerId)
        setPlayers(nextPlayers)
        const nextCareer = { ...career, club: { ...career.club, budget: nextBalance } }
        localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
        onCareerUpdate(nextCareer)
        setPendingEvent(null)
        return
      }
    }

    setPendingEvent(null)
  }

  async function respondToPlayerRequest(action: 'renew' | 'transfer' | 'continue') {
    if (!pendingEvent || pendingEvent.type !== 'player_request') return
    const player = players.find(item => item.id === pendingEvent.playerId)
    if (!player) { setPendingEvent(null); return }

    if (action === 'renew') {
      const row = await supabase.from('club_players').select('id,salary').eq('player_id', player.id).eq('club_id', career.club.id).maybeSingle()
      if (row.data?.id) {
        const nextSalary = Math.round(Math.max(Number(row.data.salary ?? player.salary) * 1.12, playerOverall(player) * 1200) / 500) * 500
        const currentDate = clock?.currentDate ?? pendingEvent.date
        const base = player.contractUntil && new Date(player.contractUntil).getTime() > new Date(currentDate).getTime() ? new Date(player.contractUntil) : new Date(currentDate)
        base.setUTCFullYear(base.getUTCFullYear() + 2)
        const nextContract = base.toISOString().slice(0, 10)
        const { error: updateError } = await supabase.from('club_players').update({ salary: nextSalary, contract_until: nextContract }).eq('id', row.data.id)
        if (!updateError) {
          const nextPlayer = { ...player, salary: nextSalary, contractUntil: nextContract, morale: Math.min(100, player.morale + 12) }
          const nextPlayers = players.map(item => item.id === player.id ? nextPlayer : item)
          setPlayers(nextPlayers)
          localStorage.setItem(TRAINING_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(TRAINING_KEY) ?? '{}'), players: Object.fromEntries(nextPlayers.map(item => [item.id, item])) }))
        }
      }
    }

    if (action === 'transfer') {
      const { data: buyers } = await supabase
        .from('clubs')
        .select('id,budget')
        .neq('id', career.club.id)
        .order('budget', { ascending: false })
        .limit(8)

      const fee = Math.max(250000, Math.round((player.marketValue ?? 0) / 50000) * 50000)
      const buyer = (buyers ?? []).find(item => Number(item.budget ?? 0) >= fee)

      if (buyer) {
        const row = await supabase.from('club_players').select('id').eq('player_id', player.id).eq('club_id', career.club.id).maybeSingle()
        if (row.data?.id) {
          const { error: updateError } = await supabase.from('club_players').update({ club_id: buyer.id }).eq('id', row.data.id)
          if (!updateError) {
            const seasonId = (await supabase.from('seasons').select('id').eq('name', career.season).maybeSingle()).data?.id
            await Promise.all([
              supabase.from('clubs').update({ budget: Number(buyer.budget) - fee }).eq('id', buyer.id),
              supabase.from('world_transfers').upsert({
                season_id: seasonId,
                transfer_date: pendingEvent.date,
                player_id: player.id,
                from_club_id: career.club.id,
                to_club_id: buyer.id,
                fee,
                reason: 'player_request',
              }, { onConflict: 'season_id,player_id,transfer_date' }),
            ])

            const transaction = createTransaction(
              pendingEvent.date,
              'transfer_in',
              'Venda · ' + player.first_name + ' ' + player.last_name,
              fee,
              undefined,
              'player_request:' + player.id + ':' + pendingEvent.date,
            )
            const nextBalance = addFinanceTransaction(transaction) ?? financeBalance
            const nextPlayers = players.filter(item => item.id !== player.id)
            setPlayers(nextPlayers)
            const nextCareer = { ...career, club: { ...career.club, budget: nextBalance } }
            localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
            onCareerUpdate(nextCareer)
          }
        }
      } else {
        const nextPlayer = { ...player, morale: Math.min(100, player.morale + 2) }
        setPlayers(players.map(item => item.id === player.id ? nextPlayer : item))
      }
    }

    if (action === 'continue') {
      const nextPlayer = { ...player, morale: Math.min(100, player.morale + (pendingEvent.request === 'leave' ? 2 : 1)) }
      setPlayers(players.map(item => item.id === player.id ? nextPlayer : item))
    }

    setPendingEvent(null)
  }
  async function respondToImportantEvent(action: 'accept' | 'continue') {
    if (!pendingEvent) return

    if (pendingEvent.type === 'manager_offer' && action === 'accept') {
      const targetClub = clubs.find(club => club.id === pendingEvent.fromClubId)
      if (targetClub) {
        const targetBudget = Number(targetClub.budget ?? 0)
        const nextCareer = { ...career, club: { ...targetClub, budget: targetBudget } }
        setFinanceBalance(targetBudget)
        localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
        onCareerUpdate(nextCareer)
        setPendingEvent(null)
        return
      }
    }

    setPendingEvent(null)
  }

  if (view === 'press') return <PressCenter club={career.club} news={worldNews} back={() => setView('overview')} />
  if (view === 'competitions') return <CompetitionCenter clubs={clubs} currentClubId={career.club.id} playedMatches={Object.values(playedMatches)} back={() => setView('overview')} />
  if (view === 'loans') return <LoanMarket club={{ ...career.club, budget: financeBalance }} clubs={clubs} balance={financeBalance} today={clock?.currentDate ?? SEASON_START} transferOverrides={transferState.playerClubOverrides} state={loanState} currentSquadSize={players.length} onLoan={(record, nextState) => { const transaction = createTransaction(record.date, record.loanClubId === career.club.id ? 'transfer_out' : 'transfer_in', `${record.loanClubId === career.club.id ? 'Empréstimo recebido' : 'Empréstimo cedido'} · ${record.playerName}`, record.loanClubId === career.club.id ? -record.fee : record.fee, undefined, `loan:${record.id}`); const finalTransactions = financeTransactions.some(item => item.eventId === transaction.eventId) ? financeTransactions : [...financeTransactions, transaction]; const finalBalance = applyTransaction(financeBalance, transaction); setLoanState(nextState); localStorage.setItem(LOANS_KEY, JSON.stringify(nextState)); saveFinance(finalBalance, finalTransactions); const nextCareer = { ...career, club: { ...career.club, budget: finalBalance } }; localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer)); onCareerUpdate(nextCareer); setView('overview') }} back={() => setView('overview')} />
  if (view === 'market') return <TransferMarket club={{ ...career.club, budget: financeBalance }} clubs={clubs} balance={financeBalance} today={clock?.currentDate ?? SEASON_START} state={transferState} loanState={loanState} currentSquadSize={players.length} personality={career.personality} onTransfer={(record, nextState, nextBalance) => { const transaction = createTransaction(record.date, record.kind === 'purchase' ? 'transfer_out' : 'transfer_in', `${record.kind === 'purchase' ? 'Compra' : 'Venda'} · ${record.playerName}`, record.kind === 'purchase' ? -record.fee : record.fee, undefined, `transfer:${record.id}`); const finalTransactions = financeTransactions.some(item => item.eventId === transaction.eventId) ? financeTransactions : [...financeTransactions, transaction]; const finalBalance = applyTransaction(financeBalance, transaction); setTransferState(nextState); localStorage.setItem(TRANSFERS_KEY, JSON.stringify(nextState)); saveFinance(finalBalance, finalTransactions); const nextCareer = { ...career, club: { ...career.club, budget: finalBalance } }; localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer)); onCareerUpdate(nextCareer); setView('overview') }} back={() => setView('overview')} />
  if (view === 'squad') return <Squad players={players} club={career.club} today={clock?.currentDate ?? SEASON_START} onContractChange={(oldSalary, newSalary) => setSalaryTotal(previous => previous - oldSalary + newSalary)} back={() => setView('overview')} />
  if (view === 'training') return <Training players={players} club={{ ...career.club, budget: financeBalance }} salaryTotal={salaryTotal} nextFixture={nextFixture} back={() => setView('overview')} onComplete={(nextPlayers, nextCareer, cost) => { setPlayers(nextPlayers); const transaction = createTransaction(clock?.currentDate ?? SEASON_START, 'training', 'Treinamento do elenco', -cost, undefined, `training:${nextFixture?.id ?? (clock?.currentDate ?? 'unknown')}`); const nextBalance = addFinanceTransaction(transaction) ?? financeBalance; const finalCareer = { ...nextCareer, club: { ...nextCareer.club, budget: nextBalance } }; saveFinance(nextBalance, [...financeTransactions, transaction]); localStorage.setItem(CAREER_KEY, JSON.stringify(finalCareer)); onCareerUpdate(finalCareer); setView('overview') }} />
  if (view === 'tactics') return <Tactics players={players} club={career.club} back={() => setView('overview')} />
  if (view === 'match' && activeMatchFixture) {
    const matchHome = activeMatchFixture.home_club_id === career.club.id
    const finishMatch = async (result: MatchResult) => {
      const nextMatches: Record<string, PlayedMatch> = {
        ...playedMatches,
        [activeMatchFixture.id]: {
          ...result,
          home_club_id: activeMatchFixture.home_club_id,
          away_club_id: activeMatchFixture.away_club_id,
          competition_id: activeMatchFixture.competition_id,
          round: activeMatchFixture.round,
        },
      }

      const { simulateMatch } = await import('./engine/match')
      const { data: roundFixtures } = await supabase
        .from('fixtures')
        .select('id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,competitions!inner(name),home_club:clubs!fixtures_home_club_id_fkey(name,short_name,city,stadium,logo_url),away_club:clubs!fixtures_away_club_id_fkey(name,short_name,city,stadium,logo_url)')
        .eq('competition_id', activeMatchFixture.competition_id)
        .eq('round', activeMatchFixture.round)
        .eq('status', 'scheduled')
        .order('scheduled_at')

      const remainingFixtures = (roundFixtures ?? []).map(normalizeFixture).filter(fixture => !nextMatches[fixture.id])
      const matchesToPersist: Record<string, PlayedMatch> = {
        [activeMatchFixture.id]: nextMatches[activeMatchFixture.id],
      }
      const matchPlayers = new Map<string, Player>()
      for (const player of players) matchPlayers.set(player.id, player)
      const clubIds = [...new Set(remainingFixtures.flatMap(fixture => [fixture.home_club_id, fixture.away_club_id]))]

      if (clubIds.length) {
        const { data: squadRows } = await supabase
          .from('club_players')
          .select('club_id,squad_number,players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale)')
          .in('club_id', clubIds)

        const squadPlayerIds = (squadRows ?? []).map((row: any) => {
          const source = Array.isArray(row.players) ? row.players[0] : row.players
          return source?.id
        }).filter(Boolean)
        const { data: roundSeasonStats } = activeMatchFixture.season_id && squadPlayerIds.length
          ? await supabase
            .from('player_season_stats')
            .select('player_id,appearances,starts,minutes,avg_rating')
            .eq('season_id', activeMatchFixture.season_id)
            .in('player_id', squadPlayerIds)
          : { data: [] }
        const roundStats = new Map((roundSeasonStats ?? []).map((row: any) => [row.player_id, row]))

        const squads = new Map<string, Player[]>()
        for (const row of squadRows ?? []) {
          const player = normalizePlayer(row)
          const stats = roundStats.get(player.id)
          const enrichedPlayer = {
            ...player,
            seasonAppearances: Number(stats?.appearances ?? 0),
            seasonStarts: Number(stats?.starts ?? 0),
            seasonMinutes: Number(stats?.minutes ?? 0),
            seasonAverageRating: Number(stats?.avg_rating ?? 0),
          }
          matchPlayers.set(player.id, enrichedPlayer)
          const squad = squads.get(row.club_id) ?? []
          squad.push(enrichedPlayer)
          squads.set(row.club_id, squad)
        }

        for (const fixture of remainingFixtures) {
          const homePlayers = squads.get(fixture.home_club_id) ?? []
          const awayPlayers = squads.get(fixture.away_club_id) ?? []
          if (!homePlayers.length || !awayPlayers.length) continue

          const homeCoach = getAiCoachProfile(fixture.home_club_id)
          const awayCoach = getAiCoachProfile(fixture.away_club_id)
          const simulated = simulateMatch(
            fixture,
            homePlayers,
            awayPlayers,
            homeCoach.tactic,
            homeCoach.formation,
            undefined,
            undefined,
            Math.random,
            homeCoach.style,
            homeCoach.personality,
          )
          // O motor usa o perfil do mandante para os modificadores principais.
          // A escalação do visitante continua sendo dinâmica pelo contexto do adversário.
          nextMatches[fixture.id] = {
            ...simulated,
            home_club_id: fixture.home_club_id,
            away_club_id: fixture.away_club_id,
            competition_id: fixture.competition_id,
            round: fixture.round,
          }
          matchesToPersist[fixture.id] = nextMatches[fixture.id]
        }
      }

      for (const [fixtureId, match] of Object.entries(matchesToPersist)) {
        const { error: updateError } = await supabase
          .from('fixtures')
          .update({ status: 'completed', home_score: match.homeScore, away_score: match.awayScore, winner_club_id: activeMatchFixture.competition_name === 'Copa Nacional do Brasil' && activeMatchFixture.round === 7 ? resolveSingleMatch(match.homeScore, match.awayScore, activeMatchFixture.home_club_id, activeMatchFixture.away_club_id, match.homeScore === match.awayScore ? choosePenaltyWinner(activeMatchFixture.home_club_id, activeMatchFixture.away_club_id, activeMatchFixture.id) : null) : null })
          .eq('id', fixtureId)
          .eq('status', 'scheduled')

        if (updateError) console.error('Não foi possível persistir o resultado da fixture', fixtureId, updateError)
      }

      // O resultado da partida passa a ter consequência no mundo: titulares ganham/perdem forma
      // e a moral reage ao resultado e ao desempenho individual.
      const playerStateUpdates = new Map<string, { form: number; morale: number; fatigue: number }>()
      for (const match of Object.values(matchesToPersist)) {
        for (const playerRating of match.playerRatings ?? []) {
          const home = playerRating.team === 'home'
          const teamScore = home ? match.homeScore : match.awayScore
          const opponentScore = home ? match.awayScore : match.homeScore
          const resultDelta = teamScore > opponentScore ? 2 : teamScore < opponentScore ? -2 : 0
          const performanceDelta = Math.round((playerRating.rating - 6.5) * 0.8)
          const current = matchPlayers.get(playerRating.playerId)
          if (!current) continue
          playerStateUpdates.set(playerRating.playerId, {
            form: Math.max(30, Math.min(95, current.form + resultDelta + performanceDelta)),
            morale: Math.max(25, Math.min(100, current.morale + resultDelta + (playerRating.rating >= 7.5 ? 1 : playerRating.rating < 5.5 ? -1 : 0))),
            fatigue: Math.min(100, (current.fatigue ?? 0) + Math.round(playerRating.fatigue * (playerRating.minutes / 90) * 0.45)),
          })
        }
      }
      if (playerStateUpdates.size) {
        await Promise.all([...playerStateUpdates.entries()].map(([playerId, values]) =>
          supabase.from('players').update(values).eq('id', playerId)
        ))
        setPlayers(current => current.map(player => {
          const values = playerStateUpdates.get(player.id)
          return values ? { ...player, ...values } : player
        }))
      }

      // Cada partida agora deixa um registro permanente da carreira esportiva.
      // Os 11 jogadores avaliados pelo motor são considerados titulares e recebem 90 minutos.
      const seasonId = activeMatchFixture.season_id
      if (seasonId) {
        const playerIds = [...new Set(Object.values(matchesToPersist).flatMap(match => (match.playerRatings ?? []).map(rating => rating.playerId)))]
        if (playerIds.length) {
          const { data: existingStats } = await supabase
            .from('player_season_stats')
            .select('player_id,club_id,appearances,starts,minutes,goals,assists,avg_rating')
            .eq('season_id', seasonId)
            .in('player_id', playerIds)

          const existing = new Map((existingStats ?? []).map((row: any) => [row.player_id, row]))
          const aggregates = new Map<string, { clubId: string; appearances: number; starts: number; minutes: number; goals: number; assists: number; ratingTotal: number; ratingCount: number }>()

          for (const match of Object.values(matchesToPersist)) {
            for (const rating of match.playerRatings ?? []) {
              const clubId = rating.team === 'home' ? match.home_club_id : match.away_club_id
              const current = aggregates.get(rating.playerId) ?? {
                clubId,
                appearances: 0,
                starts: 0,
                minutes: 0,
                goals: 0,
                assists: 0,
                ratingTotal: 0,
                ratingCount: 0,
              }
              current.clubId = clubId
              current.appearances += 1
              if (rating.started) current.starts += 1
              current.minutes += rating.minutes
              current.goals += rating.goals
              current.assists += rating.assists
              current.ratingTotal += rating.rating
              current.ratingCount += 1
              aggregates.set(rating.playerId, current)
            }
          }

          const rows = [...aggregates.entries()].map(([playerId, current]) => {
            const previous = existing.get(playerId)
            const previousAppearances = Number(previous?.appearances ?? 0)
            const previousStarts = Number(previous?.starts ?? 0)
            const previousMinutes = Number(previous?.minutes ?? 0)
            const previousGoals = Number(previous?.goals ?? 0)
            const previousAssists = Number(previous?.assists ?? 0)
            const previousRating = Number(previous?.avg_rating ?? 0)
            const previousCount = previousAppearances
            const totalAppearances = previousAppearances + current.appearances
            const weightedRating = previousCount > 0
              ? ((previousRating * previousCount) + current.ratingTotal) / Math.max(1, totalAppearances)
              : current.ratingTotal / Math.max(1, current.ratingCount)

            return {
              season_id: seasonId,
              player_id: playerId,
              club_id: current.clubId,
              appearances: totalAppearances,
              starts: previousStarts + current.starts,
              minutes: previousMinutes + current.minutes,
              goals: previousGoals + current.goals,
              assists: previousAssists + current.assists,
              avg_rating: Number(weightedRating.toFixed(2)),
              updated_at: new Date().toISOString(),
            }
          })

          if (rows.length) {
            const { error: statsError } = await supabase
              .from('player_season_stats')
              .upsert(rows, { onConflict: 'season_id,player_id' })
            if (statsError) console.error('Não foi possível salvar as estatísticas dos jogadores', statsError)
          }
        }
      }

      if (activeMatchFixture.competition_id && activeMatchFixture.round > 0) {
        const { data: competitionRows } = await supabase
          .from('fixtures')
          .select('id,season_id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,winner_club_id')
          .eq('competition_id', activeMatchFixture.competition_id)
          .order('round')
          .order('scheduled_at')

        const allFixtures = (competitionRows ?? []).map(normalizeFixture)
        const currentRound = activeMatchFixture.round
        if (activeMatchFixture.competition_name === 'Copa Nacional do Brasil' && [2, 4, 6].includes(currentRound)) {
          const firstRound = currentRound - 1
          const ties = new Map<string, Fixture[]>()
          for (const item of allFixtures.filter(f => f.round === firstRound || f.round === currentRound)) {
            const key = [item.home_club_id, item.away_club_id].sort().join(':')
            const tie = ties.get(key) ?? []
            tie.push(item)
            ties.set(key, tie)
          }
          for (const tie of ties.values()) {
            const firstLeg = tie.find(f => f.round === firstRound)
            const secondLeg = tie.find(f => f.round === currentRound)
            if (!firstLeg || !secondLeg || secondLeg.status !== 'completed') continue
            const winner = resolveTwoLegTie(firstLeg, secondLeg, secondLeg.winner_club_id ?? choosePenaltyWinner(secondLeg.home_club_id, secondLeg.away_club_id, secondLeg.id))
            if (winner && secondLeg.winner_club_id !== winner) {
              await supabase.from('fixtures').update({ winner_club_id: winner }).eq('id', secondLeg.id)
            }
          }
        }
        const stage = getCompetitionStage(currentRound)
        if (stage.legs === 2 && currentRound % 2 === 0) {
          const generated = resolveCompletedKnockoutStage(allFixtures, currentRound)
          if (generated?.length) {
            const existingNext = new Set(allFixtures.map(fixture => `${fixture.round}:${fixture.home_club_id}:${fixture.away_club_id}`))
            const rows = generated.filter(fixture => !existingNext.has(`${fixture.round}:${fixture.homeClubId}:${fixture.awayClubId}`)).map(fixture => ({
              season_id: allFixtures.find(item => item.id === activeMatchFixture.id)?.season_id,
              competition_id: activeMatchFixture.competition_id,
              round: fixture.round,
              scheduled_at: fixture.scheduledAt,
              status: 'scheduled',
              home_club_id: fixture.homeClubId,
              away_club_id: fixture.awayClubId,
              home_score: null,
              away_score: null,
            }))
            if (rows.length) {
              const { error: insertError } = await supabase.from('fixtures').insert(rows)
              if (insertError) console.error('Não foi possível criar a próxima fase da Copa', insertError)
            }
          }
        }
      }

      if (seasonId && activeMatchFixture.competition_id) {
        const { data: historyFixtures } = await supabase
          .from('fixtures')
          .select('round,status,home_club_id,away_club_id,home_score,away_score,winner_club_id')
          .eq('season_id', seasonId)
          .eq('competition_id', activeMatchFixture.competition_id)
        const historyMatches = Object.values(nextMatches)
        const competitionName = activeMatchFixture.competition_name
        const history = buildCompetitionHistoryResult(
          activeMatchFixture.competition_id,
          historyFixtures ?? [],
          historyMatches,
          competitionName === 'Liga Nacional do Brasil',
        )
        if (history) {
          const { error: historyError } = await supabase.from('competition_history').upsert({
            season_id: seasonId,
            competition_id: activeMatchFixture.competition_id,
            champion_club_id: history.championClubId,
            runner_up_club_id: history.runnerUpClubId,
            top_scorer_player_id: history.topScorerPlayerId,
            top_scorer_goals: history.topScorerGoals,
          }, { onConflict: 'season_id,competition_id' })
          if (historyError) console.error('Não foi possível salvar o histórico da competição', historyError)
        }
      }

      localStorage.setItem(MATCHES_KEY, JSON.stringify(nextMatches))
      setPlayedMatches(nextMatches)
      if (seasonId) await finalizeSeasonIfComplete(seasonId, nextMatches)

      const { data: refreshedFixtures } = await supabase
        .from('fixtures')
        .select('id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,home_club:clubs!fixtures_home_club_id_fkey(name,short_name,city,stadium,logo_url),away_club:clubs!fixtures_away_club_id_fkey(name,short_name,city,stadium,logo_url),competitions(name)')
        .or(`home_club_id.eq.${career.club.id},away_club_id.eq.${career.club.id}`)
        .eq('status', 'scheduled')
        .order('scheduled_at')

      const refreshed = (refreshedFixtures ?? [])
        .map(normalizeFixture)
        .filter(item => !nextMatches[item.id])
      setUpcomingFixtures(refreshed)
      setNextFixture(refreshed[0] ?? null)
      if (matchHome && clock) {
        const attendance = estimateAttendance(career.club.reputation)
        const revenue = calculateMatchRevenue(attendance)
        const transaction = createTransaction(toDateKey(activeMatchFixture.scheduled_at), 'match_revenue', `Bilheteria · ${activeMatchFixture.home_club?.short_name ?? 'Mandante'}`, revenue, undefined, `match_revenue:${activeMatchFixture.id}`)
        const nextBalance = addFinanceTransaction(transaction) ?? financeBalance
        const nextCareer = { ...career, club: { ...career.club, budget: nextBalance } }
        localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
        onCareerUpdate(nextCareer)
      }
      if (clock) {
        const matchClock = { ...clock, currentDate: toDateKey(activeMatchFixture.scheduled_at) }
        setClock(matchClock)
        localStorage.setItem(CLOCK_KEY, JSON.stringify(matchClock))
      }
      setActiveMatchFixture(null)
      setView('overview')
    }
    return <Match key={activeMatchFixture.id} formation={formation} fixture={activeMatchFixture} homePlayers={matchHome ? players : opponentPlayers} awayPlayers={matchHome ? opponentPlayers : players} tactic={tactic} coachStyle={career.style} coachPersonality={career.personality} back={finishMatch} />
  }

  return <main className="min-h-screen"><Top label={career.season} /><section className="px-6 py-8 md:px-10">
    <div className="flex flex-col justify-between gap-6 border-b border-white/6 pb-8 md:flex-row md:items-end"><div><p className="text-sm text-white/35">Bom trabalho, {career.name}.</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">{career.club.name}</h1><div className="mt-3 flex items-center gap-2 text-sm text-white/35"><MapPin size={15} />{career.club.city} · Liga Nacional do Brasil</div></div><button onClick={newCareer} className="rounded-lg border border-white/8 px-4 py-2.5 text-xs font-semibold text-white/55 hover:border-white/15 hover:text-white">Nova carreira</button></div>
    {pendingEvent && (() => {
      const offeredPlayer = pendingEvent.type === 'player_offer' ? players.find(item => item.id === pendingEvent.playerId) : null
      const offerOptions = pendingEvent.type === 'player_offer'
        ? (pendingEvent.offers.length ? pendingEvent.offers : [{
            playerId: pendingEvent.playerId,
            fromClubId: pendingEvent.fromClubId,
            toClubId: pendingEvent.toClubId,
            fee: pendingEvent.fee,
          }])
        : []
      const messagePlayer = (pendingEvent.type === 'player_message' || pendingEvent.type === 'player_request') ? players.find(item => item.id === pendingEvent.playerId) : null
      const managerClub = pendingEvent.type === 'manager_offer' ? clubs.find(item => item.id === pendingEvent.fromClubId) : null

      if (pendingEvent.type === 'player_offer' && offeredPlayer) {
        return <section className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/70">Decisão importante</p>
          <h2 className="mt-2 text-2xl font-bold">
            {offerOptions.length > 1 ? 'Clubes estão disputando seu jogador' : 'Recebemos uma proposta por um jogador'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/45">
            {offeredPlayer.first_name} {offeredPlayer.last_name} chamou atenção de {offerOptions.length} clube(s). {offerOptions.length > 1 ? 'As propostas abaixo refletem a concorrência pelo jogador.' : 'Você pode aceitar ou recusar a proposta.'}
          </p>
          <div className="mt-5 space-y-3">
            {offerOptions.map(offer => {
              const buyer = clubs.find(item => item.id === offer.toClubId)
              if (!buyer) return null
              return <div key={offer.toClubId} className="flex flex-col gap-3 rounded-xl border border-white/8 bg-black/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-white/85">{buyer.name}</p>
                  <p className="mt-1 text-xs text-white/35">Proposta de {money(offer.fee)}</p>
                </div>
                <button onClick={() => respondToPlayerOffer(true, offer)} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300">Aceitar {money(offer.fee)}</button>
              </div>
            })}
          </div>
          <button onClick={() => respondToPlayerOffer(false)} className="mt-4 rounded-xl border border-white/8 px-5 py-3 text-sm font-semibold text-white/60 hover:text-white">Recusar todas as propostas</button>
        </section>
      }

      if (pendingEvent.type === 'board_message') {
        return <section className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/70">Mensagem da diretoria</p>
          <h2 className="mt-2 text-2xl font-bold">{pendingEvent.title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">{pendingEvent.message}</p>
          <button onClick={() => respondToImportantEvent('continue')} className="mt-5 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06100c]">Entendido</button>
        </section>
      }

      if (pendingEvent.type === 'player_message' && messagePlayer) {
        return <section className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300/70">Mensagem de jogador</p>
          <h2 className="mt-2 text-2xl font-bold">{pendingEvent.title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">{pendingEvent.message}</p>
          <p className="mt-4 text-xs text-white/25">{messagePlayer.position} · {messagePlayer.age} anos · Moral {messagePlayer.morale}</p>
          <button onClick={() => respondToImportantEvent('continue')} className="mt-5 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06100c]">Conversar com o jogador</button>
        </section>
      }

      if (pendingEvent.type === 'player_request' && messagePlayer) {
        const renewal = pendingEvent.request === 'renewal'
        return <section className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/70">Decisão sobre o elenco</p>
          <h2 className="mt-2 text-2xl font-bold">{pendingEvent.title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">{pendingEvent.message}</p>
          <p className="mt-4 text-xs text-white/25">{messagePlayer.position} · {messagePlayer.age} anos · Moral {messagePlayer.morale} · {messagePlayer.contractUntil ? 'Contrato até ' + messagePlayer.contractUntil : 'Sem contrato'}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            {renewal ? <>
              <button onClick={() => respondToPlayerRequest('renew')} className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06100c]">Abrir negociação</button>
              <button onClick={() => respondToPlayerRequest('continue')} className="rounded-xl border border-white/8 px-5 py-3 text-sm font-semibold text-white/60 hover:text-white">Ainda não</button>
            </> : <>
              <button onClick={() => respondToPlayerRequest('transfer')} className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06100c]">Aceitar saída</button>
              <button onClick={() => respondToPlayerRequest('continue')} className="rounded-xl border border-white/8 px-5 py-3 text-sm font-semibold text-white/60 hover:text-white">Conversar e manter</button>
            </>}
          </div>
        </section>
      }
      if (pendingEvent.type === 'manager_offer' && managerClub) {
        return <section className="mt-6 rounded-2xl border border-violet-400/20 bg-violet-400/[0.05] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/70">Proposta para o treinador</p>
          <h2 className="mt-2 text-2xl font-bold">{managerClub.name} quer contratar você</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">{pendingEvent.message}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button onClick={() => respondToImportantEvent('continue')} className="rounded-xl border border-white/8 px-5 py-3 text-sm font-semibold text-white/60 hover:text-white">Recusar</button>
            <button onClick={() => respondToImportantEvent('accept')} className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06100c]">Aceitar proposta</button>
          </div>
        </section>
      }

      return null
    })()}
    {worldNews.length > 0 && <section className="mt-6 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Imprensa do futebol</p>
          <h2 className="mt-2 text-2xl font-bold">O mundo continua jogando</h2>
          <p className="mt-2 text-sm text-white/35">As principais histórias da temporada, com mais destaque para o que envolve o seu clube.</p>
        </div>
        <button onClick={() => setView('press')} className="flex shrink-0 items-center gap-2 rounded-xl border border-white/8 px-4 py-3 text-sm font-semibold text-emerald-300 hover:border-emerald-300/20 hover:text-emerald-200">
          Abrir central <ArrowRight size={16} />
        </button>
      </div>
      <div className="mt-5 space-y-2">
        {worldNews.slice(0, 3).map(item => {
          const toneClass = item.tone === 'positive'
            ? 'border-emerald-400/10 bg-emerald-400/[0.025]'
            : item.tone === 'warning'
              ? 'border-amber-400/10 bg-amber-400/[0.025]'
              : 'border-white/5 bg-black/10'
          return <div key={item.id} className={`rounded-xl border px-4 py-3 ${toneClass}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <div className="mt-1 flex items-center gap-2"><span className="text-[9px] font-semibold uppercase tracking-wider text-white/20">{item.category === 'market' ? 'Mercado' : item.category === 'academy' ? 'Base' : item.category === 'career' ? 'Carreira' : item.category === 'club' ? 'Clube' : item.category === 'match' ? 'Resultados' : 'Elenco'}</span><p className="text-xs leading-5 text-white/40">{item.message}</p></div>
              </div>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/20">{formatSeasonDate(item.date)}</span>
            </div>
          </div>
        })}
      </div>
    </section>}
    {seasonClosed && seasonCompletion && <section className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/70">Temporada encerrada</p><h2 className="mt-2 text-2xl font-bold">{career.season} concluída oficialmente</h2><div className="mt-4 grid gap-3 md:grid-cols-4"><DashboardCard icon={<Trophy size={18} />} label="Liga" value={seasonCompletion.league.championClubId} detail="campeão" /><DashboardCard icon={<Trophy size={18} />} label="Copa" value={seasonCompletion.cup.championClubId} detail="campeão" /><DashboardCard icon={<Trophy size={18} />} label="Vice da Liga" value={seasonCompletion.league.runnerUpClubId ?? '—'} detail="classificação final" /><DashboardCard icon={<Trophy size={18} />} label="Vice da Copa" value={seasonCompletion.cup.runnerUpClubId ?? '—'} detail="final" /></div><p className="mt-4 text-xs text-white/35">O resultado foi consolidado no histórico da temporada e a temporada atual não pode mais ser considerada em andamento.</p><button onClick={onNextSeason} className="mt-5 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06100c] hover:bg-emerald-300">Começar a próxima temporada</button></section>}
    {loading ? <div className="py-20 text-center text-sm text-white/35">Preparando seu clube...</div> : <>
      <div className="mt-8 grid gap-4 md:grid-cols-4"><DashboardCard icon={<Users size={18} />} label="Elenco" value={String(players.length)} detail={`média geral ${avg}`} /><DashboardCard icon={<Banknote size={18} />} label="Orçamento" value={money(financeBalance)} detail="caixa disponível" /><DashboardCard icon={<Banknote size={18} />} label="Folha salarial" value={money(salaryTotal)} detail="salários do elenco / mês" /><DashboardCard icon={<Trophy size={18} />} label="Posição" value={table.findIndex(t => t.id === career.club.id) >= 0 ? `#${table.findIndex(t => t.id === career.club.id) + 1}` : '—'} detail="Liga Nacional do Brasil" /></div>
      <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Calendário da temporada</p><h2 className="mt-2 text-2xl font-bold">{clock ? formatSeasonDate(clock.currentDate) : 'Preparando calendário'}</h2><p className="mt-2 text-sm text-white/35">{nextFixture && nextMatchDate ? (matchReady ? 'Dia de jogo.' : `${daysBetween(clock!.currentDate, nextMatchDate)} dias até a próxima partida.`) : 'Nenhuma partida pendente.'}</p></div><CalendarDays className="text-emerald-300/50" size={24} /></div><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button onClick={restOneDay} disabled={!clock || !canAdvanceDay(clock, nextMatchDate) || advancingDays} className="flex items-center justify-center gap-2 rounded-xl border border-white/8 px-4 py-3 text-sm font-semibold text-white/70 hover:border-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-30">{advancingDays ? 'Avançando...' : 'Descansar 1 dia'} <ArrowRight size={16} /></button>{nextFixture && <button onClick={advanceToNextMatch} disabled={!clock || !nextMatchDate || clock.currentDate >= nextMatchDate || advancingDays} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-[#06100c] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-30">{advancingDays ? 'Avançando...' : 'Avançar até a partida'} <CalendarDays size={16} /></button>}{nextFixture && <div className="rounded-xl border border-white/6 bg-black/10 px-4 py-3 text-sm"><span className="text-white/30">Próximo jogo</span><span className="ml-2 font-semibold">{opponent?.short_name ?? 'A definir'} · {formatSeasonDate(nextMatchDate!)}</span></div>}</div><div className="mt-5 space-y-2">{upcomingFixtures.slice(0, 5).map(item => { const itemDate = toDateKey(item.scheduled_at); const itemOpponent = item.home_club_id === career.club.id ? item.away_club : item.home_club; return <div key={item.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${item.id === nextFixture?.id ? 'border-emerald-400/20 bg-emerald-400/[0.04]' : 'border-white/5 bg-black/10'}`}><div><p className="text-sm font-semibold">{itemOpponent?.short_name ?? 'Adversário'} {item.home_club_id === career.club.id ? '· Casa' : '· Fora'}</p><p className="mt-1 text-xs text-white/30">{item.competition_name ?? 'Competição'} · Rodada {item.round}</p></div><span className="text-xs font-semibold text-white/45">{formatSeasonDate(itemDate)}</span></div> })}</div></section>
      {rosterAlerts.length > 0 && <section className="mt-4 rounded-2xl border border-amber-400/10 bg-amber-400/[0.025] p-6"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/50">Gestão do elenco</p><h2 className="mt-2 text-xl font-bold">{rosterAlerts.length} ponto{rosterAlerts.length === 1 ? '' : 's'} pedindo atenção</h2></div><div className="mt-5 grid gap-2 md:grid-cols-2">{rosterAlerts.map(alert => <div key={alert.kind} className="rounded-xl border border-white/5 bg-black/10 px-4 py-3"><p className="text-sm font-semibold">{alert.title}</p><p className="mt-1 text-xs leading-5 text-white/35">{alert.description}</p></div>)}</div></section>}
      {contractAlerts.length > 0 && <section className="mt-4 rounded-2xl border border-amber-400/10 bg-amber-400/[0.025] p-6"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/50">Contratos</p><h2 className="mt-2 text-xl font-bold">{contractAlerts.length} contrato{contractAlerts.length === 1 ? '' : 's'} pedindo atenção</h2></div><button onClick={() => setView('squad')} className="text-xs font-semibold text-emerald-300">Ver elenco</button></div><div className="mt-5 space-y-2">{contractAlerts.slice(0, 5).map(item => <div key={item.playerId} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-white/30">{item.status === 'expired' ? 'Contrato vencido' : `Vence em ${item.days} dias`}</p></div><span className="text-xs font-bold text-amber-200/70">Renovar</span></div>)}</div></section>}
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-white/6 bg-white/[0.02] p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Próximo jogo</p><h2 className="mt-2 text-2xl font-bold">{opponent ? (home ? `Seu time × ${opponent.short_name}` : `${opponent.short_name} × Seu time`) : 'Nenhum jogo agendado'}</h2></div><CalendarDays className="text-emerald-300/50" size={24} /></div><div className="mt-8 grid grid-cols-2 gap-3"><Info label="Competição" value={nextFixture?.competition_name ?? '—'} /><Info label="Rodada" value={nextFixture ? `Rodada ${nextFixture.round}` : '—'} /><Info label="Data" value={nextMatchDate ? formatSeasonDate(nextMatchDate) : '—'} /><Info label="Status" value={matchReady ? 'Dia de jogo' : 'Em preparação'} /></div><button disabled={!matchReady} onClick={() => { if (nextFixture && matchReady) { setActiveMatchFixture(JSON.parse(JSON.stringify(nextFixture))); setView('match') } }} className="mt-6 flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-30">{matchReady ? 'Preparar partida' : 'Avance os dias até a partida'} <ArrowRight size={16} /></button></section>
        <section className="rounded-2xl border border-white/6 bg-white/[0.02] p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Elenco</p><h2 className="mt-2 text-2xl font-bold">{players.length} jogadores</h2></div><Users className="text-emerald-300/50" size={24} /></div><div className="mt-6 space-y-2">{players.slice(0, 5).map(player => <div key={player.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><p className="text-sm font-semibold">{player.first_name} {player.last_name}</p><p className="text-xs text-white/30">{player.position} · {player.age} anos</p></div><span className="text-xs font-semibold text-white/40">#{player.squad_number}</span></div>)}</div><button onClick={() => setView('squad')} className="mt-5 flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200">Ver elenco completo <ChevronRight size={16} /></button></section>
      </div>
      <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Finanças</p><h2 className="mt-2 text-2xl font-bold">Movimentação da carreira</h2></div><Banknote className="text-emerald-300/50" size={24} /></div><div className="mt-6 grid gap-3 md:grid-cols-4"><Info label="Capital inicial" value={money(initialCapital)} /><Info label="Saldo" value={money(financeBalance)} /><Info label="Receitas" value={money(financeTransactions.filter(t => t.amount > 0).reduce((sum,t) => sum + t.amount, 0))} /><Info label="Despesas" value={money(financeTransactions.filter(t => t.amount < 0).reduce((sum,t) => sum + Math.abs(t.amount), 0))} /></div><div className="mt-5 space-y-2">{financeTransactions.slice(-5).reverse().map(t => <div key={t.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><p className="text-sm font-semibold">{t.description}</p><p className="text-xs text-white/30">{t.date}</p></div><span className={`text-sm font-bold ${t.amount >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{t.amount >= 0 ? '+' : ''}{money(t.amount)}</span></div>)}</div></section>
      <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Classificação</p><h2 className="mt-2 text-2xl font-bold">Liga Nacional do Brasil</h2></div><Trophy className="text-emerald-300/50" size={24} /></div><div className="mt-6 overflow-x-auto rounded-xl border border-white/5"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-white/25"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Clube</th><th className="px-4 py-3 text-center">P</th><th className="px-4 py-3 text-center">J</th><th className="px-4 py-3 text-center">V</th><th className="px-4 py-3 text-center">E</th><th className="px-4 py-3 text-center">D</th><th className="px-4 py-3 text-center">GP</th><th className="px-4 py-3 text-center">GC</th><th className="px-4 py-3 text-center">SG</th></tr></thead><tbody>{table.slice(0, 8).map((team, i) => <tr key={team.id} className={team.id === career.club.id ? 'bg-emerald-400/5' : 'border-t border-white/5'}><td className="px-4 py-3 text-white/35">{i + 1}</td><td className="px-4 py-3 font-medium">{team.name}</td><td className="px-4 py-3 text-center font-bold">{team.points}</td><td className="px-4 py-3 text-center text-white/40">{team.played}</td><td className="px-4 py-3 text-center text-white/40">{team.wins}</td><td className="px-4 py-3 text-center text-white/40">{team.draws}</td><td className="px-4 py-3 text-center text-white/40">{team.losses}</td><td className="px-4 py-3 text-center text-white/40">{team.gf}</td><td className="px-4 py-3 text-center text-white/40">{team.ga}</td><td className="px-4 py-3 text-center text-white/40">{team.gf - team.ga}</td></tr>)}</tbody></table></div></section>
      <div className="mt-4 grid gap-4 md:grid-cols-3"><button onClick={() => setView('competitions')} className="flex items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.025] p-5 text-left hover:border-white/12"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/8 text-emerald-300"><Trophy size={20} /></div><div><p className="font-semibold">Competições</p><p className="mt-1 text-xs text-white/30">Classificação, rodadas e resultados.</p></div><ChevronRight className="ml-auto text-white/20" size={18} /></button><button onClick={() => setView('press')} className="flex items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.025] p-5 text-left hover:border-white/12"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/8 text-emerald-300"><Newspaper size={20} /></div><div><p className="font-semibold">Imprensa</p><p className="mt-1 text-xs text-white/30">Acompanhe as notícias e acontecimentos da temporada.</p></div><ChevronRight className="ml-auto text-white/20" size={18} /></button><button onClick={() => setView('market')} className="flex items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.025] p-5 text-left hover:border-white/12"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/8 text-emerald-300"><ShoppingBag size={20} /></div><div><p className="font-semibold">Mercado de transferências</p><p className="mt-1 text-xs text-white/30">Busque jogadores e faça propostas.</p></div><ChevronRight className="ml-auto text-white/20" size={18} /></button><button onClick={() => setView('loans')} className="flex items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.025] p-5 text-left hover:border-white/12"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/8 text-emerald-300"><Handshake size={20} /></div><div><p className="font-semibold">Empréstimos</p><p className="mt-1 text-xs text-white/30">Receba ou empreste jogadores.</p></div><ChevronRight className="ml-auto text-white/20" size={18} /></button><button onClick={() => setView('training')} className="flex items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.025] p-5 text-left hover:border-white/12"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/8 text-emerald-300"><Dumbbell size={20} /></div><div><p className="font-semibold">Treinamento</p><p className="mt-1 text-xs text-white/30">Prepare o elenco para o próximo jogo.</p></div><ChevronRight className="ml-auto text-white/20" size={18} /></button><button onClick={() => setView('tactics')} className="flex items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.025] p-5 text-left hover:border-white/12"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/8 text-emerald-300"><Shield size={20} /></div><div><p className="font-semibold">Escalação e Táticas</p><p className="mt-1 text-xs text-white/30">Escolha a formação e os 11 titulares.</p></div><ChevronRight className="ml-auto text-white/20" size={18} /></button></div>
    </>}
  </section></main>
}

function Squad({ players, club, today, onContractChange, back }: { players: Player[]; club: Club; today: string; onContractChange?: (oldSalary: number, newSalary: number) => void; back: () => void }) {
  const [position, setPosition] = useState('ALL')
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const positions = ['ALL', 'GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST']
  const filtered = position === 'ALL' ? players : players.filter(p => p.position === position)

  return <main className="min-h-screen">
    <Top label="ELENCO" back={back} />
    <section className="px-6 py-8 md:px-10">
      <div>
        <p className="text-sm text-white/35">{club.name}</p>
        <h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">Elenco</h1>
        <p className="mt-3 text-sm text-white/35">Conheça os jogadores que estão sob seu comando.</p>
      </div>

      <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
        {positions.map(item => <button key={item} onClick={() => setPosition(item)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${position === item ? 'bg-emerald-400 text-[#06100c]' : 'border border-white/7 bg-white/[0.02] text-white/40 hover:text-white'}`}>{item === 'ALL' ? 'Todos' : item}</button>)}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/6">
        <div className="hidden grid-cols-[48px_1.8fr_70px_70px_repeat(5,1fr)] bg-white/[0.03] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/25 md:grid">
          <span>#</span><span>Jogador</span><span>Pos.</span><span>Idade</span><span>GER</span><span>Forma</span><span>Moral</span><span>Pot.</span><span>Valor</span>
        </div>
        {filtered.map(player => <button key={player.id} onClick={() => setSelectedPlayer(player)} className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 border-t border-white/5 px-4 py-4 text-left hover:bg-white/[0.025] md:grid-cols-[48px_1.8fr_70px_70px_repeat(5,1fr)]">
          <span className="text-xs text-white/25">#{player.squad_number}</span>
          <div><p className="text-sm font-semibold">{player.first_name} {player.last_name}</p><p className="text-xs text-white/30">{player.nationality}</p></div>
          <span className="text-xs font-bold text-emerald-300">{player.position}</span>
          <span className="hidden text-sm text-white/50 md:block">{player.age}</span>
          <span className="hidden text-sm font-bold md:block">{playerOverall(player)}</span>
          <span className="hidden text-sm text-white/45 md:block">{player.form}</span>
          <span className="hidden text-sm text-white/45 md:block">{player.morale}</span>
          <span className="hidden text-sm text-white/45 md:block">{player.potential}</span>
          <span className="hidden text-xs text-white/35 md:block">Ver ficha</span>
        </button>)}
      </div>
      <p className="mt-4 text-xs text-white/25">{filtered.length} jogadores exibidos. Selecione um jogador para abrir a ficha.</p>
    </section>

    {selectedPlayer && <PlayerProfile player={selectedPlayer} club={club} today={today} onContractChange={onContractChange} close={() => setSelectedPlayer(null)} />}
  </main>
}

function Tactics({ players, club, back }: { players: Player[]; club: Club; back: () => void }) {
  const formations = {
    '4-3-3': ['GK','LB','CB','CB','RB','CM','DM','CM','LW','ST','RW'],
    '4-4-2': ['GK','LB','CB','CB','RB','LW','CM','CM','RW','ST','ST'],
    '4-2-3-1': ['GK','LB','CB','CB','RB','DM','DM','LW','AM','RW','ST'],
    '3-5-2': ['GK','CB','CB','CB','LW','DM','CM','CM','RW','ST','ST'],
  } as const
  const [formation, setFormation] = useState<keyof typeof formations>(() => {
    try { return JSON.parse(localStorage.getItem(TACTIC_KEY) ?? '{}').formation ?? '4-3-3' } catch { return '4-3-3' }
  })
  const [tactic, setTactic] = useState(() => { try { return JSON.parse(localStorage.getItem(TACTIC_KEY) ?? '{}').tactic ?? 'balanced' } catch { return 'balanced' } })
  const [lineup, setLineup] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem(TACTIC_KEY) ?? '{}').lineup ?? {} } catch { return {} }
  })
  const slots = formations[formation]
  const overall = (p: Player) => p.position === 'GK' ? p.goalkeeping : Math.round((p.pace + p.shooting + p.passing + p.dribbling + p.defending + p.physical + p.mental) / 7)

  function canPlayPosition(player: Player, position: string) {
    if (player.position === position) return true
    if (position === 'CB') return ['CB', 'DM'].includes(player.position)
    if (['LB', 'RB'].includes(position)) return ['LB', 'RB', 'LW', 'RW'].includes(player.position)
    if (['LW', 'RW'].includes(position)) return ['LW', 'RW', 'AM', 'ST'].includes(player.position)
    if (['CM', 'DM', 'AM'].includes(position)) return ['CM', 'DM', 'AM'].includes(player.position)
    return false
  }

  function bestForPosition(position: string, usedIds: Set<string>) {
    return players
      .filter(player => !usedIds.has(player.id) && canPlayPosition(player, position))
      .sort((a, b) => overall(b) - overall(a))[0]
  }

  function autoPick() {
    const next: Record<number, string> = {}
    const usedIds = new Set<string>()

    slots.forEach((position, index) => {
      const picked = bestForPosition(position, usedIds)
      if (picked) {
        next[index] = picked.id
        usedIds.add(picked.id)
      }
    })

    setLineup(next)
    localStorage.setItem(TACTIC_KEY, JSON.stringify({ formation, lineup: next, tactic }))
  }

  function changeFormation(value: keyof typeof formations) {
    setFormation(value)
    setLineup({})
    localStorage.setItem(TACTIC_KEY, JSON.stringify({ formation: value, lineup: {} }))
  }

  function saveTactic(value: string) { setTactic(value); localStorage.setItem(TACTIC_KEY, JSON.stringify({ formation, lineup, tactic: value })) }

  const selected = slots.map((position,index) => ({ position, index, player: players.find(p => p.id === lineup[index]) }))
  const starters = selected.filter(x => x.player).length

  return <main className="min-h-screen"><Top label="ESCALAÇÃO E TÁTICAS" back={back} /><section className="px-6 py-8 md:px-10">
    <div className="flex flex-col justify-between gap-5 border-b border-white/6 pb-8 md:flex-row md:items-end"><div><p className="text-sm text-white/35">{club.name}</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">Quem começa jogando?</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/35">Monte sua equipe antes da partida. A escalação escolhida será a base para o motor de jogo.</p></div><button onClick={autoPick} className="rounded-xl bg-emerald-400 px-5 py-3 text-xs font-bold text-[#06100c] hover:bg-emerald-300">Escalar melhor time</button></div>
    <div className="mt-8 flex flex-wrap gap-2">{(Object.keys(formations) as Array<keyof typeof formations>).map(item => <button key={item} onClick={() => changeFormation(item)} className={`rounded-lg px-4 py-2.5 text-xs font-bold ${formation === item ? 'bg-emerald-400 text-[#06100c]' : 'border border-white/8 text-white/45 hover:text-white'}`}>{item}</button>)}</div>
    <div className="mt-6 rounded-2xl border border-white/6 bg-white/[0.02] p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Estilo de jogo</p><div className="mt-4 grid grid-cols-3 gap-2">{[['defensive','Defensivo'],['balanced','Equilibrado'],['offensive','Ofensivo']].map(([value,label]) => <button key={value} onClick={() => saveTactic(value)} className={`rounded-xl border px-3 py-3 text-xs font-bold ${tactic === value ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : 'border-white/6 text-white/40'}`}>{label}</button>)}</div></div>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <section className="rounded-2xl border border-white/6 bg-white/[0.02] p-5">
        <div className="mb-5 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Titulares</span><span className="text-xs text-white/30">{starters}/11</span></div>
        <div className="grid gap-2">{selected.map(({position,index,player}) => <div key={index} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/10 p-3"><span className="w-10 text-xs font-bold text-emerald-300">{position}</span><select value={player?.id ?? ''} onChange={e => { const next={...lineup}; if(e.target.value) next[index]=e.target.value; else delete next[index]; setLineup(next); localStorage.setItem(TACTIC_KEY,JSON.stringify({formation,lineup:next})) }} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"><option value="">Escolher jogador</option>{players.filter(p => !Object.values(lineup).includes(p.id) || p.id === player?.id).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} · {playerOverall(p)}</option>)}</select></div>)}</div>
      </section>
      <section className="rounded-2xl border border-white/6 bg-white/[0.02] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Banco</p><p className="mt-2 text-lg font-bold">{Math.max(0, players.length - starters)} jogadores</p></div><Users size={20} className="text-white/25" /></div><div className="mt-5 space-y-2">{players.filter(p => !Object.values(lineup).includes(p.id)).map(p => <div key={p.id} className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-3"><div><p className="text-sm font-semibold">{p.first_name} {p.last_name}</p><p className="text-xs text-white/30">{p.position} · {p.age} anos</p></div><span className="text-xs font-bold text-white/35">{playerOverall(p)}</span></div>)}</div></section>
    </div>
    <div className="mt-6 rounded-xl border border-emerald-400/10 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-200/70">Sua escalação fica salva nesta carreira e será usada pelo motor da próxima partida.</div>
  </section></main>
}


function Training({ players, club, salaryTotal, nextFixture, back, onComplete }: { players: Player[]; club: Club; salaryTotal: number; nextFixture: Fixture | null; back: () => void; onComplete: (players: Player[], career: ManagerProfile, cost: number) => void }) {
  const [focus, setFocus] = useState<TrainingFocus>('balanced')
  const [saving, setSaving] = useState(false)
  const [report, setReport] = useState<TrainingReport | null>(null)
  const [pendingPlayers, setPendingPlayers] = useState<Player[] | null>(null)
  const [pendingCareer, setPendingCareer] = useState<ManagerProfile | null>(null)
  const selected = TRAINING_FOCUSES[focus]
  const affordable = club.budget >= selected.cost
  const trainingState = JSON.parse(localStorage.getItem(TRAINING_KEY) ?? '{}')
  const alreadyTrained = Boolean(nextFixture && trainingState.lastTrainingFixtureId === nextFixture.id)
  const opponentName = nextFixture ? (nextFixture.home_club_id === club.id ? nextFixture.away_club?.name : nextFixture.home_club?.name) : null

  function complete() {
    if (!affordable || saving) return
    setSaving(true)
    const beforePlayers = players.map(player => ({ ...player }))
    const nextPlayers = trainSquad(players, focus)
    const changes = buildTrainingReport(beforePlayers, nextPlayers)
    const previous = JSON.parse(localStorage.getItem(TRAINING_KEY) ?? '{}')
    const map = Object.fromEntries(nextPlayers.map(player => [player.id, player]))
    localStorage.setItem(TRAINING_KEY, JSON.stringify({ players: { ...(previous.players ?? {}), ...map }, lastFocus: focus, lastTrainingAt: new Date().toISOString(), lastTrainingFixtureId: nextFixture?.id ?? null }))
    const savedCareer = localStorage.getItem(CAREER_KEY)
    const career = savedCareer ? JSON.parse(savedCareer) as ManagerProfile : null
    if (!career) { setSaving(false); return }
    const nextCareer = { ...career, club: { ...club, budget: Math.max(0, club.budget - selected.cost) } }
    localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
    setTimeout(() => { setPendingPlayers(nextPlayers); setPendingCareer(nextCareer); setReport(changes); setSaving(false) }, 250)
  }

  if (report && pendingPlayers && pendingCareer) return <TrainingReportView report={report} close={() => onComplete(pendingPlayers, pendingCareer, selected.cost)} />
  return <main className="min-h-screen"><Top label="TREINAMENTO" back={back} /><section className="px-6 py-8 md:px-10">
    <p className="text-sm text-white/35">{club.name}</p>
    <h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">Prepare o elenco</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-white/35">Escolha o foco da sessão. Jogadores jovens têm maior capacidade de evolução, mas ninguém ultrapassa o próprio potencial.</p>{nextFixture && <div className="mt-5 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3 text-xs text-white/45">Próximo jogo: <span className="font-semibold text-white/70">{club.name} {nextFixture.home_club_id === club.id ? '×' : 'fora de casa'} {opponentName ?? 'adversário'}</span> · Rodada {nextFixture.round}</div>}
    <div className="mt-8 grid gap-3 md:grid-cols-2">
      {(Object.entries(TRAINING_FOCUSES) as [TrainingFocus, typeof selected][]).map(([key, item]) => <button key={key} onClick={() => setFocus(key)} className={`rounded-2xl border p-5 text-left ${focus === key ? 'border-emerald-400/40 bg-emerald-400/8' : 'border-white/6 bg-white/[0.02]'}`}>
        <div className="flex items-center justify-between"><p className="font-semibold">{item.label}</p><span className="text-xs font-bold text-emerald-300">{money(item.cost)}</span></div>
        <p className="mt-2 text-xs leading-5 text-white/35">{item.description}</p>
      </button>)}
    </div>
    <div className="mt-6 grid gap-3 md:grid-cols-3">
      <Info label="Custo da sessão" value={money(selected.cost)} />
      <Info label="Folha mensal" value={money(calculateMonthlyPayroll([salaryTotal ?? 0]))} />
      <Info label="Orçamento disponível" value={money(club.budget)} />
    </div>
    <div className="mt-6 rounded-2xl border border-white/6 bg-white/[0.02] p-5">
      <p className="text-sm font-semibold">O que acontece?</p>
      <p className="mt-2 text-xs leading-6 text-white/35">Os atributos relacionados ao foco podem subir 1 ponto, respeitando o potencial do atleta. A sessão também melhora ligeiramente forma e moral.</p>
      <button disabled={!affordable || alreadyTrained || saving} onClick={complete} className="mt-6 flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06100c] disabled:cursor-not-allowed disabled:opacity-30">{saving ? 'Treinando...' : alreadyTrained ? 'Treinamento desta rodada já realizado' : affordable ? 'Realizar treinamento' : 'Orçamento insuficiente'} <ArrowRight size={16} /></button>
    </div>
  </section></main>
}


type TrainingChange = {
  player: Player
  changes: Array<{ attribute: string; before: number; after: number }>
}

type TrainingReport = {
  beforeFatigue: number
  afterFatigue: number
  improved: TrainingChange[]
  unchanged: Player[]
}

const TRAINING_ATTRIBUTES: Array<{ key: keyof Player; label: string }> = [
  { key: 'pace', label: 'Velocidade' },
  { key: 'shooting', label: 'Finalização' },
  { key: 'passing', label: 'Passe' },
  { key: 'dribbling', label: 'Drible' },
  { key: 'defending', label: 'Defesa' },
  { key: 'physical', label: 'Físico' },
  { key: 'mental', label: 'Mental' },
  { key: 'goalkeeping', label: 'Goleiro' },
]

function buildTrainingReport(before: Player[], after: Player[]): TrainingReport {
  const byId = new Map(before.map(player => [player.id, player]))
  const improved: TrainingChange[] = []
  const unchanged: Player[] = []

  after.forEach(player => {
    const previous = byId.get(player.id)
    if (!previous) return
    const changes = TRAINING_ATTRIBUTES
      .map(({ key, label }) => ({ attribute: label, before: Number(previous[key]), after: Number(player[key]) }))
      .filter(change => change.after > change.before)
    if (changes.length) improved.push({ player, changes })
    else unchanged.push(player)
  })

  const avg = (list: Player[]) => list.length ? Math.round(list.reduce((sum, player) => sum + (player.fatigue ?? 0), 0) / list.length) : 0
  return { beforeFatigue: avg(before), afterFatigue: avg(after), improved, unchanged }
}

function TrainingReportView({ report, close }: { report: TrainingReport; close: () => void }) {
  return <main className="min-h-screen"><Top label="RELATÓRIO DE TREINAMENTO" /><section className="px-6 py-8 md:px-10"><div><p className="text-sm text-white/35">Sessão concluída</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">O que mudou no elenco?</h1></div><div className="mt-8 grid gap-3 md:grid-cols-3"><Info label="Fadiga antes" value={`${report.beforeFatigue}%`} /><Info label="Fadiga depois" value={`${report.afterFatigue}%`} /><Info label="Jogadores que evoluíram" value={`${report.improved.length}`} /></div><section className="mt-8 rounded-2xl border border-white/6 bg-white/[0.02] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Evolução</p><p className="mt-2 text-sm text-white/40">Atributos que subiram nesta sessão.</p></div><span className="text-xs font-bold text-emerald-300">+{report.improved.reduce((sum, item) => sum + item.changes.length, 0)} pontos</span></div><div className="mt-5 space-y-2">{report.improved.length ? report.improved.map(item => <div key={item.player.id} className="flex flex-col gap-2 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.03] px-4 py-3 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-semibold">{item.player.first_name} {item.player.last_name}</p><p className="text-xs text-white/30">{item.player.position} · GER {playerOverall(item.player)}</p></div><div className="flex flex-wrap gap-2">{item.changes.map(change => <span key={change.attribute} className="rounded-lg bg-emerald-400/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300">{change.attribute} {change.before} → {change.after}</span>)}</div></div>) : <p className="py-6 text-sm text-white/35">Nenhum atributo subiu nesta sessão. Isso também faz parte do desenvolvimento: cada jogador evolui em um ritmo diferente.</p>}</div></section><section className="mt-5 rounded-2xl border border-white/6 bg-white/[0.02] p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Mantiveram os atributos</p><p className="mt-2 text-sm text-white/40">{report.unchanged.length} jogadores não tiveram aumento de atributo nesta sessão.</p><div className="mt-4 flex flex-wrap gap-2">{report.unchanged.map(player => <span key={player.id} className="rounded-lg border border-white/6 px-3 py-2 text-xs text-white/45">{player.first_name} {player.last_name}</span>)}</div></section><button onClick={close} className="mt-6 flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06100c]">Voltar ao clube <ArrowRight size={16} /></button></section></main>
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/5 bg-black/10 p-4"><p className="text-xs text-white/25">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div> }

function Match({ fixture, homePlayers, awayPlayers, tactic, formation, coachStyle, coachPersonality, back }: { fixture: Fixture; homePlayers: Player[]; awayPlayers: Player[]; tactic: string; formation: string; coachStyle: ManagerProfile['style']; coachPersonality: ManagerProfile['personality']; back: (result: MatchResult) => void }) {
  const [phase, setPhase] = useState<'pregame' | 'live' | 'postgame'>('pregame')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [currentMinute, setCurrentMinute] = useState(0)
  const [pregameTab, setPregameTab] = useState<'preview' | 'lineup'>('preview')
  const [postgameTab, setPostgameTab] = useState<'events' | 'stats' | 'round'>('events')
  const [roundResults, setRoundResults] = useState<Fixture[]>([])
  const [loadingRound, setLoadingRound] = useState(false)
  const [matchTeams] = useState(() => ({
    home: fixture.home_club?.name ?? 'Mandante',
    away: fixture.away_club?.name ?? 'Visitante',
  }))

  async function simulate() {
    setPhase('live')
    const { simulateMatch } = await import('./engine/match')
    await new Promise(resolve => setTimeout(resolve, 300))
    let savedLineup: Record<number, string> = {}
    try {
      savedLineup = JSON.parse(localStorage.getItem(TACTIC_KEY) ?? '{}').lineup ?? {}
    } catch {}
    const homeLineup = lineupFromPlayerIds(homePlayers, formation as Formation, savedLineup)
    const awayLineup = lineupFromPlayerIds(awayPlayers, formation as Formation, savedLineup)
    const match = simulateMatch(
      fixture,
      homePlayers,
      awayPlayers,
      tactic,
      formation as Formation,
      homeLineup.length >= 7 ? homeLineup : undefined,
      awayLineup.length >= 7 ? awayLineup : undefined,
      Math.random,
      coachStyle,
      coachPersonality,
    )
    setResult(match)
    for (let minute = 1; minute <= 90; minute++) {
      await new Promise(resolve => setTimeout(resolve, 55))
      setCurrentMinute(minute)
    }
    setPhase('postgame')
    setPostgameTab('events')
  }

  async function showRoundResults() {
    setPostgameTab('round')
    if (roundResults.length || loadingRound) return
    setLoadingRound(true)
    const { data } = await supabase
      .from('fixtures')
      .select('id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,home_club:clubs!fixtures_home_club_id_fkey(name,short_name,city,stadium,logo_url),away_club:clubs!fixtures_away_club_id_fkey(name,short_name,city,stadium,logo_url)')
      .eq('competition_id', fixture.competition_id)
      .eq('round', fixture.round)
      .eq('status', 'completed')
      .order('scheduled_at')
    setRoundResults((data ?? []).map(normalizeFixture))
    setLoadingRound(false)
  }

  const visibleEvents = result?.events.filter(event => event.minute <= currentMinute) ?? []
  const scoreAtMinute = (team: 'home' | 'away') => visibleEvents.filter(event => event.type === 'goal' && event.team === team).length
  const homeScore = result ? scoreAtMinute('home') : 0
  const awayScore = result ? scoreAtMinute('away') : 0
  const live = result?.timeline[Math.max(0, Math.min(currentMinute, result?.timeline.length ?? 1) - 1)]
  const homeStats = live?.home ?? (phase === 'postgame' ? result?.homeStats : undefined)
  const awayStats = live?.away ?? (phase === 'postgame' ? result?.awayStats : undefined)
  const homeStar = [...homePlayers].sort((a, b) => playerOverall(b) - playerOverall(a))[0]
  const awayStar = [...awayPlayers].sort((a, b) => playerOverall(b) - playerOverall(a))[0]
  const stadium = fixture.home_club?.name ? `Estádio ${fixture.home_club.name.replace(/ FC$/, '')}` : 'Estádio Municipal'
  const refereeNames = ['Carlos Almeida', 'Rafael Martins', 'Bruno Ferreira', 'Marcos Ribeiro', 'André Costa']
  const referee = refereeNames[fixture.round % refereeNames.length]
  let preferredLineup: Record<number, string> = {}
  try {
    preferredLineup = JSON.parse(localStorage.getItem(TACTIC_KEY) ?? '{}').lineup ?? {}
  } catch {}
  const projectedHomeLineup = selectStartingLineup(homePlayers, formation as Formation, coachStyle, coachPersonality, awayPlayers, preferredLineup, fixture.competition_name?.includes('Copa') ? (fixture.round >= 5 ? 1.2 : 1.08) : (fixture.round >= 25 ? 1.12 : 1))
  const projectedAwayLineup = selectStartingLineup(awayPlayers, formation as Formation, undefined, undefined, homePlayers, {}, fixture.competition_name?.includes('Copa') ? (fixture.round >= 5 ? 1.2 : 1.08) : (fixture.round >= 25 ? 1.12 : 1))

  function LineupList({ title, players }: { title: string; players: Player[] }) {
    return <div className="rounded-2xl border border-white/6 bg-black/10 p-5">
      <div className="flex items-center justify-between"><p className="text-sm font-bold">{title}</p><span className="text-xs text-white/25">{players.length} jogadores</span></div>
      <div className="mt-4 space-y-2">{players.slice(0, 11).map((player, index) => <div key={player.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3"><div className="flex items-center gap-3"><span className="w-6 text-xs font-bold text-emerald-300">{index + 1}</span><div><p className="text-sm font-semibold">{player.first_name} {player.last_name}</p><p className="text-xs text-white/30">{player.position} · {player.age} anos</p></div></div><span className="text-sm font-bold text-white/60">{playerOverall(player)}</span></div>)}</div>
    </div>
  }

  return <main className="min-h-screen">
    <Top label="PARTIDA" />
    <section className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/70">{fixture.competition_id ? 'Competição' : 'Partida'} · Rodada {fixture.round}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{matchTeams.home} <span className="text-white/20">×</span> {matchTeams.away}</h1>
        <p className="mt-2 text-sm text-white/35">{formatSeasonDate(toDateKey(fixture.scheduled_at))}</p>
      </div>

      {phase === 'pregame' && <section className="mt-8">
        <div className="rounded-3xl border border-white/6 bg-white/[0.02] p-6 md:p-8">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
            <div><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04]"><Shield size={28} className="text-emerald-300/70" /></div><p className="mt-4 text-sm font-bold">{matchTeams.home}</p><p className="mt-1 text-xs text-white/30">CASA</p></div>
            <div><p className="text-4xl font-bold text-white/25">×</p><p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/30">PRÉ-JOGO</p></div>
            <div><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04]"><Shield size={28} className="text-emerald-300/70" /></div><p className="mt-4 text-sm font-bold">{matchTeams.away}</p><p className="mt-1 text-xs text-white/30">FORA</p></div>
          </div>
          <button onClick={simulate} className="mx-auto mt-8 flex items-center gap-3 rounded-xl bg-emerald-400 px-7 py-3.5 text-sm font-bold text-[#06100c]">Começar partida <ArrowRight size={17} /></button>
        </div>

        <div className="mt-4 flex rounded-xl border border-white/6 bg-white/[0.02] p-1">
          <button onClick={() => setPregameTab('preview')} className={`flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] ${pregameTab === 'preview' ? 'bg-white/8 text-white' : 'text-white/35'}`}>Prévia</button>
          <button onClick={() => setPregameTab('lineup')} className={`flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] ${pregameTab === 'lineup' ? 'bg-white/8 text-white' : 'text-white/35'}`}>Escalação</button>
        </div>

        {pregameTab === 'preview' && <div className="mt-4 space-y-4">
          <section className="grid gap-3 md:grid-cols-4">
            <Info label="Dia do jogo" value={formatSeasonDate(toDateKey(fixture.scheduled_at))} />
            <Info label="Competição" value="Liga Nacional do Brasil" />
            <Info label="Rodada" value={`Rodada ${fixture.round}`} />
            <Info label="Estádio" value={stadium} />
          </section>
          <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-5"><div className="flex items-center gap-2"><MapPin size={16} className="text-emerald-300/60" /><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Arbitragem</p></div><p className="mt-3 text-sm font-semibold">{referee}</p></div>
          <section><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Destaques da partida</p><div className="mt-3 grid gap-3 md:grid-cols-2">{homeStar && <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-5"><p className="text-xs text-white/30">{matchTeams.home}</p><div className="mt-3 flex items-end justify-between"><div><p className="text-lg font-bold">{homeStar.first_name} {homeStar.last_name}</p><p className="mt-1 text-xs text-white/35">{homeStar.position}</p></div><span className="text-3xl font-bold text-emerald-300">{playerOverall(homeStar)}</span></div></div>}{awayStar && <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-5"><p className="text-xs text-white/30">{matchTeams.away}</p><div className="mt-3 flex items-end justify-between"><div><p className="text-lg font-bold">{awayStar.first_name} {awayStar.last_name}</p><p className="mt-1 text-xs text-white/35">{awayStar.position}</p></div><span className="text-3xl font-bold text-emerald-300">{playerOverall(awayStar)}</span></div></div>}</div></section>
        </div>}

        {pregameTab === 'lineup' && <div className="mt-4 grid gap-4 md:grid-cols-2"><LineupList title={matchTeams.home} players={projectedHomeLineup.map(item => item.player)} /><LineupList title={matchTeams.away} players={projectedAwayLineup.map(item => item.player)} /></div>}
      </section>}

      {phase !== 'pregame' && <section className="mt-8 rounded-3xl border border-white/6 bg-white/[0.02] p-6 md:p-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
          <div><p className="text-lg font-bold">{matchTeams.home}</p><p className="mt-2 text-xs text-white/30">CASA</p></div>
          <div><p className="text-5xl font-bold tracking-tight">{homeScore} <span className="text-white/20">×</span> {awayScore}</p><p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/60">{phase === 'live' ? currentMinute + "'" : 'FIM DE JOGO'}</p></div>
          <div><p className="text-lg font-bold">{matchTeams.away}</p><p className="mt-2 text-xs text-white/30">FORA</p></div>
        </div>
        {phase === 'live' && <p className="mt-6 text-center text-xs text-white/30">A partida está acontecendo. Os lances aparecem conforme o relógio avança.</p>}
      </section>}

      {result && <section className="mt-4">
        <div className="flex rounded-xl border border-white/6 bg-white/[0.02] p-1">
          <button onClick={() => setPostgameTab('events')} className={`flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] ${postgameTab === 'events' ? 'bg-white/8 text-white' : 'text-white/35'}`}>Lances</button>
          <button disabled={postgameTab === 'events'} onClick={() => setPostgameTab('stats')} className={`flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] ${postgameTab === 'stats' ? 'bg-white/8 text-white' : 'text-white/35'} disabled:opacity-40`}>Estatísticas</button>
          <button disabled={postgameTab !== 'stats'} onClick={showRoundResults} className={`flex-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] ${postgameTab === 'round' ? 'bg-white/8 text-white' : 'text-white/35'} disabled:opacity-40`}>Resultados da rodada</button>
        </div>

        {postgameTab === 'events' && <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Lance a lance</p><span className="text-xs text-white/25">{visibleEvents.length} eventos</span></div>
          <div className="mt-5 max-h-[480px] space-y-2 overflow-y-auto pr-1">{visibleEvents.length ? visibleEvents.slice().reverse().map((event, index) => <div key={index} className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${event.type === 'goal' ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-white/5 bg-black/10'}`}><span className="w-8 text-xs font-bold text-white/25">{event.minute}'</span><div><p className="text-sm font-semibold">{event.player}</p><p className="text-xs text-white/35">{event.text}</p></div></div>) : <p className="text-sm text-white/35">O jogo está começando...</p>}</div>
          {phase === 'postgame' && <button onClick={() => setPostgameTab('stats')} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-[#06100c]">Ver estatísticas <ArrowRight size={16} /></button>}
        </section>}

        {postgameTab === 'stats' && phase === 'postgame' && <section className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">{[['Posse', result.homeStats.possession + '% / ' + result.awayStats.possession + '%'],['Finalizações', result.homeStats.shots + ' / ' + result.awayStats.shots],['No alvo', result.homeStats.shotsOnTarget + ' / ' + result.awayStats.shotsOnTarget],['Chances', result.homeStats.chances + ' / ' + result.awayStats.chances],['Desarmes', result.homeStats.tackles + ' / ' + result.awayStats.tackles],['Escanteios', result.homeStats.corners + ' / ' + result.awayStats.corners]].map(([label,value]) => <Info key={label} label={label} value={value} />)}</div>
          <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Análise do jogo</p><div className="mt-5 grid gap-3 md:grid-cols-3"><Info label="Eficiência clínica" value={result.analysis.efficiencyText} /><Info label="Destaque" value={result.analysis.standout.name + ' · nota ' + result.analysis.standout.rating.toFixed(1)} /><Info label="Fadiga" value={result.analysis.fatigueText} /></div><div className="mt-4 grid grid-cols-2 gap-3"><Info label="xG" value={result.analysis.homeXg.toFixed(1) + ' / ' + result.analysis.awayXg.toFixed(1)} /><Info label="Resultado" value={result.homeScore + ' × ' + result.awayScore} /></div></div>
          <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Notas dos jogadores</p><div className="mt-5 grid gap-6 md:grid-cols-2">{([['home', matchTeams.home], ['away', matchTeams.away]] as const).map(([team, teamName]) => <div key={team}><p className="mb-3 text-sm font-bold">{teamName}</p><div className="space-y-2">{result.playerRatings.filter(p => p.team === team).sort((a,b) => b.rating-a.rating).map(player => <div key={player.playerId} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><p className="text-sm font-semibold">{player.name}</p><p className="text-xs text-white/30">{player.position}{player.goals ? ' · ' + player.goals + 'G' : ''}{player.assists ? ' · ' + player.assists + 'A' : ''}</p></div><span className="text-sm font-bold text-emerald-300">{player.rating.toFixed(1)}</span></div>)}</div></div>)}</div></div>
          <button onClick={showRoundResults} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-5 py-3.5 text-sm font-bold text-white/70 hover:text-white">Resultados da rodada <ArrowRight size={16} /></button>
        </section>}

        {postgameTab === 'round' && <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Rodada {fixture.round}</p><h2 className="mt-2 text-2xl font-bold">Resultados da rodada</h2></div><Trophy size={22} className="text-emerald-300/50" /></div>{loadingRound ? <p className="mt-8 text-center text-sm text-white/35">Carregando resultados...</p> : <div className="mt-5 space-y-2">{roundResults.map(item => <div key={item.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${item.id === fixture.id ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-white/5 bg-black/10'}`}><div className="min-w-0 text-sm font-semibold"><p className="truncate">{item.home_club?.short_name ?? 'Casa'} <span className="px-2 text-white/20">×</span> {item.away_club?.short_name ?? 'Fora'}</p></div><span className="shrink-0 text-sm font-bold">{item.home_score ?? 0} × {item.away_score ?? 0}</span></div>)}</div>}</section>}
      </section>}

      {phase === 'postgame' && <button onClick={() => {
        const ratings = result?.playerRatings.filter(player => player.team === 'home' || player.team === 'away') ?? []
        const homeNext = applyMatchFatigue(homePlayers, ratings.filter(player => player.team === 'home'))
        const awayNext = applyMatchFatigue(awayPlayers, ratings.filter(player => player.team === 'away'))
        localStorage.setItem(TRAINING_KEY, JSON.stringify({
          ...JSON.parse(localStorage.getItem(TRAINING_KEY) ?? '{}'),
          players: Object.fromEntries([...homeNext, ...awayNext].map(player => [player.id, player])),
          lastMatchId: fixture.id,
          lastMatchAt: new Date().toISOString(),
        }))
        if (result) back(result)
      }} className="mt-6 flex items-center gap-2 text-sm font-semibold text-emerald-300"><ArrowLeft size={16} /> Voltar ao clube</button>}
    </section>
  </main>
}function Action({ title, text, icon }: { title: string; text: string; icon: ReactNode }) { return <button className="flex items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.025] p-5 text-left hover:border-white/12"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/8 text-emerald-300">{icon}</div><div><p className="font-semibold">{title}</p><p className="mt-1 text-xs text-white/30">{text}</p></div><ChevronRight className="ml-auto text-white/20" size={18} /></button> }
function DashboardCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-white/6 bg-white/[0.025] p-5"><div className="flex items-center gap-2 text-white/35">{icon}<span className="text-xs font-semibold uppercase tracking-[0.16em]">{label}</span></div><p className="mt-7 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-white/30">{detail}</p></div> }