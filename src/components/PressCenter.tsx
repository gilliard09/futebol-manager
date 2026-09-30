import { useState } from 'react'
import { ArrowLeft, Newspaper } from 'lucide-react'
import type { Club } from '../types/game'
import type { WorldNews } from '../engine/worldNews'

type PressCenterProps = {
  club: Club
  news: WorldNews[]
  back: () => void
}

const categoryLabel: Record<WorldNews['category'], string> = {
  match: 'Resultados',
  market: 'Mercado',
  squad: 'Elenco',
  academy: 'Base',
  career: 'Carreira',
  club: 'Clubes',
}

export default function PressCenter({ club, news, back }: PressCenterProps) {
  const [filter, setFilter] = useState<'all' | 'career' | WorldNews['category']>('all')

  const scored = news.map(item => {
    const careerRelevant = item.message.includes(club.name) || item.message.includes(club.short_name) || item.title.startsWith('Seu clube')
    return { item, careerRelevant, score: item.priority + (careerRelevant ? 35 : 0) }
  })

  const filtered = scored
    .filter(({ item, careerRelevant }) => {
      if (filter === 'all') return true
      if (filter === 'career') return careerRelevant
      return item.category === filter
    })
    .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date) || b.item.id.localeCompare(a.item.id))

  const featured = filtered[0]
  const rest = filtered.slice(1)

  return <main className="min-h-screen">
    <header className="flex h-20 items-center justify-between border-b border-white/6 px-6 md:px-10">
      <button onClick={back} className="flex items-center gap-3 text-sm font-semibold text-white/60 hover:text-white">
        <ArrowLeft size={18} /> VOLTAR AO CLUBE
      </button>
      <span className="text-xs uppercase tracking-[0.18em] text-white/30">IMPRENSA</span>
    </header>

    <section className="px-6 py-8 md:px-10">
      <div className="flex flex-col justify-between gap-6 border-b border-white/6 pb-8 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/60">Central de notícias</p>
          <h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">Imprensa do futebol</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/35">
            O que acontece no futebol durante a sua temporada. Notícias do seu clube ganham destaque, mas o mundo continua se movimentando ao redor.
          </p>
        </div>
        <Newspaper size={30} className="text-white/20" />
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {([
          ['all', 'Todas'],
          ['career', 'Sua carreira'],
          ['club', 'Clubes'],
          ['match', 'Resultados'],
          ['market', 'Mercado'],
          ['academy', 'Base'],
          ['squad', 'Elenco'],
          ['career', 'Carreira'],
        ] as Array<[typeof filter, string]>).filter((entry, index, list) => list.findIndex(item => item[0] === entry[0]) === index).map(([value, label]) =>
          <button key={value} onClick={() => setFilter(value)} className={`shrink-0 rounded-lg px-4 py-2.5 text-xs font-bold ${filter === value ? 'bg-emerald-400 text-[#06100c]' : 'border border-white/7 bg-white/[0.02] text-white/40 hover:text-white'}`}>
            {label}
          </button>
        )}
      </div>

      {!filtered.length ? <section className="mt-6 rounded-2xl border border-white/6 bg-white/[0.02] p-10 text-center">
        <Newspaper size={28} className="mx-auto text-white/15" />
        <h2 className="mt-4 text-lg font-bold">Nenhuma notícia nesta seção</h2>
        <p className="mt-2 text-sm text-white/30">As histórias aparecem conforme a temporada avança.</p>
      </section> : <>
        {featured && <section className={`mt-6 rounded-3xl border p-6 md:p-8 ${featured.item.tone === 'warning' ? 'border-amber-400/20 bg-amber-400/[0.04]' : featured.item.tone === 'positive' ? 'border-emerald-400/20 bg-emerald-400/[0.04]' : 'border-white/8 bg-white/[0.025]'}`}>
          <div className="flex items-center justify-between gap-4">
            <span className="rounded-full border border-white/8 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">
              {featured.careerRelevant ? 'Sua carreira' : categoryLabel[featured.item.category]}
            </span>
            <span className="text-xs text-white/25">{featured.item.date}</span>
          </div>
          <h2 className="mt-5 max-w-3xl text-2xl font-bold leading-tight md:text-3xl">{featured.item.title}</h2>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-white/45">{featured.item.message}</p>
        </section>}

        <section className="mt-4 grid gap-3 md:grid-cols-2">
          {rest.map(({ item, careerRelevant }) => <article key={item.id} className={`rounded-2xl border p-5 ${careerRelevant ? 'border-emerald-400/15 bg-emerald-400/[0.025]' : 'border-white/6 bg-white/[0.02]'}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/25">{careerRelevant ? 'Sua carreira' : categoryLabel[item.category]}</span>
              <span className="text-[10px] text-white/20">{item.date}</span>
            </div>
            <h3 className="mt-3 text-base font-bold leading-5">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/40">{item.message}</p>
          </article>)}
        </section>
      </>}
    </section>
  </main>
}
