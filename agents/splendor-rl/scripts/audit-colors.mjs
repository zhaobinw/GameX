import {DATA,COLORS} from '../../../games/splendor/src/engine.js';
const key=c=>JSON.stringify([c.tier,c.points,c.bonus,COLORS.map(k=>c.cost[k]||0)]),all=new Set(DATA.cards.map(key));
const tiers=[1,2,3].map(tier=>{
 const cards=DATA.cards.filter(c=>c.tier===tier);let matches=0;const patterns={};
 for(const c of cards){
  const cost={};for(let i=0;i<5;i++)cost[COLORS[(i+1)%5]]=c.cost[COLORS[i]]||0;
  if(all.has(key({...c,cost,bonus:COLORS[(COLORS.indexOf(c.bonus)+1)%5]})))matches++;
  const pattern=Object.values(c.cost).filter(Boolean).sort((a,b)=>b-a).join('');patterns[pattern]=(patterns[pattern]||0)+1;
 }
 return {tier,count:cards.length,rotationMatches:matches,patterns};
});
console.log(JSON.stringify({cycle:COLORS,tiers,conclusion:'The full 90-card game is not invariant under cyclic color relabeling. No such augmentation is used.'},null,2));
