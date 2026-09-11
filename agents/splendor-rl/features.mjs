import { card, noble, COLORS, TOKENS } from '../../games/splendor/src/engine.js';
import {knowledge as strategyKnowledge} from './knowledge.mjs';
export const SCHEMA = 1;
const sum = x => Object.values(x).reduce((a,b)=>a+b,0);
const one = (values, x) => values.map(v=>+(v===x));
const cardFeatures = id => {
  const c = id && card(id);
  return c ? [1,...one(COLORS,c.bonus),...COLORS.map(k=>(c.cost[k]||0)/7),c.points/5,c.tier/3] : Array(13).fill(0);
};
// Only accepts an engine observation, never the privileged engine state.
export function encode(observation, actions, knowledge = false) {
  const o=observation, seat=o.currentPlayer, me=o.players[seat];
  const s=[...one(['action','return','noble'],o.phase),+o.finalRound,o.players.length/4,...TOKENS.map(c=>o.bank[c]/7),...o.decks.map(n=>n/40)];
  for(let i=0;i<4;i++) {
    const p=i<o.players.length?o.players[(seat+i)%o.players.length]:null;
    s.push(...(p?[1,...TOKENS.map(c=>p.tokens[c]/10),...COLORS.map(c=>p.bonuses[c]/10),p.score/15,p.reserved.length/3,p.nobles.length/5,p.purchased.length/30,+(p.id===o.firstPlayer)]:Array(17).fill(0)));
  }
  for(const id of o.market.flat()) s.push(...cardFeatures(id));
  for(let i=0;i<3;i++) s.push(...cardFeatures(me.reserved[i]));
  for(let i=0;i<5;i++) {const n=noble(o.nobles[i]);s.push(...(n?[1,...COLORS.map(c=>(n.cost[c]||0)/4)]:Array(6).fill(0)));}
  // Perfect recall of publicly reserved cards, without inferring unseen blind draws.
  for(let offset=1;offset<4;offset++) {
    const p=offset<o.players.length?o.players[(seat+offset)%o.players.length]:null;
    const known=[];
    if(p) for(const e of o.log) if(e.player===p.id) {
      if(e.type==='reserve'&&e.card) known.push(e.card);
      if(e.type==='buy') {const i=known.indexOf(e.card);if(i>=0)known.splice(i,1);}
    }
    for(let i=0;i<3;i++)s.push(...cardFeatures(known[i]));
  }
  const a=actions.map(action=>{
    const c=action.card&&card(action.card), n=action.noble&&noble(action.noble);
    const cost=COLORS.map(k=>c?Math.max(0,(c.cost[k]||0)-me.bonuses[k]):0);
    return [...one(['take','reserve','buy','return','noble'],action.type),...TOKENS.map(k=>(action.tokens?.[k]||0)/10),...TOKENS.map(k=>(action.payment?.[k]||0)/10),...cardFeatures(action.card),(action.tier||0)/3,...COLORS.map(k=>(n?.cost[k]||0)/4),...cost.map(v=>v/7),...cost.map((v,i)=>Math.max(0,v-me.tokens[COLORS[i]])/7),action.type==='reserve'&&!action.card?1:0];
  });
  // Fixed, disclosed opening prior makes long sparse-reward games collectable.
  // It is a residual prior, never a hard filter: every legal action remains selectable.
  const prior=actions.map(a=>a.type==='buy'?2.5+(card(a.card).points*.35)-(sum(a.payment)*.03):a.type==='reserve'?-.8:0);
  if(knowledge){const k=strategyKnowledge(o,actions);return {state:[...s,...k.context],actions:a.map((x,i)=>[...x,...k.features[i]]),prior:actions.map(()=>0),teacher:k.teacher};}
  return {state:s,actions:a,prior};
}
