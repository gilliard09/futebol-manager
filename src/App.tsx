import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Banknote, CalendarDays, ChevronRight, CircleUserRound, Dumbbell, MapPin, Shield, ShoppingBag, Trophy, Users, Handshake } from 'lucide-react'
import { supabase } from './lib/supabase'
import type { Club, Fixture, Formation, LineupPlayer, ManagerProfile, Player, Screen } from './types/game'
import { playerOverall, type MatchResult } from './engine/match'
import type { PlayedMatch } from './types/game'
import PlayerProfile from './components/PlayerProfile'
import TransferMarket from './components/TransferMarket'
import LoanMarket from './components/LoanMarket'
import CompetitionCenter from './components/CompetitionCenter'
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
  const [view, setView] = useState<'overview' | 'squad' | 'tactics' | 'match' | 'training' | 'market' | 'loans' | 'competitions'>('overview')
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
      const [squadResult, fixtureResult, tableResult, clubsResult, salaryResult] = await Promise.all([
        supabase.from('club_players').select('club_id,squad_number, players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale)').order('squad_number'),        supabase.from('fixtures').select('id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,home_club:clubs!fixtures_home_club_id_fkey(name,short_name,city,stadium,logo_url),away_club:clubs!fixtures_away_club_id_fkey(name,short_name,city,stadium,logo_url),competitions(name)').or(`home_club_id.eq.${career.club.id},away_club_id.eq.${career.club.id}`).eq('status','scheduled').order('scheduled_at'),
        supabase.from('fixtures').select('id,competition_id,home_club_id,away_club_id,home_score,away_score,status,competitions!inner(name)').eq('status','completed').eq('competitions.name','Liga Nacional do Brasil'),
        supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation,stadium,logo_url').order('name'),
        supabase.from('club_players').select('player_id,club_id,salary,contract_until,players!inner(first_name,last_name)').order('player_id'),
      ])
      if (!active) return
      if (!squadResult.error) {
        const loaded = (squadResult.data ?? []).filter((row: any) => (getLoanClubId(row.club_id, row.players?.id ?? row.players?.[0]?.id, clock?.currentDate ?? SEASON_START, transferState.playerClubOverrides, loanState) === career.club.id)).map(normalizePlayer)
        try {
          const saved = JSON.parse(localStorage.getItem(TRAINING_KEY) ?? '{}')
          let restored = loaded.map((player: Player) => saved.players?.[player.id] ? { ...player, ...saved.players[player.id] } : player)
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

    const [{ data: clubRows }, { data: playerRows }] = await Promise.all([
      supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation,stadium,logo_url,strength').order('name'),
      supabase.from('club_players').select('id,club_id,squad_number,contract_until,salary,market_value,players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale)'),
    ])

    if (!clubRows?.length || !playerRows?.length) return null

    const worldClubs = clubRows.map((club: any) => ({
      ...club,
      budget: Number(club.budget ?? 0),
      strength: Number(club.strength ?? club.reputation ?? 60),
    })) as WorldClub[]

    const playersForWorld = (playerRows as any[]).map(row => {
      const player = Array.isArray(row.players) ? row.players[0] : row.players
      return {
        ...player,
        clubId: row.club_id,
        marketValue: Number(row.market_value ?? 0),
        salary: Number(row.salary ?? 0),
        contractUntil: row.contract_until ?? null,
        clubPlayerId: row.id,
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

  async function simulateOtherClubs(nextDate: string) {
    const state = await loadWorldState()
    if (!state) return
    const result = simulateWorldDay(nextDate, state.seasonId, state.worldClubs, state.playersForWorld, career.club.id, state.performanceByClub)
    await persistWorldState(state.seasonId, state.worldClubs, state.playersForWorld, [result])
  }

  async function simulateWorldUntilMatch(startDate: string, targetDate: string) {
    const state = await loadWorldState()
    if (!state) return { date: startDate, event: null as ImportantEvent | null }

    const results: WorldSimulationResult[] = []
    let currentDate = startDate
    let event: ImportantEvent | null = null

    while (currentDate < targetDate) {
      currentDate = advanceSeasonDay({ currentDate, seasonStart: startDate }).currentDate
      const result = simulateWorldDay(currentDate, state.seasonId, state.worldClubs, state.playersForWorld, career.club.id, state.performanceByClub)
      results.push(result)
      const offer = result.offers[0]
      if (offer) {
        event = { type: 'player_offer', date: result.date, ...offer }
        break
      }
      const importantEvent = maybeCreateImportantEvent(result.date, state.performanceByClub)
      if (importantEvent) {
        event = importantEvent
        break
      }
    }

    await persistWorldState(state.seasonId, state.worldClubs, state.playersForWorld, results)
    return { date: event?.date ?? targetDate, event }
  }

  type ImportantEvent =
    | { type: 'player_offer'; date: string; playerId: string; fromClubId: string; toClubId: string; fee: number }
    | { type: 'board_message'; date: string; title: string; message: string; tone: 'positive' | 'warning' }
    | { type: 'player_message'; date: string; playerId: string; title: string; message: string }
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
        .sort((a, b) => a.morale - b.morale || a.form - b.form)[0]
      if (concerned && eventHash(date + ':player:' + concerned.id) % 100 < 28) {
        const reason = concerned.morale <= 48
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