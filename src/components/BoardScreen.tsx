import { ArrowLeft, Building2, Shield, Users, WalletCards } from 'lucide-react'
import type { Club } from '../types/game'
import type { BoardState, FanState } from '../engine/management'

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/5 bg-black/10 p-4"><p className="text-xs text-white/25">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>
}
export default function BoardScreen({ club, board, fans, balance, monthlyPayroll, back }: { club: Club; board: BoardState; fans: FanState; balance: number; monthlyPayroll: number; back: () => void }) {
  const status = board.managerStatus === 'dismissed' ? 'Vínculo encerrado pela diretoria' : board.managerStatus === 'contract_ended' ? 'Contrato encerrado' : board.managerStatus === 'renewed' ? 'Contrato renovado' : board.renewalOffered ? 'Renovação aguardando decisão' : board.confidence >= 70 ? 'Diretoria satisfeita' : board.confidence >= 40 ? 'Diretoria observando' : 'Diretoria cobrando reação'
  const confidenceText = board.confidence >= 70 ? 'O trabalho está acima do nível de cobrança atual.' : board.confidence >= 40 ? 'Os próximos resultados terão peso importante na avaliação.' : 'A diretoria considera que uma reação é necessária.'
  return <main className="min-h-screen bg-[#0a0f1a] px-4 py-5 sm:px-6 lg:px-8">
    <button onClick={back} className="mb-6 flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white"><ArrowLeft size={15} /> Voltar</button>
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="label-mono text-white/30">Clube · Diretoria</p><h1 className="mt-1 font-display text-3xl font-bold">Diretoria</h1><p className="mt-2 text-sm text-white/40">{club.name} · {status}</p></div><div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] px-4 py-3"><p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Confiança</p><p className="mt-1 font-display text-2xl font-bold text-emerald-300">{board.confidence}/100</p></div></div>
    <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
      <section className="game-panel"><div className="flex items-start justify-between gap-4"><div><p className="label-mono text-white/30">Objetivo da temporada</p><h2 className="mt-1 font-display text-2xl font-bold">{board.objectiveLabel}</h2><p className="mt-3 text-sm leading-6 text-white/40">{confidenceText}</p></div><Shield size={24} className="text-emerald-300/50" /></div><div className="mt-6 h-3 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-400" style={{ width: Math.max(0, Math.min(100, board.confidence)) + '%' }} /></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><Info label="Expectativa" value={board.expectation + '/100'} /><Info label="Avaliações realizadas" value={String(board.evaluations)} /><Info label="Última avaliação" value={board.lastEvaluation} /><Info label="Sequência ruim" value={board.consecutivePoorResults + ' avaliação(ões)'} /></div></section>
      <section className="game-panel"><p className="label-mono text-white/30">Vínculo</p><h2 className="mt-1 font-display text-2xl font-bold">{board.managerStatus === 'renewed' ? 'Renovado' : board.contractEndSeason}</h2><p className="mt-3 text-sm leading-6 text-white/40">{board.renewalOffered ? 'A diretoria ofereceu renovação. A decisão acontece no encerramento da temporada.' : board.managerStatus === 'dismissed' ? 'A carreira neste clube foi encerrada.' : 'A permanência é reavaliada de acordo com os resultados e a situação financeira.'}</p><div className="mt-5 rounded-xl border border-white/5 bg-black/10 p-4"><p className="text-xs text-white/25">Status atual</p><p className="mt-1 text-sm font-bold">{status}</p></div></section>
    </div>
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      <section className="game-panel"><div className="flex items-center gap-2 text-white/35"><Users size={16} /><span className="label-mono">Torcida</span></div><p className="mt-4 font-display text-3xl font-bold">{fans.satisfaction}</p><p className="mt-1 text-xs text-white/35">Satisfação · pressão {fans.pressure}%</p></section>
      <section className="game-panel"><div className="flex items-center gap-2 text-white/35"><WalletCards size={16} /><span className="label-mono">Caixa</span></div><p className="mt-4 font-display text-3xl font-bold">{money(balance)}</p><p className="mt-1 text-xs text-white/35">Folha mensal {money(monthlyPayroll)}</p></section>
      <section className="game-panel"><div className="flex items-center gap-2 text-white/35"><Building2 size={16} /><span className="label-mono">Expectativa da torcida</span></div><p className="mt-4 font-display text-3xl font-bold">{fans.expectation}</p><p className="mt-1 text-xs text-white/35">Resultado e desempenho alteram essa pressão.</p></section>
    </div>
  </main>
}
