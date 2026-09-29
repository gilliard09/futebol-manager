import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Banknote, CalendarDays, ChevronRight, CircleUserRound, Dumbbell, MapPin, Shield, Trophy, Users } from 'lucide-react'
import { supabase } from './lib/supabase'
import type { Club, Fixture, ManagerProfile, Player, Screen } from './types/game'
import type { MatchResult } from './engine/match'

const CAREER_KEY = 'futebol-manager:career'
const MATCHES_KEY = 'futebol-manager:matches'
const TACTIC_KEY = 'futebol-manager:tactic'

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [clubs, setClubs] = useState<Club[]>([])
  const [managerName, setManagerName] = useState('')
  const [nationality, setNationality] = useState('Brasil')
  const [selectedClub, setSelectedClub] = useState<Club | null>(null)
  const [career, setCareer] = useState<ManagerProfile | null>(() => {
    const saved = localStorage.getItem(CAREER_KEY)
    return saved ? JSON.parse(saved) : null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (screen !== 'club') return
    let active = true
    async function loadClubs() {
      setLoading(true); setError(null)
      const { data, error } = await supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation').order('name')
      if (!active) return
      if (error) setError(error.message); else setClubs(data ?? [])
      setLoading(false)
    }
    loadClubs()
    return () => { active = false }
  }, [screen])

  const canContinue = managerName.trim().length >= 2

  function confirmCareer() {
    if (!selectedClub || !canContinue) return
    const next: ManagerProfile = { name: managerName.trim(), nationality, club: selectedClub, season: 'Temporada 2026' }
    localStorage.setItem(CAREER_KEY, JSON.stringify(next)); setCareer(next); setScreen('dashboard')
  }

  function newCareer() {
    localStorage.removeItem(CAREER_KEY); setCareer(null); setManagerName(''); setSelectedClub(null); setScreen('manager')
  }

  return <div className="min-h-screen bg-[#090b0f] text-white"><div className="mx-auto min-h-screen max-w-6xl border-x border-white/5 bg-[#0d1015]">
    {screen === 'home' && <Home career={career} start={() => setScreen('manager')} continueCareer={() => setScreen('dashboard')} newCareer={newCareer} />}
    {screen === 'manager' && <Manager name={managerName} nationality={nationality} canContinue={canContinue} onName={setManagerName} onNationality={setNationality} back={() => setScreen('home')} next={() => setScreen('club')} />}
    {screen === 'club' && <ClubList clubs={clubs} selected={selectedClub} loading={loading} error={error} select={setSelectedClub} back={() => setScreen('manager')} confirm={confirmCareer} />}
    {screen === 'dashboard' && career && <Dashboard career={career} clubs={clubs} newCareer={newCareer} />}
  </div></div>
}

function Top({ label, back }: { label?: string; back?: () => void }) {
  return <header className="flex h-20 items-center justify-between border-b border-white/6 px-6 md:px-10"><button onClick={back} className={back ? 'flex items-center gap-3 text-sm font-semibold text-white/60 hover:text-white' : 'pointer-events-none text-sm font-semibold'}>{back && <ArrowLeft size={18} />} FUTEBOL MANAGER</button>{label && <span className="text-xs uppercase tracking-[0.18em] text-white/30">{label}</span>}</header>
}

function Home({ career, start, continueCareer, newCareer }: { career: ManagerProfile | null; start: () => void; continueCareer: () => void; newCareer: () => void }) {
  return <main className="relative min-h-screen overflow-hidden"><div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_20%_80%,rgba(59,130,246,0.08),transparent_30%)]" /><div className="relative"><Top /><section className="flex min-h-[calc(100vh-5rem)] flex-col justify-between px-6 py-12 md:px-16 md:py-16"><div className="max-w-3xl pt-8 md:pt-16"><div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1.5 text-xs font-medium text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> TEMPORADA 2026</div><h1 className="text-5xl font-bold leading-[0.98] tracking-[-0.04em] md:text-7xl">O clube está esperando por você.</h1><p className="mt-7 max-w-xl text-base leading-7 text-white/45 md:text-lg">Monte sua carreira, escolha seu clube e comece a construir sua história no futebol.</p><div className="mt-10 flex flex-col gap-3 sm:flex-row">{career ? <><button onClick={continueCareer} className="flex items-center justify-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300">Continuar carreira <ArrowRight size={17} /></button><button onClick={newCareer} className="rounded-xl border border-white/10 px-6 py-3.5 text-sm font-semibold text-white/70 hover:border-white/20 hover:text-white">Nova carreira</button></> : <button onClick={start} className="flex items-center justify-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300">Começar carreira <ArrowRight size={17} /></button>}</div></div><div className="grid max-w-3xl grid-cols-1 gap-3 pt-16 sm:grid-cols-3"><Feature icon={<CircleUserRound size={18} />} title="Seu treinador" text="Você decide o caminho." /><Feature icon={<Shield size={18} />} title="Seu clube" text="Escolha onde começar." /><Feature icon={<Trophy size={18} />} title="Sua história" text="Cada temporada conta." /></div></section></div></main>
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="rounded-2xl border border-white/6 bg-white/[0.025] p-4"><div className="mb-8 flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-white/55">{icon}</div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-white/35">{text}</p></div> }

function Manager({ name, nationality, canContinue, onName, onNationality, back, next }: { name: string; nationality: string; canContinue: boolean; onName: (v: string) => void; onNationality: (v: string) => void; back: () => void; next: () => void }) {
  return <main className="min-h-screen"><Top label="NOVA CARREIRA" back={back} /><section className="mx-auto flex max-w-2xl flex-col px-6 py-16 md:px-10"><span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/70">01 / 02</span><h1 className="mt-4 text-4xl font-bold tracking-[-0.03em] md:text-5xl">Quem vai comandar?</h1><p className="mt-4 max-w-lg leading-7 text-white/45">Comece definindo o treinador que vai escrever essa carreira.</p><div className="mt-12 space-y-7"><Field label="Nome do treinador"><input autoFocus value={name} onChange={e => onName(e.target.value)} onKeyDown={e => e.key === 'Enter' && canContinue && next()} placeholder="Ex.: Jeferson Rocha" className="w-full border-b border-white/10 bg-transparent py-3 text-xl outline-none placeholder:text-white/20 focus:border-emerald-400" /></Field><Field label="Nacionalidade"><select value={nationality} onChange={e => onNationality(e.target.value)} className="w-full border-b border-white/10 bg-transparent py-3 text-base outline-none focus:border-emerald-400"><option>Brasil</option><option>Argentina</option><option>Portugal</option><option>Uruguai</option></select></Field></div><button disabled={!canContinue} onClick={next} className="mt-14 flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-400 px-6 py-4 text-sm font-bold text-[#06100c] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-30">Escolher meu clube <ArrowRight size={17} /></button></section></main>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">{label}</span><div className="mt-2">{children}</div></label> }

function ClubList({ clubs, selected, loading, error, select, back, confirm }: { clubs: Club[]; selected: Club | null; loading: boolean; error: string | null; select: (club: Club) => void; back: () => void; confirm: () => void }) {
  return <main className="min-h-screen"><Top label="ESCOLHA SEU CLUBE" back={back} /><section className="mx-auto max-w-5xl px-6 py-12 md:px-10"><span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/70">02 / 02</span><h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">Onde começa sua história?</h1><p className="mt-4 max-w-xl leading-7 text-white/45">Escolha um dos clubes disponíveis para iniciar a temporada 2026.</p>{selected && <div className="mt-6 inline-block rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-3 text-sm"><span className="text-white/35">Selecionado</span><p className="font-semibold text-emerald-300">{selected.name}</p></div>}{loading && <div className="py-20 text-center text-sm text-white/35">Carregando clubes...</div>}{error && <div className="mt-10 rounded-xl border border-red-400/15 bg-red-400/5 p-5 text-sm text-red-200">Não foi possível carregar os clubes. {error}</div>}{!loading && !error && <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{clubs.map(club => <button key={club.id} onClick={() => select(club)} className={`group rounded-2xl border p-5 text-left transition ${selected?.id === club.id ? 'border-emerald-400/50 bg-emerald-400/8' : 'border-white/6 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.045]'}`}><div className="flex items-start justify-between"><div className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold ${selected?.id === club.id ? 'bg-emerald-400 text-[#06100c]' : 'bg-white/6 text-white/50'}`}>{club.short_name.slice(0, 3)}</div><ChevronRight size={17} className="text-white/15 group-hover:text-white/45" /></div><h2 className="mt-5 font-semibold">{club.name}</h2><div className="mt-2 flex items-center gap-2 text-xs text-white/35"><MapPin size={13} />{club.city}</div><div className="mt-5 flex items-center justify-between border-t border-white/6 pt-4 text-xs"><span className="text-white/30">Orçamento</span><span className="font-semibold text-white/60">{money(club.budget)}</span></div></button>)}</div>}<div className="mt-10 flex justify-end"><button disabled={!selected} onClick={confirm} className="flex items-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-30">Assumir o clube <ArrowRight size={17} /></button></div></section></main>
}

function Dashboard({ career, clubs, newCareer }: { career: ManagerProfile; clubs: Club[]; newCareer: () => void }) {
  const [players, setPlayers] = useState<Player[]>([])
  const [nextFixture, setNextFixture] = useState<Fixture | null>(null)
  const [opponentPlayers, setOpponentPlayers] = useState<Player[]>([])
  const [table, setTable] = useState<{ id: string; name: string; points: number; played: number; gf: number; ga: number }[]>([])
  const [playedMatches, setPlayedMatches] = useState<Record<string, MatchResult>>(() => {
    try { return JSON.parse(localStorage.getItem(MATCHES_KEY) ?? '{}') } catch { return {} }
  })
  const [view, setView] = useState<'overview' | 'squad' | 'tactics' | 'match'>('overview')
  const [selectedStarters, setSelectedStarters] = useState<Player[]>([])
  const [tactic, setTactic] = useState('balanced')
  const [formation, setFormation] = useState('4-3-3')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function loadDashboard() {
      setLoading(true)
      const [squadResult, fixtureResult, tableResult] = await Promise.all([
        supabase.from('club_players').select('squad_number, players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale)').eq('club_id', career.club.id).order('squad_number'),
        supabase.from('fixtures').select('id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,home_club:clubs!fixtures_home_club_id_fkey(name,short_name),away_club:clubs!fixtures_away_club_id_fkey(name,short_name)').or(`home_club_id.eq.${career.club.id},away_club_id.eq.${career.club.id}`).eq('status','scheduled').order('round'),
        supabase.from('fixtures').select('home_club_id,away_club_id,home_score,away_score,status').eq('status','completed'),
      ])
      if (!active) return
      if (!squadResult.error) setPlayers((squadResult.data ?? []).map((row: any) => ({ ...row.players, squad_number: row.squad_number })))
      if (!fixtureResult.error) {
        const availableFixture = (fixtureResult.data ?? []).find((item: any) => !playedMatches[item.id]) as Fixture | undefined
        const fixture = availableFixture ?? null
        setNextFixture(fixture)
        if (fixture) {
          const opponentId = fixture.home_club_id === career.club.id ? fixture.away_club_id : fixture.home_club_id
          const { data: opponentSquad } = await supabase.from('club_players').select('squad_number, players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale)').eq('club_id', opponentId).order('squad_number')
          if (active) setOpponentPlayers((opponentSquad ?? []).map((row: any) => ({ ...row.players, squad_number: row.squad_number })))
        } else {
          setOpponentPlayers([])
        }
      }
      if (!tableResult.error) {
        const stats = new Map<string, { id: string; name: string; points: number; played: number; gf: number; ga: number }>()
        for (const club of clubs) stats.set(club.id, { id: club.id, name: club.short_name, points: 0, played: 0, gf: 0, ga: 0 })
        for (const match of tableResult.data ?? []) {
          if (match.home_score === null || match.away_score === null) continue
          const home = stats.get(match.home_club_id); const away = stats.get(match.away_club_id)
          if (!home || !away) continue
          home.played++; away.played++; home.gf += match.home_score; home.ga += match.away_score; away.gf += match.away_score; away.ga += match.home_score
          if (match.home_score > match.away_score) home.points += 3; else if (match.home_score < match.away_score) away.points += 3; else { home.points++; away.points++ }
        }
        for (const match of Object.values(playedMatches)) {
          const home = stats.get(match.home_club_id)
          const away = stats.get(match.away_club_id)
          if (!home || !away) continue
          home.played++; away.played++; home.gf += match.homeScore; home.ga += match.awayScore; away.gf += match.awayScore; away.ga += match.homeScore
          if (match.homeScore > match.awayScore) home.points += 3; else if (match.homeScore < match.awayScore) away.points += 3; else { home.points++; away.points++ }
        }
        setTable([...stats.values()].sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga)))
      }
      setLoading(false)
    }
    loadDashboard()
    return () => { active = false }
  }, [career.club.id, clubs, playedMatches])

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
  const avg = players.length ? Math.round(players.reduce((sum, p) => sum + (p.position === 'GK' ? p.goalkeeping : (p.pace + p.shooting + p.passing + p.dribbling + p.defending + p.physical + p.mental) / 7), 0) / players.length) : 0

  if (view === 'squad') return <Squad players={players} club={career.club} back={() => setView('overview')} />
  if (view === 'tactics') return <Tactics players={players} club={career.club} back={() => setView('overview')} />
  if (view === 'match' && nextFixture) return <Match formation={formation} fixture={nextFixture} homePlayers={home ? (selectedStarters.length ? selectedStarters : players) : opponentPlayers} awayPlayers={home ? opponentPlayers : (selectedStarters.length ? selectedStarters : players)} tactic={tactic} back={() => setView('overview')} onComplete={(result) => {
    const nextMatches = { ...playedMatches, [nextFixture.id]: { ...result, home_club_id: nextFixture.home_club_id, away_club_id: nextFixture.away_club_id } }
    localStorage.setItem(MATCHES_KEY, JSON.stringify(nextMatches))
    setPlayedMatches(nextMatches)
  }} />


  return <main className="min-h-screen"><Top label={career.season} /><section className="px-6 py-8 md:px-10">
    <div className="flex flex-col justify-between gap-6 border-b border-white/6 pb-8 md:flex-row md:items-end"><div><p className="text-sm text-white/35">Bom trabalho, {career.name}.</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">{career.club.name}</h1><div className="mt-3 flex items-center gap-2 text-sm text-white/35"><MapPin size={15} />{career.club.city} · Liga Nacional</div></div><button onClick={newCareer} className="rounded-lg border border-white/8 px-4 py-2.5 text-xs font-semibold text-white/55 hover:border-white/15 hover:text-white">Nova carreira</button></div>
    {loading ? <div className="py-20 text-center text-sm text-white/35">Preparando seu clube...</div> : <>
      <div className="mt-8 grid gap-4 md:grid-cols-4"><DashboardCard icon={<Users size={18} />} label="Elenco" value={String(players.length)} detail={`média geral ${avg}`} /><DashboardCard icon={<Banknote size={18} />} label="Orçamento" value={money(career.club.budget)} detail="caixa do clube" /><DashboardCard icon={<Trophy size={18} />} label="Posição" value={table.findIndex(t => t.id === career.club.id) >= 0 ? `#${table.findIndex(t => t.id === career.club.id) + 1}` : '—'} detail="Liga Nacional" /><DashboardCard icon={<CalendarDays size={18} />} label="Próximo jogo" value={opponent?.short_name ?? 'A definir'} detail={nextFixture ? (home ? 'Em casa' : 'Fora') : 'Calendário indisponível'} /></div>
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-white/6 bg-white/[0.02] p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Próximo jogo</p><h2 className="mt-2 text-2xl font-bold">{opponent ? (home ? `Seu time × ${opponent.short_name}` : `${opponent.short_name} × Seu time`) : 'Nenhum jogo agendado'}</h2></div><CalendarDays className="text-emerald-300/50" size={24} /></div><div className="mt-8 grid grid-cols-2 gap-3"><Info label="Competição" value="Liga Nacional" /><Info label="Rodada" value={nextFixture ? `Rodada ${nextFixture.round}` : '—'} /></div><button onClick={() => setView('match')} className="mt-6 flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200">Preparar partida <ArrowRight size={16} /></button></section>
        <section className="rounded-2xl border border-white/6 bg-white/[0.02] p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Elenco</p><h2 className="mt-2 text-2xl font-bold">{players.length} jogadores</h2></div><Users className="text-emerald-300/50" size={24} /></div><div className="mt-6 space-y-2">{players.slice(0, 5).map(player => <div key={player.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><p className="text-sm font-semibold">{player.first_name} {player.last_name}</p><p className="text-xs text-white/30">{player.position} · {player.age} anos</p></div><span className="text-xs font-semibold text-white/40">#{player.squad_number}</span></div>)}</div><button onClick={() => setView('squad')} className="mt-5 flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200">Ver elenco completo <ChevronRight size={16} /></button></section>
      </div>
      <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Classificação</p><h2 className="mt-2 text-2xl font-bold">Liga Nacional</h2></div><Trophy className="text-emerald-300/50" size={24} /></div><div className="mt-6 overflow-hidden rounded-xl border border-white/5"><table className="w-full text-left text-sm"><thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-white/25"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Clube</th><th className="px-4 py-3">P</th><th className="px-4 py-3">J</th><th className="px-4 py-3">SG</th></tr></thead><tbody>{table.slice(0, 8).map((team, i) => <tr key={team.id} className={team.id === career.club.id ? 'bg-emerald-400/5' : 'border-t border-white/5'}><td className="px-4 py-3 text-white/35">{i + 1}</td><td className="px-4 py-3 font-medium">{team.name}</td><td className="px-4 py-3 font-bold">{team.points}</td><td className="px-4 py-3 text-white/40">{team.played}</td><td className="px-4 py-3 text-white/40">{team.gf - team.ga}</td></tr>)}</tbody></table></div></section>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><Action title="Treinamento" text="Prepare o elenco para o próximo jogo." icon={<Dumbbell size={20} />} /><button onClick={() => setView('tactics')} className="flex items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.025] p-5 text-left hover:border-white/12"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/8 text-emerald-300"><Shield size={20} /></div><div><p className="font-semibold">Escalação e Táticas</p><p className="mt-1 text-xs text-white/30">Escolha a formação e os 11 titulares.</p></div><ChevronRight className="ml-auto text-white/20" size={18} /></button></div>
    </>}
  </section></main>
}

function Squad({ players, club, back }: { players: Player[]; club: Club; back: () => void }) {
  const [position, setPosition] = useState('ALL')
  const positions = ['ALL', 'GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST']
  const filtered = position === 'ALL' ? players : players.filter(p => p.position === position)
  const overall = (p: Player) => p.position === 'GK' ? p.goalkeeping : Math.round((p.pace + p.shooting + p.passing + p.dribbling + p.defending + p.physical + p.mental) / 7)
  return <main className="min-h-screen"><Top label="ELENCO" back={back} /><section className="px-6 py-8 md:px-10"><div><p className="text-sm text-white/35">{club.name}</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">Elenco</h1><p className="mt-3 text-sm text-white/35">Conheça os jogadores que estão sob seu comando.</p></div><div className="mt-8 flex gap-2 overflow-x-auto pb-2">{positions.map(item => <button key={item} onClick={() => setPosition(item)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${position === item ? 'bg-emerald-400 text-[#06100c]' : 'border border-white/7 bg-white/[0.02] text-white/40 hover:text-white'}`}>{item === 'ALL' ? 'Todos' : item}</button>)}</div><div className="mt-4 overflow-hidden rounded-2xl border border-white/6"><div className="hidden grid-cols-[48px_1.8fr_70px_70px_repeat(5,1fr)] bg-white/[0.03] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/25 md:grid"><span>#</span><span>Jogador</span><span>Pos.</span><span>Idade</span><span>GER</span><span>Forma</span><span>Moral</span><span>Pot.</span><span>Valor</span></div>{filtered.map(player => <div key={player.id} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-t border-white/5 px-4 py-4 md:grid-cols-[48px_1.8fr_70px_70px_repeat(5,1fr)]"><span className="text-xs text-white/25">#{player.squad_number}</span><div><p className="text-sm font-semibold">{player.first_name} {player.last_name}</p><p className="text-xs text-white/30">{player.nationality}</p></div><span className="text-xs font-bold text-emerald-300">{player.position}</span><span className="hidden text-sm text-white/50 md:block">{player.age}</span><span className="hidden text-sm font-bold md:block">{overall(player)}</span><span className="hidden text-sm text-white/45 md:block">{player.form}</span><span className="hidden text-sm text-white/45 md:block">{player.morale}</span><span className="hidden text-sm text-white/45 md:block">{player.potential}</span><span className="hidden text-sm text-white/45 md:block">—</span></div>)}</div><p className="mt-4 text-xs text-white/25">{filtered.length} jogadores exibidos.</p></section></main>
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
        <div className="grid gap-2">{selected.map(({position,index,player}) => <div key={index} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/10 p-3"><span className="w-10 text-xs font-bold text-emerald-300">{position}</span><select value={player?.id ?? ''} onChange={e => { const next={...lineup}; if(e.target.value) next[index]=e.target.value; else delete next[index]; setLineup(next); localStorage.setItem(TACTIC_KEY,JSON.stringify({formation,lineup:next})) }} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"><option value="">Escolher jogador</option>{players.filter(p => !Object.values(lineup).includes(p.id) || p.id === player?.id).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} · {overall(p)}</option>)}</select></div>)}</div>
      </section>
      <section className="rounded-2xl border border-white/6 bg-white/[0.02] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Banco</p><p className="mt-2 text-lg font-bold">{Math.max(0, players.length - starters)} jogadores</p></div><Users size={20} className="text-white/25" /></div><div className="mt-5 space-y-2">{players.filter(p => !Object.values(lineup).includes(p.id)).map(p => <div key={p.id} className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-3"><div><p className="text-sm font-semibold">{p.first_name} {p.last_name}</p><p className="text-xs text-white/30">{p.position} · {p.age} anos</p></div><span className="text-xs font-bold text-white/35">{overall(p)}</span></div>)}</div></section>
    </div>
    <div className="mt-6 rounded-xl border border-emerald-400/10 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-200/70">Sua escalação fica salva nesta carreira e será usada pelo motor da próxima partida.</div>
  </section></main>
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/5 bg-black/10 p-4"><p className="text-xs text-white/25">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div> }

function Match({ fixture, homePlayers, awayPlayers, tactic, formation, back, onComplete }: { fixture: Fixture; homePlayers: Player[]; awayPlayers: Player[]; tactic: string; formation: string; back: () => void; onComplete: (result: MatchResult) => void }) {
  const [result, setResult] = useState<{ homeScore: number; awayScore: number; events: import('./engine/match').MatchEvent[] } | null>(null)
  const [simulating, setSimulating] = useState(false)

  async function simulate() {
    setSimulating(true)
    const { simulateMatch } = await import('./engine/match')
    await new Promise(resolve => setTimeout(resolve, 500))
    setResult(simulateMatch(fixture, homePlayers, awayPlayers, tactic, formation))
    setSimulating(false)
  }

  return <main className="min-h-screen">
    <Top label="PARTIDA" back={back} />
    <section className="mx-auto max-w-3xl px-6 py-12 md:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/70">Liga Nacional · Rodada {fixture.round}</p>
      <div className="mt-10 rounded-3xl border border-white/6 bg-white/[0.02] p-6 md:p-10">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
          <div><p className="text-lg font-bold">{fixture.home_club?.name ?? 'Mandante'}</p><p className="mt-2 text-xs text-white/30">CASA</p></div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/25">×</div>
          <div><p className="text-lg font-bold">{fixture.away_club?.name ?? 'Visitante'}</p><p className="mt-2 text-xs text-white/30">FORA</p></div>
        </div>
        {result && <div className="mt-10 border-t border-white/6 pt-8 text-center"><p className="text-6xl font-bold tracking-tight">{result.homeScore} <span className="text-white/20">×</span> {result.awayScore}</p><p className="mt-3 text-sm text-white/35">Partida encerrada</p></div>}
        {!result && <button onClick={simulate} disabled={simulating} className="mx-auto mt-10 flex items-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] disabled:opacity-40">{simulating ? 'Simulando...' : 'Simular partida'} <ArrowRight size={17} /></button>}
      </div>
      {result && <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Lance a lance</p>
        <div className="mt-5 space-y-2">
          {result.events.length ? result.events.map((event, index) => <div key={index} className="flex items-center gap-4 rounded-xl border border-white/5 bg-black/10 px-4 py-3"><span className="w-8 text-xs font-bold text-white/25">{event.minute}'</span><div><p className="text-sm font-semibold">{event.player}</p><p className="text-xs text-white/35">{event.text}</p></div></div>) : <p className="text-sm text-white/35">Nenhum gol na partida.</p>}
        </div>
      </section>}
      {result && <button onClick={back} className="mt-6 flex items-center gap-2 text-sm font-semibold text-emerald-300"><ArrowLeft size={16} /> Voltar ao clube</button>}
    </section>
  </main>
}

function Action({ title, text, icon }: { title: string; text: string; icon: ReactNode }) { return <button className="flex items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.025] p-5 text-left hover:border-white/12"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/8 text-emerald-300">{icon}</div><div><p className="font-semibold">{title}</p><p className="mt-1 text-xs text-white/30">{text}</p></div><ChevronRight className="ml-auto text-white/20" size={18} /></button> }
function DashboardCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-white/6 bg-white/[0.025] p-5"><div className="flex items-center gap-2 text-white/35">{icon}<span className="text-xs font-semibold uppercase tracking-[0.16em]">{label}</span></div><p className="mt-7 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-white/30">{detail}</p></div> }
