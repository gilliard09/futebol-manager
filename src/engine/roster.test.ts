import { describe, expect, it } from 'vitest'
import type { Player } from '../types/game'
import { canAddPlayer, canReleasePlayer, getLowMoralePlayers, getSquadAlerts, MAX_SQUAD_SIZE, MIN_SQUAD_SIZE } from './roster'

const player=(id:string,morale:number):Player=>({id,first_name:'Jogador',last_name:id,age:24,nationality:'Brasil',position:'CM',pace:70,shooting:65,passing:70,dribbling:65,defending:55,physical:65,goalkeeping:10,mental:65,potential:75,form:60,morale,squad_number:1})

describe('roster',()=>{
 it('respeita limite maximo e minimo do elenco',()=>{ expect(canAddPlayer(MAX_SQUAD_SIZE)).toBe(false); expect(canAddPlayer(MAX_SQUAD_SIZE-1)).toBe(true); expect(canReleasePlayer(MIN_SQUAD_SIZE)).toBe(false); expect(canReleasePlayer(MIN_SQUAD_SIZE+1)).toBe(true) })
 it('identifica jogadores com moral baixa',()=>{ expect(getLowMoralePlayers([player('a',39),player('b',40),player('c',70)]).map(p=>p.id)).toEqual(['a','b']) })
 it('gera alertas de elenco e contratos',()=>{ const alerts=getSquadAlerts([player('a',30)],3,1000,2000); expect(alerts.some(a=>a.kind==='short')).toBe(true); expect(alerts.some(a=>a.kind==='morale')).toBe(true); expect(alerts.some(a=>a.kind==='contracts')).toBe(true); expect(alerts.some(a=>a.kind==='budget')).toBe(true) })
})