export type SeasonClock = {
  currentDate: string
  seasonStart: string
}

export function toDateKey(value: string | Date) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  return date.toISOString().slice(0, 10)
}

export function addDays(dateKey: string, amount: number) {
  const date = new Date(dateKey + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() + amount)
  return toDateKey(date)
}

export function daysBetween(from: string, to: string) {
  const start = new Date(from + 'T12:00:00Z').getTime()
  const end = new Date(to + 'T12:00:00Z').getTime()
  return Math.round((end - start) / 86400000)
}

export function formatSeasonDate(dateKey: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dateKey + 'T12:00:00Z'))
}

export function createSeasonClock(seasonStart: string, firstFixtureDate: string, preparationDays = 3): SeasonClock {
  const firstDate = toDateKey(firstFixtureDate)
  const start = toDateKey(seasonStart)
  const preparationDate = addDays(firstDate, -preparationDays)
  return {
    seasonStart: start,
    currentDate: preparationDate < start ? start : preparationDate,
  }
}

export function canAdvanceDay(clock: SeasonClock, nextFixtureDate: string | null) {
  if (!nextFixtureDate) return true
  return clock.currentDate < toDateKey(nextFixtureDate)
}

export function advanceSeasonDay(clock: SeasonClock) {
  return {
    ...clock,
    currentDate: addDays(clock.currentDate, 1),
  }
}
