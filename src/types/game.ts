export type Club = {
  id: string
  name: string
  short_name: string
  city: string
  country: string
  division: number
  budget: number
  reputation: number
}

export type Player = {
  id: string
  first_name: string
  last_name: string
  age: number
  nationality: string
  position: string
  pace: number
  shooting: number
  passing: number
  dribbling: number
  defending: number
  physical: number
  goalkeeping: number
  mental: number
  potential: number
  form: number
  morale: number
  squad_number: number
}

export type Fixture = {
  id: string
  round: number
  scheduled_at: string
  status: string
  home_club_id: string
  away_club_id: string
  home_score: number | null
  away_score: number | null
  home_club: { name: string; short_name: string } | null
  away_club: { name: string; short_name: string } | null
}

export type Formation = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2'

export const FORMATIONS: Record<Formation, string[]> = {
  '4-3-3': ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'DM', 'CM', 'LW', 'ST', 'RW'],
  '4-4-2': ['GK', 'LB', 'CB', 'CB', 'RB', 'LW', 'CM', 'CM', 'RW', 'ST', 'ST'],
  '4-2-3-1': ['GK', 'LB', 'CB', 'CB', 'RB', 'DM', 'DM', 'LW', 'AM', 'RW', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'LW', 'DM', 'CM', 'CM', 'RW', 'ST', 'ST'],
}

export type LineupPlayer = {
  player: Player
  role: string
  slot: number
}

export type PlayedMatch = import('../engine/match').MatchResult & {
  home_club_id: string
  away_club_id: string
}

export type ManagerProfile = {
  name: string
  nationality: string
  club: Club
  season: string
}

export type Screen = 'home' | 'manager' | 'club' | 'dashboard'
