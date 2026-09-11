import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,observe,legalActions,step,DATA,COLORS} from '../../games/splendor/src/engine.js';
import {encode} from './features.mjs';
test('fixed observation dimensions for 2–4 players and variable legal actions',()=>{
 let dimension;
 for(const players of [2,3,4]){
  let s=createGame({players,seed:'features'});
  for(let i=0;i<80&&s.phase!=='ended';i++){
   const actions=legalActions(s),f=encode(observe(s,s.currentPlayer),actions);
   dimension??=f.state.length;assert.equal(f.state.length,dimension);assert.equal(f.actions.length,actions.length);
   assert.ok(f.actions.every(a=>a.length===47&&a.every(Number.isFinite)));assert.ok(f.state.every(Number.isFinite));
   const buys=actions.filter(a=>a.type==='buy');s=step(s,buys[0]||actions[i%actions.length]);
  }
 }
});
test('hidden card identities and deck order cannot affect learner encoding',()=>{
 const a=createGame({seed:'privacy'});a.players[1].reserved.push(a.decks[0].pop());
 const b=structuredClone(a);[b.players[1].reserved[0],b.decks[0][0]]=[b.decks[0][0],b.players[1].reserved[0]];b.decks[1].reverse();
 assert.deepEqual(encode(observe(a,0),legalActions(a)),encode(observe(b,0),legalActions(b)));
});
test('publicly reserved identity is remembered, blind reserve is not encoded',()=>{
 const s=createGame({seed:'memory'}),o=observe(s,0),a=legalActions(s),base=encode(o,a);
 o.log.push({player:1,type:'reserve',tier:1});assert.deepEqual(encode(o,a),base);
 o.log.push({player:1,type:'reserve',card:s.market[0][0]});assert.notDeepEqual(encode(o,a),base);
 o.log.push({player:1,type:'buy',card:s.market[0][0]});assert.deepEqual(encode(o,a),base);
});

test('strategy knowledge keeps all actions and hides unobserved identities',()=>{
 const a=createGame({seed:'knowledge-privacy'});a.players[1].reserved.push(a.decks[0].pop());
 const b=structuredClone(a);[b.players[1].reserved[0],b.decks[0][0]]=[b.decks[0][0],b.players[1].reserved[0]];
 const actions=legalActions(a),f=encode(observe(a,0),actions,true);
 assert.equal(f.state.length,433);assert.equal(f.actions.length,actions.length);assert.ok(f.actions.every(x=>x.length===73&&x.every(Number.isFinite)));assert.ok(f.teacher.every(Number.isFinite));
 assert.ok(f.prior.every(x=>x===0)); // Teacher labels are not runtime policy logits.
 assert.deepEqual(f,encode(observe(b,0),legalActions(b),true));
});
test('strategy projection never mutates observation, and scores winning buy',()=>{
 const s=createGame({seed:'win-knowledge'}),o=observe(s,0);o.players[0].score=14;
 const original=structuredClone(o);const id=s.market[2].find(Boolean),c=DATA.cards.find(c=>c.id===id);
 o.players[0].bonuses=Object.fromEntries(COLORS.map(k=>[k,7]));const saved=structuredClone(o);
 const f=encode(o,[{type:'buy',card:id,payment:{white:0,blue:0,green:0,red:0,black:0,gold:0}},{type:'reserve',tier:1}],true);
 assert.ok(f.teacher[0]>f.teacher[1]);assert.deepEqual(o,saved);
});
