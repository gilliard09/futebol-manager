export type BoardObjective = 'title' | 'top_four' | 'top_half' | 'avoid_relegation' | 'cup_semifinal' | 'cup_final' | 'cup_title' | 'financial_control'

export type BoardState = {
  seasonId: string
  objective: BoardObjective
  objectiveLabel: string
  expectation: number
  confidence: number
  lastEvaluation: string
  evaluations: number
  consecutivePoorResults: number
  managerStatus: 'active' | 'dismissed' | 'contract_ended' | 'renewed'
  contractEndSeason: string
  renewalOffered: boolean
}

export type FanState = {
  seasonId: string
  satisfaction: number
  expectation: number
  attendanceFactor: number
  pressure: number
  recentResults: Array<'W' | 'D' | 'L'>
  streak: number
}

export type ClubEconomicStatus = 'saudável' | 'atenção' | 'pressão'

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function chooseBoardObjective(reputation: number, budget: number, strength: number): { objective: BoardObjective; label: string; expectation: number } {
  if (strength >= 78 || reputation >= 82) return { objective: 'title', label: 'Disputar o título', expectation: 82 }
  if (strength >= 70 || reputation >= 72) return { objective: 'top_four', label: 'Terminar no G4', expectation: 70 }
  if (strength >= 62 || reputation >= 62) return { objective: 'top_half', label: 'Terminar na primeira metade', expectation: 58 }
  if (budget < 1_000_000) return { objective: 'financial_control', label: 'Controlar as finanças', expectation: 48 }
  return { objective: 'avoid_relegation', label: 'Evitar a parte de baixo da tabela', expectation: 45 }
}

export function createBoardState(seasonId: string, seasonName: string, reputation: number, budget: number, strength: number): BoardState {
  const target = chooseBoardObjective(reputation, budget, strength)
  return {
    seasonId,
    objective: target.objective,
    objectiveLabel: target.label,
    expectation: target.expectation,
    confidence: 62,
    lastEvaluation: 'Avaliação inicial',
    evaluations: 0,
    consecutivePoorResults: 0,
    managerStatus: 'active',
    contractEndSeason: seasonName,
    renewalOffered: false,
  }
}

export function evaluateBoard(
  state: BoardState,
  performance: { position: number; played: number; recentPoints: number; points: number },
  financial: { balance: number; monthlyPayroll: number },
  date: string,
): BoardState {
  let delta = 0
  let result = 'Desempenho dentro do esperado'
  const objective = state.objective

  if (objective === 'title') {
    if (performance.position <= 2) delta += 6
    else if (performance.position <= 4) delta += 2
    else if (performance.position >= 8) delta -= 8
    else delta -= 3
  } else if (objective === 'top_four') {
    if (performance.position <= 4) delta += 5
    else if (performance.position <= 6) delta += 1
    else if (performance.position >= 10) delta -= 7
    else delta -= 2
  } else if (objective === 'top_half') {
    if (performance.position <= 8) delta += 5
    else if (performance.position <= 10) delta += 1
    else if (performance.position >= 14) delta -= 7
    else delta -= 2
  } else if (objective === 'avoid_relegation') {
    if (performance.position <= 10) delta += 5
    else if (performance.position >= 15) delta -= 8
    else delta -= 2
  } else if (objective === 'financial_control') {
    if (financial.balance > Math.max(500_000, financial.monthlyPayroll * 3)) delta += 6
    else if (financial.balance < financial.monthlyPayroll) delta -= 8
  }

  if (performance.recentPoints >= 10) delta += 3
  else if (performance.recentPoints <= 3 && performance.played >= 5) delta -= 5

  if (financial.balance < 0 || financial.balance < Math.max(250_000, financial.monthlyPayroll * 0.5)) delta -= 4
  else if (financial.balance > Math.max(1_500_000, financial.monthlyPayroll * 8)) delta += 2

  const confidence = clamp(state.confidence + delta)
  const consecutivePoorResults = performance.recentPoints <= 3 && performance.played >= 5
    ? state.consecutivePoorResults + 1
    : Math.max(0, state.consecutivePoorResults - 1)

  if (delta >= 5) result = 'A diretoria está satisfeita com o trabalho'
  else if (delta <= -6) result = 'A diretoria está cobrando uma reação'
  else if (financial.balance < Math.max(250_000, financial.monthlyPayroll * 0.5)) result = 'A diretoria está preocupada com as finanças'

  const evaluations = state.evaluations + 1
  const dismissal = evaluations >= 3 && confidence <= 12 && consecutivePoorResults >= 2

  return {
    ...state,
    confidence,
    lastEvaluation: result + ' · ' + date,
    evaluations,
    consecutivePoorResults,
    managerStatus: dismissal ? 'dismissed' : state.managerStatus,
  }
}

export function shouldOfferRenewal(state: BoardState, seasonCompleted: boolean) {
  return seasonCompleted && state.managerStatus === 'active' && state.confidence >= 55
}

export function resolveContractAtSeasonEnd(state: BoardState): BoardState {
  if (state.managerStatus === 'dismissed') return state
  if (state.confidence >= 55) {
    return { ...state, managerStatus: 'renewed', renewalOffered: true }
  }
  return { ...state, managerStatus: 'contract_ended', renewalOffered: false }
}

export function applyFanResult(state: FanState, result: 'W' | 'D' | 'L', expectationPressure = 0): FanState {
  const recentResults = [...state.recentResults, result].slice(-5)
  const streak = result === 'W'
    ? Math.max(1, state.streak + 1)
    : result === 'L'
      ? Math.min(-1, state.streak - 1)
      : 0
  const base = result === 'W' ? 7 : result === 'D' ? 1 : -7
  const streakBonus = streak >= 3 ? 3 : streak <= -3 ? -4 : 0
  const satisfaction = clamp(state.satisfaction + base + streakBonus - expectationPressure)
  return {
    ...state,
    satisfaction,
    expectation: clamp(state.expectation + (result === 'W' ? 1 : result === 'L' ? -1 : 0)),
    attendanceFactor: 0.72 + satisfaction / 250,
    pressure: clamp(100 - satisfaction),
    recentResults,
    streak,
  }
}

export function createFanState(seasonId: string, reputation: number, boardExpectation: number): FanState {
  const satisfaction = clamp(55 + Math.round(reputation / 8))
  return {
    seasonId,
    satisfaction,
    expectation: clamp(boardExpectation),
    attendanceFactor: 0.72 + satisfaction / 250,
    pressure: 100 - satisfaction,
    recentResults: [],
    streak: 0,
  }
}

export function estimateFanAttendance(reputation: number, satisfaction: number, capacity = 12000) {
  const base = 3000 + Math.max(0, reputation) * 65
  const factor = 0.72 + clamp(satisfaction) / 250
  return Math.min(capacity, Math.max(1500, Math.round(base * factor)))
}

export function getEconomicStatus(balance: number, monthlyPayroll: number): ClubEconomicStatus {
  if (balance < Math.max(250_000, monthlyPayroll * 1.5)) return 'pressão'
  if (balance < Math.max(750_000, monthlyPayroll * 4)) return 'atenção'
  return 'saudável'
}

export function calculateTransferImpact(balance: number, fee: number, monthlyPayroll: number) {
  const nextBalance = Math.max(0, balance - Math.max(0, fee))
  const pressure = fee > Math.max(500_000, balance * 0.35) ? 8 : fee > Math.max(250_000, balance * 0.2) ? 3 : 0
  return { nextBalance, pressure, status: getEconomicStatus(nextBalance, monthlyPayroll) }
}
