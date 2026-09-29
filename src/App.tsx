import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, ChevronRight, CircleUserRound, MapPin, Shield, Trophy } from 'lucide-react'
import { supabase } from './lib/supabase'
import type { Club, ManagerProfile, Screen } from './types/game'

const CAREER_KEY = 'futebol-manager:career'

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
      setLoading(true)
      setError(null)
      const { data, error } = await supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation').order('name')
      if (!active) return
      if (error) setError(error.message)
      else setClubs(data ?? [])
      setLoading(false)
    }
    loadClubs()
    return () => { active = false }
  }, [screen])

  const sortedClubs = useMemo(() => [...clubs].sort((a, b) => b.reputation - a.reputation), [clubs])
  const canContinue = managerName.trim().length >= 2

  function confirmCareer() {
    if (!selectedClub || !canContinue) return
    const next: ManagerProfile = { name: managerName.trim(), nationality, club: selectedClub, season: 'Temporada 2026' }
    localStorage.setItem(CAREER_KEY, JSON.stringify(next))
    setCareer(next)
    setScreen('dashboard')
  }

  function newCareer() {
    localStorage.removeItem(CAREER_KEY)
    setCareer(null)
    setManagerName('')
    setSelectedClub(null)
    setScreen('manager')
  }

  return (
    <div className="min-h-screen bg-[#090b0f] text-white">
      <div className="mx-auto min-h-screen max-w-6xl border-x border-white/5 bg-[#0d1015]">
        {screen === 'home' && <Home career={career} start={() => setScreen('manager')} continueCareer={() => setScreen('dashboard')} newCareer={newCareer} />}
        {screen === 'manager' && <Manager name={managerName} nationality={nationality} canContinue={canContinue} onName={setManagerName} onNationality={setNationality} back={() => setScreen('home')} next={() => setScreen('club')} />}
        {screen === 'club' && <ClubList clubs={sortedClubs} selected={selectedClub} loading={loading} error={error} select={setSelectedClub} back={() => setScreen('manager')} confirm={confirmCareer} />}
        {screen === 'dashboard' && career && <Dashboard career={career} newCareer={newCareer} />}
      </div>
    </div>
  )
}

function Top({ label, back }: { label?: string; back?: () => void }) {
  return <header className="flex h-20 items-center justify-between border-b border-white/6 px-6 md:px-10">
    <button onClick={back} className={back ? 'flex items-center gap-3 text-sm font-semibold text-white/60 hover:text-white' : 'pointer-events-none text-sm font-semibold'}>{back && <ArrowLeft size={18} />} FUTEBOL MANAGER</button>
    {label && <span className="text-xs uppercase tracking-[0.18em] text-white/30">{label}</span>}
  </header>
}

function Home({ career, start, continueCareer, newCareer }: { career: ManagerProfile | null; start: () => void; continueCareer: () => void; newCareer: () => void }) {
  return <main className="relative min-h-screen overflow-hidden">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_20%_80%,rgba(59,130,246,0.08),transparent_30%)]" />
    <div className="relative">
      <Top />
      <section className="flex min-h-[calc(100vh-5rem)] flex-col justify-between px-6 py-12 md:px-16 md:py-16">
        <div className="max-w-3xl pt-8 md:pt-16">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1.5 text-xs font-medium text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> TEMPORADA 2026</div>
          <h1 className="text-5xl font-bold leading-[0.98] tracking-[-0.04em] md:text-7xl">O clube está esperando por você.</h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-white/45 md:text-lg">Monte sua carreira, escolha seu clube e comece a construir sua história no futebol.</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            {career ? <><button onClick={continueCareer} className="flex items-center justify-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300">Continuar carreira <ArrowRight size={17} /></button><button onClick={newCareer} className="rounded-xl border border-white/10 px-6 py-3.5 text-sm font-semibold text-white/70 hover:border-white/20 hover:text-white">Nova carreira</button></> : <button onClick={start} className="flex items-center justify-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300">Começar carreira <ArrowRight size={17} /></button>}
          </div>
        </div>
        <div className="grid max-w-3xl grid-cols-1 gap-3 pt-16 sm:grid-cols-3">
          <Feature icon={<CircleUserRound size={18} />} title="Seu treinador" text="Você decide o caminho." />
          <Feature icon={<Shield size={18} />} title="Seu clube" text="Escolha onde começar." />
          <Feature icon={<Trophy size={18} />} title="Sua história" text="Cada temporada conta." />
        </div>
      </section>
    </div>
  </main>
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-white/6 bg-white/[0.025] p-4"><div className="mb-8 flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-white/55">{icon}</div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-white/35">{text}</p></div>
}

function Manager({ name, nationality, canContinue, onName, onNationality, back, next }: { name: string; nationality: string; canContinue: boolean; onName: (v: string) => void; onNationality: (v: string) => void; back: () => void; next: () => void }) {
  return <main className="min-h-screen"><Top label="NOVA CARREIRA" back={back} /><section className="mx-auto flex max-w-2xl flex-col px-6 py-16 md:px-10">
    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/70">01 / 02</span><h1 className="mt-4 text-4xl font-bold tracking-[-0.03em] md:text-5xl">Quem vai comandar?</h1><p className="mt-4 max-w-lg leading-7 text-white/45">Comece definindo o treinador que vai escrever essa carreira.</p>
    <div className="mt-12 space-y-7">
      <Field label="Nome do treinador"><input autoFocus value={name} onChange={e => onName(e.target.value)} onKeyDown={e => e.key === 'Enter' && canContinue && next()} placeholder="Ex.: Jeferson Rocha" className="w-full border-b border-white/10 bg-transparent py-3 text-xl outline-none placeholder:text-white/20 focus:border-emerald-400" /></Field>
      <Field label="Nacionalidade"><select value={nationality} onChange={e => onNationality(e.target.value)} className="w-full border-b border-white/10 bg-transparent py-3 text-base outline-none focus:border-emerald-400"><option>Brasil</option><option>Argentina</option><option>Portugal</option><option>Uruguai</option></select></Field>
    </div>
    <button disabled={!canContinue} onClick={next} className="mt-14 flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-400 px-6 py-4 text-sm font-bold text-[#06100c] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-30">Escolher meu clube <ArrowRight size={17} /></button>
  </section></main>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">{label}</span><div className="mt-2">{children}</div></label>
}

function ClubList({ clubs, selected, loading, error, select, back, confirm }: { clubs: Club[]; selected: Club | null; loading: boolean; error: string | null; select: (club: Club) => void; back: () => void; confirm: () => void }) {
  return <main className="min-h-screen"><Top label="ESCOLHA SEU CLUBE" back={back} /><section className="mx-auto max-w-5xl px-6 py-12 md:px-10">
    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/70">02 / 02</span><h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">Onde começa sua história?</h1><p className="mt-4 max-w-xl leading-7 text-white/45">Escolha um dos clubes disponíveis para iniciar a temporada 2026.</p>
    {selected && <div className="mt-6 inline-block rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-3 text-sm"><span className="text-white/35">Selecionado</span><p className="font-semibold text-emerald-300">{selected.name}</p></div>}
    {loading && <div className="py-20 text-center text-sm text-white/35">Carregando clubes...</div>}
    {error && <div className="mt-10 rounded-xl border border-red-400/15 bg-red-400/5 p-5 text-sm text-red-200">Não foi possível carregar os clubes. {error}</div>}
    {!loading && !error && <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{clubs.map(club => <button key={club.id} onClick={() => select(club)} className={`group rounded-2xl border p-5 text-left transition ${selected?.id === club.id ? 'border-emerald-400/50 bg-emerald-400/8' : 'border-white/6 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.045]'}`}>
      <div className="flex items-start justify-between"><div className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold ${selected?.id === club.id ? 'bg-emerald-400 text-[#06100c]' : 'bg-white/6 text-white/50'}`}>{club.short_name.slice(0, 3)}</div><ChevronRight size={17} className="text-white/15 group-hover:text-white/45" /></div>
      <h2 className="mt-5 font-semibold">{club.name}</h2><div className="mt-2 flex items-center gap-2 text-xs text-white/35"><MapPin size={13} />{club.city}</div>
      <div className="mt-5 flex items-center justify-between border-t border-white/6 pt-4 text-xs"><span className="text-white/30">Orçamento</span><span className="font-semibold text-white/60">{money(club.budget)}</span></div>
    </button>)}</div>}
    <div className="mt-10 flex justify-end"><button disabled={!selected} onClick={confirm} className="flex items-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-30">Assumir o clube <ArrowRight size={17} /></button></div>
  </section></main>
}

function Dashboard({ career, newCareer }: { career: ManagerProfile; newCareer: () => void }) {
  return <main className="min-h-screen"><Top label={career.season} /><section className="px-6 py-8 md:px-10">
    <div className="flex flex-col justify-between gap-6 border-b border-white/6 pb-8 md:flex-row md:items-end"><div><p className="text-sm text-white/35">Bom trabalho, {career.name}.</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">{career.club.name}</h1><div className="mt-3 flex items-center gap-2 text-sm text-white/35"><MapPin size={15} />{career.club.city} · Liga Nacional</div></div><button onClick={newCareer} className="rounded-lg border border-white/8 px-4 py-2.5 text-xs font-semibold text-white/55 hover:border-white/15 hover:text-white">Nova carreira</button></div>
    <div className="mt-8 grid gap-4 md:grid-cols-3"><DashboardCard icon={<Shield size={18} />} label="Clube" value={career.club.short_name} detail={`Reputação ${career.club.reputation}/100`} /><DashboardCard icon={<BriefcaseBusiness size={18} />} label="Orçamento" value={money(career.club.budget)} detail="Disponível para a temporada" /><DashboardCard icon={<Building2 size={18} />} label="Próximo passo" value="Preparar elenco" detail="O mercado e os treinos vêm a seguir" /></div>
    <div className="mt-8 rounded-2xl border border-white/6 bg-white/[0.02] p-6 md:p-8"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Sua primeira semana</p><h2 className="mt-2 text-2xl font-bold">A temporada começou.</h2></div><Trophy className="text-emerald-300/50" size={24} /></div><div className="mt-8 grid gap-3 sm:grid-cols-3">{['Conhecer o elenco', 'Definir a formação', 'Preparar o próximo jogo'].map((item, i) => <div key={item} className="rounded-xl border border-white/6 bg-black/10 p-4"><span className="text-xs text-white/25">0{i + 1}</span><p className="mt-5 text-sm font-semibold">{item}</p><p className="mt-1 text-xs text-white/30">Em breve</p></div>)}</div></div>
  </section></main>
}

function DashboardCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-white/6 bg-white/[0.025] p-5"><div className="flex items-center gap-2 text-white/35">{icon}<span className="text-xs font-semibold uppercase tracking-[0.16em]">{label}</span></div><p className="mt-7 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-white/30">{detail}</p></div>
}
