import readline from 'node:readline';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import {createGame,step,observe,legalActions,assertInvariants,replayRecord} from '../../games/splendor/src/engine.js';
import {encode} from './features.mjs';
if(!isMainThread){
 let state, decisions=0;
 parentPort.on('message',({id,cmd})=>{try{
  if(cmd.op==='reset'){state=createGame(cmd.setup);decisions=0;}
  else if(cmd.op==='step') {const actions=legalActions(state);if(!Number.isInteger(cmd.index)||!actions[cmd.index])throw Error('Invalid legal action index');state=step(state,actions[cmd.index]);decisions++;}
  else if(cmd.op==='frames') {
   let s=createGame(cmd.record.setup);const frames=[observe(s,null)];
   for(const m of cmd.record.moves){s=step(s,m.action,m.player);frames.push(observe(s,null));}
   parentPort.postMessage({id,result:{frames}});return;
  } else throw Error('Unknown environment operation');
  if(cmd.check)assertInvariants(state);
  const o=observe(state,state.currentPlayer),actions=legalActions(state),ended=state.phase==='ended';
  parentPort.postMessage({id,result:{...encode(o,actions,workerData.knowledge),seat:state.currentPlayer,players:state.players.length,ended,winners:state.winners,scores:o.players.map(p=>p.score),decisions,legal:actions,record:ended&&cmd.record?replayRecord(state):undefined}});
 }catch(e){parentPort.postMessage({id,error:e.message});}});
}else{
 const count=Number(process.argv[2]||4);if(!Number.isInteger(count)||count<1||count>64)throw Error('Workers must be 1–64');
 const workers=Array.from({length:count},()=>new Worker(new URL(import.meta.url),{workerData:{knowledge:process.argv[3]==='knowledge'}})),pending=new Map();let seq=0;
 for(const worker of workers){worker.on('message',m=>{const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error));else p.resolve(m.result);});worker.on('error',e=>{process.stderr.write(e.stack+'\n');process.exit(1);});}
 const call=(worker,cmd)=>new Promise((resolve,reject)=>{const id=seq++;pending.set(id,{resolve,reject});worker.postMessage({id,cmd});});
 const lines=readline.createInterface({input:process.stdin});
 for await(const line of lines){try{const commands=JSON.parse(line);const result=await Promise.all(commands.map(({env,...cmd})=>{if(!workers[env])throw Error('Invalid environment');return call(workers[env],cmd);}));process.stdout.write(JSON.stringify(result)+'\n');}catch(e){process.stdout.write(JSON.stringify({error:e.message})+'\n');}}
 await Promise.all(workers.map(w=>w.terminate()));
}
