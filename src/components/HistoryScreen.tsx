import { ArrowLeft, Crown, Medal, Trophy } from 'lucide-react'
import type { Club, Player } from '../types/game'

type HistoryRow = {
  season_id: string
  season_name: string
  competition_name: string
  champion_club_id: string | null
  runner_up_club_id: string | null
  top_scorer_player_id: string | null
  top_scorer_goals: number
}

export default function HistoryScreen({
  rows,
  clubs,
  players,
  back,
}: {
  rows: HistoryRow[]
  clubs: Club[]
  players: Player[]
  back: () => void
}) {
  const clubName = (id: string | null) => clubs.find(club => club.id === id)?.name ?? '—'
  const playerName = (id: string | null) => {
    const player = players.find(item => item.id === id)
    return player ? player.first_name + ' ' + player.last_name : '—'
  }

  const seasons = [...new Set(rows.map(row => row.season_id))]
    .map(seasonId => ({
      seasonId,
      seasonName: rows.find(row => row.season_id === seasonId)?.season_name ?? seasonId,
      competitions: rows.filter(row => row.season_id === seasonId),
    }))
    .sort((a, b) => b.seasonName.localeCompare(a.seasonName))

  return <main className="min-h-screen">
    <header className="flex h-20 items-center justify-between border-b border-white/6 px-5 sm:px-8">
      <button onClick={back} className="flex items-center gap-2 text-sm font-semibold text-white/55 hover:text-white"><ArrowLeft size={17} /> Voltar</button>
      <span className="label-mono text-white/25">História</span>
    </header>
    <section className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <p className="label-mono text-emerald-300/65">Memória do mundo</p>
      <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Histórico de temporadas</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">Campeões, vice-campeões e artilheiros ficam registrados mesmo quando uma nova temporada começa.</p>

      <div className="mt-8 space-y-5">
        {seasons.length ? seasons.map(season => <section key={season.seasonId} className="game-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold">{season.seasonName}</h2>
            <span className="text-xs text-white/25">{season.competitions.length} competições</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {season.competitions.map(row => <article key={row.competition_name} className="rounded-xl border border-white/5 bg-black/10 p-4">
              <p className="label-mono text-white/30">{row.competition_name}</p>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300"><Crown size={17} /></div>
                <div><p className="text-xs text-white/30">Campeão</p><p className="font-semibold">{clubName(row.champion_club_id)}</p></div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-white/35"><Trophy size={17} /></div>
                <div><p className="text-xs text-white/30">Vice-campeão</p><p className="font-semibold">{clubName(row.runner_up_club_id)}</p></div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><Medal size={17} /></div>
                <div><p className="text-xs text-white/30">Artilheiro</p><p className="font-semibold">{playerName(row.top_scorer_player_id)} <span className="font-normal text-white/30">· {row.top_scorer_goals} gols</span></p></div>
              </div>
            </article>)}
          </div>
        </section>) : <section className="game-panel"><p className="text-sm text-white/40">Ainda não há temporadas encerradas.</p></section>}
      </div>
    </section>
  </main>
}
