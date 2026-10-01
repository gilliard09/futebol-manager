import type { StandingRow } from './competitions'
import type { Club } from '../types/game'

export type ContinentalQualification={clubId:string;competition:'libertadores'|'sudamericana';targetStage:'group_stage';source:'league'|'copa'|'continental_title';sourcePosition?:number;slot:number;note:string}
export type BrazilianContinentalInput={leagueStandings:StandingRow[];clubs:Pick<Club,'id'|'division'>[];copaChampionId?:string|null;previousLibertadoresChampionId?:string|null;previousSudamericanaChampionId?:string|null}

function eligible(clubs:Pick<Club,'id'|'division'>[]){return new Set(clubs.filter(c=>Number(c.division??1)===1).map(c=>c.id))}
function next(standings:StandingRow[],used:Set<string>,ok:Set<string>,start:number){for(let i=Math.max(0,start-1);i<standings.length;i++){const r=standings[i];if(ok.has(r.id)&&!used.has(r.id))return r}return null}

export function resolveBrazilianContinentalQualifications(input:BrazilianContinentalInput):ContinentalQualification[]{
 const ok=eligible(input.clubs),out:ContinentalQualification[]=[],lib=new Set<string>()
 const addL=(id:string,source:ContinentalQualification['source'],slot:number,note:string,pos?:number)=>{if(!ok.has(id)||lib.has(id))return false;lib.add(id);out.push({clubId:id,competition:'libertadores',source,sourcePosition:pos,targetStage:'group_stage',slot,note});return true}
 for(let p=1;p<=4;p++){const r=input.leagueStandings[p-1];if(r)addL(r.id,'league',p,`Classificação pela Liga Nacional: ${p}º lugar.`,p)}
 if(input.copaChampionId)addL(input.copaChampionId,'copa',5,'Classificação pelo título da Copa Nacional do Brasil.')
 let cursor=5
 while(lib.size<5){const r=next(input.leagueStandings,lib,ok,cursor);if(!r)break;const p=input.leagueStandings.findIndex(x=>x.id===r.id)+1;addL(r.id,'league',p,`Vaga da Libertadores redistribuída pela Liga: ${p}º lugar.`,p);cursor=p+1}
 if(input.previousLibertadoresChampionId&&ok.has(input.previousLibertadoresChampionId)&&!lib.has(input.previousLibertadoresChampionId))addL(input.previousLibertadoresChampionId,'continental_title',lib.size+1,'Campeão vigente da Libertadores.')
 const sula=new Set<string>()
 const addS=(id:string,source:ContinentalQualification['source'],slot:number,note:string,pos?:number)=>{if(!ok.has(id)||sula.has(id)||lib.has(id))return false;sula.add(id);out.push({clubId:id,competition:'sudamericana',source,sourcePosition:pos,targetStage:'group_stage',slot,note});return true}
 if(input.previousSudamericanaChampionId&&ok.has(input.previousSudamericanaChampionId))addS(input.previousSudamericanaChampionId,'continental_title',1,'Campeão vigente da Sul-Americana.')
 for(let p=6;p<=11;p++){const r=input.leagueStandings[p-1];if(r)addS(r.id,'league',sula.size+1,`Classificação pela Liga Nacional: ${p}º lugar.`,p)}
 cursor=12
 while(sula.size<6){const r=next(input.leagueStandings,new Set([...lib,...sula]),ok,cursor);if(!r)break;const p=input.leagueStandings.findIndex(x=>x.id===r.id)+1;addS(r.id,'league',sula.size+1,`Vaga da Sul-Americana redistribuída pela Liga: ${p}º lugar.`,p);cursor=p+1}
 return out
}
export function continentalQualificationIds(result:ContinentalQualification[],competition:ContinentalQualification['competition']){return result.filter(x=>x.competition===competition).map(x=>x.clubId)}

export type ContinentalFixture={competitionId:string;seasonId:string;round:number;homeClubId:string;awayClubId:string;scheduledAt:string;stage:'preliminary'|'phase_1'|'phase_2'|'phase_3'|'group_stage'}
export type ContinentalPreliminaryPlan={
 libertadores:{phase1:Club[];phase2Direct:Club[];phase2Winners:Club[];phase3Winners:Club[];phase3Losers:Club[];groupClubs:Club[]}
 sudamericana:{firstPhaseClubs:Club[];firstPhaseWinners:Club[];groupClubs:Club[]}
 fixtures:ContinentalFixture[]
}

function rank(a:Club,b:Club){return Number(b.strength??b.reputation??0)-Number(a.strength??a.reputation??0)||Number(b.reputation??0)-Number(a.reputation??0)||a.name.localeCompare(b.name)}
function winner(a:Club,b:Club){return rank(a,b)<=0?a:b}
function pair(teams:Club[],stage:ContinentalFixture['stage'],competitionId:string,seasonId:string,year:number,startRound:number){
 const ordered=[...teams].sort(rank),fixtures:ContinentalFixture[]=[],winners:Club[]=[],losers:Club[]=[]
 for(let i=0;i+1<ordered.length;i+=2){const a=ordered[i],b=ordered[i+1];const w=winner(a,b);winners.push(w);losers.push(w.id===a.id?b:a);fixtures.push(
  {competitionId,seasonId,round:startRound,homeClubId:b.id,awayClubId:a.id,scheduledAt:new Date(Date.UTC(year,1,18+i,19)).toISOString(),stage},
  {competitionId,seasonId,round:startRound+1,homeClubId:a.id,awayClubId:b.id,scheduledAt:new Date(Date.UTC(year,1,25+i,19)).toISOString(),stage}
 )}return{winners,losers,fixtures}
}
function single(teams:Club[],competitionId:string,seasonId:string,year:number){const ordered=[...teams].sort(rank),fixtures:ContinentalFixture[]=[],winners:Club[]=[];for(let i=0;i+1<ordered.length;i+=2){const a=ordered[i],b=ordered[i+1];winners.push(winner(a,b));fixtures.push({competitionId,seasonId,round:1,homeClubId:a.id,awayClubId:b.id,scheduledAt:new Date(Date.UTC(year,1,18+i,19)).toISOString(),stage:'preliminary'})}return{winners,fixtures}}

export function buildContinentalPreliminaryPlan(allForeignClubs:Club[],libBrazil:Club[],sulaBrazil:Club[],libId:string,sulaId:string,seasonId:string,year:number):ContinentalPreliminaryPlan{
 const foreign=[...allForeignClubs].filter(c=>c.country!=='Brasil').sort(rank)
 const directCount=Math.max(0,32-libBrazil.length-4)
 const direct=foreign.slice(0,directCount),used=new Set(direct.map(c=>c.id))
 const phase1Countries=['Bolívia','Equador','Paraguai','Peru','Uruguai','Venezuela']
 const phase1=phase1Countries.map(country=>foreign.find(c=>c.country===country&&!used.has(c.id))).filter(Boolean) as Club[]
 phase1.forEach(c=>used.add(c.id))
 const phase2Direct=foreign.filter(c=>!used.has(c.id)).slice(0,13);phase2Direct.forEach(c=>used.add(c.id))
 const p1=pair(phase1,'phase_1',libId,seasonId,year,1)
 const p2=pair([...p1.winners,...phase2Direct],'phase_2',libId,seasonId,year,3)
 const p3=pair(p2.winners,'phase_3',libId,seasonId,year,5)
 const libGroup=[...libBrazil,...direct,...p3.winners].slice(0,32)
 const libSet=new Set(libGroup.map(c=>c.id))
 const libPhase3LoserSet=new Set(p3.losers.map(c=>c.id))
 const available=foreign.filter(c=>!libSet.has(c.id)&&!libPhase3LoserSet.has(c.id))
 const countries=['Bolívia','Chile','Colômbia','Equador','Paraguai','Peru','Uruguai','Venezuela']
 const first:Club[]=[]
 for(const country of countries)first.push(...available.filter(c=>c.country===country).sort(rank).slice(0,4))
 if(first.length<32)first.push(...available.filter(c=>!first.some(x=>x.id===c.id)).slice(0,32-first.length))
 const sulaWinners=countries.flatMap(country=>{const four=first.filter(c=>c.country===country).slice(0,4);return four.length===4?single(four,sulaId,seasonId,year).winners:[]}).slice(0,16)
 const libLosers=p3.losers.slice(0,4),usedS=new Set([...sulaBrazil,...sulaWinners,...libLosers].map(c=>c.id))
 const need=Math.max(0,32-usedS.size),arg=foreign.filter(c=>c.country==='Argentina'&&!usedS.has(c.id)).sort(rank).slice(0,Math.min(6,need));arg.forEach(c=>usedS.add(c.id))
 const extra=foreign.filter(c=>!usedS.has(c.id)&&!libSet.has(c.id)).sort(rank).slice(0,Math.max(0,32-usedS.size))
 const sulaGroup=[...sulaBrazil,...sulaWinners,...libLosers,...arg,...extra].slice(0,32)
 const fixtures=[...p1.fixtures,...p2.fixtures,...p3.fixtures]
 for(const country of countries){const four=first.filter(c=>c.country===country).slice(0,4);if(four.length===4)fixtures.push(...single(four,sulaId,seasonId,year).fixtures)}
 return{libertadores:{phase1,phase2Direct,phase2Winners:p2.winners,phase3Winners:p3.winners,phase3Losers:p3.losers,groupClubs:libGroup},sudamericana:{firstPhaseClubs:first,firstPhaseWinners:sulaWinners,groupClubs:sulaGroup},fixtures}
}

export function selectForeignContinentalClubs(allClubs:Club[],excluded:Set<string>,count:number){return allClubs.filter(c=>c.country!=='Brasil'&&!excluded.has(c.id)).sort(rank).slice(0,count)}
function draw(clubs:Club[]){const ordered=[...clubs].sort(rank),pots=Array.from({length:4},(_,i)=>ordered.slice(i*8,i*8+8)),groups:Club[][]=Array.from({length:8},()=>[]);function placePot(pi:number):boolean{if(pi===4)return true;const pot=pots[pi];function place(i:number,used:Set<number>):boolean{if(i===pot.length)return placePot(pi+1);const c=pot[i],candidates=groups.map((g,gi)=>({g,gi})).filter(x=>!used.has(x.gi)&&!x.g.some(y=>y.country===c.country)).sort((a,b)=>a.g.length-b.g.length||a.gi-b.gi);for(const x of candidates){x.g.push(c);used.add(x.gi);if(place(i+1,used))return true;used.delete(x.gi);x.g.pop()}return false}return place(0,new Set())}if(!placePot(0))throw new Error('Não foi possível montar os grupos continentais sem repetir país.');return groups}
export function buildContinentalGroups(competition:'libertadores'|'sudamericana',clubs:Club[]){if(clubs.length!==32)throw new Error(`${competition} precisa de exatamente 32 clubes; recebeu ${clubs.length}.`);return{competition,clubs:[...clubs],groups:draw(clubs)}}
export function buildContinentalGroupFixtures(seasonId:string,competitionId:string,groups:Club[][],year:number,startDay=7):ContinentalFixture[]{const dates=[startDay,startDay+7,startDay+21].map(d=>`${year}-04-${String(d).padStart(2,'0')}T19:00:00.000Z`).concat([5,19,26].map(d=>`${year}-05-${String(d).padStart(2,'0')}T19:00:00.000Z`));const out:ContinentalFixture[]=[];groups.forEach(g=>{const[a,b,c,d]=g;const rounds=[[[d,b],[c,a]],[[b,c],[a,d]],[[b,a],[d,c]],[[a,c],[b,d]],[[a,b],[c,d]],[[c,a],[d,b]]];rounds.forEach((matches,ri)=>matches.forEach(([home,away])=>out.push({competitionId,seasonId,round:ri+1,homeClubId:home.id,awayClubId:away.id,scheduledAt:dates[ri],stage:'group_stage'})))});return out}