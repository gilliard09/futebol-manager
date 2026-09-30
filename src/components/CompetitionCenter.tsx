import { useEffect, useMemo, useState } from 'react'
import { Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Club, Fixture, PlayedMatch } from '../types/game'
import { buildStandings, getCompetitionStageLabel, BRAZIL_CUP_RULES, BRAZIL_LEAGUE_RULES } from '../engine/competitions'
import { buildPlayerCompetitionStats } from '../engine/competitionStats'

function normalizeFixture(row: any): Fixture {
  return {
    id: row.id, competition_id: row.competition_id, round: Number(row.round), scheduled_at: row.scheduled_at,
    status: row.status, home_club_id: row.home_club_id, away_club_id: row.away_club_id,
    home_score: row.home_score, away_score: row.away_score,
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

export default function CompetitionCenter({ clubs, currentClubId, playedMatches, back }: {
  clubs: Club[]
  currentClubId: string
  playedMatches: PlayedMatch[]
  back: () => void
}) {
  const [competition, setCompetition] = useState<'Liga Nacional do Brasil' | 'Copa Nacional do Brasil'>('Liga Nacional do Brasil')
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [loading, setLoading] = useState(true)
  const [round, setRound] = useState(1)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('fixtures')
        .select('id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,home_club:clubs!fixtures_home_club_id_fkey(name,short_name,city,stadium,logo_url),away_club:clubs!fixtures_away_club_id_fkey(name,short_name,city,stadium,logo_url),competitions!inner(name)')
        .eq('competitions.name', competition)
        .order('round')
        .order('scheduled_at')
      if (!active) return
      const next = (data ?? []).map(normalizeFixture)
      setFixtures(next)
      setRound(next.find(item => item.status === 'scheduled')?.round ?? next[next.length - 1]?.round ?? 1)
      setLoading(false)
    })()
    return () => { active = false }
  }, [competition])

  const table = competition === 'Liga Nacional do Brasil'
    ? buildStandings(clubs.map(c => ({ id: c.id, name: c.short_name })), fixtures)
    : []
  const rounds = [...new Set(fixtures.map(item => item.round))].sort((a, b) => a - b)
  const roundFixtures = fixtures.filter(item => item.round === round)
  const position = table.findIndex(item => item.id === currentClubId) + 1
  const rules = competition === 'Liga Nacional do Brasil' ? BRAZIL_LEAGUE_RULES : BRAZIL_CUP_RULES
  const competitionId = fixtures[0]?.competition_id
  const stats = useMemo(() => buildPlayerCompetitionStats(playedMatches, competitionId), [playedMatches, competitionId])
  const currentStage = competition === 'Copa Nacional do Brasil' ? getCompetitionStageLabel(round, rounds.length, true) : `Rodada ${round}`
  const stageRounds = competition === 'Copa Nacional do Brasil'
    ? [
        { label: 'Oitavas de final', rounds: [1, 2] },
        { label: 'Quartas de final', rounds: [3, 4] },
        { label: 'Semifinal', rounds: [5, 6] },
        { label: 'Final', rounds: [7] },
      ]
    : []

  const champion = competition === 'Copa Nacional do Brasil'
    ? fixtures.find(item => item.round === 7 && item.status === 'completed')?.home_club_id && fixtures.find(item => item.round === 7 && item.status === 'completed')?.away_club_id
      ? (() => {
          const final = fixtures.find(item => item.round === 7 && item.status === 'completed')!
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
          <p className="text-sm text-white/35">Temporada 2026</p>
          <h1 className="mt-2 text-4xl font-bold">Competições</h1>
          <p className="mt-3 text-sm text-white/35">Acompanhe a temporada, os resultados e a situação do seu clube.</p>
          <p className="mt-2 text-xs text-white/25">Formato adaptado ao universo de 16 clubes.</p>
        </div>
        <div className="flex rounded-xl border border-white/6 p-1">
          <button onClick={() => setCompetition('Liga Nacional do Brasil')} className={`rounded-lg px-4 py-2.5 text-xs font-bold ${competition === 'Liga Nacional do Brasil' ? 'bg-emerald-400 text-[#06100c]' : 'text-white/40'}`}>Liga</button>
          <button onClick={() => setCompetition('Copa Nacional do Brasil')} className={`rounded-lg px-4 py-2.5 text-xs font-bold ${competition === 'Copa Nacional do Brasil' ? 'bg-emerald-400 text-[#06100c]' : 'text-white/40'}`}>Copa</button>
        </div>
      </div>

      {loading ? <div className="py-20 text-center text-sm text-white/35">Carregando competição...</div> : <>
        <div className="mt-8 grid gap-3 md:grid-cols-4">
          <Info label="Competição" value={competition} />
          <Info label="Partidas" value={String(fixtures.length)} />
          <Info label="Concluídas" value={String(fixtures.filter(x => x.status === 'completed').length)} />
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
                    const winnerId = second?.winner_club_id ?? (stage.rounds.length === 1 && first && first.home_score != null && first.away_score != null ? (first.home_score > first.away_score ? first.home_club_id : first.away_score > first.home_score ? first.away_club_id : null) : null)
                    const completed = tie.filter(item => item.status === 'completed').length
                    const score = (clubId: string) => stage.rounds.length === 1 ? (first?.home_club_id === clubId ? firstHome : firstAway) : (first?.home_club_id === clubId ? firstHome : firstAway) + ' / ' + (second ? (second.home_club_id === clubId ? secondHome : secondAway) : '—')
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
          <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-white/30">{competition === 'Liga Nacional do Brasil' ? 'Rodadas' : 'Fase'}</p><h2 className="mt-2 text-2xl font-bold">{currentStage}</h2></div><Trophy className="text-emerald-300/50" /></div>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">{rounds.map(r => <button key={r} onClick={() => setRound(r)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${round === r ? 'bg-emerald-400 text-[#06100c]' : 'border border-white/6 text-white/35'}`}>{competition === 'Liga Nacional do Brasil' ? `Rodada ${r}` : getCompetitionStageLabel(r, rounds.length, true)}</button>)}</div>
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {roundFixtures.map(item => <div key={item.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${item.home_club_id === currentClubId || item.away_club_id === currentClubId ? 'border-emerald-400/15 bg-emerald-400/[0.03]' : 'border-white/5 bg-black/10'}`}>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-1">{item.home_club?.logo_url ? <img src={item.home_club.logo_url} alt="" className="h-full w-full object-contain" /> : item.home_club?.short_name?.slice(0, 3)}</span>
                  <span>{item.home_club?.short_name ?? 'Casa'}</span><span className="px-1 text-white/20">×</span><span>{item.away_club?.short_name ?? 'Fora'}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-1">{item.away_club?.logo_url ? <img src={item.away_club.logo_url} alt="" className="h-full w-full object-contain" /> : item.away_club?.short_name?.slice(0, 3)}</span>
                </div>
                <p className="mt-1 text-xs text-white/25">{dateLabel(item.scheduled_at)} · {item.home_club?.city ?? 'Cidade a definir'} · {item.home_club?.stadium ?? 'Estádio a definir'}</p>
              </div>
              <span className="text-sm font-bold">{item.status === 'completed' ? `${item.home_score} × ${item.away_score}` : '—'}</span>
            </div>)}
          </div>
        </section>

        {competition === 'Liga Nacional do Brasil' && <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-white/30">Classificação</p><h2 className="mt-2 text-2xl font-bold">Liga Nacional do Brasil</h2>
          <div className="mt-5 overflow-x-auto rounded-xl border border-white/5"><table className="w-full min-w-[720px] text-sm"><thead className="bg-white/[0.03] text-xs text-white/25"><tr>{['#','Clube','P','J','V','E','D','SG'].map(x => <th key={x} className="px-3 py-3 text-left">{x}</th>)}</tr></thead><tbody>
            {table.map((team, i) => <tr key={team.id} className={`border-t border-white/5 ${team.id === currentClubId ? 'bg-emerald-400/5' : ''}`}><td className="px-3 py-3">{i + 1}</td><td className="px-3 py-3 font-medium">{team.name}</td><td className="px-3 py-3 font-bold">{team.points}</td><td className="px-3 py-3">{team.played}</td><td className="px-3 py-3">{team.wins}</td><td className="px-3 py-3">{team.draws}</td><td className="px-3 py-3">{team.losses}</td><td className="px-3 py-3">{team.gf - team.ga}</td></tr>)}
          </tbody></table></div>
          <p className="mt-3 text-xs text-white/25">Zona de rebaixamento preparada: últimos {BRAZIL_LEAGUE_RULES.relegationSlots} clubes. A segunda divisão ainda não está ativa no universo.</p>
        </section>}

        {stats.length > 0 && <section className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-white/30">Estatísticas</p><h2 className="mt-2 text-2xl font-bold">Destaques da competição</h2>
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {stats.slice(0, 8).map((player, index) => <div key={player.playerId} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><p className="text-sm font-semibold">{index + 1}. {player.name}</p><p className="text-xs text-white/30">{player.appearances} jogos · média {player.averageRating.toFixed(1)} · {player.assists} assistências</p></div><span className="text-sm font-bold">{player.goals} gols</span></div>)}
          </div>
        </section>}
      </>}
    </section>
  </main>
