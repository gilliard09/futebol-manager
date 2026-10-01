export const PLAYER_POSITION_LABELS: Record<string, string> = {
  GK: 'GL',
  CB: 'ZG',
  RB: 'LD',
  LB: 'LE',
  RWB: 'ADD',
  LWB: 'ADE',
  CDM: 'VOL',
  DM: 'VOL',
  CM: 'MC',
  CAM: 'MEI',
  AM: 'MEI',
  RM: 'MD',
  LM: 'ME',
  RW: 'PD',
  LW: 'PE',
  CF: 'SA',
  ST: 'ATA',
}

export function playerPositionLabel(position: string) {
  return PLAYER_POSITION_LABELS[position] ?? position
}
