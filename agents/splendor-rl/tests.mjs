import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,observe,legalActions,step} from '../../games/splendor/src/engine.js';
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
