import { describe, expect, it } from 'vitest'
import { buildStandings, createKnockoutRound, getCompetitionStageLabel, getKnockoutWinner } from './competitions'
import type { Fixture } from '../types/game'

const fixture=(id:string,home:string,away:string,hs:number,as:number):Fixture=>({id,competition_id:'c',round:1,scheduled_at:'2026-01-01',status:'completed',home_club_id:home,away_club_id:away,home_score:hs,away_score:as,home_club:null,away_club:null})

describe('competitions',()=>{
 it('calcula classificação por pontos, saldo e gols',()=>{const rows=buildStandings([{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}],[fixture('1','a','b',2,0),fixture('2','c','a',1,1),fixture('3','b','c',3,1)]); expect(rows.map(r=>[r.id,r.points,r.gf-r.ga])).toEqual([['a',4,2],['b',3,0],['c',1,-2]])})
 it('cria confrontos de mata-mata',()=>{expect(createKnockoutRound(['a','b','c','d'],1)).toEqual([{round:1,homeClubId:'a',awayClubId:'b'},{round:1,homeClubId:'c',awayClubId:'d'}])})
 it('define vencedor quando nao ha empate',()=>{expect(getKnockoutWinner(2,1,'a','b')).toBe('a');expect(getKnockoutWinner(1,2,'a','b')).toBe('b');expect(getKnockoutWinner(1,1,'a','b')).toBeNull()})
 it('nomeia fases',()=>{expect(getCompetitionStageLabel(1,1,true)).toBe('Final');expect(getCompetitionStageLabel(1,2,true)).toBe('Semifinal');expect(getCompetitionStageLabel(1,4,false)).toBe('Rodada 1')})
})
