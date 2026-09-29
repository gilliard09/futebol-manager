import { describe, expect, it } from 'vitest'
import { buildStandings, createKnockoutRound, getCompetitionStageLabel, getKnockoutWinner, resolveSingleMatch, resolveTwoLegTie, BRAZIL_CUP_RULES, BRAZIL_LEAGUE_RULES } from './competitions'
import type { Fixture } from '../types/game'

const fixture=(id:string,home:string,away:string,hs:number,as:number):Fixture=>({id,competition_id:'c',round:1,scheduled_at:'2026-01-01',status:'completed',home_club_id:home,away_club_id:away,home_score:hs,away_score:as,home_club:null,away_club:null})

describe('competitions',()=>{
 it('mantem as regras adaptadas do Brasileirao',()=>{ expect(BRAZIL_LEAGUE_RULES.name).toBe('Liga Nacional do Brasil'); expect(BRAZIL_LEAGUE_RULES.teams).toBe(16); expect(BRAZIL_LEAGUE_RULES.doubleRoundRobin).toBe(true); expect(BRAZIL_LEAGUE_RULES.pointsForWin).toBe(3); expect(BRAZIL_LEAGUE_RULES.relegationSlots).toBe(4) })
 it('mantem as fases da Copa com ida e volta e final unica',()=>{ expect(BRAZIL_CUP_RULES.name).toBe('Copa Nacional do Brasil'); expect(BRAZIL_CUP_RULES.stages?.map(stage=>[stage.label,stage.legs])).toEqual([['Oitavas de final',2],['Quartas de final',2],['Semifinal',2],['Final',1]]) })
 it('calcula classificação por pontos, vitorias, saldo e gols',()=>{ const rows=buildStandings([{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}],[fixture('1','a','b',2,0),fixture('2','c','a',1,1),fixture('3','b','c',3,1)]); expect(rows.map(r=>[r.id,r.points,r.gf-r.ga])).toEqual([['a',4,2],['b',3,0],['c',1,-2]]) })
 it('cria confrontos de mata-mata',()=>{ expect(createKnockoutRound(['a','b','c','d'],1)).toEqual([{round:1,homeClubId:'a',awayClubId:'b'},{round:1,homeClubId:'c',awayClubId:'d'}]) })
 it('resolve vencedor de ida e volta pelo agregado ou penaltis',()=>{ const first=fixture('1','a','b',1,0); const second=fixture('2','b','a',2,2); expect(resolveTwoLegTie(first,second)).toBe('a'); const tied=fixture('2','b','a',1,0); expect(resolveTwoLegTie(first,tied)).toBeNull(); expect(resolveTwoLegTie(first,tied,'a')).toBe('a') })
 it('resolve jogo unico por placar ou penaltis',()=>{ expect(resolveSingleMatch(1,0,'a','b')).toBe('a'); expect(resolveSingleMatch(1,1,'a','b')).toBeNull(); expect(resolveSingleMatch(1,1,'a','b','b')).toBe('b') })
 it('nomeia fases',()=>{ expect(getCompetitionStageLabel(1,7,true)).toBe('Oitavas de final'); expect(getCompetitionStageLabel(3,7,true)).toBe('Quartas de final'); expect(getCompetitionStageLabel(5,7,true)).toBe('Semifinal'); expect(getCompetitionStageLabel(7,7,true)).toBe('Final'); expect(getCompetitionStageLabel(1,4,false)).toBe('Rodada 1') })
 it('define vencedor quando nao ha empate',()=>{ expect(getKnockoutWinner(2,1,'a','b')).toBe('a'); expect(getKnockoutWinner(1,2,'a','b')).toBe('b'); expect(getKnockoutWinner(1,1,'a','b')).toBeNull() })
})