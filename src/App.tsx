import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BarChart3, House, Banknote, Building2, CalendarDays, ChevronRight, CircleUserRound, Dumbbell, MapPin, Medal, Newspaper, Settings, Shield, ShoppingBag, Trophy, Users, WalletCards, Handshake } from 'lucide-react'
import { supabase } from './lib/supabase'
import type { Club, Fixture, Formation, LineupPlayer, ManagerProfile, Player } from './types/game'
import { getAiCoachProfile, getSquadRole, lineupFromPlayerIds, playerOverall, selectStartingLineup } from './engine/matchCore'
import type { MatchResult } from './engine/match'
import type { PlayedMatch } from './types/game'
import PlayerProfile from './components/PlayerProfile'
import TransferMarket from './components/TransferMarket'
import LoanMarket from './components/LoanMarket'
import BoardScreen from './components/BoardScreen'
import ContractsScreen from './components/ContractsScreen'
import CompetitionCenter from './components/CompetitionCenter'
import PressCenter from './components/PressCenter'
import SeasonEndScreen, { type SeasonAward } from './components/SeasonEndScreen'
import HistoryScreen from './components/HistoryScreen'
import ManagerCareerScreen from './components/ManagerCareerScreen'
import TrophyRoomScreen from './components/TrophyRoomScreen'
import { TRAINING_FOCUSES, type TrainingFocus, trainSquad, recoverPlayers, applyMatchFatigue } from './engine/training'
import { calculateMonthlyPayroll } from './engine/economy'
import { buildSeasonFinancialHistory, calculateClubChangeFinancialImpact, calculateDynamicTicketPrice, calculateFinancialStatus, calculateFineAndOperationalCost, calculateMatchdayFinance, calculateNextSeasonBudget, calculateTechnicalStaffPayroll, type SeasonFinancialHistory } from './engine/clubFinance'
import { applyTransaction, calculateMonthlySalaryExpense, createTransaction, summarizeFinance, type FinanceTransaction } from './engine/finance'
import { acceptManagerRenewal, applyFanResult, chooseBoardObjective, createBoardState, createFanState, evaluateBoard, getEconomicStatus, managerContractYears, resolveContractAtSeasonEnd, declineManagerRenewal, type BoardState, type FanState } from './engine/management'
import { daysUntilContractEnd, getContractStatus } from './engine/contracts'
import { applyTransfer, type TransferRecord, type TransferState } from './engine/transfers'
import { getCurrentClubId as getLoanClubId, type LoanRecord, type LoanState } from './engine/loans'
import { getSquadAlerts } from './engine/roster'
import { buildStandings, resolveCompletedKnockoutStage, getCompetitionStage, resolveTwoLegTie, choosePenaltyWinner, resolveSingleMatch } from './engine/competitions'
import { buildCompetitionHistoryResult, buildSeasonCompletion } from './engine/seasonHistory'
import { buildContinentalGroupFixtures, buildContinentalGroups, buildContinentalPreliminaryPlan, resolveBrazilianContinentalQualifications } from './engine/continentalQualification'
import { buildContinentalGroupQualification, buildSingleFinalFixture, buildTwoLegFixtures, pairLibertadoresRoundOf16, pairSequential, pairSudamericanaPlayoffs, continentalAutoScore, resolveContinentalSingleMatch, resolveContinentalTwoLegTie } from './engine/continentalCompetition'
import { buildCupPrizePayments, buildLeaguePrizePayments, type CompetitionPrizeConfig, type PrizePayment } from './engine/competitionPrizes'
import { simulateWorldDay, type MarketInterest, type WorldClub, type WorldClubPerformance, type WorldPlayer, type WorldSimulationResult } from './engine/worldSimulation'
import type { AIClubManager } from './engine/aiClubManagement'
import InteractiveMatch from './components/InteractiveMatch'
import { buildWorldNews, type WorldNews } from './engine/worldNews'
import { chooseSponsor, createStadium, stadiumUpgradeCost, canUpgradeStadium, upgradeStadium, estimateStadiumAttendance, resolveSponsorAtSeasonEnd, carryStadiumToNextSeason, type SponsorContract, type StadiumState } from './engine/commercial'
import { advanceSeasonDay, canAdvanceDay, createSeasonClock, daysBetween, formatSeasonDate, toDateKey, type SeasonClock } from './engine/calendar'
import { buildCupFixtures, buildLeagueFixtures } from './engine/seasonSchedule'
import { SERIE_B_NAME, resolveDivisionMovement, swapDivisions } from './engine/divisionSystem'
import { initialManagerPopularity, updateManagerPopularity, managerPerformanceScore, offerLevelForPopularity, buildManagerOfferCandidates, clubCanApproachManager, managerContractEndSeason, managerDeparturePopularity, type ManagerPopularity } from './engine/managerCareer'
import { calculateSuspensionReturnDate, isPlayerAvailable, shouldSuspendForYellowAccumulation, suspensionMatchesForRed } from './engine/discipline'
import { injuryDurationDays, recordCareerMatch, updatePlayerLifecycle, type PlayerLifecycleState } from './engine/playerLifecycle'
import { playerPositionLabel } from './engine/playerPositions'

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
const leagueStartDate = (year: number) => `${year}-01-28`
const cupStartDate = (year: number) => `${year}-02-18`
const TRANSFERS_KEY = 'futebol-manager:transfers'
const LOANS_KEY = 'futebol-manager:loans'
const WORLD_NEWS_KEY = 'futebol-manager:world-news'
const MARKET_INTEREST_KEY = 'futebol-manager:market-interest'
const MARKET_NEGOTIATION_KEY = 'futebol-manager:market-negotiations'
const BOARD_KEY = 'futebol-manager:board'
const FANS_KEY = 'futebol-manager:fans'
const COMMERCIAL_KEY = 'futebol-manager:commercial'
const FINANCE_HISTORY_KEY = 'futebol-manager:finance-history'
const NEXT_BUDGET_KEY = 'futebol-manager:next-budget'
const MANAGER_STATUS_KEY = 'futebol-manager:manager-status'
const AI_MANAGERS_KEY = 'futebol-manager:ai-managers'
const AI_BOARD_DECISIONS_KEY = 'futebol-manager:ai-board-decisions'
const PLAYER_LIFECYCLE_KEY = 'futebol-manager:player-lifecycle'

function seasonStorageKey(prefix: string, seasonId?: string) {
  return `${prefix}:${seasonId ?? 'default'}`
}


function marketInterestStorageKey(seasonId: string) {
  return `${MARKET_INTEREST_KEY}:${seasonId}`
}

function loadPlayerLifecycle(): Record<string, PlayerLifecycleState> {
  try { return JSON.parse(localStorage.getItem(PLAYER_LIFECYCLE_KEY) ?? '{}') } catch { return {} }
}

function savePlayerLifecycle(value: Record<string, PlayerLifecycleState>) {
  localStorage.setItem(PLAYER_LIFECYCLE_KEY, JSON.stringify(value))
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


async function ensureCompetitionTeams(seasonId: string, competitionId: string, clubs: Club[]) {
  if (!clubs.length) return
  const { data: existing, error: readError } = await supabase
    .from('competition_teams')
    .select('club_id')
    .eq('season_id', seasonId)
    .eq('competition_id', competitionId)

  if (readError) {
    console.error('Não foi possível verificar os participantes da competição', readError)
    return
  }

  const existingIds = new Set((existing ?? []).map(row => String(row.club_id)))
  const rows = clubs
    .filter(club => !existingIds.has(club.id))
    .map(club => ({
      season_id: seasonId,
      competition_id: competitionId,
      club_id: club.id,
    }))

  if (!rows.length) return

  const { error: insertError } = await supabase.from('competition_teams').insert(rows)
  if (insertError) {
    console.error('Não foi possível registrar os participantes da competição', insertError)
  }
}

async function initializeFirstSeasonContinentalCalendar(seasonId: string, year: number, clubs: Club[], libertadoresId: string, sudamericanaId: string) {
  const brazil = clubs.filter(club => club.country === 'Brasil' && Number(club.division ?? 1) === 1)
    .sort((a, b) => Number(b.strength ?? b.reputation ?? 0) - Number(a.strength ?? a.reputation ?? 0))
  const libBrazil = brazil.slice(0, 5)
  const sulaBrazil = brazil.slice(5, 11)
  const foreignPool = clubs.filter(club => club.country !== 'Brasil')

  const plan = buildContinentalPreliminaryPlan(
    foreignPool,
    libBrazil,
    sulaBrazil,
    libertadoresId,
    sudamericanaId,
    seasonId,
    year,
  )

  const libGroups = buildContinentalGroups('libertadores', plan.libertadores.groupClubs)
  const sulaGroups = buildContinentalGroups('sudamericana', plan.sudamericana.groupClubs)

  await ensureCompetitionTeams(seasonId, libertadoresId, [
    ...plan.libertadores.phase1,
    ...plan.libertadores.phase2Direct,
    ...plan.libertadores.phase2Winners,
    ...plan.libertadores.phase3Winners,
    ...plan.libertadores.phase3Losers,
    ...plan.libertadores.groupClubs,
  ].filter((club, index, list) => list.findIndex(item => item.id === club.id) === index))

  await ensureCompetitionTeams(seasonId, sudamericanaId, [
    ...plan.sudamericana.firstPhaseClubs,
    ...plan.sudamericana.firstPhaseWinners,
    ...plan.libertadores.phase3Losers,
    ...plan.sudamericana.groupClubs,
  ].filter((club, index, list) => list.findIndex(item => item.id === club.id) === index))

  const groupRows = [
    ...libGroups.groups.map((_, index) => ({
      season_id: seasonId,
      competition_id: libertadoresId,
      stage: 'group_stage',
      group_code: String.fromCharCode(65 + index),
    })),
    ...sulaGroups.groups.map((_, index) => ({
      season_id: seasonId,
      competition_id: sudamericanaId,
      stage: 'group_stage',
      group_code: String.fromCharCode(65 + index),
    })),
  ]

  const { data: createdGroups, error: groupsError } = await supabase
    .from('competition_groups')
    .insert(groupRows)
    .select('id,competition_id,group_code')

  if (groupsError || !createdGroups || createdGroups.length !== 16) {
    throw new Error(groupsError?.message ?? 'Não foi possível criar os grupos continentais.')
  }

  const groupTeamRows = [
    ...libGroups.groups.flatMap((group, index) => {
      const row = createdGroups.find(item => item.competition_id === libertadoresId && item.group_code === String.fromCharCode(65 + index))
      return group.map((club, seed) => ({ group_id: row!.id, club_id: club.id, seed: seed + 1 }))
    }),
    ...sulaGroups.groups.flatMap((group, index) => {
      const row = createdGroups.find(item => item.competition_id === sudamericanaId && item.group_code === String.fromCharCode(65 + index))
      return group.map((club, seed) => ({ group_id: row!.id, club_id: club.id, seed: seed + 1 }))
    }),
  ]
  const { error: groupTeamError } = await supabase.from('competition_group_teams').insert(groupTeamRows)
  if (groupTeamError) throw new Error(groupTeamError.message)

  const groupFixtures = [
    ...buildContinentalGroupFixtures(seasonId, libertadoresId, libGroups.groups, year, 7),
    ...buildContinentalGroupFixtures(seasonId, sudamericanaId, sulaGroups.groups, year, 8),
  ].map(fixture => ({
    competition_id: fixture.competitionId,
    season_id: fixture.seasonId,
    round: fixture.round,
    home_club_id: fixture.homeClubId,
    away_club_id: fixture.awayClubId,
    scheduled_at: fixture.scheduledAt,
    status: 'scheduled',
    stage: fixture.stage,
  }))

  const preliminaryFixtures = plan.fixtures.map((fixture, index) => {
    const home = clubs.find(club => club.id === fixture.homeClubId)
    const away = clubs.find(club => club.id === fixture.awayClubId)
    const homeStrength = Number(home?.strength ?? home?.reputation ?? 50)
    const awayStrength = Number(away?.strength ?? away?.reputation ?? 50)
    const winner = homeStrength >= awayStrength ? fixture.homeClubId : fixture.awayClubId
    const homeScore = winner === fixture.homeClubId ? 1 + (index % 2) : 0
    const awayScore = winner === fixture.awayClubId ? 1 + (index % 2) : 0
    return {
      competition_id: fixture.competitionId,
      season_id: fixture.seasonId,
      round: fixture.round,
      home_club_id: fixture.homeClubId,
      away_club_id: fixture.awayClubId,
      scheduled_at: fixture.scheduledAt,
      status: 'completed',
      home_score: homeScore,
      away_score: awayScore,
      winner_club_id: winner,
      stage: fixture.stage,
    }
  })

  const { error: fixtureError } = await supabase.from('fixtures').insert([...preliminaryFixtures, ...groupFixtures])
  if (fixtureError) throw new Error(fixtureError.message)
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
      contractYears: Number(row.contract_years ?? 1),
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
    neutral_venue: Boolean(row.neutral_venue ?? false),
    venue_name: row.venue_name ?? null,
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
  const [careerCreating, setCareerCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) {
        const savedCareer = localStorage.getItem(CAREER_KEY)
        if (savedCareer) {
          try {
            if (!JSON.parse(savedCareer).seasonId) {
              localStorage.removeItem(CAREER_KEY)
              localStorage.removeItem(MANAGER_STATUS_KEY)
              setCareer(null)
            }
          } catch {
            localStorage.removeItem(CAREER_KEY)
            setCareer(null)
          }
        }
      }
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) {
        const savedCareer = localStorage.getItem(CAREER_KEY)
        if (savedCareer) {
          try {
            if (!JSON.parse(savedCareer).seasonId) {
              localStorage.removeItem(CAREER_KEY)
              localStorage.removeItem(MANAGER_STATUS_KEY)
              setCareer(null)
            }
          } catch {
            localStorage.removeItem(CAREER_KEY)
            setCareer(null)
          }
        }
      } else {
        setCareer(null)
      }
      setAuthLoading(false)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (clubs.length > 0) return
    let active = true
    async function loadClubs() {
      setLoading(true); setError(null)
      const { data, error } = await supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation,stadium,stadium_capacity,founded_year,logo_url,strength').order('name')
      if (!active) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const loadedClubs = (data ?? []) as Club[]
      if (active) setClubs(loadedClubs)
      setLoading(false)
    }
    loadClubs()
    return () => { active = false }
  }, [clubs.length])

  const canContinue = managerName.trim().length >= 2 && Boolean(birthDate)

  async function confirmCareer() {
    if (careerCreating) return
    setCareerCreating(true)
    try {
      if (!selectedClub || !canContinue) return
      const { data: authUser } = await supabase.auth.getUser()
      if (!authUser.user) { navigate('/login'); return }

      const { data: activeSeason } = await supabase.from('seasons').select('name,start_date').eq('status', 'active').order('start_date', { ascending: false }).limit(1).maybeSingle()
      const baseSeasonName = activeSeason?.name ?? SEASON_NAME
      const year = Number(baseSeasonName.match(/\d{4}/)?.[0] ?? INITIAL_SEASON_YEAR)
      const displaySeasonName = seasonName(year)
      const contractStartSeason = displaySeasonName
      const contractEndSeason = managerContractEndSeason(displaySeasonName, 1)

      // A tentativa anterior pode ter criado a temporada e falhado depois.
      // Reutilizamos a temporada do mesmo usuário/ano para tornar a criação idempotente.
      const { data: careerSeason, error: careerSeasonError } = await supabase
        .from('seasons')
        .upsert(
          {
            owner_id: authUser.user.id,
            name: displaySeasonName,
            year,
            status: 'active',
            start_date: year + '-01-01',
            end_date: null,
          },
          { onConflict: 'owner_id,year' },
        )
        .select('id')
        .single()

      if (careerSeasonError || !careerSeason) {
        setError(careerSeasonError?.message ?? 'Não foi possível criar a temporada da carreira.')
        return
      }

      const { data: existingFixture } = await supabase
        .from('fixtures')
        .select('id')
        .eq('season_id', careerSeason.id)
        .limit(1)
        .maybeSingle()
      const seasonAlreadyInitialized = Boolean(existingFixture)

      const { data: competitions } = await supabase
        .from('competitions')
        .select('id,name')
        .in('name', ['Liga Nacional do Brasil', 'Copa Nacional do Brasil', SERIE_B_NAME])
      const leagueId = competitions?.find(item => item.name === 'Liga Nacional do Brasil')?.id
      const cupId = competitions?.find(item => item.name === 'Copa Nacional do Brasil')?.id
      const serieBId = competitions?.find(item => item.name === SERIE_B_NAME)?.id
      if (!leagueId || !cupId || !serieBId) { setError('As competições nacionais não estão configuradas.'); return }

      const firstDivision = clubs.filter(club => club.country === 'Brasil' && Number(club.division ?? 1) === 1)
      const secondDivision = clubs.filter(club => club.country === 'Brasil' && Number(club.division ?? 1) === 2)

      await ensureCompetitionTeams(careerSeason.id, leagueId, firstDivision)
      await ensureCompetitionTeams(careerSeason.id, serieBId, secondDivision)
      await ensureCompetitionTeams(careerSeason.id, cupId, [...firstDivision, ...secondDivision])

      const { data: existingNationalFixtures } = await supabase
        .from('fixtures')
        .select('id,competition_id')
        .eq('season_id', careerSeason.id)
        .in('competition_id', [leagueId, serieBId, cupId])
      const existingNationalCompetitionIds = new Set((existingNationalFixtures ?? []).map(row => String(row.competition_id)))
      const missingFixtureRows = [
        ...(existingNationalCompetitionIds.has(leagueId) ? [] : buildLeagueFixtures(careerSeason.id, leagueStartDate(year), firstDivision, leagueId)),
        ...(existingNationalCompetitionIds.has(serieBId) ? [] : buildLeagueFixtures(careerSeason.id, leagueStartDate(year), secondDivision, serieBId, 7)),
        ...(existingNationalCompetitionIds.has(cupId) ? [] : buildCupFixtures(careerSeason.id, cupStartDate(year), [...firstDivision, ...secondDivision], cupId)),
      ]
      if (missingFixtureRows.length) {
        const { error: fixtureError } = await supabase.from('fixtures').insert(missingFixtureRows)
        if (fixtureError) {
          setError(fixtureError.message)
          return
        }
      }

      if (!seasonAlreadyInitialized) {
        const { data: continentalCompetitions } = await supabase
          .from('competitions')
          .select('id,name')
          .in('name', ['CONMEBOL Libertadores', 'CONMEBOL Sudamericana'])
        const libertadoresId = continentalCompetitions?.find(item => item.name === 'CONMEBOL Libertadores')?.id
        const sudamericanaId = continentalCompetitions?.find(item => item.name === 'CONMEBOL Sudamericana')?.id
        if (libertadoresId && sudamericanaId) {
          try {
            await initializeFirstSeasonContinentalCalendar(careerSeason.id, year, clubs, libertadoresId, sudamericanaId)
          } catch (continentalError) {
            setError(continentalError instanceof Error ? continentalError.message : 'Não foi possível criar o calendário continental.')
            return
          }
        }
      }

      const next: ManagerProfile = { name: managerName.trim(), nationality, birthDate, style: managerStyle, personality: managerPersonality, club: { ...selectedClub, budget: Math.max(0, Number(selectedClub.budget ?? 0)) }, season: displaySeasonName, seasonId: careerSeason.id, careerStatus: 'active', contractStartSeason, contractEndSeason }
      localStorage.setItem(CAREER_KEY, JSON.stringify(next))
      localStorage.setItem(MANAGER_STATUS_KEY, 'active')
      const popularity = initialManagerPopularity(Number(next.club.reputation ?? 50))
      const { error: managerProfileError } = await supabase.from('manager_profiles').upsert({
        owner_id: authUser.user.id, manager_name: next.name, nationality: next.nationality, birth_date: next.birthDate || null,
        style: next.style, personality: next.personality, regional_popularity: popularity.regional, national_popularity: popularity.national,
        international_popularity: popularity.international, current_club_id: next.club.id, current_season_id: careerSeason.id,
      }, { onConflict: 'owner_id' })
      if (managerProfileError) {
        setError(managerProfileError.message)
        return
      }
      setCareer(next)
      navigate('/dashboard')
    } finally {
      setCareerCreating(false)
    }
  }
  function newCareer() {
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
    localStorage.removeItem(MANAGER_STATUS_KEY)
    localStorage.removeItem(AI_MANAGERS_KEY)
    localStorage.removeItem(AI_BOARD_DECISIONS_KEY)
    localStorage.removeItem(PLAYER_LIFECYCLE_KEY)
    localStorage.removeItem(FINANCE_HISTORY_KEY)
    localStorage.removeItem(NEXT_BUDGET_KEY)
    Object.keys(localStorage)
      .filter(key => key.startsWith(BOARD_KEY + ':') || key.startsWith(FANS_KEY + ':') || key.startsWith(COMMERCIAL_KEY + ':') || key.startsWith(MARKET_INTEREST_KEY + ':') || key.startsWith(MARKET_NEGOTIATION_KEY + ':'))
      .forEach(key => localStorage.removeItem(key))
    void (async () => {
      const { data: authUser } = await supabase.auth.getUser()
      if (authUser.user) {
        await Promise.all([
          supabase.from('manager_offers').delete().eq('owner_id', authUser.user.id),
          supabase.from('manager_records').delete().eq('owner_id', authUser.user.id),
          supabase.from('manager_trophies').delete().eq('owner_id', authUser.user.id),
          supabase.from('manager_season_history').delete().eq('owner_id', authUser.user.id),
          supabase.from('manager_profiles').delete().eq('owner_id', authUser.user.id),
        ])
      }
    })()
    setCareer(null); setManagerName(''); setNationality('Brasil'); setBirthDate(''); setManagerStyle('high_press'); setManagerPersonality('motivator'); setSelectedClub(null); navigate('/manager')
  }

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-[#0a0f1a] text-sm text-white/40">Carregando...</div>
  if (!session) return <Routes><Route path="*" element={<Login />} /></Routes>

  return <div className="min-h-screen bg-[#0a0f1a] text-white"><div className="mx-auto min-h-screen max-w-7xl border-x border-white/5 bg-[#0a0f1a]">
    <Routes>
      <Route path="/" element={<Home career={career} start={() => navigate('/manager')} continueCareer={() => navigate('/dashboard')} newCareer={newCareer} />} />
      <Route path="/manager" element={<Manager name={managerName} nationality={nationality} birthDate={birthDate} style={managerStyle} personality={managerPersonality} canContinue={canContinue} onName={setManagerName} onNationality={setNationality} onBirthDate={setBirthDate} onStyle={setManagerStyle} onPersonality={setManagerPersonality} back={() => navigate('/')} next={() => navigate('/club')} />} />
      <Route path="/club" element={<ClubList clubs={clubs} selected={selectedClub} loading={loading} creating={careerCreating} error={error} select={setSelectedClub} back={() => navigate('/manager')} confirm={confirmCareer} />} />
      <Route path="/dashboard/*" element={career ? <Dashboard career={career} clubs={clubs} newCareer={newCareer} onCareerUpdate={setCareer} onClubsUpdate={setClubs} /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to={career ? '/dashboard' : '/'} replace />} />
    </Routes>
  </div></div>
}

function Top({ label, back }: { label?: string; back?: () => void }) {
  return <header className="flex h-20 items-center justify-between border-b border-white/6 px-6 md:px-10"><button onClick={back} className={back ? 'flex items-center gap-3 text-sm font-semibold text-white/60 hover:text-white' : 'pointer-events-none text-sm font-semibold'}>{back && <ArrowLeft size={18} />} FUTEBOL MANAGER</button>{label && <span className="text-xs uppercase tracking-[0.18em] text-white/30">{label}</span>}</header>
}

function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: any) {
    event.preventDefault()
    setBusy(true); setMessage(null)
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password })
    setBusy(false)
    if (result.error) { setMessage(result.error.message); return }
    if (mode === 'signup' && !result.data.session) {
      setMessage('Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre no jogo.')
      return
    }
    navigate('/')
  }

  return <main className="flex min-h-screen items-center justify-center px-6 py-12">
    <div className="w-full max-w-md rounded-3xl border border-white/8 bg-white/[0.025] p-7 md:p-9">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/60">FUTEBOL MANAGER</p>
        <h1 className="mt-3 text-3xl font-bold">{mode === 'login' ? 'Entrar na sua carreira' : 'Criar sua conta'}</h1>
        <p className="mt-3 text-sm leading-6 text-white/40">Sua carreira, histórico e progresso ficam vinculados à sua conta.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="Seu e-mail" className="w-full rounded-xl border border-white/8 bg-black/20 px-4 py-3.5 text-sm outline-none focus:border-emerald-400/40" />
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={6} placeholder="Sua senha" className="w-full rounded-xl border border-white/8 bg-black/20 px-4 py-3.5 text-sm outline-none focus:border-emerald-400/40" />
        {message && <p className="rounded-xl border border-white/6 bg-white/[0.03] p-3 text-xs leading-5 text-white/55">{message}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-[#06100c] disabled:opacity-50">{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
      </form>
      <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(null) }} className="mt-5 w-full text-sm text-white/40 hover:text-white">{mode === 'login' ? 'Ainda não tenho uma conta' : 'Já tenho uma conta'}</button>
    </div>
  </main>
}

function Home({ career, start, continueCareer, newCareer }: { career: ManagerProfile | null; start: () => void; continueCareer: () => void; newCareer: () => void }) {
  return <main className="relative min-h-screen overflow-hidden"><div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_20%_80%,rgba(59,130,246,0.08),transparent_30%)]" /><div className="relative"><Top /><section className="flex min-h-[calc(100dvh-5rem)] flex-col justify-between px-6 py-12 md:px-16 md:py-16"><div className="max-w-3xl pt-8 md:pt-16"><div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1.5 text-xs font-medium text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> TEMPORADA ATUAL</div><h1 className="text-5xl font-bold leading-[0.98] tracking-[-0.04em] md:text-7xl">O clube está esperando por você.</h1><p className="mt-7 max-w-xl text-base leading-7 text-white/45 md:text-lg">Monte sua carreira, escolha seu clube e comece a construir sua história no futebol.</p><div className="mt-10 flex flex-col gap-3 sm:flex-row">{career ? <><button onClick={continueCareer} className="flex items-center justify-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300">Continuar carreira <ArrowRight size={17} /></button><button onClick={newCareer} className="rounded-xl border border-white/10 px-6 py-3.5 text-sm font-semibold text-white/70 hover:border-white/20 hover:text-white">Nova carreira</button></> : <button onClick={start} className="flex items-center justify-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300">Começar carreira <ArrowRight size={17} /></button>}</div></div><div className="grid max-w-3xl grid-cols-1 gap-3 pt-16 sm:grid-cols-3"><Feature icon={<CircleUserRound size={18} />} title="Seu treinador" text="Você decide o caminho." /><Feature icon={<Shield size={18} />} title="Seu clube" text="Escolha onde começar." /><Feature icon={<Trophy size={18} />} title="Sua história" text="Cada temporada conta." /></div></section></div></main>
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

function ClubList({ clubs, selected, loading, creating, error, select, back, confirm }: { clubs: Club[]; selected: Club | null; loading: boolean; creating: boolean; error: string | null; select: (club: Club) => void; back: () => void; confirm: () => void }) {
  return <main className="min-h-screen"><Top label="ESCOLHA SEU CLUBE" back={back} /><section className="mx-auto max-w-5xl px-6 py-12 md:px-10"><span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/70">02 / 02</span><h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">Onde começa sua história?</h1><p className="mt-4 max-w-xl leading-7 text-white/45">Escolha um dos clubes disponíveis para iniciar a temporada atual.</p>{selected && <div className="mt-6 inline-block rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-3 text-sm"><span className="text-white/35">Selecionado</span><p className="font-semibold text-emerald-300">{selected.name}</p></div>}{loading && <div className="py-20 text-center text-sm text-white/35">Carregando clubes...</div>}{error && <div className="mt-10 rounded-xl border border-red-400/15 bg-red-400/5 p-5 text-sm text-red-200">Não foi possível carregar os clubes. {error}</div>}{!loading && !error && <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{clubs.map(club => <button key={club.id} onClick={() => select(club)} className={`group rounded-2xl border p-5 text-left transition ${selected?.id === club.id ? 'border-emerald-400/50 bg-emerald-400/8' : 'border-white/6 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.045]'}`}><div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1.5">{club.logo_url ? <img src={club.logo_url} alt="" className="h-full w-full object-contain" loading="lazy" /> : <span className={selected?.id === club.id ? 'text-emerald-700' : 'text-slate-500'}>{club.short_name.slice(0, 3)}</span>}</div><ChevronRight size={17} className="text-white/15 group-hover:text-white/45" /></div><h2 className="mt-5 font-semibold">{club.name}</h2><div className="mt-2 flex items-center gap-2 text-xs text-white/35"><MapPin size={13} />{club.city}</div><div className="mt-5 flex items-center justify-between border-t border-white/6 pt-4 text-xs"><span className="text-white/30">Capital inicial</span><span className="font-semibold text-emerald-300/80">{money(club.budget)}</span></div></button>)}</div>}<div className="mt-10 flex justify-end"><button disabled={!selected || creating} onClick={confirm} className="flex items-center gap-3 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#06100c] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-30">{creating ? 'Criando carreira...' : 'Assumir o clube'} {!creating && <ArrowRight size={17} />}</button></div></section></main>
}

type DashboardView = 'overview' | 'board' | 'contracts' | 'calendar' | 'news' | 'squad' | 'tactics' | 'finance' | 'stadium' | 'trophies' | 'history' | 'legacy' | 'market' | 'stats' | 'settings' | 'match' | 'training' | 'loans' | 'competitions' | 'press'

function Dashboard({ career, clubs, newCareer, onCareerUpdate, onClubsUpdate }: { career: ManagerProfile; clubs: Club[]; newCareer: () => void; onCareerUpdate: (career: ManagerProfile) => void; onClubsUpdate: (clubs: Club[]) => void }) {
  const [players, setPlayers] = useState<Player[]>([])
  const [nextFixture, setNextFixture] = useState<Fixture | null>(null)
  const [opponentPlayers, setOpponentPlayers] = useState<Player[]>([])
  const [opponentLoading, setOpponentLoading] = useState(false)
  const [table, setTable] = useState<{ id: string; name: string; points: number; played: number; wins: number; draws: number; losses: number; gf: number; ga: number }[]>([])
  const [playedMatches, setPlayedMatches] = useState<Record<string, PlayedMatch>>(() => {
    try { return JSON.parse(localStorage.getItem(seasonStorageKey(MATCHES_KEY, career.seasonId)) ?? '{}') } catch { return {} }
  })
  const location = useLocation()
  const navigate = useNavigate()
  const dashboardViews: DashboardView[] = ['overview', 'board', 'contracts', 'calendar', 'news', 'squad', 'tactics', 'finance', 'stadium', 'trophies', 'history', 'legacy', 'market', 'stats', 'settings', 'match', 'training', 'loans', 'competitions', 'press']
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
  const [financeHistory, setFinanceHistory] = useState<SeasonFinancialHistory[]>(() => { try { return JSON.parse(localStorage.getItem(FINANCE_HISTORY_KEY) ?? '[]') } catch { return [] } })
  const [nextSeasonBudget, setNextSeasonBudget] = useState(() => Number(localStorage.getItem(NEXT_BUDGET_KEY) ?? 0))
  const [contractAlerts, setContractAlerts] = useState<Array<{ playerId: string; name: string; until: string | null; days: number | null; status: string }>>([])
  const [upcomingFixtures, setUpcomingFixtures] = useState<Fixture[]>([])
  const [clock, setClock] = useState<SeasonClock | null>(() => { try { const saved = localStorage.getItem(seasonStorageKey(CLOCK_KEY, career.seasonId)); return saved ? JSON.parse(saved) : null } catch { return null } })
  const [seasonClosed, setSeasonClosed] = useState(false)
  const [seasonCompletion, setSeasonCompletion] = useState<any>(null)
  const [seasonAwards, setSeasonAwards] = useState<SeasonAward[]>([])
  const [managerPopularity, setManagerPopularity] = useState<ManagerPopularity>({ regional: 0, national: 0, international: 0 })
  const [managerHistory, setManagerHistory] = useState<Array<any>>([])
  const [managerTrophies, setManagerTrophies] = useState<Array<any>>([])
  const [managerRecords, setManagerRecords] = useState<Array<any>>([])
  const [managerOffers, setManagerOffers] = useState<Array<any>>([])
  const [careerStatus, setCareerStatus] = useState<'active' | 'unemployed' | 'retired'>(() => career.careerStatus ?? (localStorage.getItem(MANAGER_STATUS_KEY) as 'active' | 'unemployed' | 'retired' | null) ?? 'active')
  const [historyRows, setHistoryRows] = useState<Array<{ season_id: string; season_name: string; competition_name: string; champion_club_id: string | null; runner_up_club_id: string | null; top_scorer_player_id: string | null; top_scorer_goals: number }>>([])
  const [historyPlayers, setHistoryPlayers] = useState<Player[]>([])
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

  async function loadCareerHistory() {
    const { data: rows } = await supabase
      .from('competition_history')
      .select('season_id,champion_club_id,runner_up_club_id,top_scorer_player_id,top_scorer_goals,seasons!inner(name),competitions!inner(name)')
      .order('season_id', { ascending: false })

    const normalized = (rows ?? []).map((row: any) => ({
      season_id: String(row.season_id),
      season_name: String(row.seasons?.name ?? row.season_id),
      competition_name: String(row.competitions?.name ?? 'Competição'),
      champion_club_id: row.champion_club_id ?? null,
      runner_up_club_id: row.runner_up_club_id ?? null,
      top_scorer_player_id: row.top_scorer_player_id ?? null,
      top_scorer_goals: Number(row.top_scorer_goals ?? 0),
    }))
    const uniqueHistory = normalized.filter((row, index, list) =>
      list.findIndex(other => other.season_id === row.season_id && other.competition_name === row.competition_name) === index
    )
    setHistoryRows(uniqueHistory)

    const playerIds = [...new Set(normalized.map(row => row.top_scorer_player_id).filter(Boolean))]
    if (playerIds.length) {
      const { data: historicalPlayers } = await supabase
        .from('players')
        .select('id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale')
        .in('id', playerIds)
      setHistoryPlayers((historicalPlayers ?? []) as Player[])
    }
  }

  async function loadManagerCareer() {
    const { data: authUser } = await supabase.auth.getUser()
    if (!authUser.user) return
    const ownerId = authUser.user.id

    const today = toDateKey(new Date().toISOString())
    await supabase
      .from('manager_offers')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('owner_id', ownerId)
      .eq('status', 'pending')
      .lt('expires_at', today)

    const [{ data: profile }, { data: history }, { data: trophies }, { data: records }, { data: offers }] = await Promise.all([
      supabase.from('manager_profiles').select('*').eq('owner_id', ownerId).maybeSingle(),
      supabase.from('manager_season_history').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
      supabase.from('manager_trophies').select('id,season_id,club_id,competition_name,trophy_type').eq('owner_id', ownerId).order('created_at', { ascending: false }),
      supabase.from('manager_records').select('id,record_type,record_value,description').eq('owner_id', ownerId).order('record_value', { ascending: false }),
      supabase.from('manager_offers').select('id,from_club_id,offered_at,expires_at,offer_level,message,status').eq('owner_id', ownerId).order('offered_at', { ascending: false }),
    ])

    if (profile) {
      if (!career.careerStatus && !localStorage.getItem(MANAGER_STATUS_KEY)) {
        setCareerStatus(profile.current_club_id ? 'active' : 'unemployed')
      }
      setManagerPopularity({
        regional: Number(profile.regional_popularity ?? 0),
        national: Number(profile.national_popularity ?? 0),
        international: Number(profile.international_popularity ?? 0),
      })
    }
    const normalizedHistory = (history ?? []).map((row: any) => ({ ...row, points: Number(row.points ?? 0), wins: Number(row.wins ?? 0), draws: Number(row.draws ?? 0), losses: Number(row.losses ?? 0) }))
    const seasonIds = [...new Set((trophies ?? []).map((row: any) => row.season_id).filter(Boolean))]
    const clubIds = [...new Set((trophies ?? []).map((row: any) => row.club_id).filter(Boolean))]
    const [seasonNames, trophyClubs] = await Promise.all([
      seasonIds.length ? supabase.from('seasons').select('id,name').in('id', seasonIds) : Promise.resolve({ data: [] as any[] }),
      clubIds.length ? supabase.from('clubs').select('id,name').in('id', clubIds) : Promise.resolve({ data: [] as any[] }),
    ])
    const seasonNameMap = new Map((seasonNames.data ?? []).map((row: any) => [row.id, row.name]))
    const clubNameMap = new Map((trophyClubs.data ?? []).map((row: any) => [row.id, row.name]))
    setManagerHistory(normalizedHistory)
    setManagerTrophies((trophies ?? []).map((row: any) => ({ ...row, season_name: seasonNameMap.get(row.season_id) ?? 'Temporada', club_name: clubNameMap.get(row.club_id) ?? 'Clube' })))
    setManagerRecords(records ?? [])
    setManagerOffers(offers ?? [])
  }

  async function finalizeManagerSeason(
    seasonId: string,
    matches: Record<string, PlayedMatch>,
    leagueStandings: Array<{ id: string; points: number; played: number; wins: number; draws: number; losses: number }>,
    leagueTitle: boolean,
    cupTitle: boolean,
    leagueId: string,
    cupId: string,
  ) {
    const { data: authUser } = await supabase.auth.getUser()
    if (!authUser.user) return
    const ownerId = authUser.user.id
    const current = managerPopularity
    const userStanding = leagueStandings.find(team => team.id === career.club.id)
    const performance = {
      position: Math.max(1, leagueStandings.findIndex(team => team.id === career.club.id) + 1),
      points: Number(userStanding?.points ?? 0),
      wins: Number(userStanding?.wins ?? 0),
      draws: Number(userStanding?.draws ?? 0),
      losses: Number(userStanding?.losses ?? 0),
      played: Number(userStanding?.played ?? 0),
      clubReputation: Number(career.club.reputation ?? 50),
      leagueTitle,
      cupTitle,
      boardConfidence: boardState.confidence,
      fanSatisfaction: fanState.satisfaction,
    }
    const nextPopularity = updateManagerPopularity(current, performance)
    const seasonMatches = [...Object.values(matches)].filter(match => match.season_id === seasonId && (match.home_club_id === career.club.id || match.away_club_id === career.club.id))
    const seasonWins = seasonMatches.filter(match => (match.home_club_id === career.club.id ? match.homeScore > match.awayScore : match.awayScore > match.homeScore)).length
    const seasonDraws = seasonMatches.filter(match => match.homeScore === match.awayScore).length
    const seasonLosses = Math.max(0, seasonMatches.length - seasonWins - seasonDraws)
    const recordedWins = seasonMatches.length ? seasonWins : performance.wins
    const recordedDraws = seasonMatches.length ? seasonDraws : performance.draws
    const recordedLosses = seasonMatches.length ? seasonLosses : performance.losses

    await supabase.from('manager_season_history').upsert({
      owner_id: ownerId,
      season_id: seasonId,
      club_id: career.club.id,
      club_name: career.club.name,
      season_name: career.season,
      final_position: performance.position,
      points: performance.points,
      wins: recordedWins,
      draws: recordedDraws,
      losses: recordedLosses,
      league_title: leagueTitle,
      cup_title: cupTitle,
      regional_popularity: nextPopularity.regional,
      national_popularity: nextPopularity.national,
      international_popularity: nextPopularity.international,
    }, { onConflict: 'owner_id,season_id,club_id' })

    const trophyRows = []
    if (leagueTitle) trophyRows.push({ owner_id: ownerId, season_id: seasonId, club_id: career.club.id, competition_id: leagueId, competition_name: 'Liga Nacional do Brasil', trophy_type: 'champion' })
    if (cupTitle) trophyRows.push({ owner_id: ownerId, season_id: seasonId, club_id: career.club.id, competition_id: cupId, competition_name: 'Copa Nacional do Brasil', trophy_type: 'champion' })
    if (trophyRows.length) await supabase.from('manager_trophies').upsert(trophyRows, { onConflict: 'owner_id,season_id,competition_id' })

    const { data: allHistory } = await supabase.from('manager_season_history').select('final_position,points,wins').eq('owner_id', ownerId)
    const { count: trophyCount } = await supabase.from('manager_trophies').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId)
    const historyValues = allHistory ?? []
    const records = [
      { type: 'best_finish', value: Math.min(...historyValues.map((row: any) => Number(row.final_position ?? 99))), description: 'Melhor colocação em uma temporada' },
      { type: 'most_points', value: Math.max(...historyValues.map((row: any) => Number(row.points ?? 0))), description: 'Maior pontuação em uma temporada' },
      { type: 'most_wins', value: Math.max(...historyValues.map((row: any) => Number(row.wins ?? 0))), description: 'Mais vitórias em uma temporada' },
      { type: 'titles', value: Number(trophyCount ?? 0), description: 'Títulos conquistados na carreira' },
    ]
    await supabase.from('manager_records').upsert(records.map(record => ({ owner_id: ownerId, record_type: record.type, record_value: record.value, season_id: seasonId, club_id: career.club.id, description: record.description })), { onConflict: 'owner_id,record_type' })

    const currentProfile = {
      regional_popularity: nextPopularity.regional,
      national_popularity: nextPopularity.national,
      international_popularity: nextPopularity.international,
      career_points: managerPerformanceScore(performance) + Number((await supabase.from('manager_profiles').select('career_points').eq('owner_id', ownerId).maybeSingle()).data?.career_points ?? 0),
      seasons_completed: Number((await supabase.from('manager_profiles').select('seasons_completed').eq('owner_id', ownerId).maybeSingle()).data?.seasons_completed ?? 0) + 1,
      matches_played: Number((await supabase.from('manager_profiles').select('matches_played').eq('owner_id', ownerId).maybeSingle()).data?.matches_played ?? 0) + Math.max(seasonMatches.length, performance.played),
      wins: Number((await supabase.from('manager_profiles').select('wins').eq('owner_id', ownerId).maybeSingle()).data?.wins ?? 0) + recordedWins,
      draws: Number((await supabase.from('manager_profiles').select('draws').eq('owner_id', ownerId).maybeSingle()).data?.draws ?? 0) + recordedDraws,
      losses: Number((await supabase.from('manager_profiles').select('losses').eq('owner_id', ownerId).maybeSingle()).data?.losses ?? 0) + recordedLosses,
      current_club_id: career.club.id,
      current_season_id: seasonId,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('manager_profiles').update(currentProfile).eq('owner_id', ownerId)

    const level = offerLevelForPopularity(nextPopularity)
    const candidateClubs = clubs
      .filter(club => club.id !== career.club.id)
      .filter(club => clubCanApproachManager(nextPopularity, Number(club.reputation ?? 50), managerPerformanceScore(performance)))
      .sort((a, b) => Number(b.reputation ?? 50) - Number(a.reputation ?? 50))
      .slice(0, 3)
    if (candidateClubs.length) {
      await supabase.from('manager_offers').update({ status: 'expired', responded_at: new Date().toISOString() }).eq('owner_id', ownerId).eq('status', 'pending')
      const offeredAt = toDateKey(new Date().toISOString())
      const expiresAt = addDays(offeredAt, 30)
      const offerRows = candidateClubs.map(club => ({
        owner_id: ownerId,
        offered_at: offeredAt,
        expires_at: expiresAt,
        from_club_id: club.id,
        performance_score: managerPerformanceScore(performance),
        popularity_score: nextPopularity.regional + nextPopularity.national + nextPopularity.international,
        offer_level: level,
        message: club.name + ' quer contar com seu trabalho. O objetivo da diretoria seria ' + chooseBoardObjective(Number(club.reputation ?? 50), Number(club.budget ?? 0), Number(club.strength ?? club.reputation ?? 50)).label.toLowerCase() + '. Sua reputação atual permite esta abordagem.',
        status: 'pending',
      }))
      await supabase.from('manager_offers').insert(offerRows)
    }

    setManagerPopularity(nextPopularity)
    await loadManagerCareer()
  }

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
    // A temporada só fecha depois que o ciclo continental também terminou.
    // Libertadores e Sul-Americana têm finais em partida única; quando os dois finais
    // ainda não foram disputados, o treinador continua na mesma temporada.
    const { data: continentalCompetitions } = await supabase
      .from('competitions')
      .select('id,name')
      .in('name', ['CONMEBOL Libertadores', 'CONMEBOL Sudamericana'])
    const continentalIds = (continentalCompetitions ?? []).map(row => row.id)
    if (continentalIds.length === 2) {
      const { data: continentalFixtures } = await supabase
        .from('fixtures')
        .select('id,competition_id,round,status,home_score,away_score')
        .eq('season_id', seasonId)
        .in('competition_id', continentalIds)
      const hasContinentalCalendar = (continentalFixtures ?? []).length > 0
      const continentalFinalsComplete = continentalIds.every(competitionId =>
        (continentalFixtures ?? []).some(fixture =>
          fixture.competition_id === competitionId &&
          Number(fixture.round) === 15 &&
          fixture.status === 'completed' &&
          fixture.home_score != null &&
          fixture.away_score != null,
        ),
      )
      if (hasContinentalCalendar && !continentalFinalsComplete) return
    }
    const continentalHistoryFixtures = continentalIds.length === 2
      ? await (async () => {
          const { data } = await supabase
            .from('fixtures')
            .select('round,status,home_club_id,away_club_id,home_score,away_score,winner_club_id,competition_id')
            .eq('season_id', seasonId)
            .in('competition_id', continentalIds)
          return data ?? []
        })()
      : []

    const libertadoresId = continentalCompetitions?.find(item => item.name === 'CONMEBOL Libertadores')?.id
    const sudamericanaId = continentalCompetitions?.find(item => item.name === 'CONMEBOL Sudamericana')?.id

    const completion = buildSeasonCompletion(
      { id: seasonId, name: career.season },
      leagueId,
      cupId,
      leagueFixtures,
      cupFixtures,
      Object.values(matches),
      {
        libertadoresId,
        sudamericanaId,
        libertadoresFixtures: continentalHistoryFixtures.filter(item => item.competition_id === libertadoresId),
        sudamericanaFixtures: continentalHistoryFixtures.filter(item => item.competition_id === sudamericanaId),
      },
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

    const clubById = new Map(clubs.map(club => [club.id, club]))
    const leagueTeams = [...new Set(leagueFixtures.flatMap(item => [item.home_club_id, item.away_club_id]))]
      .map(id => ({ id, name: clubById.get(id)?.name ?? id }))
    const leagueStandings = buildStandings(leagueTeams, leagueFixtures as any)

    // A Série B é simulada integralmente quando a temporada é fechada caso o
    // treinador esteja na elite. Isso impede que o mundo fique parado só
    // porque o jogador não acompanha a segunda divisão.
    const { data: serieBCompetition } = await supabase
      .from('competitions')
      .select('id,name')
      .eq('name', SERIE_B_NAME)
      .maybeSingle()

    let serieBStandings: ReturnType<typeof buildStandings> = []
    if (serieBCompetition?.id) {
      const { data: bFixturesBefore } = await supabase
        .from('fixtures')
        .select('id,round,home_club_id,away_club_id,home_score,away_score,status')
        .eq('season_id', seasonId)
        .eq('competition_id', serieBCompetition.id)

      const bScheduled = (bFixturesBefore ?? []).filter(item => item.status !== 'completed')
      const strengthMap = Object.fromEntries(clubs.map(club => [club.id, Number(club.strength ?? club.reputation ?? 50)]))

      const autoScore = (homeId: string, awayId: string, round: number) => {
        const home = Number(strengthMap[homeId] ?? 50)
        const away = Number(strengthMap[awayId] ?? 50)
        const seed = Math.abs(Math.sin((round * 97) + homeId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) - awayId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)))
        const homeGoals = Math.max(0, Math.min(5, Math.round(seed * 3 + (home - away) / 22 + 0.55)))
        const awayGoals = Math.max(0, Math.min(5, Math.round((1 - seed) * 2.5 + (away - home) / 24)))
        return [homeGoals, awayGoals] as const
      }

      if (bScheduled.length) {
        await Promise.all(bScheduled.map(async fixture => {
          const [homeScore, awayScore] = autoScore(fixture.home_club_id, fixture.away_club_id, Number(fixture.round ?? 1))
          await supabase
            .from('fixtures')
            .update({
              status: 'completed',
              home_score: homeScore,
              away_score: awayScore,
              winner_club_id: homeScore > awayScore ? fixture.home_club_id : awayScore > homeScore ? fixture.away_club_id : null,
            })
            .eq('id', fixture.id)
        }))
      }

      const { data: bFixtures } = await supabase
        .from('fixtures')
        .select('home_club_id,away_club_id,home_score,away_score,status')
        .eq('season_id', seasonId)
        .eq('competition_id', serieBCompetition.id)
      const bTeams = [...new Set((bFixtures ?? []).flatMap(item => [item.home_club_id, item.away_club_id]))]
        .map(id => ({ id, name: clubById.get(id)?.name ?? id }))
      serieBStandings = buildStandings(bTeams, (bFixtures ?? []) as any)

      const movement = resolveDivisionMovement(leagueStandings, serieBStandings, strengthMap)
      const promoted = new Set(movement.promotedClubIds)
      const relegated = new Set(movement.relegatedClubIds)

      if (serieBStandings.length >= 20) {
        await supabase.from('competition_history').upsert({
          season_id: seasonId,
          competition_id: serieBCompetition.id,
          champion_club_id: serieBStandings[0]?.id ?? null,
          runner_up_club_id: serieBStandings[1]?.id ?? null,
          top_scorer_player_id: null,
          top_scorer_goals: 0,
        }, { onConflict: 'season_id,competition_id' })
      }

      // Atualiza a divisão no mundo inteiro, não apenas no clube do treinador.
      // O estado local também precisa acompanhar o banco imediatamente: ele é usado
      // pela IA, pelo mercado e pela preparação da temporada seguinte.
      const nextWorldClubs = swapDivisions(clubs, [...promoted], [...relegated])
      onClubsUpdate(nextWorldClubs)

      for (const clubId of [...promoted, ...relegated]) {
        const { error: divisionError } = await supabase
          .from('clubs')
          .update({ division: promoted.has(clubId) ? 1 : 2 })
          .eq('id', clubId)
        if (divisionError) {
          console.error('Não foi possível atualizar a divisão do clube', divisionError)
        }
      }

      const movementRows = [
        ...leagueStandings.map((row, index) => ({
          season_id: seasonId,
          club_id: row.id,
          from_division: 1,
          to_division: relegated.has(row.id) ? 2 : 1,
          movement: relegated.has(row.id) ? 'relegated' : 'stayed',
        })),
        ...serieBStandings.map(row => ({
          season_id: seasonId,
          club_id: row.id,
          from_division: 2,
          to_division: promoted.has(row.id) ? 1 : 2,
          movement: promoted.has(row.id) ? 'promoted' : 'stayed',
        })),
      ]
      await supabase.from('season_club_movements').upsert(movementRows, { onConflict: 'season_id,club_id' })

      const standingsRows = [
        ...leagueStandings.map((row, index) => ({
          season_id: seasonId, competition_id: leagueId, club_id: row.id, division: 1,
          position: index + 1, played: row.played, wins: row.wins, draws: row.draws, losses: row.losses,
          goals_for: row.gf, goals_against: row.ga, points: row.points,
        })),
        ...serieBStandings.map((row, index) => ({
          season_id: seasonId, competition_id: serieBCompetition.id, club_id: row.id, division: 2,
          position: index + 1, played: row.played, wins: row.wins, draws: row.draws, losses: row.losses,
          goals_for: row.gf, goals_against: row.ga, points: row.points,
        })),
      ]
      await supabase.from('season_club_standings').upsert(standingsRows, { onConflict: 'season_id,competition_id,club_id' })

      for (const [competitionId, standings] of [[leagueId, leagueStandings], [serieBCompetition.id, serieBStandings] ] as Array<[string, ReturnType<typeof buildStandings>]>) {
        const records = [
          { record_type: 'highest_points', row: [...standings].sort((a, b) => b.points - a.points)[0], value: [...standings].sort((a, b) => b.points - a.points)[0]?.points ?? 0, description: 'Maior pontuação em uma temporada' },
          { record_type: 'most_wins', row: [...standings].sort((a, b) => b.wins - a.wins)[0], value: [...standings].sort((a, b) => b.wins - a.wins)[0]?.wins ?? 0, description: 'Mais vitórias em uma temporada' },
          { record_type: 'best_goal_difference', row: [...standings].sort((a, b) => (b.gf - b.ga) - (a.gf - a.ga))[0], value: [...standings].sort((a, b) => (b.gf - b.ga) - (a.gf - a.ga))[0] ? (([...standings].sort((a, b) => (b.gf - b.ga) - (a.gf - a.ga))[0].gf - [...standings].sort((a, b) => (b.gf - b.ga) - (a.gf - a.ga))[0].ga)) : 0, description: 'Melhor saldo de gols em uma temporada' },
        ]
        for (const record of records) {
          if (!record.row) continue
          const { data: previous } = await supabase
            .from('competition_records')
            .select('value')
            .eq('competition_id', competitionId)
            .eq('record_type', record.record_type)
            .maybeSingle()
          if (!previous || Number(previous.value) < record.value) {
            await supabase.from('competition_records').upsert({
              competition_id: competitionId,
              record_type: record.record_type,
              club_id: record.row.id,
              value: record.value,
              season_id: seasonId,
              description: record.description,
            }, { onConflict: 'competition_id,record_type' })
          }
        }
      }

      const userMovement = promoted.has(career.club.id) ? 'promoted' : relegated.has(career.club.id) ? 'relegated' : null
      if (userMovement) {
        const nextDivision = userMovement === 'promoted' ? 1 : 2
        const nextCareer = { ...career, club: { ...career.club, division: nextDivision } }
        onCareerUpdate(nextCareer)
      }
    }
    const { data: competitionPrizeRows, error: competitionPrizesError } = await supabase
      .from('competition_prizes')
      .select('id,competition_id,prize_type,position_from,position_to,stage,amount,description')
      .in('competition_id', [leagueId, cupId, serieBCompetition?.id].filter(Boolean) as string[])

    if (competitionPrizesError) {
      console.error('Não foi possível carregar as premiações das competições', competitionPrizesError)
      return
    }

    const competitionPrizes = (competitionPrizeRows ?? []) as CompetitionPrizeConfig[]
    const leaguePrizePayments = buildLeaguePrizePayments(
      competitionPrizes.filter(prize => prize.competition_id === leagueId),
      leagueStandings.map(team => ({ id: team.id, name: team.name })),
    )
    const cupPrizePayments = buildCupPrizePayments(
      competitionPrizes.filter(prize => prize.competition_id === cupId),
      cupFixtures as any,
    )
    const serieBPrizePayments = serieBCompetition?.id
      ? buildLeaguePrizePayments(
          competitionPrizes.filter(prize => prize.competition_id === serieBCompetition.id),
          serieBStandings.map(team => ({ id: team.id, name: team.name })),
        )
      : []

    const prizePayments: PrizePayment[] = [
      ...leaguePrizePayments,
      ...cupPrizePayments,
      ...serieBPrizePayments,
    ]

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

    // As premiações oficiais são acumuladas por competição.
    for (const payment of prizePayments) {
      achievement(payment.clubId).budgetBonus += payment.amount
    }

    leagueStandings.forEach((team, index) => {
      const current = achievement(team.id)
      const position = index + 1
      if (position === 1) {
        current.reputationBonus += 5
        current.strengthBonus += 2
        current.marketMultiplier *= 1.05
      } else if (position === 2) {
        current.reputationBonus += 2
        current.strengthBonus += 1
        current.marketMultiplier *= 1.02
      } else if (position <= 4) {
        current.reputationBonus += 1
        current.marketMultiplier *= 1.01
      }
    })

    if (completion.cup.championClubId) {
      const cupChampion = achievement(completion.cup.championClubId)
      cupChampion.reputationBonus += 3
      cupChampion.strengthBonus += 1
      cupChampion.marketMultiplier *= 1.03
    }

    if (completion.cup.runnerUpClubId) {
      const cupRunner = achievement(completion.cup.runnerUpClubId)
      cupRunner.reputationBonus += 1
      cupRunner.marketMultiplier *= 1.015
    }

    const { error: prizePaymentsError } = prizePayments.length
      ? await supabase
          .from('competition_prize_payments')
          .upsert(
            prizePayments.map(payment => ({
              competition_id: payment.competitionId,
              season_id: seasonId,
              club_id: payment.clubId,
              prize_id: payment.prizeId,
              prize_type: payment.prizeType,
              stage: payment.stage,
              position: payment.position,
              amount: payment.amount,
              description: payment.description,
            })),
            { onConflict: 'competition_id,season_id,club_id,prize_id' },
          )
      : { error: null }

    if (prizePaymentsError) {
      console.error('Não foi possível registrar as premiações da temporada', prizePaymentsError)
      return
    }

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

    // A premiação da temporada entra no caixa real e altera o orçamento do próximo ano.
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

    const financialYear = Number(career.season.match(/\d{4}/)?.[0] ?? INITIAL_SEASON_YEAR)
    const previousFinancialHistory = financeHistory.find(item => item.seasonId === seasonId)
    const openingBalance = financeHistory.find(item => item.seasonName === seasonName(financialYear - 1))?.closingBalance
      ?? financeTransactions.find(item => item.eventId === 'career:initial-budget')?.amount
      ?? Number(career.club.budget ?? 0)
    const seasonTransactions = financeTransactions.filter(item => item.date.startsWith(String(financialYear)) && item.eventId !== 'career:initial-budget' && !item.eventId?.startsWith('manager-switch:'))
    const closingBalance = Math.max(0, financeBalance + userEffect.budgetBonus)
    const seasonRevenue = seasonTransactions.filter(item => item.amount > 0).reduce((sum, item) => sum + item.amount, 0) + (previousFinancialHistory ? 0 : 0)
    const seasonExpenses = seasonTransactions.filter(item => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0)
    const financialStatus = calculateFinancialStatus(closingBalance, salaryTotal)
    const calculatedNextBudget = calculateNextSeasonBudget(
      closingBalance,
      seasonRevenue,
      seasonExpenses,
      userEffect.budgetBonus,
      Math.max(35, Math.min(95, Number(career.club.reputation ?? 50) + userEffect.reputationBonus)),
      financialStatus,
    )
    const historyEntry = buildSeasonFinancialHistory(
      [...seasonTransactions, ...(userEffect.budgetBonus > 0 ? [createTransaction(toDateKey(new Date().toISOString()), 'prize', 'Premiação por desempenho da temporada', userEffect.budgetBonus, undefined, `season:achievement:${seasonId}`)] : [])],
      seasonId,
      career.season,
      career.club.id,
      openingBalance,
      closingBalance,
      calculatedNextBudget,
    )
    const nextHistory = [...financeHistory.filter(item => item.seasonId !== seasonId), historyEntry]
    setFinanceHistory(nextHistory)
    localStorage.setItem(FINANCE_HISTORY_KEY, JSON.stringify(nextHistory))
    setNextSeasonBudget(calculatedNextBudget)
    localStorage.setItem(NEXT_BUDGET_KEY, String(calculatedNextBudget))
    const { data: seasonStats } = await supabase
      .from('player_season_stats')
      .select('player_id,club_id,goals,assists,minutes,avg_rating')
      .eq('season_id', seasonId)

    const topScorer = [...(seasonStats ?? [])]
      .sort((a: any, b: any) => Number(b.goals ?? 0) - Number(a.goals ?? 0) || Number(b.assists ?? 0) - Number(a.assists ?? 0))
      .find((row: any) => Number(row.goals ?? 0) > 0) ?? null

    const playerOfSeason = [...(seasonStats ?? [])]
      .filter((row: any) => Number(row.minutes ?? 0) >= 900 && Number(row.avg_rating ?? 0) > 0)
      .sort((a: any, b: any) => Number(b.avg_rating ?? 0) - Number(a.avg_rating ?? 0) || Number(b.minutes ?? 0) - Number(a.minutes ?? 0))[0] ?? null

    const leagueChampionPrize = prizePayments
      .filter(payment => payment.competitionId === leagueId && payment.clubId === completion.league.championClubId)
      .reduce((sum, payment) => sum + payment.amount, 0)
    const cupChampionPrize = prizePayments
      .filter(payment => payment.competitionId === cupId && payment.clubId === completion.cup.championClubId)
      .reduce((sum, payment) => sum + payment.amount, 0)

    const awardRows = [
      { season_id: seasonId, award_type: 'league_champion', club_id: completion.league.championClubId, player_id: null, value: leagueChampionPrize },
      { season_id: seasonId, award_type: 'cup_champion', club_id: completion.cup.championClubId, player_id: null, value: cupChampionPrize },
      { season_id: seasonId, award_type: 'top_scorer', club_id: topScorer?.club_id ?? null, player_id: topScorer?.player_id ?? completion.league.topScorerPlayerId, value: Number(topScorer?.goals ?? completion.league.topScorerGoals ?? 0) },
      { season_id: seasonId, award_type: 'player_of_season', club_id: playerOfSeason?.club_id ?? null, player_id: playerOfSeason?.player_id ?? null, value: Number(playerOfSeason?.avg_rating ?? 0) },
    ]
    const { error: awardsError } = await supabase
      .from('season_awards')
      .upsert(awardRows, { onConflict: 'season_id,award_type' })
    if (awardsError) {
      console.error('Não foi possível salvar as premiações da temporada', awardsError)
    } else {
      setSeasonAwards(awardRows.map(({ season_id, award_type, club_id, player_id, value }) => ({ season_id, award_type, club_id, player_id, value })))
    }

    const nextCommercial = {
      sponsor: {
        ...sponsorResolution.nextSponsor,
        seasonId: seasonId,
      },
      stadium: commercial.stadium,
    }
    await saveCommercial(nextCommercial)
    const finalBoard = resolveContractAtSeasonEnd(boardState, career.season)
    saveManagement(finalBoard, fanState)
    if (finalBoard.managerStatus === 'active' && finalBoard.renewalOffered) {
      appendWorldNews([{
        id: 'board-renewal:' + seasonId,
        date: toDateKey(new Date().toISOString()),
        title: 'A diretoria quer manter o treinador',
        message: 'A temporada terminou e a diretoria colocou uma renovação sobre a mesa. Agora a decisão é do treinador.',
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

  async function startNextSeason() {
    if (!seasonClosed || !databaseSeasonId || !seasonCompletion) return
    if (boardState.managerStatus !== 'renewed') return

    const currentYear = Number(career.season.match(/\d{4}/)?.[0] ?? INITIAL_SEASON_YEAR)
    const nextYear = currentYear + 1
    const { data: authUser } = await supabase.auth.getUser()
    if (!authUser.user) return
    const nextSeasonName = seasonName(nextYear) + ' · ' + authUser.user.id.slice(0, 8)
    const nextStartDate = `${nextYear}-01-01`
    const nextLeagueStartDate = leagueStartDate(nextYear)
    const nextCupStartDate = cupStartDate(nextYear)

    const { data: existingSeason } = await supabase
      .from('seasons')
      .select('id,status')
      .eq('name', nextSeasonName)
      .eq('owner_id', authUser.user.id)
      .maybeSingle()

    let nextSeasonId = existingSeason?.id as string | undefined
    if (existingSeason?.id && existingSeason.status !== 'active') {
      await supabase.from('seasons').update({ status: 'active', start_date: nextStartDate, end_date: null }).eq('id', existingSeason.id)
    }
    if (!nextSeasonId) {
      const { data: createdSeason, error: createSeasonError } = await supabase
        .from('seasons')
        .insert({ owner_id: authUser.user.id, name: nextSeasonName, year: nextYear, status: 'active', start_date: nextStartDate, end_date: null })
        .select('id')
        .single()
      if (createSeasonError || !createdSeason) {
        console.error('Não foi possível criar a próxima temporada', createSeasonError)
        return
      }
      nextSeasonId = createdSeason.id
    }

    if (!nextSeasonId) {
      console.error('A próxima temporada não possui um ID válido')
      return
    }

    const { data: competitions } = await supabase
      .from('competitions')
      .select('id,name')
      .in('name', ['Liga Nacional do Brasil', 'Copa Nacional do Brasil', SERIE_B_NAME])
    const leagueId = competitions?.find(item => item.name === 'Liga Nacional do Brasil')?.id
    const cupId = competitions?.find(item => item.name === 'Copa Nacional do Brasil')?.id
    const serieBId = competitions?.find(item => item.name === SERIE_B_NAME)?.id
    if (!leagueId || !cupId || !serieBId) return

    const { data: nextClubsData } = await supabase
      .from('clubs')
      .select('id,name,short_name,city,country,division,budget,reputation,stadium,stadium_capacity,founded_year,logo_url,strength')
      .order('name')
    const nextClubs = (nextClubsData ?? []) as Club[]
    const brazilClubs = nextClubs.filter(club => club.country === 'Brasil')
    const activeClubs = brazilClubs.filter(club => Number(club.division ?? 1) === 1)
    const serieBClubs = brazilClubs.filter(club => Number(club.division ?? 1) === 2)
    if (activeClubs.length !== 16 || serieBClubs.length !== 20) {
      console.error('A próxima temporada precisa de 16 clubes na Série A e 20 na Série B', { serieA: activeClubs.length, serieB: serieBClubs.length })
      return
    }

    // Monta o caminho continental completo antes da fase de grupos.
    // A Libertadores passa por Fase 1, Fase 2 e Fase 3. Os quatro eliminados
    // na Fase 3 são transferidos automaticamente para a fase de grupos da Sul-Americana.
    const { data: continentalCompetitions } = await supabase
      .from('competitions')
      .select('id,name')
      .in('name', ['CONMEBOL Libertadores', 'CONMEBOL Sudamericana'])

    const libertadoresId = continentalCompetitions?.find(item => item.name === 'CONMEBOL Libertadores')?.id
    const sudamericanaId = continentalCompetitions?.find(item => item.name === 'CONMEBOL Sudamericana')?.id

    if (libertadoresId && sudamericanaId) {
      const { data: previousContinentalHistory } = await supabase
        .from('competition_history')
        .select('competition_id,champion_club_id')
        .eq('season_id', databaseSeasonId)
        .in('competition_id', [libertadoresId, sudamericanaId])

      const previousLibertadoresChampionId = previousContinentalHistory?.find(item => item.competition_id === libertadoresId)?.champion_club_id ?? null
      const previousSudamericanaChampionId = previousContinentalHistory?.find(item => item.competition_id === sudamericanaId)?.champion_club_id ?? null

      // A classificação da temporada encerrada já foi persistida no banco durante o fechamento.
      // Recarregamos daqui para que a virada de temporada não dependa do escopo local de finalizeSeasonIfComplete.
      const { data: persistedLeagueStandings } = await supabase
        .from('season_club_standings')
        .select('club_id,position,played,wins,draws,losses,goals_for,goals_against,points')
        .eq('season_id', databaseSeasonId)
        .eq('competition_id', leagueId)
        .order('position', { ascending: true })

      const clubNameById = new Map(nextClubs.map(club => [club.id, club.name]))
      const leagueStandings = (persistedLeagueStandings ?? []).map(row => ({
        id: row.club_id,
        name: clubNameById.get(row.club_id) ?? row.club_id,
        played: Number(row.played ?? 0),
        wins: Number(row.wins ?? 0),
        draws: Number(row.draws ?? 0),
        losses: Number(row.losses ?? 0),
        gf: Number(row.goals_for ?? 0),
        ga: Number(row.goals_against ?? 0),
        points: Number(row.points ?? 0),
      }))

      if (leagueStandings.length !== 16) {
        console.error('A classificação da Liga Nacional da temporada anterior não está completa', {
          seasonId: databaseSeasonId,
          expected: 16,
          received: leagueStandings.length,
        })
        return
      }

      const continentalQualifications = resolveBrazilianContinentalQualifications({
        leagueStandings,
        clubs: nextClubs,
        copaChampionId: seasonCompletion.cup.championClubId,
        previousLibertadoresChampionId,
        previousSudamericanaChampionId,
      })

      const libBrazil = continentalQualifications.filter(item => item.competition === 'libertadores')
      const sulaBrazil = continentalQualifications.filter(item => item.competition === 'sudamericana')
      const libBrazilIds = new Set(libBrazil.map(item => item.clubId))
      const sulaBrazilIds = new Set(sulaBrazil.map(item => item.clubId))

      const foreignPool = nextClubs.filter(club => club.country !== 'Brasil')
      const preliminaryPlan = buildContinentalPreliminaryPlan(
        foreignPool,
        nextClubs.filter(club => libBrazilIds.has(club.id)),
        nextClubs.filter(club => sulaBrazilIds.has(club.id)),
        libertadoresId,
        sudamericanaId,
        nextSeasonId,
        nextYear,
      )

      const libClubs = preliminaryPlan.libertadores.groupClubs
      const sulaClubs = preliminaryPlan.sudamericana.groupClubs

      if (libClubs.length !== 32 || sulaClubs.length !== 32) {
        console.error('Não foi possível completar os campos continentais', {
          libertadores: libClubs.length,
          sudamericana: sulaClubs.length,
          libertadoresPreliminares: preliminaryPlan.libertadores.phase1.length + preliminaryPlan.libertadores.phase2Direct.length,
          sulAmericanaPreliminar: preliminaryPlan.sudamericana.firstPhaseClubs.length,
        })
        return
      }

      const brazilQualifierRows = continentalQualifications.map(item => ({
        season_id: nextSeasonId,
        competition_id: item.competition === 'libertadores' ? libertadoresId : sudamericanaId,
        club_id: item.clubId,
        source_competition_id: item.source === 'league' ? leagueId : item.source === 'copa' ? cupId : null,
        source_position: item.sourcePosition ?? null,
        qualification_type: item.source,
        target_stage: item.targetStage,
        slot_order: item.slot,
        status: 'qualified',
        notes: item.note,
      }))

      const foreignQualifierRows = [
        ...preliminaryPlan.libertadores.groupClubs
          .filter(club => !libBrazilIds.has(club.id))
          .map((club, index) => ({
            season_id: nextSeasonId,
            competition_id: libertadoresId,
            club_id: club.id,
            source_competition_id: null,
            source_position: null,
            qualification_type: preliminaryPlan.libertadores.phase3Winners.some(item => item.id === club.id) ? 'phase_3' : 'foreign_direct',
            target_stage: 'group_stage',
            slot_order: libBrazil.length + index + 1,
            status: 'qualified',
            notes: preliminaryPlan.libertadores.phase3Winners.some(item => item.id === club.id)
              ? 'Classificado pela Fase 3 da Libertadores.'
              : 'Vaga estrangeira direta da Libertadores.',
          })),
        ...preliminaryPlan.sudamericana.groupClubs
          .filter(club => !sulaBrazilIds.has(club.id))
          .map((club, index) => ({
            season_id: nextSeasonId,
            competition_id: sudamericanaId,
            club_id: club.id,
            source_competition_id: null,
            source_position: null,
            qualification_type: preliminaryPlan.libertadores.phase3Losers.some(item => item.id === club.id)
              ? 'libertadores_phase_3_loser'
              : preliminaryPlan.sudamericana.firstPhaseWinners.some(item => item.id === club.id)
                ? 'sudamericana_first_phase'
                : 'foreign_direct',
            target_stage: 'group_stage',
            slot_order: sulaBrazil.length + index + 1,
            status: 'qualified',
            notes: preliminaryPlan.libertadores.phase3Losers.some(item => item.id === club.id)
              ? 'Transferido da Fase 3 da Libertadores para a Sul-Americana.'
              : preliminaryPlan.sudamericana.firstPhaseWinners.some(item => item.id === club.id)
                ? 'Classificado pela Primeira Fase da Sul-Americana.'
                : 'Vaga estrangeira direta da Sul-Americana.',
          })),
      ]

      const qualifierRows = [...brazilQualifierRows, ...foreignQualifierRows]

      await supabase.from('competition_qualifiers').delete().eq('season_id', nextSeasonId).in('competition_id', [libertadoresId, sudamericanaId])
      if (qualifierRows.length) {
        const { error: qualifierError } = await supabase.from('competition_qualifiers').insert(qualifierRows)
        if (qualifierError) console.error('Não foi possível registrar as vagas continentais brasileiras', qualifierError)
      }

      const libParticipants = [...preliminaryPlan.libertadores.phase1, ...preliminaryPlan.libertadores.phase2Direct, ...preliminaryPlan.libertadores.phase2Winners, ...preliminaryPlan.libertadores.phase3Winners, ...preliminaryPlan.libertadores.phase3Losers, ...libClubs]
      const sulaParticipants = [...preliminaryPlan.sudamericana.firstPhaseClubs, ...preliminaryPlan.sudamericana.firstPhaseWinners, ...preliminaryPlan.libertadores.phase3Losers, ...sulaClubs]
      await ensureCompetitionTeams(nextSeasonId, libertadoresId, [...new Map(libParticipants.map(club => [club.id, club])).values()])
      await ensureCompetitionTeams(nextSeasonId, sudamericanaId, [...new Map(sulaParticipants.map(club => [club.id, club])).values()])

      const { data: existingContinentalFixtures } = await supabase
        .from('fixtures')
        .select('id')
        .eq('season_id', nextSeasonId)
        .in('competition_id', [libertadoresId, sudamericanaId])

      if (!(existingContinentalFixtures?.length)) {
        const libDraw = buildContinentalGroups('libertadores', libClubs)
        const sulaDraw = buildContinentalGroups('sudamericana', sulaClubs)
        const groupRows = [
          ...libDraw.groups.map((_, index) => ({ season_id: nextSeasonId, competition_id: libertadoresId, stage: 'group_stage', group_code: String.fromCharCode(65 + index) })),
          ...sulaDraw.groups.map((_, index) => ({ season_id: nextSeasonId, competition_id: sudamericanaId, stage: 'group_stage', group_code: String.fromCharCode(65 + index) })),
        ]

        await supabase.from('competition_groups').delete().eq('season_id', nextSeasonId).in('competition_id', [libertadoresId, sudamericanaId])

        const { data: createdGroups, error: groupsError } = await supabase
          .from('competition_groups')
          .insert(groupRows)
          .select('id,competition_id,group_code')

        if (groupsError || !createdGroups || createdGroups.length !== 16) {
          console.error('Não foi possível criar os grupos continentais', groupsError)
          return
        }

        const groupTeamRows = [
          ...libDraw.groups.flatMap((group, index) => {
            const row = createdGroups.find(item => item.competition_id === libertadoresId && item.group_code === String.fromCharCode(65 + index))
            return group.map((club, seed) => ({ group_id: row!.id, club_id: club.id, seed: seed + 1 }))
          }),
          ...sulaDraw.groups.flatMap((group, index) => {
            const row = createdGroups.find(item => item.competition_id === sudamericanaId && item.group_code === String.fromCharCode(65 + index))
            return group.map((club, seed) => ({ group_id: row!.id, club_id: club.id, seed: seed + 1 }))
          }),
        ]
        await supabase.from('competition_group_teams').insert(groupTeamRows)

        const groupFixtures = [
          ...buildContinentalGroupFixtures(nextSeasonId, libertadoresId, libDraw.groups, nextYear),
          ...buildContinentalGroupFixtures(nextSeasonId, sudamericanaId, sulaDraw.groups, nextYear, 8),
        ].map(fixture => ({
          competition_id: fixture.competitionId,
          season_id: fixture.seasonId,
          round: fixture.round,
          home_club_id: fixture.homeClubId,
          away_club_id: fixture.awayClubId,
          scheduled_at: fixture.scheduledAt,
          status: 'scheduled',
          stage: fixture.stage,
        }))

        const preliminaryFixtures = preliminaryPlan.fixtures.map((fixture, index) => {
          const home = nextClubs.find(club => club.id === fixture.homeClubId)
          const away = nextClubs.find(club => club.id === fixture.awayClubId)
          const homeStrength = Number(home?.strength ?? home?.reputation ?? 50)
          const awayStrength = Number(away?.strength ?? away?.reputation ?? 50)
          const winner = homeStrength >= awayStrength ? fixture.homeClubId : fixture.awayClubId
          const homeScore = winner === fixture.homeClubId ? 1 + (index % 2) : 0
          const awayScore = winner === fixture.awayClubId ? 1 + (index % 2) : 0
          return {
            competition_id: fixture.competitionId,
            season_id: fixture.seasonId,
            round: fixture.round,
            home_club_id: fixture.homeClubId,
            away_club_id: fixture.awayClubId,
            scheduled_at: fixture.scheduledAt,
            status: 'completed',
            home_score: homeScore,
            away_score: awayScore,
            winner_club_id: winner,
            stage: fixture.stage,
          }
        })

        const { error: continentalFixtureError } = await supabase
          .from('fixtures')
          .insert([...preliminaryFixtures, ...groupFixtures])

        if (continentalFixtureError) {
          console.error('Não foi possível criar o calendário continental', continentalFixtureError)
          return
        }
      }
    }

    // O banco é a fonte de verdade da nova temporada; sincronizamos o estado
    // local antes de reconstruir calendário, IA e telas do universo.
    onClubsUpdate(nextClubs)

    await ensureCompetitionTeams(nextSeasonId, leagueId, activeClubs)
    await ensureCompetitionTeams(nextSeasonId, serieBId, serieBClubs)
    await ensureCompetitionTeams(nextSeasonId, cupId, [...activeClubs, ...serieBClubs])

    const { data: existingFixtures } = await supabase
      .from('fixtures')
      .select('id')
      .eq('season_id', nextSeasonId)

    if (!(existingFixtures?.length)) {
      const fixtureRows = [
        ...buildLeagueFixtures(nextSeasonId, nextLeagueStartDate, activeClubs, leagueId),
        ...buildLeagueFixtures(nextSeasonId, nextLeagueStartDate, serieBClubs, serieBId, 5),
        ...buildCupFixtures(nextSeasonId, nextCupStartDate, [...activeClubs, ...serieBClubs], cupId),
      ]
      const { error: fixtureError } = await supabase.from('fixtures').insert(fixtureRows)
      if (fixtureError) {
        console.error('Não foi possível criar o calendário da próxima temporada', fixtureError)
        return
      }
    }

    // Contratos encerrados no intervalo entre temporadas viram jogadores livres.
    await supabase
      .from('club_players')
      .update({ club_id: null, salary: 0, contract_until: null })
      .lte('contract_until', nextStartDate)

    // Cartões, suspensões e lesões não atravessam uma temporada.
    await supabase
      .from('players')
      .update({ injured_until: null, suspended_until: null, yellow_cards: 0, red_cards: 0 })
      .not('id', 'is', null)

    const nextSponsor = { ...chooseSponsor(career.club.reputation ?? 50), seasonId: nextSeasonName }
    const sponsorTransaction = createTransaction(
      nextStartDate,
      'sponsorship',
      nextSponsor.name,
      nextSponsor.upfront,
      undefined,
      `sponsor:upfront:${nextSeasonName}`,
    )
    let nextBalance = nextSeasonBudget > 0 ? nextSeasonBudget : financeBalance
    if (!financeTransactions.some(item => item.eventId === sponsorTransaction.eventId)) {
      nextBalance = addFinanceTransaction(sponsorTransaction) ?? financeBalance
      setFinanceBalance(nextBalance)
    }
    const currentClubInNextSeason = nextClubs.find(club => club.id === career.club.id)
    const updatedCareer = {
      ...career,
      club: currentClubInNextSeason
        ? { ...currentClubInNextSeason, budget: nextBalance }
        : { ...career.club, budget: nextBalance },
      season: nextSeasonName,
    }
    localStorage.setItem(CAREER_KEY, JSON.stringify(updatedCareer))
    onCareerUpdate(updatedCareer)

    localStorage.removeItem(MATCHES_KEY)
    localStorage.removeItem(CONTRACTS_KEY)
    localStorage.removeItem(TRAINING_KEY)
    localStorage.removeItem(CLOCK_KEY)
    localStorage.removeItem(TRANSFERS_KEY)
    localStorage.removeItem(MARKET_INTEREST_KEY + ':' + nextSeasonName)
    localStorage.removeItem(MARKET_NEGOTIATION_KEY + ':' + nextSeasonName)
    localStorage.setItem(MARKET_INTEREST_KEY + ':' + nextSeasonName, JSON.stringify([]))
    localStorage.setItem(MARKET_NEGOTIATION_KEY + ':' + nextSeasonName, JSON.stringify([]))
    const nextBoardBase = createBoardState(nextSeasonName, nextSeasonName, career.club.reputation ?? 50, nextBalance, career.club.strength ?? 50)
    const nextBoard = {
      ...nextBoardBase,
      managerStatus: 'renewed' as const,
      contractYears: boardState.contractYears ?? 1,
      contractEndSeason: boardState.contractEndSeason,
    }
    localStorage.setItem(BOARD_KEY + ':' + nextSeasonName, JSON.stringify(nextBoard))
    localStorage.setItem(FANS_KEY + ':' + nextSeasonName, JSON.stringify(createFanState(nextSeasonName, career.club.reputation ?? 50, nextBoard.expectation)))
    localStorage.setItem(COMMERCIAL_KEY + ':' + nextSeasonName, JSON.stringify({
      sponsor: nextSponsor,
      stadium: carryStadiumToNextSeason(commercial.stadium, nextSeasonName),
    }))

    setSeasonClosed(false)
    setSeasonCompletion(null)
    setSeasonAwards([])
    setNextSeasonBudget(0)
    localStorage.removeItem(NEXT_BUDGET_KEY)
    setBoardState(nextBoard)
    setClock(createSeasonClock(nextStartDate, nextStartDate, 3))
    setPlayedMatches({})
    setTransferState({ playerClubOverrides: {}, records: [] })
    setView('overview')
    navigate('/dashboard')
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

  async function persistManagementToSupabase(seasonId: string, nextBoard: BoardState, nextFans: FanState, clubId = career.club.id) {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) return

    const { error } = await supabase.from('club_management_seasons').upsert({
      season_id: seasonId,
      club_id: clubId,
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
    }, { onConflict: 'season_id,club_id,owner_id' })
    if (error) console.error('Não foi possível persistir a gestão/torcida', error)
  }

  async function saveManagement(nextBoard: BoardState, nextFans: FanState) {
    setBoardState(nextBoard)
    setFanState(nextFans)
    localStorage.setItem(BOARD_KEY + ':' + career.season, JSON.stringify(nextBoard))
    localStorage.setItem(FANS_KEY + ':' + career.season, JSON.stringify(nextFans))
    if (databaseSeasonId) await persistManagementToSupabase(databaseSeasonId, nextBoard, nextFans)
  }

  async function persistCommercialToSupabase(seasonId: string, value: { sponsor: SponsorContract; stadium: StadiumState }, clubId = career.club.id) {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) return

    const { error } = await supabase.from('club_commercial_seasons').upsert({
      season_id: seasonId,
      club_id: value.stadium.clubId || clubId,
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
    }, { onConflict: 'season_id,club_id,owner_id' })
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
      const currentTeam = table.find(team => team.id === career.club.id)
      const dismissalScore = managerPerformanceScore({
        position: currentPosition,
        points: Number(currentTeam?.points ?? 0),
        wins: Number(currentTeam?.wins ?? 0),
        draws: Number(currentTeam?.draws ?? 0),
        losses: Number(currentTeam?.losses ?? 0),
        clubReputation: Number(career.club.reputation ?? 50),
        leagueTitle: false,
        cupTitle: false,
        boardConfidence: nextBoard.confidence,
        fanSatisfaction: nextFans.satisfaction,
      })
      const candidateClubs = buildManagerOfferCandidates(
        managerPopularity,
        dismissalScore,
        clubs,
        career.club.id,
      )
      void (async () => {
        const { data: authUser } = await supabase.auth.getUser()
        if (!authUser.user) return
        const offeredAt = toDateKey(fixture.scheduled_at)
        const expiresAt = addDays(offeredAt, 14)
        await supabase
          .from('manager_offers')
          .update({ status: 'expired', responded_at: new Date().toISOString() })
          .eq('owner_id', authUser.user.id)
          .eq('status', 'pending')
        if (candidateClubs.length) {
          await supabase.from('manager_offers').insert(candidateClubs.map(club => ({
            owner_id: authUser.user.id,
            offered_at: offeredAt,
            expires_at: expiresAt,
            from_club_id: club.id,
            performance_score: dismissalScore,
            popularity_score: managerPopularity.regional + managerPopularity.national + managerPopularity.international,
            offer_level: offerLevelForPopularity(managerPopularity),
            message: club.name + ' está disposto a avaliar seu trabalho. O objetivo inicial seria ' + chooseBoardObjective(Number(club.reputation ?? 50), Number(club.budget ?? 0), Number(club.strength ?? club.reputation ?? 50)).label.toLowerCase() + '. A proposta ficará disponível por 14 dias.',
            status: 'pending',
          })))
        }
        await markManagerUnemployed('dismissed')
        await loadManagerCareer()
      })()

      setPendingEvent({
        type: 'board_message',
        date: toDateKey(fixture.scheduled_at),
        title: 'A diretoria encerrou seu trabalho',
        message: candidateClubs.length
          ? 'A sequência de resultados encerrou seu vínculo. Outros clubes já demonstraram interesse; consulte a carreira do treinador para analisar as propostas.'
          : 'A sequência de resultados e o nível de confiança chegaram a um ponto em que a diretoria decidiu encerrar o vínculo com o treinador.',
        tone: 'warning',
      })
    }
  }


  useEffect(() => {
    let active = true
    async function loadDashboard() {
      setLoading(true)
      await Promise.all([loadCareerHistory(), loadManagerCareer()])
      const { data: currentSeasonRow } = await supabase.from('seasons').select('id,status').eq('id', career.seasonId).maybeSingle()
      const currentSeasonId = currentSeasonRow?.id ?? null
      if (currentSeasonId) {
        setDatabaseSeasonId(currentSeasonId)

        // Repara carreiras antigas que foram criadas antes da Série B e da Copa
        // entrarem no calendário nacional. Só cria uma competição se ela realmente
        // não tiver nenhuma fixture nessa temporada, evitando duplicações.
        const { data: nationalCompetitions } = await supabase
          .from('competitions')
          .select('id,name')
          .in('name', ['Liga Nacional do Brasil', 'Copa Nacional do Brasil', SERIE_B_NAME])
        const repairLeagueId = nationalCompetitions?.find(item => item.name === 'Liga Nacional do Brasil')?.id
        const repairCupId = nationalCompetitions?.find(item => item.name === 'Copa Nacional do Brasil')?.id
        const repairSerieBId = nationalCompetitions?.find(item => item.name === SERIE_B_NAME)?.id
        if (repairLeagueId && repairCupId && repairSerieBId) {
          const { data: existingNational } = await supabase
            .from('fixtures')
            .select('competition_id')
            .eq('season_id', currentSeasonId)
            .in('competition_id', [repairLeagueId, repairCupId, repairSerieBId])
          const existingIds = new Set((existingNational ?? []).map(row => String(row.competition_id)))
          const firstDivision = clubs.filter(club => club.country === 'Brasil' && Number(club.division ?? 1) === 1)
          const secondDivision = clubs.filter(club => club.country === 'Brasil' && Number(club.division ?? 1) === 2)
          const repairRows = [
            ...(existingIds.has(repairLeagueId) ? [] : buildLeagueFixtures(currentSeasonId, leagueStartDate(Number(career.season.match(/\d{4}/)?.[0] ?? INITIAL_SEASON_YEAR)), firstDivision, repairLeagueId)),
            ...(existingIds.has(repairSerieBId) ? [] : buildLeagueFixtures(currentSeasonId, leagueStartDate(Number(career.season.match(/\d{4}/)?.[0] ?? INITIAL_SEASON_YEAR)), secondDivision, repairSerieBId, 7)),
            ...(existingIds.has(repairCupId) ? [] : buildCupFixtures(currentSeasonId, cupStartDate(Number(career.season.match(/\d{4}/)?.[0] ?? INITIAL_SEASON_YEAR)), [...firstDivision, ...secondDivision], repairCupId)),
          ]
          if (repairRows.length) {
            const { error: repairError } = await supabase.from('fixtures').insert(repairRows)
            if (repairError) console.error('Não foi possível reparar o calendário nacional da temporada', repairError)
          }

          // Carreiras que já estavam avançadas precisam ter os jogos nacionais
          // anteriores à data salva no relógio resolvidos antes de carregar o painel.
          const savedClock = localStorage.getItem(seasonStorageKey(CLOCK_KEY, career.seasonId))
          let repairTargetDate: string | null = null
          try {
            repairTargetDate = savedClock ? JSON.parse(savedClock).currentDate ?? null : null
          } catch {}
          if (repairTargetDate) {
            await simulateOtherNationalMatchesUntil(repairTargetDate, currentSeasonId, career.club.id)
          }
        }

        const { data: sessionData } = await supabase.auth.getSession()

        if (sessionData.session) {
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
      }
      if (currentSeasonId && currentSeasonRow?.status === 'completed') {
        const { data: completedHistory } = await supabase
          .from('competition_history')
          .select('competition_id,champion_club_id,runner_up_club_id,top_scorer_player_id,top_scorer_goals,competitions!inner(name)')
          .eq('season_id', currentSeasonId)
        const leagueHistory = (completedHistory ?? []).find((row: any) => row.competitions?.name === 'Liga Nacional do Brasil')
        const cupHistory = (completedHistory ?? []).find((row: any) => row.competitions?.name === 'Copa Nacional do Brasil')
        const { data: loadedAwards } = await supabase
          .from('season_awards')
          .select('award_type,club_id,player_id,value')
          .eq('season_id', currentSeasonId)
        setSeasonAwards((loadedAwards ?? []) as SeasonAward[])

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
        supabase.from('fixtures').select('id,season_id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,home_club:clubs!fixtures_home_club_id_fkey(name,short_name,city,stadium,logo_url),away_club:clubs!fixtures_away_club_id_fkey(name,short_name,city,stadium,logo_url),competitions(name)').eq('season_id', currentSeasonId ?? '').or(`home_club_id.eq.${career.club.id},away_club_id.eq.${career.club.id}`).eq('status','scheduled').order('scheduled_at'),
        supabase.from('fixtures').select('id,season_id,competition_id,home_club_id,away_club_id,home_score,away_score,status,competitions!inner(name)').eq('season_id', currentSeasonId ?? '').eq('status','completed').eq('competitions.name','Liga Nacional do Brasil'),
        supabase.from('clubs').select('id,name,short_name,city,country,division,budget,reputation,stadium,logo_url').order('name'),
        supabase.from('club_players').select('player_id,club_id,salary,contract_until,players!inner(first_name,last_name)').order('player_id'),
        supabase.from('player_season_stats').select('player_id,appearances,starts,minutes,avg_rating,goals,assists').eq('season_id', currentSeasonId ?? ''),
      ])
      if (!active) return
      if (!squadResult.error) {
        const seasonStats = new Map((seasonStatsResult.data ?? []).map((row: any) => [row.player_id, row]))
        const lifecycle = loadPlayerLifecycle()
        const loaded = (squadResult.data ?? []).filter((row: any) => (getLoanClubId(row.club_id, row.players?.id ?? row.players?.[0]?.id, clock?.currentDate ?? SEASON_START, transferState.playerClubOverrides, loanState) === career.club.id)).map((row: any) => {
          const player = normalizePlayer(row)
          const life = lifecycle[player.id]
          const withLifecycle = life ? { ...player, ...life, careerAverageRating: life.careerRatingCount ? Number((life.careerRatingTotal / life.careerRatingCount).toFixed(2)) : 0 } : player
          const stats = seasonStats.get(player.id)
          return {
            ...withLifecycle,
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
          localStorage.setItem(seasonStorageKey(CLOCK_KEY, career.seasonId), JSON.stringify(initialClock))
        }
        if (fixture) {
          const opponentId = fixture.home_club_id === career.club.id ? fixture.away_club_id : fixture.home_club_id
          const { data: opponentSquad, error: opponentSquadError } = await supabase
            .from('club_players')
            .select('club_id,squad_number,players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale,injured_until,suspended_until,yellow_cards,red_cards)')
            .eq('club_id', opponentId)
            .order('squad_number')
          if (opponentSquadError) {
            console.error('Não foi possível carregar o elenco do adversário', opponentSquadError)
          }
          // club_players já representa o elenco atual do clube. Não filtramos novamente
          // por empréstimos aqui, pois isso podia zerar a lista quando o estado local
          // ainda não refletia a movimentação daquele jogador.
          if (active) setOpponentPlayers((opponentSquad ?? []).map(normalizePlayer))
        } else {
          setOpponentPlayers([])
        }
      }
      const leagueClubs = (clubs.length > 0 ? clubs : (clubsResult.data ?? []) as Club[])
        .filter(club => club.country === 'Brasil' && Number(club.division ?? 1) === 1)
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
      const savedMatches = JSON.parse(localStorage.getItem(seasonStorageKey(MATCHES_KEY, career.seasonId)) ?? '{}')
      setPlayedMatches(savedMatches)
    } catch {
      setPlayedMatches({})
    }
    try {
      const savedClock = localStorage.getItem(seasonStorageKey(CLOCK_KEY, career.seasonId))
      setClock(savedClock ? JSON.parse(savedClock) : null)
    } catch {
      setClock(null)
    }
    setNextFixture(null)
    setOpponentPlayers([])
  }, [career.seasonId])

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

  async function openOpponentSquad() {
    if (!nextFixture) return
    const opponentId = nextFixture.home_club_id === career.club.id ? nextFixture.away_club_id : nextFixture.home_club_id
    setOpponentLoading(true)
    setViewOpponent(true)
    goToView('squad')

    try {
      const { data, error } = await supabase
        .from('club_players')
        .select('club_id,squad_number,players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale,injured_until,suspended_until,yellow_cards,red_cards)')
        .eq('club_id', opponentId)
        .order('squad_number')

      if (error) throw error
      setOpponentPlayers((data ?? []).map(normalizePlayer))
    } catch (error) {
      console.error('Não foi possível carregar o elenco do adversário', error)
      setOpponentPlayers([])
    } finally {
      setOpponentLoading(false)
    }
  }

  async function loadWorldState() {
    const { data: season } = await supabase.from('seasons').select('id').eq('id', career.seasonId).maybeSingle()
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
      const life = loadPlayerLifecycle()[player.id]
      return {
        ...player,
        ...(life ? { ...life, careerAverageRating: life.careerRatingCount ? Number((life.careerRatingTotal / life.careerRatingCount).toFixed(2)) : 0 } : {}),
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

    const nationalLeagueClubIds = new Set(
      worldClubs
        .filter(club => club.country === 'Brasil' && Number(club.division ?? 1) === 1)
        .map(club => club.id),
    )
    const stats = new Map<string, { points: number; wins: number; draws: number; losses: number; gf: number; ga: number; recentResults: Array<'W' | 'D' | 'L'> }>()
    for (const club of worldClubs) {
      if (nationalLeagueClubIds.has(club.id)) {
        stats.set(club.id, { points: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, recentResults: [] })
      }
    }

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
    const lifecycle = loadPlayerLifecycle()
    for (const player of playersForWorld) {
      const currentLife = lifecycle[player.id] ?? updatePlayerLifecycle(undefined, {})
      lifecycle[player.id] = updatePlayerLifecycle(currentLife, {
        coachRelationship: Number(player.coachRelationship ?? lifecycle[player.id].coachRelationship),
        dissatisfaction: Number(player.dissatisfaction ?? lifecycle[player.id].dissatisfaction),
        transferRequested: Boolean(player.transferRequested ?? lifecycle[player.id].transferRequested),
        transferRequestDate: player.transferRequestDate ?? lifecycle[player.id].transferRequestDate,
        careerGoals: Number(player.careerGoals ?? lifecycle[player.id].careerGoals),
        careerAssists: Number(player.careerAssists ?? lifecycle[player.id].careerAssists),
        careerAppearances: Number(player.careerAppearances ?? lifecycle[player.id].careerAppearances),
        careerStarts: Number(player.careerStarts ?? lifecycle[player.id].careerStarts),
        careerMinutes: Number(player.careerMinutes ?? lifecycle[player.id].careerMinutes),
        careerRatingTotal: Number(player.careerAverageRating ?? 0) * Number(player.careerAppearances ?? currentLife.careerRatingCount),
        careerRatingCount: Number(player.careerAppearances ?? currentLife.careerRatingCount),
        careerSeasons: Number(player.careerSeasons ?? lifecycle[player.id].careerSeasons),
        injuries: Number(player.injuries ?? lifecycle[player.id].injuries),
        longTermInjuries: Number(player.longTermInjuries ?? lifecycle[player.id].longTermInjuries),
      })
    }
    savePlayerLifecycle(lifecycle)
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
    const previousAIManagers: AIClubManager[] = (() => {
      try { return JSON.parse(localStorage.getItem(AI_MANAGERS_KEY) ?? '[]') } catch { return [] }
    })()
    const activeLoans: LoanRecord[] = (() => {
      try {
        const stored: LoanState = JSON.parse(localStorage.getItem(LOANS_KEY) ?? '{"records":[]}')
        return stored.records ?? []
      } catch { return [] }
    })()
    const result = simulateWorldDay(nextDate, state.seasonId, state.worldClubs, state.playersForWorld, career.club.id, state.performanceByClub, previousMarketInterest, activeLoans, previousAIManagers, { personality: career.personality, style: career.style })
    localStorage.setItem(marketInterestStorageKey(state.seasonId), JSON.stringify(result.marketInterest))
    localStorage.setItem(AI_MANAGERS_KEY, JSON.stringify(result.aiManagers))
    const previousDecisions: unknown[] = (() => {
      try { return JSON.parse(localStorage.getItem(AI_BOARD_DECISIONS_KEY) ?? '[]') } catch { return [] }
    })()
    localStorage.setItem(AI_BOARD_DECISIONS_KEY, JSON.stringify([...result.boardDecisions, ...previousDecisions].slice(0, 120)))
    const news = buildWorldNews(result, state.worldClubs, state.playersForWorld, state.performanceByClub, career.club.id)
    await persistWorldState(state.seasonId, state.worldClubs, state.playersForWorld, [result])
    appendWorldNews(news)
    return news
  }

  async function simulateOtherNationalMatchesUntil(targetDate: string, seasonId = databaseSeasonId, currentClubId = career.club.id) {
    if (!seasonId) return

    const { data: competitions } = await supabase
      .from('competitions')
      .select('id,name')
      .in('name', [SERIE_B_NAME, 'Copa Nacional do Brasil'])
    const serieBId = competitions?.find(item => item.name === SERIE_B_NAME)?.id
    const cupId = competitions?.find(item => item.name === 'Copa Nacional do Brasil')?.id
    const competitionIds = [serieBId, cupId].filter(Boolean) as string[]
    if (!competitionIds.length) return

    const { data: simClubs } = await supabase
      .from('clubs')
      .select('id,strength,reputation,division,country')
    const strengthByClub = Object.fromEntries((simClubs ?? []).map(club => [
      club.id,
      Number(club.strength ?? club.reputation ?? 50),
    ]))

    const { data: pending } = await supabase
      .from('fixtures')
      .select('id,round,competition_id,home_club_id,away_club_id')
      .eq('season_id', seasonId)
      .in('competition_id', competitionIds)
      .eq('status', 'scheduled')
      .lte('scheduled_at', targetDate)
      .order('scheduled_at')

    const aiFixtures = (pending ?? []).filter(fixture =>
      fixture.home_club_id !== currentClubId && fixture.away_club_id !== currentClubId,
    )

    await Promise.all(aiFixtures.map(async fixture => {
      const home = Number(strengthByClub[fixture.home_club_id] ?? 50)
      const away = Number(strengthByClub[fixture.away_club_id] ?? 50)
      const seed = Math.abs(Math.sin(
        Number(fixture.round ?? 1) * 97 +
        fixture.home_club_id.split('').reduce((sum: number, char: string) => sum + char.charCodeAt(0), 0) -
        fixture.away_club_id.split('').reduce((sum: number, char: string) => sum + char.charCodeAt(0), 0),
      ))
      const homeScore = Math.max(0, Math.min(5, Math.round(seed * 3 + (home - away) / 22 + 0.55)))
      const awayScore = Math.max(0, Math.min(5, Math.round((1 - seed) * 2.5 + (away - home) / 24)))
      const isCup = fixture.competition_id === cupId
      const winner = homeScore > awayScore
        ? fixture.home_club_id
        : awayScore > homeScore
          ? fixture.away_club_id
          : isCup
            ? choosePenaltyWinner(fixture.home_club_id, fixture.away_club_id, fixture.id)
            : null

      await supabase
        .from('fixtures')
        .update({
          status: 'completed',
          home_score: homeScore,
          away_score: awayScore,
          winner_club_id: winner,
        })
        .eq('id', fixture.id)
    }))

    if (cupId) {
      const cupClubs = (simClubs ?? [])
        .filter(club => club.country === 'Brasil' && Number(club.division ?? 1) <= 2)
        .map(club => club.id)
      for (const currentRound of [1, 2, 4, 6, 8]) {
        const { data: cupRows } = await supabase
          .from('fixtures')
          .select('id,season_id,competition_id,round,scheduled_at,status,home_club_id,away_club_id,home_score,away_score,winner_club_id')
          .eq('season_id', seasonId)
          .eq('competition_id', cupId)
          .order('round')
          .order('scheduled_at')
        const cupFixtures = (cupRows ?? []).map(normalizeFixture)
        if (!cupFixtures.some(fixture => fixture.round === currentRound)) continue
        const generated = resolveCompletedKnockoutStage(cupFixtures, currentRound, cupClubs)
        if (!generated?.length) continue
        const existing = new Set(cupFixtures.map(fixture => `${fixture.round}:${fixture.home_club_id}:${fixture.away_club_id}`))
        const rows = generated
          .filter(fixture => !existing.has(`${fixture.round}:${fixture.homeClubId}:${fixture.awayClubId}`))
          .map(fixture => ({
            season_id: seasonId,
            competition_id: cupId,
            round: fixture.round,
            scheduled_at: fixture.scheduledAt,
            status: 'scheduled' as const,
            home_club_id: fixture.homeClubId,
            away_club_id: fixture.awayClubId,
            home_score: null,
            away_score: null,
            winner_club_id: null,
          }))
        if (rows.length) {
          const { error } = await supabase.from('fixtures').insert(rows)
          if (error) console.error('Não foi possível criar a próxima fase da Copa durante a simulação automática', error)
        }
      }
    }
  }

  async function simulateWorldUntilMatch(startDate: string, targetDate: string) {
    const state = await loadWorldState()
    if (!state) return { date: targetDate, event: null as ImportantEvent | null }

    const results: WorldSimulationResult[] = []
    const news: WorldNews[] = []
    let currentDate = startDate
    let event: ImportantEvent | null = null
    let aiManagers: AIClubManager[] = (() => {
      try { return JSON.parse(localStorage.getItem(AI_MANAGERS_KEY) ?? '[]') } catch { return [] }
    })()

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
      const result = simulateWorldDay(currentDate, state.seasonId, state.worldClubs, state.playersForWorld, career.club.id, state.performanceByClub, previousMarketInterest, activeLoans, aiManagers, { personality: career.personality, style: career.style })
      aiManagers = result.aiManagers
      localStorage.setItem(marketInterestStorageKey(state.seasonId), JSON.stringify(result.marketInterest))
      localStorage.setItem(AI_MANAGERS_KEY, JSON.stringify(aiManagers))
      const previousDecisions: unknown[] = (() => {
        try { return JSON.parse(localStorage.getItem(AI_BOARD_DECISIONS_KEY) ?? '[]') } catch { return [] }
      })()
      localStorage.setItem(AI_BOARD_DECISIONS_KEY, JSON.stringify([...result.boardDecisions, ...previousDecisions].slice(0, 120)))
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

    const monthlyClubPayroll = salaryTotal + calculateTechnicalStaffPayroll(salaryTotal, Number(career.club.reputation ?? 50), Number(career.club.strength ?? 50), boardState.confidence)
    const financialStatus = calculateFinancialStatus(financeBalance, monthlyClubPayroll)
    if (day === 1 && financialStatus !== 'saudável') {
      return {
        type: 'board_message',
        date,
        title: financialStatus === 'crítico' ? 'A situação financeira ficou crítica' : 'A diretoria está preocupada com as finanças',
        message: financialStatus === 'crítico'
          ? 'O caixa entrou em uma faixa crítica. A diretoria precisa reduzir despesas, evitar contratações caras e preservar recursos para o restante da temporada.'
          : 'O caixa entrou em uma faixa de atenção. A diretoria espera controle da folha e das próximas despesas.',
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

    if ([3, 6, 9].includes(month) && day === 15 && managerPopularity.regional + managerPopularity.national + managerPopularity.international >= 35) {
      const performanceScore = sporting ? managerPerformanceScore({ position: sporting.position, points: sporting.points, wins: Math.round(sporting.played * 0.45), draws: Math.round(sporting.played * 0.2), losses: Math.max(0, sporting.played - Math.round(sporting.played * 0.65)), clubReputation: Number(career.club.reputation ?? 50), leagueTitle: false, cupTitle: false, boardConfidence: boardState.confidence, fanSatisfaction: fanState.satisfaction }) : 0
      const candidates = clubs
        .filter(club => club.id !== career.club.id)
        .filter(club => clubCanApproachManager(managerPopularity, Number(club.reputation ?? 0), performanceScore))
        .sort((a, b) => Number(b.reputation ?? 0) - Number(a.reputation ?? 0))
      const target = candidates[eventHash(date + ':manager-target') % Math.max(1, candidates.length)]
      if (target) {
        return { type: 'manager_offer', date, fromClubId: target.id, message: target.name + ' entrou em contato porque seu desempenho e sua crescente reputação colocaram você no radar do clube.' }
      }
    }

    return null
  }

  async function simulateContinentalUntil(targetDate: string) {
    if (!databaseSeasonId) return
    const continental = await supabase
      .from('competitions')
      .select('id,name')
      .in('name', ['CONMEBOL Libertadores', 'CONMEBOL Sudamericana'])
    const ids = new Map((continental.data ?? []).map(row => [row.name, row.id]))
    if (!ids.size) return

    const { simulateMatch } = await import('./engine/match')

    for (let pass = 0; pass < 20; pass++) {
      const { data: pending } = await supabase
        .from('fixtures')
        .select('id,round,competition_id,home_club_id,away_club_id,scheduled_at,status,home_score,away_score,winner_club_id,neutral_venue,venue_name,home_club:clubs!fixtures_home_club_id_fkey(name,short_name,city,stadium,logo_url),away_club:clubs!fixtures_away_club_id_fkey(name,short_name,city,stadium,logo_url),competitions(name)')
        .eq('season_id', databaseSeasonId)
        .in('competition_id', [...ids.values()])
        .eq('status', 'scheduled')
        .lte('scheduled_at', targetDate)
        .order('scheduled_at')

      const eligible = (pending ?? []).filter(fixture => fixture.home_club_id !== career.club.id && fixture.away_club_id !== career.club.id)
      if (!eligible.length) {
        if ((pending ?? []).some(fixture => fixture.home_club_id === career.club.id || fixture.away_club_id === career.club.id)) break
        await advanceContinentalStages()
        const { data: nextPending } = await supabase
          .from('fixtures')
          .select('id')
          .eq('season_id', databaseSeasonId)
          .in('competition_id', [...ids.values()])
          .eq('status', 'scheduled')
          .lte('scheduled_at', targetDate)
          .limit(1)
        if (!nextPending?.length) break
        continue
      }

      const clubIds = [...new Set(eligible.flatMap(fixture => [fixture.home_club_id, fixture.away_club_id]))]
      const { data: squadRows } = await supabase
        .from('club_players')
        .select('club_id,squad_number,players!inner(id,first_name,last_name,age,nationality,position,pace,shooting,passing,dribbling,defending,physical,goalkeeping,mental,potential,form,morale,injured_until,suspended_until,yellow_cards,red_cards)')
        .in('club_id', clubIds)

      const squads = new Map<string, Player[]>()
      for (const row of squadRows ?? []) {
        const player = normalizePlayer(row)
        const squad = squads.get(row.club_id) ?? []
        squad.push(player)
        squads.set(row.club_id, squad)
      }

      let simulatedAny = false
      for (const rawFixture of eligible) {
        const fixture = normalizeFixture(rawFixture)
        const homePlayers = squads.get(fixture.home_club_id) ?? []
        const awayPlayers = squads.get(fixture.away_club_id) ?? []
        if (!homePlayers.length || !awayPlayers.length) continue

        const homeCoach = getAiCoachProfile(fixture.home_club_id)
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

        const { error } = await supabase.from('fixtures').update({
          status: 'completed',
          home_score: simulated.homeScore,
          away_score: simulated.awayScore,
          winner_club_id: simulated.homeScore > simulated.awayScore
            ? fixture.home_club_id
            : simulated.awayScore > simulated.homeScore
              ? fixture.away_club_id
              : null,
        }).eq('id', fixture.id).eq('status', 'scheduled')

        if (!error) simulatedAny = true
      }

      if (!simulatedAny) break
      await advanceContinentalStages()
    }

    await advanceContinentalStages()
    if (databaseSeasonId) await finalizeSeasonIfComplete(databaseSeasonId, playedMatches)
  }

  async function advanceContinentalStages() {
    if (!databaseSeasonId) return
    const { data: competitions } = await supabase
      .from('competitions')
      .select('id,name')
      .in('name', ['CONMEBOL Libertadores', 'CONMEBOL Sudamericana'])
    const libId = competitions?.find(row => row.name === 'CONMEBOL Libertadores')?.id
    const sulaId = competitions?.find(row => row.name === 'CONMEBOL Sudamericana')?.id
    if (!libId || !sulaId) return

    const [{ data: fixtures }, { data: groups }] = await Promise.all([
      supabase.from('fixtures').select('id,round,competition_id,home_club_id,away_club_id,scheduled_at,status,home_score,away_score,winner_club_id,neutral_venue,venue_name').eq('season_id', databaseSeasonId).in('competition_id',[libId,sulaId]).order('scheduled_at'),
      supabase.from('competition_groups').select('id,competition_id,group_code').eq('season_id',databaseSeasonId).in('competition_id',[libId,sulaId]),
    ])
    const groupIds = (groups ?? []).map((row: { id: string }) => row.id)
    const { data: groupTeams } = groupIds.length
      ? await supabase.from('competition_group_teams').select('group_id,club_id').in('group_id', groupIds)
      : { data: [] as Array<{ group_id: string; club_id: string }> }
    const allFixtures = (fixtures ?? []) as any[]
    const groupRows = (groups ?? []) as any[]
    const teamsByGroup = new Map<string,string[]>()
    for (const row of groupTeams ?? []) {
      const list = teamsByGroup.get(row.group_id) ?? []
      list.push(row.club_id)
      teamsByGroup.set(row.group_id,list)
    }
    const teamMap = new Map(clubs.map(club => [club.id, club]))

    const getGroupData = (competitionId: string) =>
      groupRows.filter(row => row.competition_id === competitionId).sort((a,b) => a.group_code.localeCompare(b.group_code)).map(row => ({
        code: row.group_code,
        teams: (teamsByGroup.get(row.id) ?? []).map(id => teamMap.get(id)).filter(Boolean),
      })).filter(group => group.teams.length === 4) as Array<{code:string;teams:Club[]}>

    const groupComplete = (competitionId: string) => {
      const groupFixtures = allFixtures.filter(f => f.competition_id === competitionId && f.round <= 6 && f.status === 'completed' && f.home_score != null && f.away_score != null)
      return groupFixtures.length === 96
    }

    const createRows = async (competitionId: string, rows: Array<{round:number;homeClubId:string;awayClubId:string;scheduledAt:string;stage:string;neutralVenue?:boolean;venueName?:string}>) => {
      if (!rows.length) return
      await supabase.from('fixtures').insert(rows.map(row => ({
        competition_id: competitionId,
        season_id: databaseSeasonId,
        round: row.round,
        home_club_id: row.homeClubId,
        away_club_id: row.awayClubId,
        scheduled_at: row.scheduledAt,
        status: 'scheduled',
        stage: row.stage,
        neutral_venue: row.neutralVenue ?? false,
        venue_name: row.venueName ?? null,
      })))
    }

    const stageComplete = (competitionId: string, firstRound: number, lastRound: number, expected: number) => {
      const rows = allFixtures.filter(f => f.competition_id === competitionId && f.round >= firstRound && f.round <= lastRound)
      return rows.length === expected && rows.every(f => f.status === 'completed' && f.home_score != null && f.away_score != null)
    }

    const resolveWinners = (competitionId: string, firstRound: number, secondRound: number) => {
      const rows = allFixtures.filter(f => f.competition_id === competitionId && (f.round === firstRound || f.round === secondRound) && f.status === 'completed' && f.home_score != null && f.away_score != null)
      const ties = new Map<string, any[]>()
      for (const fixture of rows) {
        const key = [fixture.home_club_id, fixture.away_club_id].sort().join(':')
        const list = ties.get(key) ?? []
        list.push(fixture)
        ties.set(key,list)
      }
      const winners:string[]=[]
      for (const tie of ties.values()) {
        const first=tie.find(f=>f.round===firstRound)
        const second=tie.find(f=>f.round===secondRound)
        if(!first||!second) continue
        winners.push(resolveContinentalTwoLegTie(first,second,choosePenaltyWinner(second.home_club_id,second.away_club_id,second.id)))
      }
      return winners
    }

    const dateAfter = (rounds:number, days:number) => {
      const relevant = allFixtures.filter(f => rounds === 0 ? true : f.round === rounds && f.status === 'completed')
      const latest = relevant.length ? Math.max(...relevant.map(f=>new Date(f.scheduled_at).getTime())) : Date.now()
      return new Date(latest + days * 86400000).toISOString().slice(0,10)
    }

    // Libertadores: grupos -> oitavas.
    if (groupComplete(libId) && !allFixtures.some(f => f.competition_id === libId && f.round === 9)) {
      const q = buildContinentalGroupQualification(getGroupData(libId), allFixtures.filter(f => f.competition_id === libId) as any)
      const pairs = pairLibertadoresRoundOf16(q.winners,q.runnersUp)
      const first = dateAfter(6,70), second = dateAfter(6,77)
      await createRows(libId, buildTwoLegFixtures(pairs,9,first,second,'round_of_16'))
    }

    // Sul-Americana: grupos + terceiros da Libertadores -> playoff.
    if (groupComplete(sulaId) && groupComplete(libId) && !allFixtures.some(f => f.competition_id === sulaId && f.round === 7)) {
      const libQ = buildContinentalGroupQualification(getGroupData(libId), allFixtures.filter(f => f.competition_id === libId) as any)
      const sulaQ = buildContinentalGroupQualification(getGroupData(sulaId), allFixtures.filter(f => f.competition_id === sulaId) as any)
      const pairs = pairSudamericanaPlayoffs(libQ.thirds,sulaQ.runnersUp)
      await createRows(sulaId, buildTwoLegFixtures(pairs,7,dateAfter(6,56),dateAfter(6,63),'sudamericana_playoff'))
    }

    // Sul-Americana: playoff -> oitavas.
    if (stageComplete(sulaId,7,8,16) && !allFixtures.some(f => f.competition_id === sulaId && f.round === 9)) {
      const q = buildContinentalGroupQualification(getGroupData(sulaId), allFixtures.filter(f => f.competition_id === sulaId) as any)
      const playoffWinners = resolveWinners(sulaId,7,8)
      const pairs = pairSequential([...q.winners,...playoffWinners])
      await createRows(sulaId, buildTwoLegFixtures(pairs,9,dateAfter(8,14),dateAfter(8,21),'round_of_16'))
    }

    for (const competitionId of [libId,sulaId]) {
      if (stageComplete(competitionId,9,10,16) && !allFixtures.some(f => f.competition_id === competitionId && f.round === 11)) {
        const winners=resolveWinners(competitionId,9,10)
        await createRows(competitionId,buildTwoLegFixtures(pairSequential(winners),11,dateAfter(10,21),dateAfter(10,28),'quarterfinals'))
      }
      if (stageComplete(competitionId,11,12,8) && !allFixtures.some(f => f.competition_id === competitionId && f.round === 13)) {
        const winners=resolveWinners(competitionId,11,12)
        await createRows(competitionId,buildTwoLegFixtures(pairSequential(winners),13,dateAfter(12,28),dateAfter(12,35),'semifinals'))
      }
      if (stageComplete(competitionId,13,14,4) && !allFixtures.some(f => f.competition_id === competitionId && f.round === 15)) {
        const winners=resolveWinners(competitionId,13,14)
        if (winners.length===2) {
          const neutralVenue = clubs
            .filter(club => club.country === 'Brasil' && club.id !== winners[0] && club.id !== winners[1])
            .sort((a,b) => Number(b.stadium_capacity ?? 0) - Number(a.stadium_capacity ?? 0))[0]
          const row = {
            ...buildSingleFinalFixture(winners[0], winners[1], 15, new Date(new Date(dateAfter(14,35)+'T19:00:00Z').getTime()).toISOString()),
            neutralVenue: true,
            venueName: neutralVenue?.stadium ?? 'Estádio Nacional',
          }
          await createRows(competitionId,[row])
        }
      }
      const final = allFixtures.find(f=>f.competition_id===competitionId && f.round===15 && f.status==='completed' && f.home_score!=null && f.away_score!=null)
      if (final) {
        const champion = resolveContinentalSingleMatch(
          final,
          choosePenaltyWinner(final.home_club_id, final.away_club_id, final.id),
        )
        const runner = champion === final.home_club_id ? final.away_club_id : final.home_club_id

        await supabase.from('competition_history').upsert({
          season_id: databaseSeasonId,
          competition_id: competitionId,
          champion_club_id: champion,
          runner_up_club_id: runner,
          top_scorer_player_id: null,
          top_scorer_goals: 0,
        }, { onConflict: 'season_id,competition_id' })

        const { data: prize } = await supabase
          .from('competition_prizes')
          .select('id,prize_type,stage,amount,description')
          .eq('competition_id', competitionId)
          .eq('prize_type', 'champion')
          .maybeSingle()

        if (prize) {
          const { data: existingPayment } = await supabase
            .from('competition_prize_payments')
            .select('id')
            .eq('competition_id', competitionId)
            .eq('season_id', databaseSeasonId)
            .eq('club_id', champion)
            .eq('prize_id', prize.id)
            .maybeSingle()

          if (!existingPayment) {
            await supabase.from('competition_prize_payments').insert({
              competition_id: competitionId,
              season_id: databaseSeasonId,
              club_id: champion,
              prize_id: prize.id,
              prize_type: prize.prize_type,
              stage: prize.stage,
              position: 1,
              amount: Number(prize.amount),
              description: prize.description ?? 'Premiação do campeão continental',
            })

            const { data: championClub } = await supabase
              .from('clubs')
              .select('budget,reputation,strength')
              .eq('id', champion)
              .maybeSingle()

            if (championClub) {
              const reputationBonus = 8
              await supabase.from('clubs').update({
                budget: Math.max(0, Number(championClub.budget ?? 0) + Number(prize.amount ?? 0)),
                reputation: Math.min(95, Number(championClub.reputation ?? 50) + reputationBonus),
                strength: Math.min(95, Number(championClub.strength ?? 50) + 2),
              }).eq('id', champion)
            }

            const { data: runnerClub } = await supabase
              .from('clubs')
              .select('reputation,strength')
              .eq('id', runner)
              .maybeSingle()

            if (runnerClub) {
              await supabase.from('clubs').update({
                reputation: Math.min(95, Number(runnerClub.reputation ?? 50) + 4),
                strength: Math.min(95, Number(runnerClub.strength ?? 50) + 1),
              }).eq('id', runner)
            }

            const { data: authUser } = await supabase.auth.getUser()
            if (authUser.user && career.club.id === champion) {
              const { data: profile } = await supabase
                .from('manager_profiles')
                .select('regional_popularity,national_popularity,international_popularity,career_points')
                .eq('owner_id', authUser.user.id)
                .maybeSingle()

              if (profile) {
                const nextPopularity = {
                  regional: Math.min(100, Number(profile.regional_popularity ?? 0) + 3),
                  national: Math.min(100, Number(profile.national_popularity ?? 0) + 5),
                  international: Math.min(100, Number(profile.international_popularity ?? 0) + 10),
                }
                await supabase.from('manager_profiles').update({
                  ...nextPopularity,
                  career_points: Number(profile.career_points ?? 0) + 35,
                  updated_at: new Date().toISOString(),
                }).eq('owner_id', authUser.user.id)

                await supabase.from('manager_trophies').upsert({
                  owner_id: authUser.user.id,
                  season_id: databaseSeasonId,
                  club_id: champion,
                  competition_id: competitionId,
                  competition_name: competitionId === libId ? 'CONMEBOL Libertadores' : 'CONMEBOL Sudamericana',
                  trophy_type: 'champion',
                }, { onConflict: 'owner_id,season_id,competition_id' })

                setManagerPopularity(nextPopularity)
              }
            } else if (authUser.user && career.club.id === runner) {
              const { data: profile } = await supabase
                .from('manager_profiles')
                .select('regional_popularity,national_popularity,international_popularity,career_points')
                .eq('owner_id', authUser.user.id)
                .maybeSingle()

              if (profile) {
                const nextPopularity = {
                  regional: Math.min(100, Number(profile.regional_popularity ?? 0) + 1),
                  national: Math.min(100, Number(profile.national_popularity ?? 0) + 2),
                  international: Math.min(100, Number(profile.international_popularity ?? 0) + 4),
                }
                await supabase.from('manager_profiles').update({
                  ...nextPopularity,
                  career_points: Number(profile.career_points ?? 0) + 15,
                  updated_at: new Date().toISOString(),
                }).eq('owner_id', authUser.user.id)
                setManagerPopularity(nextPopularity)
              }
            }
          }
        }
      }
    }
  }

  async function advanceOneDay(fromClock = clock) {
    if (boardState.managerStatus !== 'active' && boardState.managerStatus !== 'renewed') return false
    if (!fromClock || !canAdvanceDay(fromClock, nextMatchDate)) return false

    const nextClock = advanceSeasonDay(fromClock)
    // O relógio é a fonte da verdade da navegação. Atualizamos primeiro para que
    // uma falha em uma simulação secundária nunca impeça o usuário de avançar.
    setClock(nextClock)
    localStorage.setItem(seasonStorageKey(CLOCK_KEY, career.seasonId), JSON.stringify(nextClock))

    try {
      const worldResult = await simulateWorldUntilMatch(fromClock.currentDate, nextClock.currentDate)
      await simulateOtherNationalMatchesUntil(nextClock.currentDate, databaseSeasonId, career.club.id)
      await simulateContinentalUntil(nextClock.currentDate)
      if (worldResult?.event) setPendingEvent(worldResult.event)
    } catch (simulationError) {
      console.error('Falha ao processar a simulação do dia; o relógio foi avançado mesmo assim.', simulationError)
    }

    const nextPlayers = recoverPlayers(players, 8)
    if (nextClock.currentDate.slice(0, 7) !== fromClock.currentDate.slice(0, 7)) {
      const salaryExpense = calculateMonthlySalaryExpense(salaryTotal)
      const staffPayroll = calculateTechnicalStaffPayroll(salaryTotal, Number(career.club.reputation ?? 50), Number(career.club.strength ?? 50), boardState.confidence)
      const monthlyTransactions = [
        createTransaction(nextClock.currentDate, 'salary', `Folha salarial de ${nextClock.currentDate.slice(0, 7)}`, salaryExpense, undefined, `salary:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
        createTransaction(nextClock.currentDate, 'staff_salary', 'Comissão técnica e equipe do clube', -staffPayroll, undefined, `staff-salary:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
        createTransaction(nextClock.currentDate, 'sponsorship', commercial.sponsor.name, commercial.sponsor.monthly, undefined, `sponsor:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
        createTransaction(nextClock.currentDate, 'stadium_maintenance', 'Manutenção do estádio', -commercial.stadium.maintenance, undefined, `stadium-maintenance:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
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

    setPlayers(nextPlayers)
    const savedTraining = JSON.parse(localStorage.getItem(TRAINING_KEY) ?? '{}')
    localStorage.setItem(TRAINING_KEY, JSON.stringify({ ...savedTraining, players: Object.fromEntries(nextPlayers.map(player => [player.id, player])) }))
    return true
  }

  async function restOneDay() {
    if (advancingDays || !clock) return
    if (!canAdvanceDay(clock, nextMatchDate)) return

    setAdvancingDays(true)
    try {
      const advanced = await advanceOneDay(clock)
      if (!advanced) return
    } catch (error) {
      console.error('Não foi possível avançar o dia.', error)
    } finally {
      setAdvancingDays(false)
    }
  }

  async function advanceToNextMatch() {
    if (boardState.managerStatus !== 'active' && boardState.managerStatus !== 'renewed') return
    if (!clock || !nextMatchDate || clock.currentDate >= nextMatchDate || advancingDays) return

    setAdvancingDays(true)
    try {
      let advanceResult: Awaited<ReturnType<typeof simulateWorldUntilMatch>> = { date: nextMatchDate, event: null }
      try {
        advanceResult = await simulateWorldUntilMatch(clock.currentDate, nextMatchDate)
      } catch (simulationError) {
        console.error('Falha na simulação do mundo; avançando diretamente até a data da partida.', simulationError)
      }
      const targetDate = advanceResult.date ?? nextMatchDate

      let current = clock
      let nextPlayers = players
      let nextBalance = financeBalance
      let nextTransactions = financeTransactions

      while (current.currentDate < targetDate) {
        const nextClock = advanceSeasonDay(current)
        nextPlayers = recoverPlayers(nextPlayers, 8)

        if (nextClock.currentDate.slice(0, 7) !== current.currentDate.slice(0, 7)) {
          const salaryExpense = calculateMonthlySalaryExpense(salaryTotal)
          const staffPayroll = calculateTechnicalStaffPayroll(salaryTotal, Number(career.club.reputation ?? 50), Number(career.club.strength ?? 50), boardState.confidence)
          const monthlyTransactions = [
            createTransaction(nextClock.currentDate, 'salary', `Folha salarial de ${nextClock.currentDate.slice(0, 7)}`, salaryExpense, undefined, `salary:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
            createTransaction(nextClock.currentDate, 'staff_salary', 'Comissão técnica e equipe do clube', -staffPayroll, undefined, `staff-salary:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
            createTransaction(nextClock.currentDate, 'sponsorship', commercial.sponsor.name, commercial.sponsor.monthly, undefined, `sponsor:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
            createTransaction(nextClock.currentDate, 'stadium_maintenance', 'Manutenção do estádio', -commercial.stadium.maintenance, undefined, `stadium-maintenance:${career.season}:${nextClock.currentDate.slice(0, 7)}`),
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
      localStorage.setItem(seasonStorageKey(CLOCK_KEY, career.seasonId), JSON.stringify(current))

      try {
        await simulateContinentalUntil(targetDate)
        if (advanceResult?.event) setPendingEvent(advanceResult.event)
      } catch (simulationError) {
        console.error('Falha ao processar as competições durante o avanço até a partida.', simulationError)
      }

      setPlayers(nextPlayers)
      setFinanceBalance(nextBalance)
      setFinanceTransactions(nextTransactions)

      localStorage.setItem(FINANCE_KEY, JSON.stringify(nextTransactions))
      localStorage.setItem(CAREER_KEY, JSON.stringify({ ...career, club: { ...career.club, budget: nextBalance } }))
      localStorage.setItem(TRAINING_KEY, JSON.stringify({
        ...JSON.parse(localStorage.getItem(TRAINING_KEY) ?? '{}'),
        players: Object.fromEntries(nextPlayers.map(player => [player.id, player])),
      }))
      onCareerUpdate({ ...career, club: { ...career.club, budget: nextBalance } })
    } catch (simulationError) {
      console.error('Falha ao avançar até o dia da partida.', simulationError)
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
  async function markManagerUnemployed(reason: 'dismissed' | 'contract_ended' | 'resigned') {
    const nextPopularity = managerDeparturePopularity(managerPopularity, reason)
    const nextCareer = { ...career, careerStatus: 'unemployed' as const, lastDepartureReason: reason }
    setCareerStatus('unemployed')
    setManagerPopularity(nextPopularity)
    localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
    localStorage.setItem(MANAGER_STATUS_KEY, 'unemployed')
    onCareerUpdate(nextCareer)
    const { data: authUser } = await supabase.auth.getUser()
    if (authUser.user) {
      await supabase.from('manager_profiles').update({
        regional_popularity: nextPopularity.regional,
        national_popularity: nextPopularity.national,
        international_popularity: nextPopularity.international,
        current_club_id: null,
        current_season_id: null,
        updated_at: new Date().toISOString(),
      }).eq('owner_id', authUser.user.id)
    }
  }

  async function renewManagerContract() {
    if (!seasonCompletion || !boardState.renewalOffered) return
    const nextSeasonName = seasonName(Number(career.season.match(/\d{4}/)?.[0] ?? INITIAL_SEASON_YEAR) + 1)
    const years = managerContractYears(boardState.confidence)
    const nextBoard = acceptManagerRenewal(boardState, nextSeasonName, years)
    const nextCareer = {
      ...career,
      careerStatus: 'active' as const,
      contractStartSeason: nextSeasonName,
      contractEndSeason: nextBoard.contractEndSeason,
      lastDepartureReason: undefined,
    }
    await saveManagement(nextBoard, fanState)
    localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
    localStorage.setItem(MANAGER_STATUS_KEY, 'active')
    onCareerUpdate(nextCareer)
    setCareerStatus('active')
    setPendingEvent(null)
  }

  async function endManagerContract() {
    if (!boardState.renewalOffered) return
    const nextBoard = declineManagerRenewal(boardState)
    await saveManagement(nextBoard, fanState)
    await markManagerUnemployed('contract_ended')
    setPendingEvent(null)
  }

  async function rejectManagerOffer(offer: { id: string }) {
    const { data: authUser } = await supabase.auth.getUser()
    if (!authUser.user) return
    await supabase.from('manager_offers').update({
      status: 'rejected',
      responded_at: new Date().toISOString(),
    }).eq('id', offer.id).eq('owner_id', authUser.user.id).eq('status', 'pending')
    setManagerOffers(current => current.map(item => item.id === offer.id ? { ...item, status: 'rejected' } : item))
  }

  async function retireManager() {
    if (!window.confirm('Encerrar a carreira do treinador? Esta decisão mantém o histórico, mas encerra definitivamente esta carreira.')) return
    const nextCareer = { ...career, careerStatus: 'retired' as const, lastDepartureReason: 'retired' as const }
    setCareerStatus('retired')
    localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
    localStorage.setItem(MANAGER_STATUS_KEY, 'retired')
    onCareerUpdate(nextCareer)
    const { data: authUser } = await supabase.auth.getUser()
    if (authUser.user) {
      await supabase.from('manager_profiles').update({
        current_club_id: null,
        current_season_id: null,
        updated_at: new Date().toISOString(),
      }).eq('owner_id', authUser.user.id)
    }
  }

  async function respondToManagerOffer(offer: { id: string; from_club_id: string }) {
    const targetClub = clubs.find(club => club.id === offer.from_club_id)
    if (!targetClub) return
    const { data: authUser } = await supabase.auth.getUser()
    if (!authUser.user) return

    if (!seasonClosed && careerStatus === 'active' && databaseSeasonId) {
      const userStanding = table.find(team => team.id === career.club.id)
      await supabase.from('manager_season_history').upsert({
        owner_id: authUser.user.id,
        season_id: databaseSeasonId,
        club_id: career.club.id,
        club_name: career.club.name,
        season_name: career.season,
        final_position: null,
        points: Number(userStanding?.points ?? 0),
        wins: Number(userStanding?.wins ?? 0),
        draws: Number(userStanding?.draws ?? 0),
        losses: Number(userStanding?.losses ?? 0),
        league_title: false,
        cup_title: false,
        regional_popularity: managerPopularity.regional,
        national_popularity: managerPopularity.national,
        international_popularity: managerPopularity.international,
      }, { onConflict: 'owner_id,season_id,club_id' })
    }

    const { error: offerError } = await supabase.from('manager_offers').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', offer.id).eq('owner_id', authUser.user.id).eq('status', 'pending')
    if (offerError) return
    await supabase.from('manager_offers').update({ status: 'rejected', responded_at: new Date().toISOString() }).eq('owner_id', authUser.user.id).eq('status', 'pending').neq('id', offer.id)

    const { data: seasonRow } = await supabase.from('seasons').select('id').eq('name', career.season).maybeSingle()
    const departurePopularity = !seasonClosed ? managerDeparturePopularity(managerPopularity, 'resigned') : managerPopularity
    const targetConfidence = Math.max(55, Math.min(95, Math.round(Number(targetClub.reputation ?? 50) + 20)))
    const targetYears = managerContractYears(targetConfidence)
    const targetEndSeason = managerContractEndSeason(career.season, targetYears)
    const nextCareer = {
      ...career,
      club: { ...targetClub, budget: Number(targetClub.budget ?? 0) },
      careerStatus: 'active' as const,
      contractStartSeason: career.season,
      contractEndSeason: targetEndSeason,
      lastDepartureReason: !seasonClosed ? 'resigned' as const : undefined,
    }
    const nextBoard = {
      ...createBoardState(career.season, career.season, Number(targetClub.reputation ?? 50), Number(targetClub.budget ?? 0), Number(targetClub.strength ?? targetClub.reputation ?? 50)),
      managerStatus: 'renewed' as const,
      contractYears: targetYears,
      contractEndSeason: targetEndSeason,
    }
    const nextFans = createFanState(career.season, Number(targetClub.reputation ?? 50), nextBoard.expectation)
    const nextSponsor = { ...chooseSponsor(Number(targetClub.reputation ?? 50)), seasonId: career.season }
    const nextCommercial = {
      sponsor: nextSponsor,
      stadium: createStadium(targetClub.id, career.season, targetClub.stadium ?? 'Estádio Municipal', targetClub.stadium_capacity ?? 12000),
    }

    await supabase.from('manager_profiles').update({
      regional_popularity: departurePopularity.regional,
      national_popularity: departurePopularity.national,
      international_popularity: departurePopularity.international,
      current_club_id: targetClub.id,
      current_season_id: seasonRow?.id ?? null,
      updated_at: new Date().toISOString(),
    }).eq('owner_id', authUser.user.id)

    localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
    localStorage.setItem(MANAGER_STATUS_KEY, 'active')
    localStorage.setItem(BOARD_KEY + ':' + career.season, JSON.stringify(nextBoard))
    localStorage.setItem(FANS_KEY + ':' + career.season, JSON.stringify(nextFans))
    localStorage.setItem(COMMERCIAL_KEY + ':' + career.season, JSON.stringify(nextCommercial))
    onCareerUpdate(nextCareer)
    setCareerStatus('active')
    setManagerPopularity(departurePopularity)
    setBoardState(nextBoard)
    setFanState(nextFans)
    setCommercial(nextCommercial)
    const targetBudget = Number(targetClub.budget ?? 0)
    const switchImpact = calculateClubChangeFinancialImpact(targetBudget, Number(targetClub.reputation ?? 50))
    const switchDate = toDateKey(new Date().toISOString())
    const switchTransactions = [
      createTransaction(
        switchDate,
        'other',
        'Caixa disponível ao assumir o novo clube',
        targetBudget,
        undefined,
        'manager-switch:' + targetClub.id + ':' + career.season,
      ),
      createTransaction(
        switchDate,
        'other',
        'Custos de transição da troca de clube',
        -switchImpact.transitionCost,
        undefined,
        'manager-switch-cost:' + targetClub.id + ':' + career.season,
      ),
    ]
    setFinanceBalance(switchImpact.availableBudget)
    setFinanceTransactions(switchTransactions)
    localStorage.setItem(FINANCE_KEY, JSON.stringify(switchTransactions))

    setManagerOffers(current => current.map(item => item.id === offer.id ? { ...item, status: 'accepted' } : { ...item, status: item.status === 'pending' ? 'rejected' : item.status }))

    if (seasonRow?.id) {
      await Promise.all([
        persistManagementToSupabase(seasonRow.id, nextBoard, nextFans, targetClub.id),
        persistCommercialToSupabase(seasonRow.id, nextCommercial, targetClub.id),
      ])
    }

    setSeasonClosed(false)
    setSeasonCompletion(null)
    setView('overview')
    navigate('/dashboard')
    setPendingEvent(null)
  }

  async function respondToImportantEvent(action: 'accept' | 'continue') {
    if (!pendingEvent) return

    if (pendingEvent.type === 'manager_offer' && action === 'accept') {
      const matchingOffer = managerOffers.find(item => item.from_club_id === pendingEvent.fromClubId && item.status === 'pending')
      if (matchingOffer) await respondToManagerOffer(matchingOffer)
      else setPendingEvent(null)
      return
    }

    setPendingEvent(null)
  }

  if (careerStatus !== 'active') {
    return <ManagerCareerScreen
      managerName={career.name}
      popularity={managerPopularity}
      history={managerHistory}
      trophies={managerTrophies}
      records={managerRecords}
      offers={managerOffers}
      clubs={clubs}
      careerStatus={careerStatus}
      currentClubId={null}
      contractEndSeason={career.contractEndSeason}
      contractYears={boardState.contractYears ?? 1}
      back={() => navigate('/')}
      onOffer={respondToManagerOffer}
      onRejectOffer={rejectManagerOffer}
      onRetire={careerStatus === 'unemployed' ? retireManager : undefined}
    />
  }

  if (seasonClosed && seasonCompletion) {
    return <SeasonEndScreen
      completion={seasonCompletion}
      clubs={clubs}
      players={[...players, ...historyPlayers]}
      awards={seasonAwards}
      currentClubId={career.club.id}
      nextSeasonName={seasonName(Number(career.season.match(/\d{4}/)?.[0] ?? INITIAL_SEASON_YEAR) + 1)}
      onNextSeason={startNextSeason}
      managerOffers={managerOffers.filter(item => item.status === 'pending')}
      onManagerOffer={respondToManagerOffer}
      board={boardState}
      onRenewManager={renewManagerContract}
      onEndManagerContract={endManagerContract}
    />
  }
  if (view === 'board') return <BoardScreen club={career.club} board={boardState} fans={fanState} balance={financeBalance} monthlyPayroll={salaryTotal} back={() => goToView('overview')} />
  if (view === 'contracts') return <ContractsScreen players={players} club={career.club} today={clock?.currentDate ?? SEASON_START} onContractChange={(oldSalary, newSalary) => setSalaryTotal(previous => previous - oldSalary + newSalary)} back={() => goToView('overview')} />
  if (view === 'calendar') return <CompetitionCenter clubs={clubs} currentClubId={career.club.id} playedMatches={Object.values(playedMatches)} seasonName={career.season} seasonId={career.seasonId} back={() => goToView('overview')} />
  if (view === 'news') return <PressCenter club={career.club} news={worldNews} back={() => goToView('overview')} />
  if (view === 'finance') return <FinanceScreen balance={financeBalance} transactions={financeTransactions} salaryTotal={salaryTotal} initialCapital={initialCapital} financeHistory={financeHistory} nextSeasonBudget={nextSeasonBudget} reputation={Number(career.club.reputation ?? 50)} strength={Number(career.club.strength ?? 50)} managerConfidence={boardState.confidence} back={() => goToView('overview')} />
  if (view === 'stadium') return <StadiumScreen club={career.club} commercial={commercial} balance={financeBalance} fanSatisfaction={fanState.satisfaction} reputation={career.club.reputation ?? 50} onUpgrade={async (nextStadium, cost) => {
    const transaction = createTransaction(toDateKey(new Date().toISOString()), 'other', 'Melhoria do estádio', -cost, undefined, 'stadium:' + career.season + ':' + nextStadium.level)
    const nextBalance = addFinanceTransaction(transaction) ?? financeBalance
    const nextCommercial = { ...commercial, stadium: nextStadium }
    await saveCommercial(nextCommercial)
    const nextCareer = { ...career, club: { ...career.club, budget: nextBalance } }
    localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
    onCareerUpdate(nextCareer)
  }} back={() => goToView('overview')} />
  if (view === 'trophies') return <TrophyRoomScreen trophies={managerTrophies} back={() => goToView('overview')} />
  if (view === 'history') return <HistoryScreen rows={historyRows} clubs={clubs} players={[...players, ...historyPlayers]} back={() => goToView('overview')} />
  if (view === 'legacy') return <ManagerCareerScreen managerName={career.name} popularity={managerPopularity} history={managerHistory} trophies={managerTrophies} records={managerRecords} offers={managerOffers} clubs={clubs} careerStatus={careerStatus} currentClubId={career.club.id} contractEndSeason={career.contractEndSeason ?? boardState.contractEndSeason} contractYears={boardState.contractYears ?? 1} back={() => goToView('overview')} onOffer={respondToManagerOffer} onRejectOffer={rejectManagerOffer} onRetire={undefined} />
  if (view === 'stats') return <GameSection title="Estatísticas" eyebrow="Mundo" icon={<BarChart3 size={22} />} description="Desempenho do clube, jogadores e campeonato em uma visão dedicada." back={() => goToView('overview')} />
  if (view === 'settings') return <GameSection title="Configurações" eyebrow="Jogo" icon={<Settings size={22} />} description="Preferências da carreira e configurações do jogo." back={() => goToView('overview')} />

  if (view === 'press') return <PressCenter club={career.club} news={worldNews} back={() => goToView('overview')} />
  if (view === 'competitions') return <CompetitionCenter clubs={clubs} currentClubId={career.club.id} playedMatches={Object.values(playedMatches)} seasonName={career.season} seasonId={career.seasonId} back={() => goToView('overview')} />
  if (view === 'loans') return <LoanMarket club={{ ...career.club, budget: financeBalance }} clubs={clubs} balance={financeBalance} today={clock?.currentDate ?? SEASON_START} transferOverrides={transferState.playerClubOverrides} state={loanState} currentSquadSize={players.length} onLoan={(record, nextState) => { const transaction = createTransaction(record.date, record.loanClubId === career.club.id ? 'transfer_out' : 'transfer_in', `${record.loanClubId === career.club.id ? 'Empréstimo recebido' : 'Empréstimo cedido'} · ${record.playerName}`, record.loanClubId === career.club.id ? -record.fee : record.fee, undefined, `loan:${record.id}`); const finalTransactions = financeTransactions.some(item => item.eventId === transaction.eventId) ? financeTransactions : [...financeTransactions, transaction]; const finalBalance = applyTransaction(financeBalance, transaction); setLoanState(nextState); localStorage.setItem(LOANS_KEY, JSON.stringify(nextState)); saveFinance(finalBalance, finalTransactions); const nextCareer = { ...career, club: { ...career.club, budget: finalBalance } }; localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer)); onCareerUpdate(nextCareer); goToView('overview') }} back={() => goToView('overview')} />
  if (view === 'market') return <TransferMarket club={{ ...career.club, budget: financeBalance }} clubs={clubs} balance={financeBalance} today={clock?.currentDate ?? SEASON_START} state={transferState} loanState={loanState} currentSquadSize={players.length} personality={career.personality} onTransfer={(record, nextState, nextBalance) => {
    const transaction = createTransaction(record.date, record.kind === 'purchase' ? 'transfer_out' : 'transfer_in', (record.kind === 'purchase' ? 'Compra' : 'Venda') + ' · ' + record.playerName, record.kind === 'purchase' ? -record.fee : record.fee, undefined, 'transfer:' + record.id)
    const finalTransactions = financeTransactions.some(item => item.eventId === transaction.eventId) ? financeTransactions : [...financeTransactions, transaction]
    const finalBalance = applyTransaction(financeBalance, transaction)
    setTransferState(nextState)
    localStorage.setItem(TRANSFERS_KEY, JSON.stringify(nextState))
    saveFinance(finalBalance, finalTransactions)
    const nextCareer = { ...career, club: { ...career.club, budget: finalBalance } }
    localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
    onCareerUpdate(nextCareer)
    void (async () => {
      const { data: seasonRow } = await supabase.from('seasons').select('id').eq('name', career.season).maybeSingle()
      const { data: playerRow } = await supabase.from('club_players').select('id,club_id').eq('player_id', record.playerId).maybeSingle()
      if (playerRow?.id) {
        const update = await supabase.from('club_players').update({ club_id: record.toClubId }).eq('id', playerRow.id)
        if (!update.error && seasonRow?.id) {
          await supabase.from('world_transfers').upsert({
            season_id: seasonRow.id,
            transfer_date: record.date,
            player_id: record.playerId,
            from_club_id: record.fromClubId === 'free-agent' ? null : record.fromClubId,
            to_club_id: record.toClubId,
            fee: record.fee,
            reason: record.kind === 'purchase' ? 'user_purchase' : 'user_sale',
          }, { onConflict: 'season_id,player_id,transfer_date' })
        }
      }
      if (record.kind === 'sale') {
        await Promise.all([
          supabase.from('clubs').update({ budget: finalBalance }).eq('id', career.club.id),
          supabase.from('clubs').select('budget').eq('id', record.toClubId).maybeSingle().then(async ({ data }) => {
            if (!data) return
            return supabase.from('clubs').update({ budget: Math.max(0, Number(data.budget ?? 0) - record.fee) }).eq('id', record.toClubId)
          }),
        ])
      } else if (record.fromClubId && record.fromClubId !== 'free-agent') {
        const { data: seller } = await supabase.from('clubs').select('budget').eq('id', record.fromClubId).maybeSingle()
        if (seller) {
          await supabase.from('clubs').update({ budget: Number(seller.budget ?? 0) + record.fee }).eq('id', record.fromClubId)
        }
      }
    })()
    goToView('overview')
  }} back={() => goToView('overview')} />
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
            const currentLife = loadPlayerLifecycle()[event.playerId]
            const longTermRoll = eventHash(`${matchDate}:injury:${event.playerId}`) / 0xffffffff
            const severity = longTermRoll < 0.12 ? 'long_term' : longTermRoll < 0.4 ? 'moderate' : 'minor'
            const duration = injuryDurationDays(current, severity, (eventHash(`${matchDate}:injury-duration:${event.playerId}`) % 1000) / 1000)
            previous.injuredUntil = addDays(matchDate, duration)
            if (currentLife) {
              const nextLife = updatePlayerLifecycle(currentLife, {
                injuries: currentLife.injuries + 1,
                longTermInjuries: currentLife.longTermInjuries + (severity === 'long_term' ? 1 : 0),
              })
              const allLifecycle = loadPlayerLifecycle()
              allLifecycle[event.playerId] = nextLife
              savePlayerLifecycle(allLifecycle)
            }
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
      // O motor agora retorna somente jogadores que efetivamente participaram da partida; reservas não utilizados ficam fora das estatísticas.
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

          // Estatísticas de carreira atravessam temporadas e ficam no save local para
          // que aposentadorias, transferências e novos talentos não apaguem o legado.
          const careerLifecycle = loadPlayerLifecycle()
          for (const match of Object.values(matchesToPersist)) {
            for (const rating of match.playerRatings ?? []) {
              const current = careerLifecycle[rating.playerId] ?? updatePlayerLifecycle(undefined, {})
              careerLifecycle[rating.playerId] = recordCareerMatch(current, {
                minutes: rating.minutes,
                goals: rating.goals,
                assists: rating.assists,
                rating: rating.rating,
                starts: rating.started ? 1 : 0,
              })
            }
          }
          savePlayerLifecycle(careerLifecycle)
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
        if (activeMatchFixture.competition_name === 'Copa Nacional do Brasil' && [1, 2, 4, 6, 8].includes(currentRound)) {
          const cupClubIds = clubs.filter(club => Number(club.division ?? 1) <= 2).map(club => club.id)
          const generated = resolveCompletedKnockoutStage(allFixtures, currentRound, cupClubIds)
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

      localStorage.setItem(seasonStorageKey(MATCHES_KEY, career.seasonId), JSON.stringify(nextMatches))
      setPlayedMatches(nextMatches)

      // A imprensa recebe um resumo de cada rodada disputada: maior placar e defesa mais vazada.
      const pressMatches = [
        { fixture: activeMatchFixture, match: nextMatches[activeMatchFixture.id] },
        ...remainingFixtures
          .filter(item => nextMatches[item.id])
          .map(item => ({ fixture: item, match: nextMatches[item.id] })),
      ]
      if (pressMatches.length) {
        const clubById = new Map(clubs.map(club => [club.id, club]))
        const clubLabel = (id: string) => clubById.get(id)?.short_name ?? clubById.get(id)?.name ?? 'Clube'
        const mostGoals = [...pressMatches].sort((a, b) => ((b.match?.homeScore ?? 0) + (b.match?.awayScore ?? 0)) - ((a.match?.homeScore ?? 0) + (a.match?.awayScore ?? 0)))[0]
        const conceded = new Map<string, number>()
        for (const item of pressMatches) {
          if (!item.match) continue
          conceded.set(item.fixture.home_club_id, (conceded.get(item.fixture.home_club_id) ?? 0) + item.match.awayScore)
          conceded.set(item.fixture.away_club_id, (conceded.get(item.fixture.away_club_id) ?? 0) + item.match.homeScore)
        }
        const mostConceded = [...conceded.entries()].sort((a, b) => b[1] - a[1])[0]
        const date = toDateKey(activeMatchFixture.scheduled_at)
        const pressItems: WorldNews[] = []
        if (mostGoals?.match) {
          const total = mostGoals.match.homeScore + mostGoals.match.awayScore
          pressItems.push({
            id: `press-highscore:${date}:${activeMatchFixture.competition_id}:${activeMatchFixture.round}`,
            date,
            title: 'Jogo da rodada tem chuva de gols',
            message: `${clubLabel(mostGoals.fixture.home_club_id)} ${mostGoals.match.homeScore} x ${mostGoals.match.awayScore} ${clubLabel(mostGoals.fixture.away_club_id)} — ${total} gols na partida.`,
            tone: 'positive',
            category: 'match',
            priority: 96,
          })
        }
        if (mostConceded && mostConceded[1] >= 3) {
          pressItems.push({
            id: `press-defense:${date}:${activeMatchFixture.competition_id}:${activeMatchFixture.round}`,
            date,
            title: 'Defesa mais vazada da rodada',
            message: `${clubLabel(mostConceded[0])} sofreu ${mostConceded[1]} gol(s) na rodada e vira alvo das análises da imprensa.`,
            tone: 'warning',
            category: 'match',
            priority: 88,
          })
        }
        const currentManagers: AIClubManager[] = (() => {
          try { return JSON.parse(localStorage.getItem(AI_MANAGERS_KEY) ?? '[]') } catch { return [] }
        })()
        const pressuredManager = currentManagers.filter(manager => manager.confidence <= 42).sort((a, b) => a.confidence - b.confidence)[0]
        if (pressuredManager) {
          pressItems.push({
            id: `press-manager:${date}:${pressuredManager.clubId}`,
            date,
            title: 'Treinador perde força nos bastidores',
            message: `${pressuredManager.name}, do ${clubLabel(pressuredManager.clubId)}, caiu para ${pressuredManager.confidence}% de confiança e começa a enfrentar pressão.`,
            tone: 'warning',
            category: 'club',
            priority: 86,
          })
        }
        appendWorldNews(pressItems)
      }

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
        const opponentClubId = matchHome ? activeMatchFixture.away_club_id : activeMatchFixture.home_club_id
        const opponentReputation = Number(clubs.find(club => club.id === opponentClubId)?.reputation ?? 50)
        const isCup = activeMatchFixture.competition_name === 'Copa Nacional do Brasil'
        const matchFinance = calculateMatchdayFinance(
          commercial.stadium.capacity,
          Number(career.club.reputation ?? 50),
          fanState.satisfaction,
          opponentReputation,
          commercial.stadium.baseTicketPrice,
          userOutcome,
          isCup,
        )
        const transaction = createTransaction(
          toDateKey(activeMatchFixture.scheduled_at),
          'match_revenue',
          `Bilheteria · ${activeMatchFixture.home_club?.short_name ?? 'Mandante'} · ${matchFinance.attendance} torcedores · ingresso ${money(matchFinance.ticketPrice)}`,
          matchFinance.grossRevenue,
          undefined,
          `match_revenue:${activeMatchFixture.id}`,
        )
        const matchCost = createTransaction(
          toDateKey(activeMatchFixture.scheduled_at),
          'other',
          `Operação da partida · ${activeMatchFixture.home_club?.short_name ?? 'Mandante'}`,
          -matchFinance.operatingCost,
          undefined,
          `matchday-cost:${activeMatchFixture.id}`,
        )
        const redCards = result.events.filter(event => event.type === 'red_card').length
        const injuries = result.events.filter(event => event.type === 'injury').length
        const fineAmount = calculateFineAndOperationalCost(redCards, injuries, 0, calculateFinancialStatus(financeBalance, salaryTotal) === 'crítico')
        const fineTransaction = fineAmount > 0
          ? createTransaction(
              toDateKey(activeMatchFixture.scheduled_at),
              'fine',
              'Multas e custos disciplinares da partida',
              -fineAmount,
              undefined,
              `fine:${activeMatchFixture.id}`,
            )
          : null
        const matchTransactions = [transaction, matchCost, ...(fineTransaction ? [fineTransaction] : [])]
        let finalMatchBalance = financeBalance
        let finalMatchTransactions = financeTransactions
        for (const item of matchTransactions) {
          if (finalMatchTransactions.some(existing => existing.eventId === item.eventId)) continue
          finalMatchTransactions = [...finalMatchTransactions, item]
          finalMatchBalance = applyTransaction(finalMatchBalance, item)
        }
        saveFinance(finalMatchBalance, finalMatchTransactions)
        const nextCareer = { ...career, club: { ...career.club, budget: finalMatchBalance } }
        localStorage.setItem(CAREER_KEY, JSON.stringify(nextCareer))
        onCareerUpdate(nextCareer)
      }
      if (seasonId) {
        await advanceContinentalStages()
        await finalizeSeasonIfComplete(seasonId, nextMatches)
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
    onAdvanceDay={matchReady
      ? () => {
          if (nextFixture) {
            setActiveMatchFixture(JSON.parse(JSON.stringify(nextFixture)))
            goToView('match')
          }
        }
      : restOneDay}
    advanceLabel={matchReady ? 'Jogar partida' : advancingDays ? 'Avançando...' : 'Avançar dia'}
    canAdvance={!advancingDays && Boolean(matchReady || (clock?.currentDate && nextMatchDate ? clock.currentDate < nextMatchDate : false))}
  >
    <main className="min-h-screen pb-24 lg:pb-0">
      <section className="px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="label-mono text-emerald-300/60">Seu clube · seu comando</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{career.club.name}</h1><span className="text-sm font-semibold text-white/35">Temporada {career.season.match(/\d{4}/)?.[0] ?? '2026'}</span></div>
            <p className="mt-2 text-xs text-white/40">Você é o treinador. Cada decisão aqui muda a temporada.</p>
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
            <p className="label-mono text-violet-300/70">Proposta para o treinador</p><h2 className="mt-2 text-xl font-bold">{managerClub.name} quer contratar você</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{pendingEvent.message}</p><div className="mt-4 flex gap-2"><button onClick={() => respondToImportantEvent('continue')} className="rounded-lg border border-white/8 px-4 py-2.5 text-xs font-semibold text-white/55">Recusar</button><button onClick={() => respondToImportantEvent('accept')} className="rounded-lg bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#06100c]">Aceitar proposta</button></div>
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
                  <div className="mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-6">
                    <ClubMatchSide club={career.club} overall={avg} align="right" />
                    <div className="min-w-[48px] text-center">
                      <p className="font-display text-xs font-bold uppercase tracking-[0.16em] text-white/70">VS</p>
                      <p className="mt-2 whitespace-nowrap text-[10px] font-medium text-white/75">{nextMatchDate ? formatSeasonDate(nextMatchDate) : 'Sem partida'}</p>
                    </div>
                    <ClubMatchSide club={opponent} overall={opponent ? Math.round(opponentStrength) : 0} align="left" />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 border-t border-white/5 bg-[#101827] px-5 py-4 sm:px-7">
                <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-between">
                  <div><p className="label-mono text-white/50">Hoje</p><p className="mt-1 text-sm font-bold tabular-nums">{clock?.currentDate ? formatSeasonDate(clock.currentDate) : '—'}</p></div>
                  <div className="text-right"><p className="label-mono text-white/50">Partida</p><p className="mt-1 text-sm font-bold tabular-nums">{nextMatchDate ? formatSeasonDate(nextMatchDate) : '—'}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                  <button onClick={() => { if (matchReady && nextFixture) { setActiveMatchFixture(JSON.parse(JSON.stringify(nextFixture))); goToView('match') } else { void restOneDay() } }} disabled={advancingDays || (!matchReady && (!clock || !canAdvanceDay(clock, nextMatchDate)))} className={`game-button ${matchReady ? 'bg-emerald-400 text-[#06100c] shadow-[0_0_24px_rgba(52,211,153,0.18)] hover:bg-emerald-300' : 'game-button-secondary'}`} title={matchReady ? 'Jogar a partida de hoje' : 'Avançar um dia'}>{advancingDays ? 'Avançando...' : matchReady ? 'Jogar partida' : 'Avançar dia'}</button>
                  <button onClick={() => goToView('tactics')} className="game-button game-button-secondary">Escalação</button>
                  <button onClick={() => goToView('squad')} className="game-button game-button-secondary">Elenco</button>
                  <button onClick={openOpponentSquad} disabled={!opponent || opponentLoading} className="game-button game-button-secondary">{opponentLoading ? 'Carregando...' : 'Ver adversário'}</button>
                  <button disabled={boardState.managerStatus === 'dismissed' || boardState.managerStatus === 'contract_ended' || advancingDays || !nextFixture} onClick={() => { if (nextFixture) { if (matchReady) { setActiveMatchFixture(JSON.parse(JSON.stringify(nextFixture))); goToView('match') } else { advanceToNextMatch() } } }} className="game-button game-button-primary col-span-2 hidden w-full sm:order-first sm:col-auto sm:w-auto lg:inline-flex">{matchReady ? 'Jogar partida' : (advancingDays ? 'Avançando...' : 'Aguardar dia de jogo')}</button>
                </div>
              </div>
              <div className="mobile-thumb-action fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-[#101827]/95 px-4 pt-3 backdrop-blur-lg lg:hidden">
                <button disabled={boardState.managerStatus === 'dismissed' || boardState.managerStatus === 'contract_ended' || advancingDays || !nextFixture} onClick={() => { if (nextFixture) { if (matchReady) { setActiveMatchFixture(JSON.parse(JSON.stringify(nextFixture))); goToView('match') } else { advanceToNextMatch() } } }} className="game-button game-button-primary w-full py-3.5">{matchReady ? 'Jogar partida' : (advancingDays ? 'Avançando...' : 'Aguardar dia de jogo')}</button>
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
                <div className="grid grid-cols-[24px_24px_minmax(0,1fr)_34px_34px_34px_38px] bg-white/[0.025] px-2 py-2 text-[9px] font-bold uppercase tracking-wider text-white/45 sm:grid-cols-[28px_28px_minmax(0,1fr)_40px_40px_40px_44px] sm:px-3"><span>#</span><span></span><span>Clube</span><span className="text-center">P</span><span className="text-center">J</span><span className="text-center">V</span><span className="text-center">SG</span></div>
                {table.slice(0, 8).map((team, i) => {
                  const club = clubs.find(item => item.id === team.id)
                  const zone = i < 4 ? 'border-l-2 border-emerald-400/70' : i >= 12 ? 'border-l-2 border-red-400/70' : ''
                  return <div key={team.id} className={`grid grid-cols-[24px_24px_minmax(0,1fr)_34px_34px_34px_38px] items-center border-t border-white/5 px-2 py-2.5 text-[11px] ${zone} ${team.id === career.club.id ? 'bg-emerald-400/[0.06]' : ''} sm:grid-cols-[28px_28px_minmax(0,1fr)_40px_40px_40px_44px] sm:px-3 sm:text-xs`}>
                    <span className={`font-bold ${i < 4 ? 'text-emerald-300' : i >= 12 ? 'text-red-300' : 'text-white/45'}`}>{i + 1}</span>
                    <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white p-0.5 sm:h-6 sm:w-6">
                      {club?.logo_url ? <img src={club.logo_url} alt="" className="h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.add('club-logo-fallback') }} /> : <span className="font-display text-[7px] font-black text-slate-700">{(club?.short_name ?? club?.name ?? 'FC').slice(0, 3).toUpperCase()}</span>}
                    </span>
                    <span className="min-w-0 truncate font-medium"><span className="sm:hidden">{club?.short_name ?? team.name}</span><span className="hidden sm:inline">{team.name}</span></span>
                    <span className="text-center font-bold tabular-nums">{team.points}</span><span className="text-center text-white/50 tabular-nums">{team.played}</span><span className="text-center text-white/50 tabular-nums">{team.wins}</span><span className="text-center text-white/50 tabular-nums">{team.gf - team.ga}</span>
                  </div>
                })}
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
  const fallback = (club?.short_name ?? club?.name ?? 'FC').slice(0, 3).toUpperCase()
  return <div className={`flex min-w-0 items-center gap-2.5 ${align === 'right' ? 'justify-end text-right' : 'text-left'}`}>
    <div className="flex h-[2.9rem] w-[2.9rem] shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-lg sm:h-[4.2rem] sm:w-[4.2rem]">
      {club?.logo_url ? <img src={club.logo_url} alt="" className="h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.add('club-logo-fallback') }} /> : <span className="font-display text-[11px] font-black text-slate-700">{fallback}</span>}
    </div>
    <p className="font-display text-[10px] font-bold tabular-nums text-white/60 sm:text-xs">OVR {overall}</p>
  </div>
}

function GameShell({ career, activeView, onNavigate, onAdvanceDay, advanceLabel, canAdvance, children }: {
  career: ManagerProfile
  activeView: string
  onNavigate: (view: DashboardView) => void
  onAdvanceDay: () => void
  advanceLabel: string
  canAdvance: boolean
  children: ReactNode
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const groups: Array<{ label: string; items: Array<{ key: DashboardView; label: string; icon: typeof Settings }> }> = [
    { label: 'Central', items: [
      { key: 'overview', label: 'Início', icon: House },
      { key: 'calendar', label: 'Partidas', icon: CalendarDays },
      { key: 'squad', label: 'Meu Clube', icon: Shield },
      { key: 'legacy', label: 'Carreira', icon: Medal },
    ] },
    { label: 'Gestão', items: [
      { key: 'board', label: 'Diretoria', icon: Building2 },
      { key: 'contracts', label: 'Contratos', icon: Handshake },
      { key: 'tactics', label: 'Escalação e tática', icon: Shield },
      { key: 'training', label: 'Treinamento', icon: Dumbbell },
      { key: 'market', label: 'Mercado', icon: ShoppingBag },
      { key: 'loans', label: 'Empréstimos', icon: Handshake },
      { key: 'finance', label: 'Finanças', icon: WalletCards },
      { key: 'stadium', label: 'Estádio', icon: Building2 },
    ] },
    { label: 'Mundo', items: [
      { key: 'competitions', label: 'Competições', icon: Trophy },
      { key: 'news', label: 'Notícias', icon: Newspaper },
      { key: 'stats', label: 'Estatísticas', icon: BarChart3 },
      { key: 'trophies', label: 'Sala de Troféus', icon: Trophy },
      { key: 'history', label: 'Histórico', icon: Medal },
      { key: 'press', label: 'Imprensa', icon: Newspaper },
    ] },
  ] as const
  const extras = [
    { key: 'loans' as DashboardView, label: 'Empréstimos', icon: Handshake },
    { key: 'training' as DashboardView, label: 'Treinamento', icon: Dumbbell },
    { key: 'settings' as DashboardView, label: 'Configurações', icon: Settings },
  ]
  const activeLabel = groups.flatMap(group => group.items).find(item => item.key === activeView)?.label
    ?? extras.find(item => item.key === activeView)?.label
    ?? 'Futebol Manager'

  function navigateMobile(view: DashboardView) {
    setMobileMenuOpen(false)
    onNavigate(view)
  }

  return <div className="min-h-screen bg-[#0a0f1a]">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-white/5 bg-[#0d1421] lg:flex lg:flex-col">
      <div className="flex h-16 items-center border-b border-white/5 px-5">
        <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400 text-[11px] font-black text-[#06100c]">FM</div><div><p className="font-display text-sm font-bold tracking-wide">FUTEBOL MANAGER</p><p className="label-mono text-white/25">Carreira</p></div></div>
      </div>
      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {groups.map(group => <div key={group.label} className="mb-3">
          <p className="px-3 pb-1.5 label-mono text-white/30">{group.label}</p>
          <div className="space-y-0.5">{group.items.map(item => {
            const Icon = item.icon
            const active = activeView === item.key
            return <button key={item.key} onClick={() => onNavigate(item.key)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${active ? 'bg-emerald-400/10 text-emerald-300' : 'text-white/45 hover:bg-white/[0.035] hover:text-white/80'}`}><Icon size={16} strokeWidth={active ? 2.2 : 1.8} /><span>{item.label}</span></button>
          })}</div>
        </div>)}
        <div className="mb-5">
          <p className="px-3 pb-2 label-mono text-white/20">Extras</p>
          <div className="space-y-0.5">{extras.slice(0, 2).map(item => {
            const Icon = item.icon
            return <button key={item.key} onClick={() => onNavigate(item.key)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${activeView === item.key ? 'bg-emerald-400/10 text-emerald-300' : 'text-white/45 hover:bg-white/[0.035] hover:text-white/80'}`}><Icon size={16} /><span>{item.label}</span></button>
          })}</div>
        </div>
      </nav>
      <div className="border-t border-white/5 p-3">
        <div className="rounded-xl bg-white/[0.025] p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 p-1.5">{career.club.logo_url ? <img src={career.club.logo_url} alt="" className="h-full w-full object-contain" /> : <span className="font-display text-[10px] font-black text-white/55">{(career.club.short_name ?? career.club.name ?? "FM").slice(0, 3).toUpperCase()}</span>}</div>
            <div className="min-w-0"><p className="truncate text-xs font-bold">{career.name}</p><p className="mt-0.5 truncate text-[10px] text-white/30">Treinador · {career.club.short_name ?? career.club.name}</p></div>
          </div>
          <div className="mt-3 border-t border-white/5 pt-3"><div className="flex items-center justify-between"><span className="text-[10px] text-white/35">Contrato / temporada</span><span className="font-display text-xs font-bold tabular-nums text-emerald-300">{career.season.match(/\d{4}/)?.[0] ?? '2026'}</span></div><div className="mt-1 flex items-center justify-between"><span className="text-[10px] text-white/25">Nível do técnico</span><span className="text-[10px] font-bold text-white/65">Nível 1 · 0 pts</span></div></div>
        </div>
        <button onClick={() => onNavigate('settings')} className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold text-white/35 hover:bg-white/[0.035] hover:text-white/75"><Settings size={16} /><span>Configurações</span></button>
      </div>
    </aside>

    <div className="min-h-screen lg:pl-[248px]">
      <header
        className="sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-white/5 bg-[#0a0f1a]/95 px-3 pb-2 backdrop-blur sm:px-6"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
      >
        <div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/55">Você está no comando</p><p className="truncate text-sm font-semibold text-white/80">{activeLabel}</p></div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { void onAdvanceDay() }} disabled={!canAdvance} className={`hidden items-center gap-2 lg:flex game-button ${advanceLabel === 'Jogar partida' ? 'bg-emerald-400 text-[#06100c] shadow-[0_0_24px_rgba(52,211,153,0.18)] hover:bg-emerald-300' : 'game-button-primary'} disabled:cursor-not-allowed disabled:opacity-30`}><CalendarDays size={14} /> {advanceLabel}</button>
          <button onClick={() => setMobileMenuOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.02] text-white/75 lg:hidden" aria-label="Abrir menu"><span className="text-xl leading-none">☰</span></button>
        </div>
      </header>
      <div className="pb-4 lg:pb-0">{children}</div>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-[#0d1421]/95 px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
  <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
    {[
      { key: 'overview' as DashboardView, label: 'Início', icon: House },
      { key: 'calendar' as DashboardView, label: 'Partidas', icon: CalendarDays },
      { key: 'squad' as DashboardView, label: 'Meu Clube', icon: Shield },
      { key: 'legacy' as DashboardView, label: 'Carreira', icon: Medal },
    ].map(item => {
      const Icon = item.icon
      const active = activeView === item.key
      return <button key={item.key} onClick={() => onNavigate(item.key)} className={'flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ' + (active ? 'bg-emerald-400/10 text-emerald-300' : 'text-white/35')}>
        <Icon size={18} strokeWidth={active ? 2.3 : 1.7} /><span>{item.label}</span>
      </button>
    })}
  </div>
</nav>
{mobileMenuOpen && <div className="fixed inset-0 z-[60] lg:hidden">
      <button className="absolute inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu" />
      <aside className="absolute right-0 top-0 h-[100dvh] w-[min(86vw,340px)] overflow-y-auto border-l border-white/8 bg-[#0d1421] px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] shadow-2xl">
        <div className="mb-5 flex items-center justify-between border-b border-white/5 pb-4">
          <div><p className="font-display text-sm font-bold">FUTEBOL MANAGER</p><p className="label-mono mt-1 text-white/25">{career.club.short_name ?? career.club.name}</p></div>
          <button onClick={() => setMobileMenuOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/8 text-white/60" aria-label="Fechar menu">×</button>
        </div>
        {groups.map(group => <div key={group.label} className="mb-5">
          <p className="px-2 pb-2 label-mono text-white/30">{group.label}</p>
          <div className="space-y-1">{group.items.map(item => {
            const Icon = item.icon
            const active = activeView === item.key
            return <button key={item.key} onClick={() => navigateMobile(item.key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${active ? 'bg-emerald-400/10 text-emerald-300' : 'text-white/55'}`}><Icon size={18} /><span>{item.label}</span></button>
          })}</div>
        </div>)}
        <div className="mb-5">
          <p className="px-2 pb-2 label-mono text-white/30">Extras</p>
          <div className="space-y-1">{extras.map(item => {
            const Icon = item.icon
            const active = activeView === item.key
            return <button key={item.key} onClick={() => navigateMobile(item.key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${active ? 'bg-emerald-400/10 text-emerald-300' : 'text-white/55'}`}><Icon size={18} /><span>{item.label}</span></button>
          })}</div>
        </div>
      </aside>
    </div>}

  </div>
}

function FinanceScreen({ balance, transactions, salaryTotal, initialCapital, financeHistory, nextSeasonBudget, reputation, strength, managerConfidence, back }: {
  balance: number; transactions: FinanceTransaction[]; salaryTotal: number; initialCapital: number;
  financeHistory: SeasonFinancialHistory[]; nextSeasonBudget: number; reputation: number; strength: number; managerConfidence: number; back: () => void
}) {
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)
  const income = transactions.filter(item => item.amount > 0).reduce((sum, item) => sum + item.amount, 0)
  const expense = transactions.filter(item => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0)
  const financialStatus = calculateFinancialStatus(balance, salaryTotal)
  const statusLabel = financialStatus === 'saudável' ? 'Saudável' : financialStatus === 'atenção' ? 'Atenção' : 'Crítico'
  const statusClass = financialStatus === 'saudável' ? 'text-emerald-300' : financialStatus === 'atenção' ? 'text-amber-200' : 'text-red-300'
  return <main className="min-h-screen bg-[#0a0f1a] px-4 py-5 sm:px-6 lg:px-8">
    <button onClick={back} className="mb-6 flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white"><ArrowLeft size={15} /> Voltar</button>
    <div className="mb-6"><p className="label-mono text-white/30">Clube · Temporada</p><h1 className="mt-1 font-display text-3xl font-bold">Finanças</h1><p className="mt-2 text-sm text-white/40">O caixa reage a desempenho, público, estádio, folha, comissão técnica, multas e mercado.</p></div>
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
      <DashboardCard icon={<WalletCards size={18} />} label="Caixa" value={money(balance)} detail="disponível agora" />
      <DashboardCard icon={<Banknote size={18} />} label="Próximo ano" value={money(nextSeasonBudget)} detail="orçamento projetado" />
      <DashboardCard icon={<Users size={18} />} label="Folha mensal" value={money(salaryTotal)} detail="jogadores" />
      <DashboardCard icon={<Handshake size={18} />} label="Comissão" value={money(calculateTechnicalStaffPayroll(salaryTotal, reputation, strength, managerConfidence))} detail="estimativa mensal" />
      <DashboardCard icon={<BarChart3 size={18} />} label="Movimentado" value={money(income + expense)} detail={"entradas " + money(income) + " · saídas " + money(expense)} />
      <DashboardCard icon={<Shield size={18} />} label="Situação" value={statusLabel} detail="saúde financeira" />
    </div>
    <section className="game-panel mt-5"><div className="flex items-center justify-between"><div><p className="label-mono text-white/30">Saúde financeira</p><h2 className={`mt-1 font-display text-xl font-bold ${statusClass}`}>{statusLabel}</h2></div><span className="text-xs text-white/25">Reputação {Math.round(reputation)}</span></div><p className="mt-3 max-w-2xl text-sm leading-6 text-white/40">{financialStatus === 'crítico' ? 'O caixa está em zona crítica. A diretoria deve conter gastos e o mercado ficará mais restritivo.' : financialStatus === 'atenção' ? 'O clube ainda opera normalmente, mas novas despesas precisam caber no fluxo de caixa.' : 'O clube tem margem para investir, renovar contratos e absorver oscilações de receita.'}</p></section>
    <section className="game-panel mt-5"><div className="flex items-center justify-between"><div><p className="label-mono text-white/30">Livro-caixa</p><h2 className="mt-1 font-display text-xl font-bold">Movimentações recentes</h2></div><span className="text-xs text-white/25">{transactions.length} registros</span></div><div className="mt-4 space-y-1.5">{recent.length ? recent.map(item => <div key={item.eventId ?? item.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.description}</p><p className="mt-1 text-[10px] text-white/25">{formatSeasonDate(item.date)}</p></div><span className={item.amount >= 0 ? 'shrink-0 font-mono text-xs font-bold text-emerald-300' : 'shrink-0 font-mono text-xs font-bold text-red-300'}>{item.amount >= 0 ? '+' : ''}{money(item.amount)}</span></div>) : <p className="py-8 text-center text-sm text-white/30">Nenhuma movimentação registrada.</p>}</div></section>
    <section className="game-panel mt-5"><div><p className="label-mono text-white/30">Histórico financeiro</p><h2 className="mt-1 font-display text-xl font-bold">Temporadas</h2></div><div className="mt-4 space-y-2">{financeHistory.length ? [...financeHistory].sort((a,b) => b.seasonName.localeCompare(a.seasonName)).map(item => <div key={item.seasonId} className="grid gap-3 rounded-xl border border-white/5 bg-black/10 px-4 py-4 md:grid-cols-6 md:items-center"><div><p className="text-sm font-bold">{item.seasonName}</p><p className="text-[10px] text-white/25">{item.financialStatus}</p></div><Info label="Receitas" value={money(item.revenue)} /><Info label="Despesas" value={money(item.expenses)} /><Info label="Bilheteria" value={money(item.matchRevenue)} /><Info label="Premiações" value={money(item.prizeRevenue)} /><Info label="Fechamento" value={money(item.closingBalance)} /></div>) : <p className="py-8 text-center text-sm text-white/30">O histórico será fechado ao final da primeira temporada.</p>}</div></section>
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
  const recommendedTicketPrice = calculateDynamicTicketPrice(stadium.baseTicketPrice, reputation, fanSatisfaction)
  return <main className="min-h-screen bg-[#0a0f1a] px-4 py-5 sm:px-6 lg:px-8">
    <button onClick={back} className="mb-6 flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white"><ArrowLeft size={15} /> Voltar</button>
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="label-mono text-white/30">Clube · Infraestrutura</p><h1 className="mt-1 font-display text-3xl font-bold">Estádio</h1><p className="mt-2 text-sm text-white/40">{stadium.name} · casa de {club.short_name ?? club.name}</p></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/8 px-3 py-1.5 text-xs font-bold text-emerald-300">Nível {stadium.level}/6</span></div>
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <section className="game-panel overflow-hidden p-0"><div className="relative min-h-[260px] overflow-hidden bg-[radial-gradient(circle_at_50%_20%,rgba(0,196,140,.18),transparent_42%),linear-gradient(180deg,#182638,#0d1623)] p-6"><div className="absolute inset-x-8 bottom-8 h-28 rounded-[50%] border border-emerald-300/15 bg-emerald-400/[0.03]" /><div className="absolute inset-x-14 bottom-12 h-16 rounded-[50%] border border-white/8" /><div className="absolute bottom-16 left-1/2 h-16 w-40 -translate-x-1/2 rounded-[50%] border border-white/10" /><div className="relative flex h-full min-h-[210px] items-start justify-between"><div><p className="label-mono text-white/25">Sua casa</p><p className="mt-2 font-display text-2xl font-bold">{stadium.name}</p><p className="mt-1 text-xs text-white/35">{stadium.capacity.toLocaleString('pt-BR')} lugares</p></div><Building2 size={30} className="text-emerald-300/50" /></div></div><div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5 bg-black/10">
        <Info label="Capacidade" value={stadium.capacity.toLocaleString('pt-BR')} /><Info label="Ingresso base" value={money(stadium.baseTicketPrice)} /><Info label="Manutenção" value={money(stadium.maintenance) + '/mês'} /></div></section>
      <section className="game-panel"><p className="label-mono text-white/30">Investimento</p><h2 className="mt-1 font-display text-2xl font-bold">Melhorar estádio</h2><p className="mt-3 text-sm leading-6 text-white/40">Cada nível aumenta a capacidade e melhora o potencial de receita da sua casa. O investimento sai diretamente do caixa do clube.</p>
        <div className="mt-5 rounded-xl border border-white/5 bg-black/10 p-4"><div className="flex items-center justify-between"><span className="text-xs text-white/35">Próximo nível</span><span className="font-display text-lg font-bold">{maxed ? 'MAX' : 'Nível ' + nextLevel}</span></div><div className="mt-3 flex items-center justify-between"><span className="text-xs text-white/35">Custo</span><span className="font-mono text-sm font-bold text-amber-200">{maxed ? '—' : money(cost)}</span></div><div className="mt-3 flex items-center justify-between"><span className="text-xs text-white/35">Caixa disponível</span><span className="font-mono text-sm font-bold">{money(balance)}</span></div></div>
        <button disabled={!canUpgrade} onClick={() => onUpgrade(upgradeStadium(stadium), cost)} className="mt-5 w-full rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-[#06100c] disabled:cursor-not-allowed disabled:opacity-30">{maxed ? 'Estádio no nível máximo' : canUpgrade ? 'Investir ' + money(cost) : 'Caixa insuficiente'}</button>
      </section>
    </div>
    <section className="mt-4 grid gap-4 md:grid-cols-3"><DashboardCard icon={<Users size={18} />} label="Público estimado" value={estimatedAttendance.toLocaleString('pt-BR')} detail="próximo jogo em casa" /><DashboardCard icon={<Banknote size={18} />} label="Ingresso projetado" value={money(recommendedTicketPrice)} detail="varia com demanda e reputação" /><DashboardCard icon={<Medal size={18} />} label="Satisfação" value={String(fanSatisfaction)} detail="impacta a presença da torcida" /><DashboardCard icon={<Banknote size={18} />} label="Patrocínio" value={commercial.sponsor.name} detail={'+' + money(commercial.sponsor.monthly) + ' / mês'} /></section>
  </main>
}

function OpponentSquad({ players, club, today, back }: { players: Player[]; club: { id?: string; name: string; short_name: string; city?: string; stadium?: string; logo_url?: string } | null; today: string; back: () => void }) {
  const coach = club?.id ? getAiCoachProfile(club.id) : null
  const lineup = club && players.length && coach ? selectStartingLineup(players, coach.formation, coach.style, coach.personality, [], {}, 1) : []
  return <main className="min-h-screen bg-[#0a0f1a] px-4 py-5 sm:px-6 lg:px-8">
    <button onClick={back} className="mb-6 flex items-center gap-2 text-xs font-semibold text-white/40 hover:text-white"><ArrowLeft size={15} /> Voltar</button>
    <div className="mb-6 flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2">{club?.logo_url ? <img src={club.logo_url} alt="" className="h-full w-full object-contain" /> : <span className="font-display text-sm font-black text-slate-500">{(club?.short_name ?? club?.name ?? "FC").slice(0, 3).toUpperCase()}</span>}</div><div><p className="label-mono text-white/30">Próximo adversário</p><h1 className="mt-1 font-display text-3xl font-bold">{club?.name ?? 'Adversário'}</h1><p className="mt-1 text-sm text-white/35">{club?.city ?? '—'} · {club?.stadium ?? 'Estádio não informado'} · {formatSeasonDate(today)}</p></div></div>
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-4">
        <div className="game-panel">
          <div className="flex items-center justify-between gap-3">
            <div><p className="label-mono text-white/30">Escalação provável</p><h2 className="mt-1 font-display text-xl font-bold">{coach?.formation ?? '—'} · {coach?.tactic === 'offensive' ? 'Ofensivo' : coach?.tactic === 'defensive' ? 'Defensivo' : 'Equilibrado'}</h2></div>
            <span className="text-xs font-bold text-white/30">{players.length} jogadores</span>
          </div>
          {lineup.length ? <div className="mt-4 space-y-2">{lineup.map(item => <div key={item.player.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-3 py-2.5"><div><p className="text-xs font-bold">{item.player.first_name} {item.player.last_name}</p><p className="mt-0.5 text-[9px] uppercase tracking-wider text-white/25">{item.role} · OVR {playerOverall(item.player)}</p></div><span className="font-mono text-[9px] text-white/25">#{item.player.squad_number ?? '—'}</span></div>)}</div> : <p className="mt-4 text-sm text-white/35">Não foi possível montar a escalação provável.</p>}
        </div>
        <div className="game-panel">
          <p className="label-mono text-white/30">Elenco</p>
          <h2 className="mt-1 font-display text-xl font-bold">Jogadores disponíveis</h2>
          {players.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{players.map(player => <div key={player.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-bold">{player.first_name} {player.last_name}</p><p className="mt-0.5 text-[9px] uppercase tracking-wider text-white/25">{player.position} · OVR {playerOverall(player)} · {player.age} anos</p></div><span className="ml-3 shrink-0 font-mono text-[9px] text-white/25">#{player.squad_number ?? '—'}</span></div>)}</div> : <p className="mt-4 text-sm text-white/35">O elenco deste clube não foi encontrado.</p>}
        </div>
      </section>
      <section className="game-panel"><div className="relative mx-auto aspect-[4/5] max-w-[430px] overflow-hidden rounded-2xl border border-white/10 bg-[#123b2d]"><div className="absolute inset-3 rounded-xl border border-white/30" />{lineup.map((item,index) => <div key={item.player.id} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{left: playerFieldPositionForRole(item.role,index) + '%', top: playerFieldY(item.role,index) + '%'}}><span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-[9px] font-black text-[#1a0b00]">{item.player.first_name[0]}{item.player.last_name[0]}</span><span className="mt-1 block max-w-16 truncate bg-black/50 px-1 text-[8px] font-bold">{item.player.last_name}</span></div>)}</div></section></div>
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
          <span className="text-xs font-bold text-emerald-300">{playerPositionLabel(player.position)}</span>
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
  return <main className="min-h-screen"><Top label="RELATÓRIO DE TREINAMENTO" /><section className="px-6 py-8 md:px-10"><div><p className="text-sm text-white/35">Sessão concluída</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.035em]">O que mudou no elenco?</h1></div><div className="mt-8 grid gap-3 md:grid-cols-3"><Info label="Fadiga antes" value={`${report.beforeFatigue}%`} /><Info label="Fadiga depois" value={`${report.afterFatigue}%`} /><Info label="Jogadores que evoluíram" value={`${report.improved.length}`} /></div><section className="mt-8 rounded-2xl border border-white/6 bg-white/[0.02] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Evolução</p><p className="mt-2 text-sm text-white/40">Atributos que subiram nesta sessão.</p></div><span className="text-xs font-bold text-emerald-300">+{report.improved.reduce((sum, item) => sum + item.changes.length, 0)} pontos</span></div><div className="mt-5 space-y-2">{report.improved.length ? report.improved.map(item => <div key={item.player.id} className="flex flex-col gap-2 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.03] px-4 py-3 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-semibold">{item.player.first_name} {item.player.last_name}</p><p className="text-xs text-white/30">{playerPositionLabel(item.player.position)} · GER {playerOverall(item.player)}</p></div><div className="flex flex-wrap gap-2">{item.changes.map(change => <span key={change.attribute} className="rounded-lg bg-emerald-400/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300">{change.attribute} {change.before} → {change.after}</span>)}</div></div>) : <p className="py-6 text-sm text-white/35">Nenhum atributo subiu nesta sessão. Isso também faz parte do desenvolvimento: cada jogador evolui em um ritmo diferente.</p>}</div></section><section className="mt-5 rounded-2xl border border-white/6 bg-white/[0.02] p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Mantiveram os atributos</p><p className="mt-2 text-sm text-white/40">{report.unchanged.length} jogadores não tiveram aumento de atributo nesta sessão.</p><div className="mt-4 flex flex-wrap gap-2">{report.unchanged.map(player => <span key={player.id} className="rounded-lg border border-white/6 px-3 py-2 text-xs text-white/45">{player.first_name} {player.last_name}</span>)}</div></section><button onClick={close} className="mt-6 flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06100c]">Voltar ao clube <ArrowRight size={16} /></button></section></main>
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
      <div className="mt-4 space-y-2">{players.slice(0, 11).map((player, index) => <div key={player.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3"><div className="flex items-center gap-3"><span className="w-6 text-xs font-bold text-emerald-300">{index + 1}</span><div><p className="text-sm font-semibold">{player.first_name} {player.last_name}</p><p className="text-xs text-white/30">{playerPositionLabel(player.position)} · {player.age} anos</p></div></div><span className="text-sm font-bold text-white/60">{playerOverall(player)}</span></div>)}</div>
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
          <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Notas dos jogadores</p><div className="mt-5 grid gap-6 md:grid-cols-2">{([['home', matchTeams.home], ['away', matchTeams.away]] as const).map(([team, teamName]) => <div key={team}><p className="mb-3 text-sm font-bold">{teamName}</p><div className="space-y-2">{result.playerRatings.filter(p => p.team === team).sort((a,b) => b.rating-a.rating).map(player => <div key={player.playerId} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/10 px-4 py-3"><div><p className="text-sm font-semibold">{player.name}</p><p className="text-xs text-white/30">{playerPositionLabel(player.position)}{player.goals ? ' · ' + player.goals + 'G' : ''}{player.assists ? ' · ' + player.assists + 'A' : ''}</p></div><span className="text-sm font-bold text-emerald-300">{player.rating.toFixed(1)}</span></div>)}</div></div>)}</div></div>
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