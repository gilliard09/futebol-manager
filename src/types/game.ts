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

export type ManagerProfile = {
  name: string
  nationality: string
  club: Club
  season: string
}

export type Screen = 'home' | 'manager' | 'club' | 'dashboard'
