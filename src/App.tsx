import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BarChart3, House, Banknote, Building2, CalendarDays, ChevronRight, CircleUserRound, Dumbbell, MapPin, Medal, Newspaper, Settings, Shield, ShoppingBag, Trophy, Users, WalletCards, Handshake } from 'lucide-react'
import { supabase } from './lib/supabase'
import type { Club, Fixture, Formation, LineupPlayer, ManagerProfile, Player } from './types/game'
import { getAiCoachProfile, getSquadRole, lineupFromPlayerIds, playerOverall, selectStartingLineup, type MatchResult } from './engine/match'
import type { PlayedMatch } from './types/game'
import PlayerProfile from './components/PlayerProfile'
import TransferMarket from './components/TransferMarket'
import LoanMarket from './components/LoanMarket'
import CompetitionCenter from './components/CompetitionCenter'
import PressCenter from './components/PressCenter'
import { TRAINING_FOCUSES, type TrainingFocus, trainSquad, recoverPlayers, applyMatchFatigue } from './engine/training'
import { calculateMonthlyPayroll } from './engine/economy'
import { applyTransaction , calculateMonthlySalaryExpense, createTransaction , calculateMatchRevenueFromAttendance, summarizeFinance, type FinanceTransaction } from './engine/finance'
import { applyFanResult, createBoardState, createFanState, estimateFanAttendance, evaluateBoard, getEconomicStatus, resolveContractAtSeasonEnd, type BoardState, type FanState } from './engine/management'
import { daysUntilContractEnd, getContractStatus } from './engine/contracts'
import { applyTransfer, type TransferRecord, type TransferState } from './engine/transfers'
import { getCurrentClubId as getLoanClubId, type LoanRecord, type LoanState } from './engine/loans'
import { getSquadAlerts } from './engine/roster'
import { buildStandings, resolveCompletedKnockoutStage, getCompetitionStage, resolveTwoLegTie, choosePenaltyWinner, resolveSingleMatch } from './engine/competitions'
import { buildCompetitionHistoryResult, buildSeasonCompletion } from './engine/seasonHistory'
import { simulateWorldDay, type MarketInterest, type WorldClub, type WorldClubPerformance, type WorldPlayer, type WorldSimulationResult } from './engine/worldSimulation'
import InteractiveMatch from './components/InteractiveMatch'
import { buildWorldNews, type WorldNews } from './engine/worldNews'
import { chooseSponsor, createStadium, stadiumUpgradeCost, canUpgradeStadium, upgradeStadium, estimateStadiumAttendance, resolveSponsorAtSeasonEnd, carryStadiumToNextSeason, type SponsorContract, type StadiumState } from './engine/commercial'
import { advanceSeasonDay, canAdvanceDay, createSeasonClock, daysBetween, formatSeasonDate, toDateKey, type SeasonClock } from './engine/calendar'
import { calculateInjuryReturnDate, calculateSuspensionReturnDate, isPlayerAvailable, shouldSuspendForYellowAccumulation, suspensionMatchesForRed } from './engine/discipline'

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
const seasonStart = (season: string) => `${Number(season.match(/\d{4}/)?.[0] ?? INITIAL_SEASON_YEAR)}-01-01`
const SEASON_START = seasonStart(SEASON_NAME)
const TRANSFERS_KEY = 'futebol-manager:transfers'
const LOANS_KEY = 'futebol-manager:loans'
const WORLD_NEWS_KEY = 'futebol-manager:world-news'
const MARKET_INTEREST_KEY = 'futebol-manager:market-interest'
const MARKET_NEGOTIATION_KEY = 'futebol-manager:market-negotiations'
const BOARD_KEY = 'futebol-manager:board'
const FANS_KEY = 'futebol-manager:fans'
const COMMERCIAL_KEY = 'futebol-manager:commercial'


function marketInterestStorageKey(seasonId: string) {
  return `${MARKET_INTEREST_KEY}:${seasonId}`
}

function loadMarketInterest(seasonId: string): MarketInterest[] {
  try {
    const stored = localStorage.getItem(marketInterestStorageKey(seasonId))
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}


type MarketNegotiation = {
  playerId: string
  buyerId: string
  sellerId: string
  offer: number
  round: number
  nextDate: string
}

function marketNegotiationStorageKey(seasonId: string) {
  return `${MARKET_NEGOTIATION_KEY}:${seasonId}`
}

function loadMarketNegotiations(seasonId: string): MarketNegotiation[] {
  try {
    const stored = localStorage.getItem(marketNegotiationStorageKey(seasonId))
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveMarketNegotiations(seasonId: string, negotiations: MarketNegotiation[]) {
  localStorage.setItem(marketNegotiationStorageKey(seasonId), JSON.stringify(negotiations))
}

function addDays(date: string, days: number) {
  const next = new Date(date + 'T00:00:00Z')
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function normalizeManagementRow(row: any): { board: BoardState; fans: FanState } {
  return {
    board: {
      seasonId: String(row.season_id),
      objective: row.objective as BoardState['objective'],
      objectiveLabel: row.objective_label,
      expectation: Number(row.expectation ?? 0),
      confidence: Number(row.confidence ?? 0),
      lastEvaluation: row.last_evaluation ?? 'Avaliação inicial',
      evaluations: Number(row.evaluations ?? 0),
      consecutivePoorResults: Number(row.consecutive_poor_results ?? 0),
      managerStatus: row.manager_status as BoardState['managerStatus'],
      contractEndSeason: row.contract_end_season,
      renewalOffered: Boolean(row.renewal_offered),
    },
    fans: {
      seasonId: String(row.season_id),
      satisfaction: Number(row.satisfaction ?? 0),
      expectation: Number(row.fan_expectation ?? 0),
      attendanceFactor: Number(row.fan_attendance_factor ?? 1),
      pressure: Number(row.fan_pressure ?? 0),
      recentResults: Array.isArray(row.fan_recent_results) ? row.fan_recent_results.filter((item: unknown): item is 'W' | 'D' | 'L' => item === 'W' || item === 'D' || item === 'L') : [],
      streak: Number(row.fan_streak ?? 0),
    },
  }
}

function normalizeCommercialRow(row: any): { sponsor: SponsorContract; stadium: StadiumState } {
  return {
    sponsor: {
      status: row.sponsor_status ?? 'active',
      completedSeasons: Number(row.sponsor_completed_seasons ?? 0),
      sponsorId: row.sponsor_id,
      name: row.sponsor_name,
      seasonId: String(row.season_id),
      upfront: Number(row.sponsor_upfront ?? 0),
      monthly: Number(row.sponsor_monthly ?? 0),
      objective: row.sponsor_objective,
      objectiveTarget: Number(row.sponsor_target ?? 0),
      progress: Number(row.sponsor_progress ?? 0),
      reputationRequired: Number(row.sponsor_reputation_required ?? 0),
    },
    stadium: {
      clubId: row.club_id,
      seasonId: String(row.season_id),
      name: row.stadium_name,
      capacity: Number(row.stadium_capacity ?? 12000),
      level: Number(row.stadium_level ?? 1),
      baseTicketPrice: Number(row.stadium_ticket_price ?? 35),
      attendanceRate: Number(row.stadium_attendance_rate ?? 0.72),
      maintenance: Number(row.stadium_maintenance ?? 15000),
      upgrades: Array.isArray(row.stadium_upgrades) ? row.stadium_upgrades : [],
    },
  }
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
  return {
    ...source,
    squad_number: row.squad_number,
    injuredUntil: source?.injured_until ?? null,
    suspendedUntil: source?.suspended_until ?? null,
    yellowCards: Number(source?.yellow_cards ?? 0),
    redCards: Number(source?.red_cards ?? 0),
  } as Player
}

export default function App() {
  return <BrowserRouter><GameApp /></BrowserRouter>
}

function GameApp() {
  const navigate = useNavigate()
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
      const { data, error } = await supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation,stadium,stadium_capacity,founded_year,logo_url,strength').order('name')
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
    const initialSponsor = { ...chooseSponsor(next.club.reputation ?? 50), seasonId: next.season }
    localStorage.setItem(FINANCE_KEY, JSON.stringify([
      createTransaction(SEASON_START, 'other', 'Capital inicial da carreira', next.club.budget, undefined, 'career:initial-budget'),
      createTransaction(SEASON_START, 'sponsorship', initialSponsor.name, initialSponsor.upfront, undefined, 'sponsor:upfront:' + next.season),
    ]))
    setCareer(next); navigate('/dashboard')
  }

  async function resetSeasonForNewCareer() {
    if (!career) return
    // Uma nova carreira nunca herda o estado esportivo da carreira anterior.
    // A temporada 2026 volta ao estado pré-rodada e a Copa é reduzida às
    // partidas-base; as fases seguintes serão recriadas pelo motor conforme o avanço.
    const { data: season } = await supabase.from('seasons').select('id,status').eq('name', career.season).maybeSingle()
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

  async function loadWorldState() {
    if (!career) return null
    const { data: season } = await supabase.from('seasons').select('id').eq('name', career.season).maybeSingle()
    if (!season?.id) return null

    const [{ data: clubRows }, { data: playerRows }, { data: seasonStatRows }] = await Promise.all([
      supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation,stadium,logo_url,strength').order('name'),
      supabase.from('club_players').select('id,club_id,squad_number,contract_until,salary,market_value,players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale,injured_until,suspended_until,yellow_cards,red_cards)'),
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
        injuredUntil: player.injured_until ?? null,
        suspendedUntil: player.suspended_until ?? null,
        yellowCards: Number(player.yellow_cards ?? 0),
        redCards: Number(player.red_cards ?? 0),
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
    if (!career) return
    const evolvedPlayerIds = new Set(results.flatMap(result => result.evolvedPlayerIds))
    const transfers = results.flatMap(result => result.transfers)
    const renewals = results.flatMap(result => result.renewals)
    const newLoans = results.flatMap(result => result.loans ?? [])
    const retirements = results.flatMap(result => result.retirements)
    const expiredContracts = results.flatMap(result => result.expiredContracts)
    const youth = results.flatMap(result => result.youth)
    const changedClubs = new Set(results.flatMap(result => result.changedClubs))
    const currentLoanState: LoanState = (() => {
      try { return JSON.parse(localStorage.getItem(LOANS_KEY) ?? '{"records":[]}') } catch { return { records: [] } }
    })()

    if (newLoans.length) {
      const known = new Set(currentLoanState.records.map(record => record.id))
      const mergedRecords = [...currentLoanState.records, ...newLoans.filter(record => !known.has(record.id))]
      const nextLoanState = { records: mergedRecords }
      localStorage.setItem(LOANS_KEY, JSON.stringify(nextLoanState))
    }

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
    let current: WorldNews[] = []
    try { current = JSON.parse(localStorage.getItem(WORLD_NEWS_KEY) ?? '[]') } catch {}
    const merged = [...items, ...current]
      .filter((item, index, list) => list.findIndex(other => other.id === item.id) === index)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 80)
    localStorage.setItem(WORLD_NEWS_KEY, JSON.stringify(merged))
  }

  function addFinanceTransaction(transaction: FinanceTransaction) {
    let current: FinanceTransaction[] = []
    try { current = JSON.parse(localStorage.getItem(FINANCE_KEY) ?? '[]') } catch {}
    if (transaction.eventId && current.some(item => item.eventId === transaction.eventId)) return
    localStorage.setItem(FINANCE_KEY, JSON.stringify([...current, transaction]))
  }


  async function persistManagementForSeason(seasonId: string, nextBoard: BoardState, nextFans: FanState) {
    if (!career) return
    const { error } = await supabase.from('club_management_seasons').upsert({
      season_id: seasonId,
      club_id: career.club.id,
      manager_status: nextBoard.managerStatus,
      objective: nextBoard.objective,
      objective_label: nextBoard.objectiveLabel,
      expectation: nextBoard.expectation,
      confidence: nextBoard.confidence,
      satisfaction: nextFans.satisfaction,
      fan_expectation: nextFans.expectation,
      fan_pressure: nextFans.pressure,
      contract_end_season: nextBoard.contractEndSeason,
      renewal_offered: nextBoard.renewalOffered,
      last_evaluation: nextBoard.lastEvaluation,
      evaluations: nextBoard.evaluations,
      consecutive_poor_results: nextBoard.consecutivePoorResults,
      fan_attendance_factor: nextFans.attendanceFactor,
      fan_recent_results: nextFans.recentResults,
      fan_streak: nextFans.streak,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'season_id,club_id' })
    if (error) console.error('Não foi possível persistir a gestão/torcida', error)
  }

  async function persistCommercialForSeason(seasonId: string, value: { sponsor: SponsorContract; stadium: StadiumState }) {
    if (!career) return
    const { error } = await supabase.from('club_commercial_seasons').upsert({
      season_id: seasonId,
      club_id: value.stadium.clubId || career.club.id,
      sponsor_id: value.sponsor.sponsorId,
      sponsor_name: value.sponsor.name,
      sponsor_upfront: value.sponsor.upfront,
      sponsor_monthly: value.sponsor.monthly,
      sponsor_objective: value.sponsor.objective,
      sponsor_target: value.sponsor.objectiveTarget,
      sponsor_progress: value.sponsor.progress,
      sponsor_status: value.sponsor.status ?? 'active',
      sponsor_completed_seasons: value.sponsor.completedSeasons ?? 0,
      sponsor_reputation_required: value.sponsor.reputationRequired,
      stadium_name: value.stadium.name,
      stadium_capacity: value.stadium.capacity,
      stadium_level: value.stadium.level,
      stadium_ticket_price: value.stadium.baseTicketPrice,
      stadium_maintenance: value.stadium.maintenance,
      stadium_attendance_rate: value.stadium.attendanceRate,
      stadium_upgrades: value.stadium.upgrades,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'season_id,club_id' })
    if (error) console.error('Não foi possível persistir patrocínio/estádio', error)
  }

  async function startNextSeason() {
    if (!career) return
    const currentYear = Number(career?.season.match(/\d{4}/)?.[0] ?? INITIAL_SEASON_YEAR)
    let previousCommercial: { sponsor: SponsorContract; stadium: StadiumState } | null = null
    try {
      const raw = localStorage.getItem(COMMERCIAL_KEY + ':' + career?.season)
      previousCommercial = raw ? JSON.parse(raw) as { sponsor: SponsorContract; stadium: StadiumState } : null
    } catch {}
    const nextYear = currentYear + 1
    const nextSeasonName = seasonName(nextYear)

    const { data: currentSeason } = await supabase.from('seasons').select('id,status').eq('name', career?.season ?? SEASON_NAME).maybeSingle()
    if (!currentSeason?.id || currentSeason.status !== 'completed') return

    const { data: persistedCommercialRow } = await supabase
      .from('club_commercial_seasons')
      .select('*')
      .eq('season_id', currentSeason.id)
      .eq('club_id', career.club.id)
      .maybeSingle()
    if (persistedCommercialRow) previousCommercial = normalizeCommercialRow(persistedCommercialRow)
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

    const nextCommercial = previousCommercial
      ? {
          sponsor: { ...previousCommercial.sponsor, seasonId: nextSeasonName, status: 'active' as const, progress: 0 },
          stadium: carryStadiumToNextSeason(previousCommercial.stadium, nextSeasonName),
        }
      : {
          sponsor: { ...chooseSponsor(career?.club.reputation ?? 50), seasonId: nextSeasonName },
          stadium: createStadium(career?.club.id ?? '', nextSeasonName, career?.club.stadium ?? 'Estádio Municipal', career?.club.stadium_capacity ?? 12000),
        }
    await persistCommercialForSeason(newSeason.id, nextCommercial)
    localStorage.setItem(COMMERCIAL_KEY + ':' + nextSeasonName, JSON.stringify(nextCommercial))

    const nextBoard = createBoardState(
      nextSeasonName,
      nextSeasonName,
      career.club.reputation ?? 50,
      career.club.budget ?? 0,
      career.club.strength ?? career.club.reputation ?? 50,
    )
    const nextFans = createFanState(nextSeasonName, career.club.reputation ?? 50, nextBoard.expectation)
    await persistManagementForSeason(newSeason.id, nextBoard, nextFans)
    localStorage.setItem(BOARD_KEY + ':' + nextSeasonName, JSON.stringify(nextBoard))
    localStorage.setItem(FANS_KEY + ':' + nextSeasonName, JSON.stringify(nextFans))

    if (nextCommercial.sponsor.upfront > 0) {
      addFinanceTransaction(createTransaction(
        `${nextYear}-01-10`,
        'sponsorship',
        `Assinatura de patrocínio · ${nextCommercial.sponsor.name}`,
        nextCommercial.sponsor.upfront,
        undefined,
        `sponsor:upfront:${nextSeasonName}`,
      ))
    }

    // A virada da temporada também é uma janela de planejamento para a IA.
    // Usamos o desempenho encerrado no ano anterior para que cada clube entre
    // na nova temporada corrigindo posições carentes, renovando contratos e
    // movimentando o elenco antes da primeira rodada.
    const previousWorld = await loadWorldState()
    if (previousWorld) {
      const activeLoans: LoanRecord[] = (() => {
        try {
          const stored: LoanState = JSON.parse(localStorage.getItem(LOANS_KEY) ?? '{"records":[]}')
          return stored.records ?? []
        } catch {
          return []
        }
      })()
      const transitionResult = simulateWorldDay(
        `${nextYear}-01-10`,
        newSeason.id,
        previousWorld.worldClubs,
        previousWorld.playersForWorld,
        career.club.id,
        previousWorld.performanceByClub,
        [],
        activeLoans,
      )
      await persistWorldState(newSeason.id, previousWorld.worldClubs, previousWorld.playersForWorld, [transitionResult])
      localStorage.setItem(marketInterestStorageKey(nextSeasonName), JSON.stringify(transitionResult.marketInterest))
      appendWorldNews(buildWorldNews(transitionResult, previousWorld.worldClubs, previousWorld.playersForWorld, previousWorld.performanceByClub, career.club.id))
    }

    if (career) { const nextCareer = { ...career, season: nextSeasonName }; localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer)); setCareer(nextCareer) }
    localStorage.removeItem(CLOCK_KEY)
    localStorage.removeItem(MATCHES_KEY)
    localStorage.removeItem(TRAINING_KEY)
    localStorage.removeItem(COMMERCIAL_KEY + ':' + career.season)
    localStorage.removeItem(BOARD_KEY + ':' + career.season)
    localStorage.removeItem(FANS_KEY + ':' + career.season)
    Object.keys(localStorage).filter(key => (key.startsWith(MARKET_INTEREST_KEY + ':') || key.startsWith(MARKET_NEGOTIATION_KEY + ':')) && key !== marketInterestStorageKey(nextSeasonName) && key !== marketNegotiationStorageKey(nextSeasonName)).forEach(key => localStorage.removeItem(key))
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
    Object.keys(localStorage)
      .filter(key => key.startsWith(BOARD_KEY + ':') || key.startsWith(FANS_KEY + ':') || key.startsWith(COMMERCIAL_KEY + ':') || key.startsWith(MARKET_INTEREST_KEY + ':') || key.startsWith(MARKET_NEGOTIATION_KEY + ':'))
      .forEach(key => localStorage.removeItem(key))
    setCareer(null); setManagerName(''); setNationality('Brasil'); setBirthDate(''); setManagerStyle('high_press'); setManagerPersonality('motivator'); setSelectedClub(null); navigate('/manager')
  }

  return <div className="min-h-screen bg-[#0a0f1a] text-white"><div className="mx-auto min-h-screen max-w-7xl border-x border-white/5 bg-[#0a0f1a]">
    <Routes>
      <Route path="/" element={<Home career={career} start={() => navigate('/manager')} continueCareer={() => navigate('/dashboard')} newCareer={newCareer} />} />
      <Route path="/manager" element={<Manager name={managerName} nationality={nationality} birthDate={birthDate} style={managerStyle} personality={managerPersonality} canContinue={canContinue} onName={setManagerName} onNationality={setNationality} onBirthDate={setBirthDate} onStyle={setManagerStyle} onPersonality={setManagerPersonality} back={() => navigate('/')} next={() => navigate('/club')} />} />
      <Route path="/club" element={<ClubList clubs={clubs} selected={selectedClub} loading={loading} error={error} select={setSelectedClub} back={() => navigate('/manager')} confirm={confirmCareer} />} />
      <Route path="/dashboard/*" element={career ? <Dashboard career={career} clubs={clubs} newCareer={newCareer} onNextSeason={startNextSeason} onCareerUpdate={setCareer} /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to={career ? '/dashboard' : '/'} replace />} />
    </Routes>
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

type DashboardView = 'overview' | 'calendar' | 'news' | 'squad' | 'tactics' | 'finance' | 'stadium' | 'trophies' | 'legacy' | 'market' | 'stats' | 'settings' | 'match' | 'training' | 'loans' | 'competitions' | 'press'

function Dashboard({ career, clubs, newCareer, onNextSeason, onCareerUpdate }: { career: ManagerProfile; clubs: Club[]; newCareer: () => void; onNextSeason: () => void; onCareerUpdate: (career: ManagerProfile) => void }) {
  const [players, setPlayers] = useState<Player[]>([])
  const [nextFixture, setNextFixture] = useState<Fixture | null>(null)
  const [opponentPlayers, setOpponentPlayers] = useState<Player[]>([])
  const [table, setTable] = useState<{ id: string; name: string; points: number; played: number; wins: number; draws: number; losses: number; gf: number; ga: number }[]>([])
  const [playedMatches, setPlayedMatches] = useState<Record<string, PlayedMatch>>(() => {
    try { return JSON.parse(localStorage.getItem(MATCHES_KEY) ?? '{}') } catch { return {} }
  })
  const location = useLocation()
  const navigate = useNavigate()
  const dashboardViews: DashboardView[] = ['overview', 'calendar', 'news', 'squad', 'tactics', 'finance', 'stadium', 'trophies', 'legacy', 'market', 'stats', 'settings', 'match', 'training', 'loans', 'competitions', 'press']
  const pathView = location.pathname.split('/')[2] as DashboardView | undefined
  const initialView = pathView && dashboardViews.includes(pathView) ? pathView : 'overview'
  const [view, setView] = useState<DashboardView>(initialView)
  function goToView(nextView: DashboardView) {
    if (nextView !== 'squad') setViewOpponent(false)
    setView(nextView)
    navigate(nextView === 'overview' ? '/dashboard' : '/dashboard/' + nextView)
  }
  useEffect(() => {
    const nextView = pathView && dashboardViews.includes(pathView) ? pathView : 'overview'
    setView(current => current === nextView ? current : nextView)
  }, [location.pathname])
  const [transferState, setTransferState] = useState<TransferState>(() => { try { return JSON.parse(localStorage.getItem(TRANSFERS_KEY) ?? '{"playerClubOverrides":{},"records":[]}') } catch { return { playerClubOverrides: {}, records: [] } } })
  const [loanState, setLoanState] = useState<LoanState>(() => { try { return JSON.parse(localStorage.getItem(LOANS_KEY) ?? '{"records":[]}') } catch { return { records: [] } } })
  const [selectedStarters, setSelectedStarters] = useState<Player[]>([])
  const [viewOpponent, setViewOpponent] = useState(false)
  const [tactic, setTactic] = useState('balanced')
  const [formation, setFormation] = useState('4-3-3')
  const [activeMatchFixture, setActiveMatchFixture] = useState<Fixture | null>(null)
  const [loading, setLoading] = useState(true)
  const [databaseSeasonId, setDatabaseSeasonId] = useState<string | null>(null)
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
  const [boardState, setBoardState] = useState<BoardState>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${BOARD_KEY}:${career.season}`) ?? 'null')
      return saved ?? createBoardState(career.season, career.season, career.club.reputation ?? 50, career.club.budget ?? 0, career.club.strength ?? career.club.reputation ?? 50)
    } catch {
      return createBoardState(career.season, career.season, career.club.reputation ?? 50, career.club.budget ?? 0, career.club.strength ?? career.club.reputation ?? 50)
    }
  })
  const [commercial, setCommercial] = useState<{ sponsor: SponsorContract; stadium: StadiumState }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COMMERCIAL_KEY + ':' + career.season) ?? 'null')
      if (saved) return saved
    } catch {}
    const sponsor = { ...chooseSponsor(career.club.reputation ?? 50), seasonId: career.season }
    return { sponsor, stadium: createStadium(career.club.id, career.season, career.club.stadium ?? 'Estádio Municipal', career.club.stadium_capacity ?? 12000) }
  })

  const [fanState, setFanState] = useState<FanState>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${FANS_KEY}:${career.season}`) ?? 'null')
      return saved ?? createFanState(career.season, career.club.reputation ?? 50, boardState.expectation)
    } catch {
      return createFanState(career.season, career.club.reputation ?? 50, boardState.expectation)
    }
  })

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COMMERCIAL_KEY + ':' + career.season)
      if (saved) {
        setCommercial(JSON.parse(saved))
      } else {
        const sponsor = { ...chooseSponsor(career.club.reputation ?? 50), seasonId: career.season }
        const next = { sponsor, stadium: createStadium(career.club.id, career.season, career.club.stadium ?? 'Estádio Municipal', career.club.stadium_capacity ?? 12000) }
        setCommercial(next)
        localStorage.setItem(COMMERCIAL_KEY + ':' + career.season, JSON.stringify(next))
      }
    } catch {}
  }, [career.season])

  useEffect(() => {
    const savedBoard = localStorage.getItem(`${BOARD_KEY}:${career.season}`)
    const nextBoard = savedBoard ? JSON.parse(savedBoard) as BoardState : createBoardState(career.season, career.season, career.club.reputation ?? 50, financeBalance, career.club.strength ?? career.club.reputation ?? 50)
    setBoardState(nextBoard)
    localStorage.setItem(`${BOARD_KEY}:${career.season}`, JSON.stringify(nextBoard))
    const savedFans = localStorage.getItem(`${FANS_KEY}:${career.season}`)
    const nextFans = savedFans ? JSON.parse(savedFans) as FanState : createFanState(career.season, career.club.reputation ?? 50, nextBoard.expectation)
    setFanState(nextFans)
    localStorage.setItem(`${FANS_KEY}:${career.season}`, JSON.stringify(nextFans))
  }, [career.season])

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

    const userPosition = leagueStandings.findIndex(team => team.id === career.club.id) + 1
    const sponsorProgress = commercial.sponsor.sponsorId === 'regional'
      ? Math.round(fanState.satisfaction)
      : userPosition > 0 && userPosition <= commercial.sponsor.objectiveTarget
        ? commercial.sponsor.objectiveTarget
        : 0
    const sponsorResolution = resolveSponsorAtSeasonEnd(commercial.sponsor, sponsorProgress, Number(career.club.reputation ?? 50))

    // Se o clube do treinador foi premiado, o mesmo efeito precisa chegar
    // imediatamente à carreira local e ao caixa exibido no dashboard.
    const userEffect = achievementByClub.get(career.club.id) ?? { budgetBonus: 0, reputationBonus: 0, strengthBonus: 0, marketMultiplier: 1 }
    {
      const nextBudget = Math.max(0, Number(career.club.budget ?? 0) + userEffect.budgetBonus)
      const nextCareer: ManagerProfile = {
        ...career,
        club: {
          ...career.club,
          budget: nextBudget,
          reputation: Math.max(35, Math.min(95, sponsorResolution.reputation + userEffect.reputationBonus)),
          strength: Math.max(35, Math.min(95, Number(career.club.strength ?? 50) + userEffect.strengthBonus)),
        },
      }
      onCareerUpdate(nextCareer)

      if (userEffect.budgetBonus > 0) {
        addFinanceTransaction(createTransaction(
          toDateKey(new Date().toISOString()),
          'prize',
          'Premiação por desempenho da temporada',
          userEffect.budgetBonus,
          undefined,
          `season:achievement:${seasonId}`,
        ))
      }
    }
    const nextCommercial = {
      sponsor: {
        ...sponsorResolution.nextSponsor,
        seasonId: seasonId,
      },
      stadium: commercial.stadium,
    }
    await saveCommercial(nextCommercial)
    const finalBoard = resolveContractAtSeasonEnd(boardState)
    saveManagement(finalBoard, fanState)
    if (finalBoard.managerStatus === 'renewed') {
      appendWorldNews([{
        id: 'board-renewal:' + seasonId,
        date: toDateKey(new Date().toISOString()),
        title: 'A diretoria quer manter o treinador',
        message: 'A temporada terminou e a diretoria decidiu renovar seu vínculo para a próxima temporada.',
        tone: 'positive',
        category: 'career',
        priority: 82,
      }])
    } else if (finalBoard.managerStatus === 'contract_ended') {
      appendWorldNews([{
        id: 'board-contract-ended:' + seasonId,
        date: toDateKey(new Date().toISOString()),
        title: 'Seu contrato chegou ao fim',
        message: 'A diretoria encerrou o vínculo ao final da temporada. A continuidade da carreira depende de uma nova oportunidade.',
        tone: 'warning',
        category: 'career',
        priority: 82,
      }])
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

  async function persistManagementToSupabase(seasonId: string, nextBoard: BoardState, nextFans: FanState) {
    const { error } = await supabase.from('club_management_seasons').upsert({
      season_id: seasonId,
      club_id: career.club.id,
      manager_status: nextBoard.managerStatus,
      objective: nextBoard.objective,
      objective_label: nextBoard.objectiveLabel,
      expectation: nextBoard.expectation,
      confidence: nextBoard.confidence,
      satisfaction: nextFans.satisfaction,
      fan_expectation: nextFans.expectation,
      fan_pressure: nextFans.pressure,
      contract_end_season: nextBoard.contractEndSeason,
      renewal_offered: nextBoard.renewalOffered,
      last_evaluation: nextBoard.lastEvaluation,
      evaluations: nextBoard.evaluations,
      consecutive_poor_results: nextBoard.consecutivePoorResults,
      fan_attendance_factor: nextFans.attendanceFactor,
      fan_recent_results: nextFans.recentResults,
      fan_streak: nextFans.streak,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'season_id,club_id' })
    if (error) console.error('Não foi possível persistir a gestão/torcida', error)
  }

  async function saveManagement(nextBoard: BoardState, nextFans: FanState) {
    setBoardState(nextBoard)
    setFanState(nextFans)
    localStorage.setItem(BOARD_KEY + ':' + career.season, JSON.stringify(nextBoard))
    localStorage.setItem(FANS_KEY + ':' + career.season, JSON.stringify(nextFans))
    if (databaseSeasonId) await persistManagementToSupabase(databaseSeasonId, nextBoard, nextFans)
  }

  async function persistCommercialToSupabase(seasonId: string, value: { sponsor: SponsorContract; stadium: StadiumState }) {
    const { error } = await supabase.from('club_commercial_seasons').upsert({
      season_id: seasonId,
      club_id: value.stadium.clubId || career.club.id,
      sponsor_id: value.sponsor.sponsorId,
      sponsor_name: value.sponsor.name,
      sponsor_upfront: value.sponsor.upfront,
      sponsor_monthly: value.sponsor.monthly,
      sponsor_objective: value.sponsor.objective,
      sponsor_target: value.sponsor.objectiveTarget,
      sponsor_progress: value.sponsor.progress,
      sponsor_status: value.sponsor.status ?? 'active',
      sponsor_completed_seasons: value.sponsor.completedSeasons ?? 0,
      sponsor_reputation_required: value.sponsor.reputationRequired,
      stadium_name: value.stadium.name,
      stadium_capacity: value.stadium.capacity,
      stadium_level: value.stadium.level,
      stadium_ticket_price: value.stadium.baseTicketPrice,
      stadium_maintenance: value.stadium.maintenance,
      stadium_attendance_rate: value.stadium.attendanceRate,
      stadium_upgrades: value.stadium.upgrades,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'season_id,club_id' })
    if (error) console.error('Não foi possível persistir patrocínio/estádio', error)
  }

  async function saveCommercial(next: { sponsor: SponsorContract; stadium: StadiumState }) {
    setCommercial(next)
    localStorage.setItem(COMMERCIAL_KEY + ':' + career.season, JSON.stringify(next))
    if (databaseSeasonId) await persistCommercialToSupabase(databaseSeasonId, next)
  }

  function applyMatchManagement(result: MatchResult, fixture: Fixture) {
    const userIsHome = fixture.home_club_id === career.club.id
    const userGoals = userIsHome ? result.homeScore : result.awayScore
    const opponentGoals = userIsHome ? result.awayScore : result.homeScore
    const outcome: 'W' | 'D' | 'L' = userGoals > opponentGoals ? 'W' : userGoals < opponentGoals ? 'L' : 'D'
    const expectationPressure = boardState.expectation >= 75 && outcome === 'L' ? 2 : 0
    const nextFans = applyFanResult(fanState, outcome, expectationPressure)
    const currentPosition = table.findIndex(team => team.id === career.club.id) + 1 || 16
    const nextBoard = evaluateBoard(
      boardState,
      {
        position: currentPosition,
        played: Math.max(1, table.find(team => team.id === career.club.id)?.played ?? 0) + 1,
        recentPoints: nextFans.recentResults.reduce((sum, item) => sum + (item === 'W' ? 3 : item === 'D' ? 1 : 0), 0),
        points: table.find(team => team.id === career.club.id)?.points ?? 0,
      },
      { balance: financeBalance, monthlyPayroll: salaryTotal },
      toDateKey(fixture.scheduled_at),
      nextFans.pressure,
    )
    saveManagement(nextBoard, nextFans)
    if (nextBoard.managerStatus === 'dismissed') {
      setPendingEvent({
        type: 'board_message',
        date: toDateKey(fixture.scheduled_at),
        title: 'A diretoria encerrou seu trabalho',
        message: 'A sequência de resultados e o nível de confiança chegaram a um ponto em que a diretoria decidiu encerrar o vínculo com o treinador.',
        tone: 'warning',
      })
    }
  }


  useEffect(() => {
    let active = true
    async function loadDashboard() {
      setLoading(true)
      const { data: currentSeasonRow } = await supabase.from('seasons').select('id,status').eq('name', career.season).maybeSingle()
      const currentSeasonId = currentSeasonRow?.id ?? null
      if (currentSeasonId) {
        setDatabaseSeasonId(currentSeasonId)
        const [{ data: managementRow }, { data: commercialRow }] = await Promise.all([
          supabase.from('club_management_seasons').select('*').eq('season_id', currentSeasonId).eq('club_id', career.club.id).maybeSingle(),
          supabase.from('club_commercial_seasons').select('*').eq('season_id', currentSeasonId).eq('club_id', career.club.id).maybeSingle(),
        ])

        if (managementRow) {
          const persisted = normalizeManagementRow(managementRow)
          setBoardState(persisted.board)
          setFanState(persisted.fans)
          localStorage.setItem(BOARD_KEY + ':' + career.season, JSON.stringify(persisted.board))
          localStorage.setItem(FANS_KEY + ':' + career.season, JSON.stringify(persisted.fans))
        } else {
          const initialBoard = createBoardState(career.season, career.season, career.club.reputation ?? 50, financeBalance, career.club.strength ?? career.club.reputation ?? 50)
          const initialFans = createFanState(career.season, career.club.reputation ?? 50, initialBoard.expectation)
          await persistManagementToSupabase(currentSeasonId, initialBoard, initialFans)
        }

        if (commercialRow) {
          const persistedCommercial = normalizeCommercialRow(commercialRow)
          setCommercial(persistedCommercial)
          localStorage.setItem(COMMERCIAL_KEY + ':' + career.season, JSON.stringify(persistedCommercial))
        } else {
          const initialSponsor = { ...chooseSponsor(career.club.reputation ?? 50), seasonId: career.season }
          const initialCommercial = {
            sponsor: initialSponsor,
            stadium: createStadium(career.club.id, career.season, career.club.stadium ?? 'Estádio Municipal', career.club.stadium_capacity ?? 12000),
          }
          await persistCommercialToSupabase(currentSeasonId, initialCommercial)
          setCommercial(initialCommercial)
          localStorage.setItem(COMMERCIAL_KEY + ':' + career.season, JSON.stringify(initialCommercial))
        }
      }
      if (currentSeasonId && currentSeasonRow?.status === 'completed') {
        const { data: completedHistory } = await supabase
          .from('competition_history')
          .select('competition_id,champion_club_id,runner_up_club_id,top_scorer_player_id,top_scorer_goals,competitions!inner(name)')
          .eq('season_id', currentSeasonId)
        const leagueHistory = (completedHistory ?? []).find((row: any) => row.competitions?.name === 'Liga Nacional do Brasil')
        const cupHistory = (completedHistory ?? []).find((row: any) => row.competitions?.name === 'Copa Nacional do Brasil')
        if (leagueHistory && cupHistory) {
          setSeasonClosed(true)
          setSeasonCompletion({
            seasonId: currentSeasonId,
            seasonName: career.season,
            league: {
              championClubId: leagueHistory.champion_club_id,
              runnerUpClubId: leagueHistory.runner_up_club_id,
              topScorerPlayerId: leagueHistory.top_scorer_player_id,
              topScorerGoals: Number(leagueHistory.top_scorer_goals ?? 0),
            },
            cup: {
              championClubId: cupHistory.champion_club_id,
              runnerUpClubId: cupHistory.runner_up_club_id,
              topScorerPlayerId: cupHistory.top_scorer_player_id,
              topScorerGoals: Number(cupHistory.top_scorer_goals ?? 0),
            },
          })
        }
      }
      const [squadResult, fixtureResult, tableResult, clubsResult, salaryResult, seasonStatsResult] = await Promise.all([
        supabase.from('club_players').select('club_id,squad_number, players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale,injured_until,suspended_until,yellow_cards,red_cards)').order('squad_number'),
        supabase.from('fixtures').select('id,season_id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,home_club:clubs!fixtures_home_club_id_fkey(name,short_name,city,stadium,logo_url),away_club:clubs!fixtures_away_club_id_fkey(name,short_name,city,stadium,logo_url),competitions(name)').or(`home_club_id.eq.${career.club.id},away_club_id.eq.${career.club.id}`).eq('status','scheduled').order('scheduled_at'),
        supabase.from('fixtures').select('id,competition_id,home_club_id,away_club_id,home_score,away_score,status,competitions!inner(name),seasons!inner(name)').eq('seasons.name', career.season).eq('status','completed').eq('competitions.name','Liga Nacional do Brasil'),
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
          const restored = loaded.map((player: Player) => {
            const savedPlayer = saved.players?.[player.id]
            if (!savedPlayer) return player
            return {
              ...player,
              ...savedPlayer,
              // Disponibilidade disciplinar/médica vem do banco; o cache local não pode sobrescrevê-la.
              injuredUntil: player.injuredUntil,
              suspendedUntil: player.suspendedUntil,
              yellowCards: player.yellowCards,
              redCards: player.redCards,
            }
          })
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
        const scheduled = (fixtureResult.data ?? []).map(normalizeFixture).filter(item => item.season_id === currentSeasonId && !playedMatches[item.id])
        const fixture = scheduled[0] ?? null
        setUpcomingFixtures(scheduled)
        setNextFixture(fixture)
        if (!clock && fixture) {
          const initialClock = createSeasonClock(seasonStart(career.season), toDateKey(fixture.scheduled_at), 3)
          setClock(initialClock)
          localStorage.setItem(CLOCK_KEY, JSON.stringify(initialClock))
        }
        if (fixture) {
          const opponentId = fixture.home_club_id === career.club.id ? fixture.away_club_id : fixture.home_club_id
          const { data: opponentSquad } = await supabase.from('club_players').select('club_id,squad_number, players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale,injured_until,suspended_until,yellow_cards,red_cards)').order('squad_number')
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
  }, [career.club.id, career.season, clubs, playedMatches, clock?.currentDate, transferState.playerClubOverrides, loanState.records])

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
  const opponentStrength = opponent ? Number((opponent as { strength?: number; reputation?: number }).strength ?? (opponent as { strength?: number; reputation?: number }).reputation ?? 60) : 0
  const home = nextFixture?.home_club_id === career.club.id
  const rosterAlerts = getSquadAlerts(players, contractAlerts.length, financeBalance, salaryTotal)
  const initialCapital = financeTransactions.find(transaction => transaction.eventId === 'career:initial-budget')?.amount ?? career.club.budget
  const avg = players.length ? Math.round(players.reduce((sum, player) => sum + playerOverall(player), 0) / players.length) : 0
  const recentUserResults = Object.values(playedMatches)
    .filter(match => match.home_club_id === career.club.id || match.away_club_id === career.club.id)
    .slice(0, 5)
    .map(match => {
      const userHome = match.home_club_id === career.club.id
      const userScore = userHome ? match.homeScore : match.awayScore
      const opponentScore = userHome ? match.awayScore : match.homeScore
      return {
        id: `${match.home_club_id}-${match.away_club_id}-${userScore}-${opponentScore}`,
        competition: match.competition_name ?? 'Liga Nacional do Brasil',
        opponent: userHome ? (clubs.find(club => club.id === match.away_club_id)?.short_name ?? 'Adversário') : (clubs.find(club => club.id === match.home_club_id)?.short_name ?? 'Adversário'),
        score: `${userScore}–${opponentScore}`,
        result: userScore > opponentScore ? 'W' : userScore < opponentScore ? 'L' : 'D',
      } as const
    })
  const nextMatchDate = nextFixture ? toDateKey(nextFixture.scheduled_at) : null
  const matchReady = Boolean(clock && nextMatchDate && clock.currentDate >= nextMatchDate)

  async function loadWorldState() {
    const { data: season } = await supabase.from('seasons').select('id').eq('name', career.season).maybeSingle()
    if (!season?.id) return null

    const [{ data: clubRows }, { data: playerRows }, { data: seasonStatRows }] = await Promise.all([
      supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation,stadium,logo_url,strength').order('name'),
      supabase.from('club_players').select('id,club_id,squad_number,contract_until,salary,market_value,players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale,injured_until,suspended_until,yellow_cards,red_cards)'),
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
        injuredUntil: player.injured_until ?? null,
        suspendedUntil: player.suspended_until ?? null,
        yellowCards: Number(player.yellow_cards ?? 0),
        redCards: Number(player.red_cards ?? 0),
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
    const newLoans = results.flatMap(result => result.loans ?? [])
    const retirements = results.flatMap(result => result.retirements)
    const expiredContracts = results.flatMap(result => result.expiredContracts)
    const youth = results.flatMap(result => result.youth)
    const changedClubs = new Set(results.flatMap(result => result.changedClubs))
    const currentLoanState: LoanState = (() => {
      try { return JSON.parse(localStorage.getItem(LOANS_KEY) ?? '{"records":[]}') } catch { return { records: [] } }
    })()
    if (newLoans.length) {
      const known = new Set(currentLoanState.records.map(record => record.id))
      const mergedRecords = [...currentLoanState.records, ...newLoans.filter(record => !known.has(record.id))]
      const nextLoanState = { records: mergedRecords }
      localStorage.setItem(LOANS_KEY, JSON.stringify(nextLoanState))
      setLoanState(nextLoanState)
    }

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
    const previousMarketInterest = loadMarketInterest(state.seasonId)
    const activeLoans: LoanRecord[] = (() => {
      try {
        const stored: LoanState = JSON.parse(localStorage.getItem(LOANS_KEY) ?? '{"records":[]}')
        return stored.records ?? []
      } catch { return [] }
    })()
    const result = simulateWorldDay(nextDate, state.seasonId, state.worldClubs, state.playersForWorld, career.club.id, state.performanceByClub, previousMarketInterest, activeLoans)
    localStorage.setItem(marketInterestStorageKey(state.seasonId), JSON.stringify(result.marketInterest))
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

      const negotiations = loadMarketNegotiations(state.seasonId)
      const dueNegotiation = negotiations.find(item => item.nextDate <= currentDate)
      if (dueNegotiation) {
        const player = state.playersForWorld.find(item => item.id === dueNegotiation.playerId)
        const buyer = state.worldClubs.find(item => item.id === dueNegotiation.buyerId)
        if (player && buyer && player.clubId === career.club.id) {
          const responseRoll = eventHash(`negotiation:${dueNegotiation.playerId}:${dueNegotiation.buyerId}:${dueNegotiation.round}:${currentDate}`) % 100
          const marketCeiling = Math.max(250000, Math.round(player.marketValue * 1.25 / 50000) * 50000)
          const affordable = Math.min(buyer.budget * 0.9, marketCeiling)
          let responseFee = dueNegotiation.offer
          if (responseRoll < 55 && dueNegotiation.offer <= affordable) {
            responseFee = dueNegotiation.offer
          } else if (responseRoll < 85 && dueNegotiation.offer < affordable) {
            responseFee = Math.min(affordable, Math.round(dueNegotiation.offer * 1.08 / 50000) * 50000)
          } else {
            responseFee = 0
          }

          const remainingNegotiations = negotiations.filter(item => !(item.playerId === dueNegotiation.playerId && item.buyerId === dueNegotiation.buyerId))
          saveMarketNegotiations(state.seasonId, remainingNegotiations)

          if (responseFee > 0) {
            event = {
              type: 'player_offer',
              date: currentDate,
              playerId: player.id,
              fromClubId: career.club.id,
              toClubId: buyer.id,
              fee: responseFee,
              offers: [{ playerId: player.id, fromClubId: career.club.id, toClubId: buyer.id, fee: responseFee }],
              negotiationRound: dueNegotiation.round,
              negotiationStatus: 'counter_response',
            }
            break
          }

          news.push({
            id: `negotiation-ended:${player.id}:${buyer.id}:${currentDate}`,
            date: currentDate,
            title: 'Negociação encerrada',
            message: `${buyer.name} encerrou as conversas por ${player.first_name} ${player.last_name} após a contraproposta.`,
            tone: 'warning',
            category: 'market',
            priority: 74,
          })
        }
      }

      const previousMarketInterest = loadMarketInterest(state.seasonId)
      const activeLoans: LoanRecord[] = (() => {
        try {
          const stored: LoanState = JSON.parse(localStorage.getItem(LOANS_KEY) ?? '{"records":[]}')
          return [...(stored.records ?? []), ...results.flatMap(item => item.loans ?? [])]
        } catch { return results.flatMap(item => item.loans ?? []) }
      })()
      const result = simulateWorldDay(currentDate, state.seasonId, state.worldClubs, state.playersForWorld, career.club.id, state.performanceByClub, previousMarketInterest, activeLoans)
      localStorage.setItem(marketInterestStorageKey(state.seasonId), JSON.stringify(result.marketInterest))
      results.push(result)
      news.push(...buildWorldNews(result, state.worldClubs, state.playersForWorld))
      const offer = result.offers[0]
      if (offer) {
        const playerOffers = result.offers.filter(item => item.playerId === offer.playerId)
        event = { type: 'player_offer', date: result.date, ...offer, offers: playerOffers, negotiationRound: 0, negotiationStatus: 'new' }
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
    | { type: 'player_offer'; date: string; playerId: string; fromClubId: string; toClubId: string; fee: number; offers: WorldSimulationResult['offers']; negotiationRound?: number; negotiationStatus?: 'new' | 'counter_response' }
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
    if (boardState.managerStatus !== 'active' && boardState.managerStatus !== 'renewed') return false
    if (!fromClock || !canAdvanceDay(fromClock, nextMatchDate)) return false
    const nextClock = advanceSeasonDay(fromClock)
    const worldResult = await simulateWorldUntilMatch(fromClock.currentDate, nextClock.currentDate)
    if (worldResult?.event) setPendingEvent(worldResult.event)
    const nextPlayers = recoverPlayers(players, 8)
    if (nextClock.currentDate.slice(0, 7) !== fromClock.currentDate.slice(0, 7)) {
      const salaryExpense = calculateMonthlySalaryExpense(salaryTotal)
      const monthlyTransactions = [
        createTransaction(nextClock.currentDate, 'salary', `Folha salarial de ${nextClock.currentDate.slice(0, 7)}`, salaryExpense, undefined, `salary:${nextClock.currentDate.slice(0, 7)}`),
        createTransaction(nextClock.currentDate, 'sponsorship', commercial.sponsor.name, commercial.sponsor.monthly, undefined, `sponsor:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
        createTransaction(nextClock.currentDate, 'other', 'Manutenção do estádio', -commercial.stadium.maintenance, undefined, `stadium-maintenance:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
      ]
      let nextBalance = financeBalance
      let nextTransactions = financeTransactions
      for (const transaction of monthlyTransactions) {
        if (nextTransactions.some(item => item.eventId === transaction.eventId)) continue
        nextTransactions = [...nextTransactions, transaction]
        nextBalance = applyTransaction(nextBalance, transaction)
      }
      setFinanceBalance(nextBalance)
      setFinanceTransactions(nextTransactions)
      localStorage.setItem(FINANCE_KEY, JSON.stringify(nextTransactions))
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
    if (boardState.managerStatus !== 'active' && boardState.managerStatus !== 'renewed') return
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
          const monthlyTransactions = [
            createTransaction(nextClock.currentDate, 'salary', `Folha salarial de ${nextClock.currentDate.slice(0, 7)}`, salaryExpense, undefined, `salary:${nextClock.currentDate.slice(0, 7)}`),
            createTransaction(nextClock.currentDate, 'sponsorship', commercial.sponsor.name, commercial.sponsor.monthly, undefined, `sponsor:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
            createTransaction(nextClock.currentDate, 'other', 'Manutenção do estádio', -commercial.stadium.maintenance, undefined, `stadium-maintenance:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
          ]
          for (const transaction of monthlyTransactions) {
            if (!nextTransactions.some(item => item.eventId === transaction.eventId)) {
              nextTransactions = [...nextTransactions, transaction]
              nextBalance = applyTransaction(nextBalance, transaction)
            }
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

  function counterPlayerOffer(offer: WorldSimulationResult['offers'][number]) {
    if (!pendingEvent || pendingEvent.type !== 'player_offer') return
    const raw = window.prompt('Digite o valor da contraproposta:', String(Math.round(offer.fee * 1.12 / 50000) * 50000))
    if (!raw) return
    const normalized = Number(raw.replace(/[^0-9]/g, ''))
    if (!Number.isFinite(normalized) || normalized <= offer.fee) return

    const negotiation: MarketNegotiation = {
      playerId: offer.playerId,
      buyerId: offer.toClubId,
      sellerId: offer.fromClubId,
      offer: Math.round(normalized / 50000) * 50000,
      round: (pendingEvent.negotiationRound ?? 0) + 1,
      nextDate: addDays(pendingEvent.date, 7),
    }
    const existing = loadMarketNegotiations(career.season)
      .filter(item => !(item.playerId === negotiation.playerId && item.buyerId === negotiation.buyerId))
    saveMarketNegotiations(career.season, [...existing, negotiation])
    setPendingEvent(null)
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

  if (view === 'calendar') return <CompetitionCenter clubs={clubs} currentClubId={career.club.id} playedMatches={Object.values(playedMatches)} seasonName={career.season} back={() => goToView('overview')} />
  if (view === 'news') return <PressCenter club={career.club} news={worldNews} back={() => goToView('overview')} />
  if (view === 'finance') return <FinanceScreen balance={financeBalance} transactions={financeTransactions} salaryTotal={salaryTotal} initialCapital={initialCapital} back={() => goToView('overview')} />
  if (view === 'stadium') return <StadiumScreen club={career.club} commercial={commercial} balance={financeBalance} fanSatisfaction={fanState.satisfaction} reputation={career.club.reputation ?? 50} onUpgrade={async (nextStadium, cost) => {
    const transaction = createTransaction(toDateKey(new Date().toISOString()), 'other', 'Melhoria do estádio', -cost, undefined, 'stadium:' + career.season + ':' + nextStadium.level)
    const nextBalance = addFinanceTransaction(transaction) ?? financeBalance
    const nextCommercial = { ...commercial, stadium: nextStadium }
    await saveCommercial(nextCommercial)
    const nextCareer = { ...career, club: { ...career.club, budget: nextBalance } }
    localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
    onCareerUpdate(nextCareer)
  }} back={() => goToView('overview')} />
  if (view === 'trophies') return <GameSection title="Sala de Troféus" eyebrow="História" icon={<Trophy size={22} />} description="Os títulos e campanhas que constroem a história do clube aparecerão aqui." back={() => goToView('overview')} />
  if (view === 'legacy') return <GameSection title="Conquistas & Legado" eyebrow="História" icon={<Medal size={22} />} description="Registros de carreira, marcas, conquistas e legado do treinador." back={() => goToView('overview')} />
  if (view === 'stats') return <GameSection title="Estatísticas" eyebrow="Mundo" icon={<BarChart3 size={22} />} description="Desempenho do clube, jogadores e campeonato em uma visão dedicada." back={() => goToView('overview')} />
  if (view === 'settings') return <GameSection title="Configurações" eyebrow="Jogo" icon={<Settings size={22} />} description="Preferências da carreira e configurações do jogo." back={() => goToView('overview')} />

  if (view === 'press') return <PressCenter club={career.club} news={worldNews} back={() => goToView('overview')} />
  if (view === 'competitions') return <CompetitionCenter clubs={clubs} currentClubId={career.club.id} playedMatches={Object.values(playedMatches)} seasonName={career.season} back={() => goToView('overview')} />
  if (view === 'loans') return <LoanMarket club={{ ...career.club, budget: financeBalance }} clubs={clubs} balance={financeBalance} today={clock?.currentDate ?? SEASON_START} transferOverrides={transferState.playerClubOverrides} state={loanState} currentSquadSize={players.length} onLoan={(record, nextState) => { const transaction = createTransaction(record.date, record.loanClubId === career.club.id ? 'transfer_out' : 'transfer_in', `${record.loanClubId === career.club.id ? 'Empréstimo recebido' : 'Empréstimo cedido'} · ${record.playerName}`, record.loanClubId === career.club.id ? -record.fee : record.fee, undefined, `loan:${record.id}`); const finalTransactions = financeTransactions.some(item => item.eventId === transaction.eventId) ? financeTransactions : [...financeTransactions, transaction]; const finalBalance = applyTransaction(financeBalance, transaction); setLoanState(nextState); localStorage.setItem(LOANS_KEY, JSON.stringify(nextState)); saveFinance(finalBalance, finalTransactions); const nextCareer = { ...career, club: { ...career.club, budget: finalBalance } }; localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer)); onCareerUpdate(nextCareer); goToView('overview') }} back={() => goToView('overview')} />
  if (view === 'market') return <TransferMarket club={{ ...career.club, budget: financeBalance }} clubs={clubs} balance={financeBalance} today={clock?.currentDate ?? SEASON_START} state={transferState} loanState={loanState} currentSquadSize={players.length} personality={career.personality} onTransfer={(record, nextState, nextBalance) => { const transaction = createTransaction(record.date, record.kind === 'purchase' ? 'transfer_out' : 'transfer_in', `${record.kind === 'purchase' ? 'Compra' : 'Venda'} · ${record.playerName}`, record.kind === 'purchase' ? -record.fee : record.fee, undefined, `transfer:${record.id}`); const finalTransactions = financeTransactions.some(item => item.eventId === transaction.eventId) ? financeTransactions : [...financeTransactions, transaction]; const finalBalance = applyTransaction(financeBalance, transaction); setTransferState(nextState); localStorage.setItem(TRANSFERS_KEY, JSON.stringify(nextState)); saveFinance(finalBalance, finalTransactions); const nextCareer = { ...career, club: { ...career.club, budget: finalBalance } }; localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer)); onCareerUpdate(nextCareer); goToView('overview') }} back={() => goToView('overview')} />
  if (view === 'squad') return viewOpponent
    ? <OpponentSquad players={opponentPlayers} club={opponent ?? null} today={clock?.currentDate ?? SEASON_START} back={() => { setViewOpponent(false); goToView('overview') }} />
    : <Squad players={players} club={career.club} today={clock?.currentDate ?? SEASON_START} onContractChange={(oldSalary, newSalary) => setSalaryTotal(previous => previous - oldSalary + newSalary)} back={() => goToView('overview')} />
  if (view === 'training') return <Training players={players} club={{ ...career.club, budget: financeBalance }} salaryTotal={salaryTotal} nextFixture={nextFixture} back={() => goToView('overview')} onComplete={(nextPlayers, nextCareer, cost) => { setPlayers(nextPlayers); const transaction = createTransaction(clock?.currentDate ?? SEASON_START, 'training', 'Treinamento do elenco', -cost, undefined, `training:${nextFixture?.id ?? (clock?.currentDate ?? 'unknown')}`); const nextBalance = addFinanceTransaction(transaction) ?? financeBalance; const finalCareer = { ...nextCareer, club: { ...nextCareer.club, budget: nextBalance } }; saveFinance(nextBalance, [...financeTransactions, transaction]); localStorage.setItem(CAREER_KEY, JSON.stringify(finalCareer)); onCareerUpdate(finalCareer); goToView('overview') }} />
  if (view === 'tactics') return <Tactics players={players} club={career.club} today={clock?.currentDate ?? SEASON_START} back={() => goToView('overview')} />
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
          season_id: activeMatchFixture.season_id,
          round: activeMatchFixture.round,
        },
      }

      // Retorna imediatamente ao clube; a atualização detalhada do mundo continua em segundo plano.
      setActiveMatchFixture(null)
      goToView('overview')

      const { simulateMatch } = await import('./engine/match')
      const { data: roundFixtures } = await supabase
        .from('fixtures')
        .select('id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,competitions!inner(name),home_club:clubs!fixtures_home_club_id_fkey(name,short_name,city,stadium,logo_url),away_club:clubs!fixtures_away_club_id_fkey(name,short_name,city,stadium,logo_url)')
        .eq('competition_id', activeMatchFixture.competition_id)
        .eq('season_id', activeMatchFixture.season_id ?? '')
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
          .select('club_id,squad_number,players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale,injured_until,suspended_until,yellow_cards,red_cards)')
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
            season_id: fixture.season_id,
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

      // Consequências disciplinares e médicas passam a fazer parte do elenco real.
      // O status é salvo no jogador, então a disponibilidade afeta as partidas seguintes.
      const fixtureDates = new Map<string, string>([
        [activeMatchFixture.id, toDateKey(activeMatchFixture.scheduled_at)],
        ...remainingFixtures.map(item => [item.id, toDateKey(item.scheduled_at)] as [string, string]),
      ])
      const involvedClubIds = [...new Set(Object.values(matchesToPersist).flatMap(match => [match.home_club_id, match.away_club_id]))]
      const { data: upcomingAvailabilityFixtures } = activeMatchFixture.season_id
        ? await supabase
          .from('fixtures')
          .select('home_club_id,away_club_id,scheduled_at,status')
          .eq('season_id', activeMatchFixture.season_id)
          .eq('status', 'scheduled')
          .order('scheduled_at')
        : { data: [] }
      const upcomingByClub = new Map<string, string[]>()
      for (const fixture of upcomingAvailabilityFixtures ?? []) {
        const date = toDateKey(fixture.scheduled_at)
        if (!involvedClubIds.includes(fixture.home_club_id) && !involvedClubIds.includes(fixture.away_club_id)) continue
        for (const clubId of [fixture.home_club_id, fixture.away_club_id]) {
          if (!involvedClubIds.includes(clubId)) continue
          const dates = upcomingByClub.get(clubId) ?? []
          dates.push(date)
          upcomingByClub.set(clubId, dates)
        }
      }

      const availabilityUpdates = new Map<string, { injuredUntil?: string | null; suspendedUntil?: string | null; yellowCards?: number; redCards?: number }>()
      for (const [fixtureId, match] of Object.entries(matchesToPersist)) {
        const matchDate = fixtureDates.get(fixtureId) ?? toDateKey(activeMatchFixture.scheduled_at)
        for (const event of match.events ?? []) {
          if (!event.playerId) continue
          const current = matchPlayers.get(event.playerId)
          if (!current) continue
          const previous = availabilityUpdates.get(event.playerId) ?? {}
          const clubId = event.team === 'home' ? match.home_club_id : match.away_club_id
          const upcomingDates = upcomingByClub.get(clubId) ?? []

          if (event.type === 'card') {
            const previousYellow = Number(previous.yellowCards ?? current.yellowCards ?? 0)
            const nextYellow = previousYellow + 1
            previous.yellowCards = nextYellow
            if (shouldSuspendForYellowAccumulation(previousYellow, nextYellow)) {
              previous.suspendedUntil = calculateSuspensionReturnDate(matchDate, upcomingDates, 1)
            }
          }

          if (event.type === 'red_card') {
            previous.redCards = Number(previous.redCards ?? current.redCards ?? 0) + 1
            if (event.text.includes('Segundo amarelo')) {
              const previousYellow = Number(previous.yellowCards ?? current.yellowCards ?? 0)
              const nextYellow = previousYellow + 1
              previous.yellowCards = nextYellow
            }
            const matches = suspensionMatchesForRed(event.text)
            previous.suspendedUntil = calculateSuspensionReturnDate(matchDate, upcomingDates, matches)
          }

          if (event.type === 'injury') {
            previous.injuredUntil = calculateInjuryReturnDate(matchDate)
          }

          availabilityUpdates.set(event.playerId, previous)
        }
      }
      if (availabilityUpdates.size) {
        await Promise.all([...availabilityUpdates.entries()].map(([playerId, values]) => {
          const payload: Record<string, unknown> = {}
          if (values.injuredUntil !== undefined) payload.injured_until = values.injuredUntil
          if (values.suspendedUntil !== undefined) payload.suspended_until = values.suspendedUntil
          if (values.yellowCards !== undefined) payload.yellow_cards = values.yellowCards
          if (values.redCards !== undefined) payload.red_cards = values.redCards
          return supabase.from('players').update(payload).eq('id', playerId)
        }))
        setPlayers(current => current.map(player => {
          const values = availabilityUpdates.get(player.id)
          return values ? {
            ...player,
            injuredUntil: values.injuredUntil ?? player.injuredUntil ?? null,
            suspendedUntil: values.suspendedUntil ?? player.suspendedUntil ?? null,
            yellowCards: values.yellowCards ?? player.yellowCards ?? 0,
            redCards: values.redCards ?? player.redCards ?? 0,
          } : player
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
          seasonId,
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
        .eq('season_id', activeMatchFixture.season_id ?? '')
        .eq('status', 'scheduled')
        .order('scheduled_at')

      const refreshed = (refreshedFixtures ?? [])
        .map(normalizeFixture)
        .filter(item => !nextMatches[item.id])
      setUpcomingFixtures(refreshed)
      setNextFixture(refreshed[0] ?? null)
      applyMatchManagement(result, activeMatchFixture)
      if (matchHome && clock) {
        const userOutcome: 'W' | 'D' | 'L' = result.homeScore > result.awayScore ? 'W' : result.homeScore < result.awayScore ? 'L' : 'D'
        const attendance = estimateFanAttendance(career.club.reputation, fanState.satisfaction)
        const revenue = calculateMatchRevenueFromAttendance(attendance, 35, userOutcome)
        const transaction = createTransaction(toDateKey(activeMatchFixture.scheduled_at), 'match_revenue', `Bilheteria · ${activeMatchFixture.home_club?.short_name ?? 'Mandante'} · ${attendance} torcedores`, revenue, undefined, `match_revenue:${activeMatchFixture.id}`)
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
    }
    return <InteractiveMatch key={activeMatchFixture.id} userClubId={career.club.id} formation={formation as Formation} fixture={activeMatchFixture} homePlayers={matchHome ? players : opponentPlayers} awayPlayers={matchHome ? opponentPlayers : players} tactic={tactic as 'balanced' | 'offensive' | 'defensive'} coachStyle={career.style} coachPersonality={career.personality} back={finishMatch} cancel={() => { setActiveMatchFixture(null); goToView('overview') }} />
  }

  return <GameShell
    career={career}
    activeView={view}
    onNavigate={goToView}
    onAdvanceDay={matchReady ? restOneDay : advanceToNextMatch}
    canAdvance={!advancingDays && (matchReady || (clock?.currentDate && nextMatchDate ? clock.currentDate < nextMatchDate : false))}
  >
    <main className="min-h-screen">
      <section className="px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="label-mono text-white/45">Visão geral · {career.season.replace('Temporada ', '')}</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Visão geral</h1>
          </div>
          <button onClick={newCareer} className="hidden rounded-lg border border-white/8 px-3 py-2 text-xs font-semibold text-white/45 transition hover:border-white/15 hover:text-white lg:block">Nova carreira</button>
        </div>

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

          if (pendingEvent.type === 'player_offer' && offeredPlayer) return <section className="mb-6 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5">
            <p className="label-mono text-emerald-300/65">Decisão importante</p>
            <h2 className="mt-2 text-xl font-bold">{offerOptions.length > 1 ? 'Clubes estão disputando seu jogador' : 'Recebemos uma proposta por um jogador'}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{offeredPlayer.first_name} {offeredPlayer.last_name} chamou atenção de {offerOptions.length} clube(s). {offerOptions.length > 1 ? 'As propostas abaixo refletem a concorrência pelo jogador.' : 'Você pode aceitar, recusar ou tentar melhorar o valor.'}</p>
            <div className="mt-4 space-y-2">{offerOptions.map(offer => {
              const buyer = clubs.find(item => item.id === offer.toClubId)
              if (!buyer) return null
              return <div key={offer.toClubId} className="flex flex-col gap-3 rounded-lg border border-white/6 bg-black/15 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold">{buyer.name}</p><p className="mt-1 text-xs text-white/40">Proposta de {money(offer.fee)}</p></div>
                <div className="flex gap-2"><button onClick={() => respondToPlayerOffer(true, offer)} className="rounded-lg bg-emerald-400 px-4 py-2 text-xs font-bold text-[#06100c]">Aceitar</button><button onClick={() => counterPlayerOffer(offer)} className="rounded-lg border border-amber-400/25 px-4 py-2 text-xs font-semibold text-amber-200">Contraproposta</button></div>
              </div>
            })}</div>
            <button onClick={() => respondToPlayerOffer(false)} className="mt-3 text-xs font-semibold text-white/45 hover:text-white">Recusar todas</button>
          </section>

          if (pendingEvent.type === 'board_message') return <section className="mb-6 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-5">
            <p className="label-mono text-amber-200/70">Mensagem da diretoria</p><h2 className="mt-2 text-xl font-bold">{pendingEvent.title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{pendingEvent.message}</p><button onClick={() => respondToImportantEvent('continue')} className="mt-4 rounded-lg bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#06100c]">Entendido</button>
          </section>

          if (pendingEvent.type === 'player_message' && messagePlayer) return <section className="mb-6 rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-5">
            <p className="label-mono text-sky-300/70">Mensagem de jogador</p><h2 className="mt-2 text-xl font-bold">{pendingEvent.title}</h2><p className="mt-2 text-sm leading-6 text-white/55">{pendingEvent.message}</p><button onClick={() => respondToImportantEvent('continue')} className="mt-4 rounded-lg bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#06100c]">Conversar</button>
          </section>

          if (pendingEvent.type === 'player_request' && messagePlayer) return <section className="mb-6 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-5">
            <p className="label-mono text-amber-200/70">Decisão sobre o elenco</p><h2 className="mt-2 text-xl font-bold">{pendingEvent.title}</h2><p className="mt-2 text-sm leading-6 text-white/55">{pendingEvent.message}</p><div className="mt-4 flex gap-2"><button onClick={() => respondToPlayerRequest(pendingEvent.request === 'renewal' ? 'renew' : 'transfer')} className="rounded-lg bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#06100c]">{pendingEvent.request === 'renewal' ? 'Abrir negociação' : 'Aceitar saída'}</button><button onClick={() => respondToPlayerRequest('continue')} className="rounded-lg border border-white/8 px-4 py-2.5 text-xs font-semibold text-white/55">Ainda não</button></div>
          </section>

          if (pendingEvent.type === 'manager_offer' && managerClub) return <section className="mb-6 rounded-xl border border-violet-400/15 bg-violet-400/[0.04] p-5">
            <p className="label-mono text-violet-300/70">Proposta para o treinador</p><h2 className="mt-2 text-xl font-bold">{managerClub.name} quer contratar você</h2><p className="mt-2 text-sm leading-6 text-white/55">{pendingEvent.message}</p><div className="mt-4 flex gap-2"><button onClick={() => respondToImportantEvent('continue')} className="rounded-lg border border-white/8 px-4 py-2.5 text-xs font-semibold text-white/55">Recusar</button><button onClick={() => respondToImportantEvent('accept')} className="rounded-lg bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#06100c]">Aceitar proposta</button></div>
          </section>

          return null
        })()}

        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          <div className="min-w-0 space-y-5">
            <section className="overflow-hidden rounded-2xl border border-white/5 bg-[#131b2a]">
              <div className="relative overflow-hidden px-5 py-5 sm:px-7 sm:py-6">
                <div className="absolute inset-0 opacity-90" style={{ background: 'var(--gradient-match)' }} />
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-black/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/85">{nextFixture?.competition_name ?? 'Liga Nacional do Brasil'}</span>
                    {nextFixture && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">Rodada {nextFixture.round}</span>}
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">{home ? 'Em casa' : 'Fora'}</span>
                  </div>
                  <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
                    <ClubMatchSide club={career.club} overall={avg} align="right" />
                    <div className="text-center">
                      <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-white/70">VS</p>
                      <p className="mt-2 text-[10px] font-medium text-white/65">{nextMatchDate ? formatSeasonDate(nextMatchDate) : 'Sem partida'}</p>
                    </div>
                    <ClubMatchSide club={opponent} overall={opponent ? Math.round(opponentStrength) : 0} align="left" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 bg-[#101827] px-5 py-4 sm:px-7">
                <div><p className="label-mono text-white/35">Data da partida</p><p className="mt-1 text-sm font-bold tabular-nums">{clock?.currentDate ? formatSeasonDate(clock.currentDate) : '—'}</p></div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={restOneDay} disabled={!clock || !canAdvanceDay(clock, nextMatchDate) || advancingDays} className="game-button game-button-secondary">{advancingDays ? 'Avançando...' : 'Avançar dia'}</button>
                  <button onClick={() => goToView('tactics')} className="game-button game-button-secondary">Escalação</button>
                  <button onClick={() => { if (opponent) { setViewOpponent(true); goToView('squad') } }} className="game-button game-button-secondary">Ver adversário</button>
                  <button disabled={boardState.managerStatus === 'dismissed' || boardState.managerStatus === 'contract_ended' || advancingDays || !nextFixture} onClick={() => { if (nextFixture) { if (matchReady) { setActiveMatchFixture(JSON.parse(JSON.stringify(nextFixture))); goToView('match') } else { advanceToNextMatch() } } }} className="game-button game-button-primary">{matchReady ? 'Jogar partida' : (advancingDays ? 'Avançando...' : 'Aguardar dia de jogo')}</button>
                </div>
              </div>
            </section>

            <section className="game-panel">
              <div className="flex items-center justify-between"><div><p className="label-mono text-white/35">Últimos resultados</p><h2 className="mt-1 font-display text-2xl font-bold">Forma recente</h2></div><button onClick={() => goToView('calendar')} className="text-xs font-bold text-emerald-300">Calendários <ChevronRight size={14} className="inline" /></button></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-5">
                {recentUserResults.length ? recentUserResults.map(item => <div key={item.id} className="rounded-lg border border-white/5 bg-black/10 p-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase text-white/30">{item.competition}</span><span className={item.result === 'W' ? 'text-emerald-300' : item.result === 'D' ? 'text-amber-200' : 'text-red-300'}>{item.result}</span></div>
                  <div className="mt-3 text-center font-display text-xl font-bold tabular-nums">{item.score}</div>
                  <p className="mt-1 truncate text-center text-[10px] text-white/35">{item.opponent}</p>
                </div>) : <p className="text-sm text-white/35">Ainda não há resultados disputados.</p>}
              </div>
            </section>

            <section className="game-panel">
              <div className="flex items-center justify-between"><div><p className="label-mono text-white/35">Campeonato</p><h2 className="mt-1 font-display text-2xl font-bold">Classificação</h2></div><span className="text-xs font-bold text-white/35">Liga Nacional do Brasil</span></div>
              <div className="mt-4 overflow-hidden rounded-xl border border-white/5">
                <div className="grid grid-cols-[34px_1fr_44px_44px_44px] bg-white/[0.025] px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-white/30"><span>#</span><span>Clube</span><span className="text-center">P</span><span className="text-center">J</span><span className="text-center">SG</span></div>
                {table.slice(0, 8).map((team, i) => <div key={team.id} className={`grid grid-cols-[34px_1fr_44px_44px_44px] items-center border-t border-white/5 px-3 py-2.5 text-xs ${team.id === career.club.id ? 'bg-emerald-400/[0.06]' : ''}`}>
                  <span className={`font-bold ${i === 0 ? 'text-amber-300' : i < 4 ? 'text-emerald-300/75' : i >= 6 ? 'text-red-300/65' : 'text-white/30'}`}>{i + 1}</span><span className="truncate font-medium">{team.name}</span><span className="text-center font-bold tabular-nums">{team.points}</span><span className="text-center text-white/40 tabular-nums">{team.played}</span><span className="text-center text-white/40 tabular-nums">{team.gf - team.ga}</span>
                </div>)}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="game-panel">
              <div className="flex items-start justify-between gap-3"><div><p className="label-mono text-white/35">Diretoria</p><h2 className="mt-1 font-display text-xl font-bold">Confiança</h2></div><span className="display-number text-2xl font-bold text-emerald-300">{boardState.confidence}</span></div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-400" style={{ width: Math.max(0, Math.min(100, boardState.confidence)) + '%' }} /></div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs"><span className="text-white/45">Meta</span><span className="font-bold text-white/75">{boardState.objectiveLabel}</span></div>
            </section>

            <section className="game-panel">
              <div className="flex items-start justify-between"><div><p className="label-mono text-white/35">Torcida</p><h2 className="mt-1 font-display text-xl font-bold">Satisfação</h2></div><span className="display-number text-2xl font-bold text-amber-200">{fanState.satisfaction}</span></div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-amber-300" style={{ width: Math.max(0, Math.min(100, fanState.satisfaction)) + '%' }} /></div>
              <div className="mt-3 flex items-center justify-between text-xs"><span className="text-white/40">Pressão</span><span className="font-bold text-white/65">{fanState.pressure}%</span></div>
              <div className="mt-3 flex gap-1.5">{fanState.recentResults.length ? fanState.recentResults.slice(-5).map((result, index) => <span key={index} className={`flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-bold ${result === 'W' ? 'bg-emerald-400/15 text-emerald-300' : result === 'D' ? 'bg-amber-400/15 text-amber-200' : 'bg-red-400/15 text-red-300'}`}>{result}</span>) : <span className="text-xs text-white/30">Sem jogos</span>}</div>
            </section>

            <section className="game-panel">
              <div className="flex items-center justify-between"><div><p className="label-mono text-white/35">Elenco</p><h2 className="mt-1 font-display text-xl font-bold">Pontos de atenção</h2></div><button onClick={() => goToView('squad')} className="text-xs font-bold text-emerald-300">Ver elenco</button></div>
              <div className="mt-4 space-y-2">{rosterAlerts.slice(0, 4).map(alert => <div key={alert.kind} className="border-l-2 border-amber-300/60 bg-white/[0.02] px-3 py-2.5"><p className="text-xs font-semibold">{alert.title}</p><p className="mt-1 text-[10px] leading-4 text-white/40">{alert.description}</p></div>)}{!rosterAlerts.length && <p className="text-xs text-white/35">Nenhum ponto de atenção no momento.</p>}</div>
            </section>

            <section className="game-panel">
              <div className="flex items-center justify-between"><div><p className="label-mono text-white/35">Mundo</p><h2 className="mt-1 font-display text-xl font-bold">Notícias recentes</h2></div><button onClick={() => goToView('news')} className="text-xs font-bold text-emerald-300">Todas</button></div>
              <div className="mt-4 space-y-2">{worldNews.slice(0, 4).map(item => <div key={item.id} className="flex gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0"><div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${item.tone === 'positive' ? 'bg-emerald-400/10 text-emerald-300' : item.tone === 'warning' ? 'bg-amber-400/10 text-amber-200' : 'bg-white/5 text-white/45'}`}><Newspaper size={13} /></div><div className="min-w-0"><p className="line-clamp-2 text-xs font-semibold">{item.title}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/35">{item.message}</p></div></div>)}{!worldNews.length && <p className="text-xs text-white/35">As notícias aparecerão conforme o mundo avançar.</p>}</div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  </GameShell>
}

function ClubMatchSide({ club, overall, align }: { club: { name: string; short_name?: string; logo_url?: string } | null | undefined; overall: number; align: 'left' | 'right' }) {
  const content = <div className={`flex items-center gap-3 ${align === 'right' ? 'justify-end text-right' : 'text-left'}`}>
    {align === 'right' && <div><p className="truncate text-sm font-black sm:text-base">{club?.short_name ?? club?.name ?? 'Seu clube'}</p><p className="mt-1 font-display text-xl font-bold tabular-nums text-white/85">OVR {overall}</p></div>}
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/90 p-2 shadow-lg sm:h-16 sm:w-16">
      {club?.logo_url ? <img src={club.logo_url} alt="" className="h-full w-full object-contain" /> : <Shield size={25} className="text-slate-700" />}
    </div>
    {align === 'left' && <div><p className="truncate text-sm font-black sm:text-base">{club?.short_name ?? club?.name ?? 'Adversário'}</p><p className="mt-1 font-display text-xl font-bold tabular-nums text-white/85">OVR {overall}</p></div>}
  </div>
  return content
}

function GameShell({ career, activeView, onNavigate, onAdvanceDay, canAdvance, children }: {
  career: ManagerProfile
  activeView: string
  onNavigate: (view: DashboardView) => void
  onAdvanceDay: () => void
  canAdvance: boolean
  children: ReactNode
}) {
  const groups: Array<{ label: string; items: Array<{ key: DashboardView; label: string; icon: typeof Settings }> }> = [
    {
      label: 'Hoje',
      items: [{ key: 'overview', label: 'Dashboard', icon: House }],
    },
    {
      label: 'Clube',
      items: [
        { key: 'calendar', label: 'Calendários', icon: CalendarDays },
        { key: 'news', label: 'Notícias', icon: Newspaper },
        { key: 'squad', label: 'Elencos', icon: Users },
        { key: 'tactics', label: 'Táticas', icon: Shield },
        { key: 'finance', label: 'Finanças', icon: WalletCards },
        { key: 'stadium', label: 'Estádio', icon: Building2 },
        { key: 'trophies', label: 'Sala de Troféus', icon: Trophy },
        { key: 'legacy', label: 'Conquistas & Legado', icon: Medal },
      ],
    },
    {
      label: 'Mercado',
      items: [{ key: 'market', label: 'Mercado', icon: ShoppingBag }],
    },
    {
      label: 'Mundo',
      items: [{ key: 'stats', label: 'Estatísticas', icon: BarChart3 }],
    },
  ] as const

  const activeLabel = groups.flatMap(group => group.items).find(item => item.key === activeView)?.label ?? 'Futebol Manager'

  return <div className="min-h-screen bg-[#0a0f1a]">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-white/5 bg-[#0d1421] lg:flex lg:flex-col">
      <div className="flex h-16 items-center border-b border-white/5 px-5">
        <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400 text-[11px] font-black text-[#06100c]">FM</div><div><p className="font-display text-sm font-bold tracking-wide">FUTEBOL MANAGER</p><p className="label-mono text-white/25">Carreira</p></div></div>
      </div>
      <nav className="flex-1 overflow-hidden px-3 py-3">
        {groups.map(group => <div key={group.label} className="mb-3">
          <p className="px-3 pb-1.5 label-mono text-white/20">{group.label}</p>
          <div className="space-y-0.5">{group.items.map(item => {
            const Icon = item.icon
            const active = activeView === item.key
            return <button key={item.key} onClick={() => onNavigate(item.key)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${active ? 'bg-emerald-400/10 text-emerald-300' : 'text-white/45 hover:bg-white/[0.035] hover:text-white/80'}`}><Icon size={16} strokeWidth={active ? 2.2 : 1.8} /><span>{item.label}</span></button>
          })}</div>
        </div>)}
        <div className="mb-5">
          <p className="px-3 pb-2 label-mono text-white/20">Extras</p>
          <div className="space-y-0.5">
            <button onClick={() => onNavigate('loans')} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${activeView === 'loans' ? 'bg-emerald-400/10 text-emerald-300' : 'text-white/45 hover:bg-white/[0.035] hover:text-white/80'}`}><Handshake size={16} /><span>Empréstimos</span></button>
            <button onClick={() => onNavigate('training')} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${activeView === 'training' ? 'bg-emerald-400/10 text-emerald-300' : 'text-white/45 hover:bg-white/[0.035] hover:text-white/80'}`}><Dumbbell size={16} /><span>Treinamento</span></button>
          </div>
        </div>
      </nav>
      <div className="border-t border-white/5 p-3">
        <div className="rounded-xl bg-white/[0.025] p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 p-1.5">
              {career.club.logo_url ? <img src={career.club.logo_url} alt="" className="h-full w-full object-contain" /> : <Shield size={16} className="text-white/35" />}
            </div>
            <div className="min-w-0"><p className="truncate text-xs font-bold">{career.club.name}</p><p className="mt-0.5 truncate text-[10px] text-white/30">{career.name}</p></div>
          </div>
          <div className="mt-3 border-t border-white/5 pt-3"><div className="flex items-center justify-between"><span className="text-[10px] text-white/25">Contrato / temporada</span><span className="font-display text-xs font-bold tabular-nums text-emerald-300">—</span></div><div className="mt-1 flex items-center justify-between"><span className="text-[10px] text-white/25">Nível do técnico</span><span className="text-[10px] font-bold text-white/65">Nível 1 · 0 pts</span></div></div>
        </div>
        <button onClick={() => onNavigate('settings')} className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold text-white/35 hover:bg-white/[0.035] hover:text-white/75"><Settings size={16} /><span>Configurações</span></button>
      </div>
    </aside>

    <div className="min-h-screen lg:pl-[248px]">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/5 bg-[#0a0f1a]/90 px-4 backdrop-blur sm:px-6">
        <div className="min-w-0"><p className="label-mono text-white/25">Temporada {career.season.match(/\d{4}/)?.[0] ?? '2026'}</p><p className="truncate text-sm font-semibold text-white/75">{groups.flatMap(group => group.items).find(item => item.key === activeView)?.label ?? 'Futebol Manager'}</p></div>
        <button onClick={onAdvanceDay} disabled={!canAdvance} className="game-button game-button-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-30"><CalendarDays size={14} /> Avançar dia</button>
      </header>
      <div className="pb-24 lg:pb-0">{children}</div>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/5 bg-[#0d1421]/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur lg:hidden">
      <div className="grid grid-cols-5 gap-1">
        {[['overview','Dashboard',House],['calendar','Calendários',CalendarDays],['squad','Elencos',Users],['market','Mercado',ShoppingBag],['stats','Estatísticas',BarChart3]].map(([key,label,Icon]) => <button key={String(key)} onClick={() => onNavigate(key as DashboardView)} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[9px] font-semibold ${activeView === key ? 'text-emerald-300' : 'text-white/35'}`}><Icon size={16} /><span>{String(label)}</span></button>)}
      </div>
    </nav>
  </div>
}

function FinanceScreen({ balance, transactions, salaryTotal, initialCapital, back }: { balance: number; transactions: FinanceTransaction[]; salaryTotal: number; initialCapital: number; back: () => void }) {
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)
  const income = transactions.filter(item => item.amount > 0).reduce((sum, item) => sum + item.amount, 0)
  const expense = transactions.filter(item => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0)
  return <main className="min-h-screen bg-[#0a0f1a] px-4 py-5 sm:px-6 lg:px-8">
    <button onClick={back} className="mb-6 flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white"><ArrowLeft size={15} /> Voltar</button>
    <div className="mb-6"><p className="label-mono text-white/30">Clube · Temporada</p><h1 className="mt-1 font-display text-3xl font-bold">Finanças</h1><p className="mt-2 text-sm text-white/40">O caixa do clube, a folha salarial e tudo o que movimenta sua temporada.</p></div>
    <div className="grid gap-3 md:grid-cols-4">
      <DashboardCard icon={<WalletCards size={18} />} label="Caixa" value={money(balance)} detail="disponível agora" />
      <DashboardCard icon={<Banknote size={18} />} label="Capital inicial" value={money(initialCapital)} detail="início da carreira" />
      <DashboardCard icon={<Users size={18} />} label="Folha mensal" value={money(salaryTotal)} detail="salários do elenco" />
      <DashboardCard icon={<BarChart3 size={18} />} label="Movimentado" value={money(income + expense)} detail={"entradas " + money(income) + " · saídas " + money(expense)} />
    </div>
    <section className="game-panel mt-5"><div className="flex items-center justify-between"><div><p className="label-mono text-white/30">Livro-caixa</p><h2 className="mt-1 font-display text-xl font-bold">Movimentações recentes</h2></div><span className="text-xs text-white/25">{transactions.length} registros</span></div>
      <div className="mt-4 space-y-1.5">{recent.length ? recent.map(item => <div key={item.eventId ?? item.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.description}</p><p className="mt-1 text-[10px] text-white/25">{formatSeasonDate(item.date)}</p></div><span className={item.amount >= 0 ? 'shrink-0 font-mono text-xs font-bold text-emerald-300' : 'shrink-0 font-mono text-xs font-bold text-red-300'}>{item.amount >= 0 ? '+' : ''}{money(item.amount)}</span></div>) : <p className="py-8 text-center text-sm text-white/30">Nenhuma movimentação registrada.</p>}</div>
    </section>
  </main>
}

function StadiumScreen({ club, commercial, balance, fanSatisfaction, reputation, onUpgrade, back }: {
  club: Club
  commercial: { sponsor: SponsorContract; stadium: StadiumState }
  balance: number
  fanSatisfaction: number
  reputation: number
  onUpgrade: (stadium: StadiumState, cost: number) => void | Promise<void>
  back: () => void
}) {
  const stadium = commercial.stadium
  const nextLevel = stadium.level + 1
  const maxed = stadium.level >= 6
  const cost = maxed ? 0 : stadiumUpgradeCost(nextLevel)
  const canUpgrade = !maxed && canUpgradeStadium(stadium, balance)
  const estimatedAttendance = estimateStadiumAttendance(stadium, fanSatisfaction, reputation)
  return <main className="min-h-screen bg-[#0a0f1a] px-4 py-5 sm:px-6 lg:px-8">
    <button onClick={back} className="mb-6 flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white"><ArrowLeft size={15} /> Voltar</button>
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="label-mono text-white/30">Clube · Infraestrutura</p><h1 className="mt-1 font-display text-3xl font-bold">Estádio</h1><p className="mt-2 text-sm text-white/40">{stadium.name} · casa de {club.short_name ?? club.name}</p></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/8 px-3 py-1.5 text-xs font-bold text-emerald-300">Nível {stadium.level}/6</span></div>
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <section className="game-panel overflow-hidden p-0"><div className="relative min-h-[260px] overflow-hidden bg-[radial-gradient(circle_at_50%_20%,rgba(0,196,140,.18),transparent_42%),linear-gradient(180deg,#182638,#0d1623)] p-6"><div className="absolute inset-x-8 bottom-8 h-28 rounded-[50%] border border-emerald-300/15 bg-emerald-400/[0.03]" /><div className="absolute inset-x-14 bottom-12 h-16 rounded-[50%] border border-white/8" /><div className="absolute bottom-16 left-1/2 h-16 w-40 -translate-x-1/2 rounded-[50%] border border-white/10" /><div className="relative flex h-full min-h-[210px] items-start justify-between"><div><p className="label-mono text-white/25">Sua casa</p><p className="mt-2 font-display text-2xl font-bold">{stadium.name}</p><p className="mt-1 text-xs text-white/35">{stadium.capacity.toLocaleString('pt-BR')} lugares</p></div><Building2 size={30} className="text-emerald-300/50" /></div></div><div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5 bg-black/10">
        <Info label="Capacidade" value={stadium.capacity.toLocaleString('pt-BR')} /><Info label="Ingresso" value={money(stadium.baseTicketPrice)} /><Info label="Manutenção" value={money(stadium.maintenance) + '/mês'} /></div></section>
      <section className="game-panel"><p className="label-mono text-white/30">Investimento</p><h2 className="mt-1 font-display text-2xl font-bold">Melhorar estádio</h2><p className="mt-3 text-sm leading-6 text-white/40">Cada nível aumenta a capacidade e melhora o potencial de receita da sua casa. O investimento sai diretamente do caixa do clube.</p>
        <div className="mt-5 rounded-xl border border-white/5 bg-black/10 p-4"><div className="flex items-center justify-between"><span className="text-xs text-white/35">Próximo nível</span><span className="font-display text-lg font-bold">{maxed ? 'MAX' : 'Nível ' + nextLevel}</span></div><div className="mt-3 flex items-center justify-between"><span className="text-xs text-white/35">Custo</span><span className="font-mono text-sm font-bold text-amber-200">{maxed ? '—' : money(cost)}</span></div><div className="mt-3 flex items-center justify-between"><span className="text-xs text-white/35">Caixa disponível</span><span className="font-mono text-sm font-bold">{money(balance)}</span></div></div>
        <button disabled={!canUpgrade} onClick={() => onUpgrade(upgradeStadium(stadium), cost)} className="mt-5 w-full rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-[#06100c] disabled:cursor-not-allowed disabled:opacity-30">{maxed ? 'Estádio no nível máximo' : canUpgrade ? 'Investir ' + money(cost) : 'Caixa insuficiente'}</button>
      </section>
    </div>
    <section className="mt-4 grid gap-4 md:grid-cols-3"><DashboardCard icon={<Users size={18} />} label="Público estimado" value={estimatedAttendance.toLocaleString('pt-BR')} detail="próximo jogo em casa" /><DashboardCard icon={<Medal size={18} />} label="Satisfação" value={String(fanSatisfaction)} detail="impacta a presença da torcida" /><DashboardCard icon={<Banknote size={18} />} label="Patrocínio" value={commercial.sponsor.name} detail={'+' + money(commercial.sponsor.monthly) + ' / mês'} /></section>
  </main>
}

function OpponentSquad({ players, club, today, back }: { players: Player[]; club: { id?: string; name: string; short_name: string; city?: string; stadium?: string; logo_url?: string } | null; today: string; back: () => void }) {
  const coach = club?.id ? getAiCoachProfile(club.id) : null
  const lineup = club && players.length && coach ? selectStartingLineup(players, coach.formation, coach.style, coach.personality, [], {}, 1) : []
  return <main className="min-h-screen bg-[#0a0f1a] px-4 py-5 sm:px-6 lg:px-8">
    <button onClick={back} className="mb-6 flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white"><ArrowLeft size={15} /> Voltar</button>
    <div className="mb-6 flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2">{club?.logo_url ? <img src={club.logo_url} alt="" className="h-full w-full object-contain" /> : <Shield size={24} className="text-slate-500" />}</div><div><p className="label-mono text-white/30">Próximo adversário</p><h1 className="mt-1 font-display text-3xl font-bold">{club?.name ?? 'Adversário'}</h1><p className="mt-1 text-sm text-white/35">{club?.city ?? '—'} · {club?.stadium ?? 'Estádio não informado'} · {formatSeasonDate(today)}</p></div></div>
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]"><section className="game-panel"><p className="label-mono text-white/30">Escalação provável</p><h2 className="mt-1 font-display text-xl font-bold">{coach?.formation ?? '—'} · {coach?.tactic === 'offensive' ? 'Ofensivo' : coach?.tactic === 'defensive' ? 'Defensivo' : 'Equilibrado'}</h2><div className="mt-4 space-y-2">{lineup.map(item => <div key={item.player.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-3 py-2.5"><div><p className="text-xs font-bold">{item.player.first_name} {item.player.last_name}</p><p className="mt-0.5 text-[9px] uppercase tracking-wider text-white/25">{item.role} · OVR {playerOverall(item.player)}</p></div><span className="font-mono text-[9px] text-white/25">#{item.player.id.slice(0,4)}</span></div>)}</div></section><section className="game-panel"><div className="relative mx-auto aspect-[4/5] max-w-[430px] overflow-hidden rounded-2xl border border-white/10 bg-[#123b2d]"><div className="absolute inset-3 rounded-xl border border-white/30" />{lineup.map((item,index) => <div key={item.player.id} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{left: playerFieldPositionForRole(item.role,index) + '%', top: playerFieldY(item.role,index) + '%'}}><span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-[9px] font-black text-[#1a0b00]">{item.player.first_name[0]}{item.player.last_name[0]}</span><span className="mt-1 block max-w-16 truncate bg-black/50 px-1 text-[8px] font-bold">{item.player.last_name}</span></div>)}</div></section></div>
  </main>
}
function playerFieldPositionForRole(role: string, index: number) {
  const x: Record<string, number> = { GK:50, CB:index%2?65:35, LB:14, RB:86, DM:index%2?38:50, CM:index%2?66:34, AM:50, LW:18, RW:82, ST:50 }
  return x[role] ?? 50
}
function playerFieldY(role: string, index: number) {
  const y: Record<string, number> = { GK:94, CB:78, LB:80, RB:80, DM:66, CM:58, AM:46, LW:43, RW:43, ST:30 }
  return y[role] ?? (30 + (index % 5) * 12)
}
function GameSection({ title, eyebrow, icon, description, back }: { title: string; eyebrow: string; icon: ReactNode; description: string; back: () => void }) {
  return <main className="min-h-screen bg-[#0a0f1a] px-4 py-5 sm:px-6 lg:px-8">
    <button onClick={back} className="mb-8 flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white"><ArrowLeft size={15} /> Voltar</button>
    <section className="game-panel max-w-3xl">
      <div className="flex items-start gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">{icon}</div><div><p className="label-mono text-white/30">{eyebrow}</p><h1 className="mt-1 font-display text-3xl font-bold">{title}</h1><p className="mt-3 text-sm leading-6 text-white/45">{description}</p></div></div>
    </section>
  </main>
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
          <div>
            <p className="text-sm font-semibold">{player.first_name} {player.last_name}</p>
            <p className="text-xs text-white/30">{player.nationality}</p>
            {(player.injuredUntil && player.injuredUntil > today) && <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-red-300">Lesionado até {player.injuredUntil}</p>}
            {(!player.injuredUntil || player.injuredUntil <= today) && player.suspendedUntil && player.suspendedUntil > today && <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-amber-300">Suspenso até {player.suspendedUntil}</p>}
            {((player.yellowCards ?? 0) > 0 || (player.redCards ?? 0) > 0) && <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/25">CA {player.yellowCards ?? 0} · CV {player.redCards ?? 0}</p>}
          </div>
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

function Tactics({ players, club, today, back }: { players: Player[]; club: Club; today: string; back: () => void }) {
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
    try {
      const saved = JSON.parse(localStorage.getItem(TACTIC_KEY) ?? '{}').lineup ?? {}
      return Object.fromEntries(
        Object.entries(saved).filter(([, playerId]) => {
          const player = players.find(item => item.id === playerId)
          return player ? isPlayerAvailable(player, today) : false
        }),
      ) as Record<number, string>
    } catch { return {} }
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
      .filter(player => isPlayerAvailable(player, today) && !usedIds.has(player.id) && canPlayPosition(player, position))
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
        <div className="grid gap-2">{selected.map(({position,index,player}) => <div key={index} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/10 p-3"><span className="w-10 text-xs font-bold text-emerald-300">{position}</span><select value={player?.id ?? ''} onChange={e => { const next={...lineup}; if(e.target.value) next[index]=e.target.value; else delete next[index]; setLineup(next); localStorage.setItem(TACTIC_KEY,JSON.stringify({formation,lineup:next})) }} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"><option value="">Escolher jogador</option>{players.filter(p => (isPlayerAvailable(p, today) && (!Object.values(lineup).includes(p.id) || p.id === player?.id)) || p.id === player?.id).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} · {playerOverall(p)}{!isPlayerAvailable(p, today) ? ' · indisponível' : ''}</option>)}</select></div>)}</div>
      </section>
      <section className="rounded-2xl border border-white/6 bg-white/[0.02] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Banco</p><p className="mt-2 text-lg font-bold">{Math.max(0, players.length - starters)} jogadores</p></div><Users size={20} className="text-white/25" /></div><div className="mt-5 space-y-2">{players.filter(p => isPlayerAvailable(p, today) && !Object.values(lineup).includes(p.id)).map(p => <div key={p.id} className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-3"><div><p className="text-sm font-semibold">{p.first_name} {p.last_name}</p><p className="text-xs text-white/30">{p.position} · {p.age} anos</p></div><span className="text-xs font-bold text-white/35">{playerOverall(p)}</span></div>)}</div></section>
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

function Match({ fixture, userClubId, homePlayers, awayPlayers, tactic, formation, coachStyle, coachPersonality, back }: { fixture: Fixture; userClubId: string; homePlayers: Player[]; awayPlayers: Player[]; tactic: string; formation: string; coachStyle: ManagerProfile['style']; coachPersonality: ManagerProfile['personality']; back: (result: MatchResult) => void }) {
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
    const userIsHome = fixture.home_club_id === userClubId
    const userIsAway = fixture.away_club_id === userClubId
    const aiAway = getAiCoachProfile(fixture.away_club_id)
    const aiHome = getAiCoachProfile(fixture.home_club_id)
    const userLineup = userIsHome
      ? lineupFromPlayerIds(homePlayers, formation as Formation, savedLineup)
      : lineupFromPlayerIds(awayPlayers, formation as Formation, savedLineup)
    const homeFormation = userIsHome ? formation as Formation : aiHome.formation
    const awayFormation = userIsAway ? formation as Formation : aiAway.formation
    const homeTactic = userIsHome ? tactic as 'balanced' | 'offensive' | 'defensive' : aiHome.tactic
    const awayTactic = userIsAway ? tactic as 'balanced' | 'offensive' | 'defensive' : aiAway.tactic
    const homeStyle = userIsHome ? coachStyle : aiHome.style
    const awayStyle = userIsAway ? coachStyle : aiAway.style
    const homePersonality = userIsHome ? coachPersonality : aiHome.personality
    const awayPersonality = userIsAway ? coachPersonality : aiAway.personality
    const homeLineup = userIsHome ? userLineup : lineupFromPlayerIds(homePlayers, homeFormation, {})
    const awayLineup = userIsAway ? userLineup : lineupFromPlayerIds(awayPlayers, awayFormation, {})
    const match = simulateMatch(
      fixture,
      homePlayers,
      awayPlayers,
      homeTactic,
      homeFormation,
      homeLineup.length >= 7 ? homeLineup : undefined,
      awayLineup.length >= 7 ? awayLineup : undefined,
      Math.random,
      homeStyle,
      homePersonality,
      awayTactic,
      awayFormation,
      awayStyle,
      awayPersonality,
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
  const userIsHome = fixture.home_club_id === userClubId
  const userIsAway = fixture.away_club_id === userClubId
  const aiHome = getAiCoachProfile(fixture.home_club_id)
  const aiAway = getAiCoachProfile(fixture.away_club_id)
  const projectedHomeLineup = userIsHome
    ? selectStartingLineup(homePlayers, formation as Formation, coachStyle, coachPersonality, awayPlayers, preferredLineup, fixture.competition_name?.includes('Copa') ? (fixture.round >= 5 ? 1.2 : 1.08) : (fixture.round >= 25 ? 1.12 : 1))
    : selectStartingLineup(homePlayers, aiHome.formation, aiHome.style, aiHome.personality, awayPlayers, {}, fixture.competition_name?.includes('Copa') ? (fixture.round >= 5 ? 1.2 : 1.08) : (fixture.round >= 25 ? 1.12 : 1))
  const projectedAwayLineup = userIsAway
    ? selectStartingLineup(awayPlayers, formation as Formation, coachStyle, coachPersonality, homePlayers, preferredLineup, fixture.competition_name?.includes('Copa') ? (fixture.round >= 5 ? 1.2 : 1.08) : (fixture.round >= 25 ? 1.12 : 1))
    : selectStartingLineup(awayPlayers, aiAway.formation, aiAway.style, aiAway.personality, homePlayers, {}, fixture.competition_name?.includes('Copa') ? (fixture.round >= 5 ? 1.2 : 1.08) : (fixture.round >= 25 ? 1.12 : 1))

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