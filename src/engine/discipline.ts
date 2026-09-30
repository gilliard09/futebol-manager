export type SuspensionReason = 'yellow_accumulation' | 'second_yellow' | 'direct_red'

export function addCalendarDays(date: string, days: number) {
  const value = new Date(date + 'T00:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/**
 * injuredUntil/suspendedUntil representam a primeira data em que o atleta
 * volta a estar disponível. Assim, se a data for igual à partida, ele joga.
 */
export function isPlayerAvailable(player: { injuredUntil?: string | null; suspendedUntil?: string | null }, matchDate: string) {
  return (!player.injuredUntil || player.injuredUntil <= matchDate)
    && (!player.suspendedUntil || player.suspendedUntil <= matchDate)
}

export function calculateInjuryReturnDate(matchDate: string, days = 14) {
  return addCalendarDays(matchDate, days)
}

export function calculateSuspensionReturnDate(
  matchDate: string,
  upcomingFixtureDates: string[],
  matches = 1,
) {
  const futureDates = upcomingFixtureDates
    .filter(date => date > matchDate)
    .sort()
  const lastSuspendedMatch = futureDates[Math.min(matches - 1, futureDates.length - 1)]
  return lastSuspendedMatch ? addCalendarDays(lastSuspendedMatch, 1) : addCalendarDays(matchDate, 7)
}

export function shouldSuspendForYellowAccumulation(previousYellowCards: number, nextYellowCards: number) {
  return Math.floor(Math.max(0, nextYellowCards) / 5) > Math.floor(Math.max(0, previousYellowCards) / 5)
}

export function suspensionMatchesForRed(eventText: string) {
  return eventText.includes('Segundo amarelo') ? 1 : 2
}
