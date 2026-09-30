import { describe, expect, it } from 'vitest'
import { buildScoutingReport, calculatePlayerMarketValue, evaluateSquadNeeds } from './worldSimulation'
import { canUpgradeStadium, chooseSponsor, createStadium, estimateStadiumAttendance, stadiumUpgradeCost, upgradeStadium } from './commercial'

const player = { id:'p1', first_name:'A', last_name:'B', age:19, nationality:'BR', position:'ST', pace:80, shooting:82, passing:70, dribbling:78, defending:30, physical:72, goalkeeping:10, mental:75, potential:92, form:80, morale:75, squad_number:9, marketValue:500000 } as any

describe('market, scouting and commercial systems', () => {
 it('finds squad needs',()=>expect(evaluateSquadNeeds([player]).some(x=>x.position==='GK')).toBe(true))
 it('values young high-potential players',()=>expect(calculatePlayerMarketValue(player,3)).toBeGreaterThan(player.marketValue))
 it('builds scouting reports with reliability',()=>expect(buildScoutingReport(player,'detailed').potentialEstimate).toBeGreaterThan(0))
 it('selects sponsors by reputation',()=>expect(chooseSponsor(80).sponsorId).toBe('premium'))
 it('upgrades stadium capacity and costs money',()=>{const s=createStadium('c','s');expect(canUpgradeStadium(s,stadiumUpgradeCost(2))).toBe(true);expect(upgradeStadium(s).capacity).toBeGreaterThan(s.capacity)})
 it('keeps attendance inside capacity',()=>{const s=createStadium('c','s');expect(estimateStadiumAttendance(s,90,80)).toBeLessThanOrEqual(s.capacity)})
})
