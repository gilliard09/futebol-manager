import { describe, expect, it } from 'vitest'
import {
  buildContinentalGroupQualification,
  pairLibertadoresRoundOf16,
  pairSudamericanaPlayoffs,
  resolveContinentalTwoLegTie,
} from './continentalCompetition'

const f=(home:string,away:string,hs:number,as:number,round:number):any=>({
 id:`${home}-${away}-${round}`,home_club_id:home,away_club_id:away,home_score:hs,away_score:as,status:'completed',round
})

describe('continental competition engine',()=>{
 it('classifies Libertadores group top two and third',()=>{
  const teams=['a','b','c','d'].map(id=>({id,name:id}))
  const fixtures=[
   f('a','b',2,0,1),f('b','c',1,1,2),f('c','a',0,1,3),
   f('d','a',0,0,4),f('b','d',2,0,5),f('c','d',2,1,6),
  ]
  const result=buildContinentalGroupQualification([{code:'A',teams}],fixtures)
  expect(result.winners).toEqual(['b'])
  expect(result.runnersUp).toEqual(['a'])
  expect(result.thirds).toEqual(['c'])
 })
 it('pairs Libertadores winners against runners-up',()=>{
  expect(pairLibertadoresRoundOf16(['w1','w2'],['r1','r2'])).toEqual([
   {homeClubId:'r1',awayClubId:'w1'},{homeClubId:'r2',awayClubId:'w2'}
  ])
 })
 it('pairs eight Sudamericana playoff ties',()=>{
  const result=pairSudamericanaPlayoffs(['l1','l2','l3','l4'],['s1','s2','s3','s4'])
  expect(result).toHaveLength(4)
  expect(new Set(result.flatMap(x=>[x.homeClubId,x.awayClubId])).size).toBe(8)
 })
 it('uses penalties when aggregate is tied',()=>{
  expect(resolveContinentalTwoLegTie(f('a','b',1,0,1),f('b','a',1,0,2),'a')).toBe('a')
 })
})
