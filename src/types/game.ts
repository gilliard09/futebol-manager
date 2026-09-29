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

export type ManagerProfile = {
  name: string
  nationality: string
  club: Club
  season: string
}

export type Screen = 'home' | 'manager' | 'club' | 'dashboard'
