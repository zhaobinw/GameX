// Convert completed human games to legal, seat-specific imitation examples.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createGame,step,observe,legalActions} from '../../games/splendor/src/engine.js';
import {encode} from './features.mjs';
export function replayExamples(record, seat=0) {
 if(record.version!==1)throw Error('Unsupported replay version');
 let state=createGame(record.setup);const examples=[];
 for(const move of record.moves){
  if(move.player!==state.currentPlayer)throw Error('Invalid replay seat');
  const actions=legalActions(state),index=actions.findIndex(a=>isDeepStrictEqual(a,move.action));
  if(index<0)throw Error('Replay contains illegal action');
  if(move.player===seat)examples.push({...encode(observe(state,seat),actions,true),index});
  state=step(state,move.action,move.player);
 }
 if(state.phase!=='ended')throw Error('Only completed games can become training examples');
 if(!state.players[seat])throw Error('Invalid player seat');
 return {schema:1,seat,winners:state.winners,examples};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const bytes=readFileSync(process.argv[2]);
 const dataset=replayExamples(JSON.parse(bytes),Number(process.argv[4]||0));
 dataset.source_sha256=createHash('sha256').update(bytes).digest('hex');
 writeFileSync(process.argv[3],JSON.stringify(dataset));
 console.log(JSON.stringify({samples:dataset.examples.length,winners:dataset.winners,source_sha256:dataset.source_sha256}));
}
