// Strategy hypotheses from the user-supplied guide, computed from actual cards.
// This module only receives a legal observation; no hidden-state transition/search.
import {card,noble,COLORS,TOKENS} from '../../games/splendor/src/engine.js';
const sum=v=>Object.values(v).reduce((a,b)=>a+b,0);
export const shape=id=>Object.values(card(id).cost).filter(Boolean).sort((a,b)=>b-a).join('');
function target(c,p,bank){
 const cost=COLORS.map(k=>Math.max(0,(c.cost[k]||0)-p.bonuses[k]));
 let missing=cost.map((n,i)=>Math.max(0,n-p.tokens[COLORS[i]]));
 // Allocate flexible gold to the largest current deficit; this is a teacher estimate.
 for(let g=0;g<p.tokens.gold;g++){const m=Math.max(...missing);if(!m)break;missing[missing.indexOf(m)]--;}
 const unavailable=missing.reduce((s,n,i)=>s+Math.max(0,n-bank[COLORS[i]]),0);
 const eta=1+Math.max(sum(missing)/2.5,...missing.map((n,i)=>n/(bank[COLORS[i]]>=4?1.8:1)))+unavailable*.7+Math.max(0,sum(cost)-10)*1.5;
 return {eta,cost:sum(cost),missing:sum(missing),unavailable};
}
function details(o,p,ids){
 const scored=ids.map(id=>{const c=card(id),t=target(c,p,o.bank);return {c,...t};});
 const demands=COLORS.map(k=>scored.reduce((s,t)=>s+(t.c.points+.3)*Math.min(3,Math.max(0,(t.c.cost[k]||0)-p.bonuses[k]))/(t.eta+2),0));
 const bonusValue=COLORS.map((k,i)=>.45/(1+p.bonuses[k]*.4)+Math.min(.45,demands[i]*.06));
 const routes=scored.map(t=>(t.c.points*2.8+bonusValue[COLORS.indexOf(t.c.bonus)])/Math.pow(t.eta,1.15)).sort((a,b)=>b-a);
 const distances=o.nobles.map(id=>{const n=noble(id);return COLORS.reduce((s,k)=>s+Math.max(0,(n.cost[k]||0)-p.bonuses[k]),0);}).sort((a,b)=>a-b);
 const noblePotential=(distances[0]===undefined?0:1/(1+distances[0]))+(distances[1]===undefined?0:.4/(1+distances[1]));
 const portfolio=COLORS.reduce((s,k)=>s+Math.log1p(p.bonuses[k])*.65,0)*Math.max(.3,1-p.score/25);
 const route=(routes[0]||0)+.18*(routes[1]||0)+.05*(routes[2]||0);
 const value=p.score*3.2+portfolio+route+noblePotential*.9+p.tokens.gold*.08;
 return {value,route,portfolio,noblePotential,demands,distances,bonusValue};
}
export function knowledge(o,actions){
 const me=o.players[o.currentPlayer],ids=[...o.market.flat().filter(Boolean),...me.reserved.filter(Boolean)];
 const before=details(o,me,ids),opponents=o.players.filter(p=>p.id!==me.id),maxScore=Math.max(0,...opponents.map(p=>p.score));
 const features=[],teacher=[];
 for(const a of actions){
  const p={...me,tokens:{...me.tokens},bonuses:{...me.bonuses},reserved:[...me.reserved]},bank={...o.bank};let remaining=[...ids],gain=0,denial=0;
  if(a.type==='take')for(const k of TOKENS){p.tokens[k]+=a.tokens[k]||0;bank[k]-=a.tokens[k]||0;}
  if(a.type==='return')for(const k of TOKENS){p.tokens[k]-=a.tokens[k]||0;bank[k]+=a.tokens[k]||0;}
  if(a.type==='reserve'){
   if(bank.gold){bank.gold--;p.tokens.gold++;}
   p.reserved.push(a.card||null);
  }
  if(a.type==='buy'){
   const c=card(a.card);p.score+=c.points;gain=c.points;p.bonuses[c.bonus]++;
   for(const k of TOKENS){p.tokens[k]-=a.payment[k]||0;bank[k]+=a.payment[k]||0;}
   remaining=remaining.filter(id=>id!==a.card);p.reserved=p.reserved.filter(id=>id!==a.card);
   if(o.nobles.some(id=>COLORS.every(k=>p.bonuses[k]>=(noble(id).cost[k]||0)))){p.score+=3;gain+=3;}
  }
  if(a.type==='noble'){p.score+=3;gain=3;}
  if(a.card&&(a.type==='buy'||a.type==='reserve'))for(const opp of opponents){
   const t=target(card(a.card),opp,o.bank);
   if(t.missing===0)denial=Math.max(denial,(opp.score+card(a.card).points>=15?3:.12*card(a.card).points));
  }
  const after=details({...o,bank},p,remaining),c=a.card&&card(a.card),t=c?target(c,me,o.bank):{eta:0,cost:0,missing:0,unavailable:0};
  const excess=Math.max(0,sum(p.tokens)-10),win=p.score>=15&&p.score>=maxScore;
  const acquired=c&&a.type==='buy'?before.bonusValue[COLORS.indexOf(c.bonus)]:0;
  let value=after.value-before.value+denial+acquired*.15-excess*.12;
  if(a.type==='reserve')value-=a.card ? .1 : 1; // known reservations have a small tempo/slot cost
  if(a.type==='reserve'&&c)value-=Math.max(0,t.cost-10)*.25+p.reserved.length*.04;
  if(win)value+=20;
  // This score is a teacher label, not an extra game reward or permanent policy logit.
  teacher.push(value);
  features.push([gain/5,(after.route-before.route)/5,(after.portfolio-before.portfolio),after.noblePotential-before.noblePotential,denial/3,acquired,t.eta/15,t.cost/14,t.missing/14,t.unavailable/7,excess/3,+win,p.score/15,maxScore/15,p.reserved.length/3,after.route/8,before.route/8,...(c?COLORS.map(k=>Math.max(0,(c.cost[k]||0)-me.bonuses[k])/7):Array(5).fill(0)),...(c?[+(shape(c.id)==='421'),+(shape(c.id)==='73'),+(shape(c.id)==='7'),+(shape(c.id)==='5333')]:Array(4).fill(0))]);
 }
 return {features,teacher,context:[...before.demands.map(n=>n/10),before.route/8,before.noblePotential,Math.min(...before.distances,10)/10,maxScore/15]};
}
