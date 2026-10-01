import { ArrowLeft, Crown, Trophy } from 'lucide-react'

type TrophyRow = {
  id: string
  season_name: string
  competition_name: string
  club_name: string
}

export default function TrophyRoomScreen({
  trophies,
  back,
}: {
  trophies: TrophyRow[]
  back: () => void
}) {
  return <main className="min-h-screen bg-[#0a0f1a] px-4 py-6 sm:px-6 lg:px-8">
    <button onClick={back} className="mb-6 flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white"><ArrowLeft size={15} /> Voltar</button>
    <div className="mb-7">
      <p className="label-mono text-amber-300/65">Legado permanente</p>
      <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Sala de Troféus</h1>
      <p className="mt-2 text-sm text-white/40">Títulos conquistados pelo treinador permanecem registrados entre as temporadas.</p>
    </div>
    {trophies.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{trophies.map(trophy => <article key={trophy.id} className="game-panel">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-200"><Crown size={26} /></div>
      <p className="mt-5 label-mono text-amber-200/55">{trophy.season_name}</p>
      <h2 className="mt-2 text-lg font-bold">{trophy.competition_name}</h2>
      <p className="mt-2 text-xs text-white/35">{trophy.club_name}</p>
    </article>)}</div> : <section className="game-panel"><Trophy size={24} className="text-white/25" /><p className="mt-4 text-sm text-white/35">Nenhum troféu conquistado ainda. A primeira taça ficará registrada aqui.</p></section>}
  </main>
}