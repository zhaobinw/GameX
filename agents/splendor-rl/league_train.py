"""PFSP training: validation selects; unseen holdout tests exactly one candidate."""
import argparse,copy,hashlib,json,random,time,math
from pathlib import Path
import numpy as np
import torch
from env import Environments,ROOT
from train import load,collect,update_ppo,summarize,checkpoint,atomic_json
from league import STYLES,pfsp_weights,update_payoffs

def main():
 p=argparse.ArgumentParser()
 p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
 for name,default in [('updates',24),('episodes',128),('workers',8),('seed',261209),('validation-games',40),('holdout-games',200),('validation-every',4)]:p.add_argument('--'+name,type=int,default=default)
 p.add_argument('--teacher-weight',type=float,default=0.);p.add_argument('--anchor-weight',type=float,default=0.);p.add_argument('--entropy-weight',type=float,default=.01)
 a=p.parse_args()
 if a.run.exists():p.error('Use a new output directory')
 if min(a.updates,a.episodes,a.workers,a.validation_games,a.holdout_games,a.validation_every)<1:p.error('Positive counts required')
 if a.workers>32 or a.episodes>1024:p.error('Worker or episode limit exceeded')
 if a.validation_games%2 or a.holdout_games%2:p.error('Evaluation games must be even for seat pairs')
 if any(not math.isfinite(x) or not 0<=x<=10 for x in (a.teacher_weight,a.anchor_weight,a.entropy_weight)):p.error('Invalid regularization weights')
 a.run.mkdir(parents=True);torch.set_num_threads(1);torch.manual_seed(a.seed);random.seed(a.seed);np.random.seed(a.seed)
 model,saved=load(a.source)
 if not saved['config'].get('knowledge'):raise ValueError('Knowledge checkpoint required')
 baseline=copy.deepcopy(model).eval();pool=[baseline];payoffs={};metrics=[]
 opt=torch.optim.Adam(model.parameters(),lr=.0001)
 config={**saved['config'],**{k:str(v) if isinstance(v,Path) else v for k,v in vars(a).items()},'algorithm':'PFSP diverse frozen opponents + PPO','learning_rate':.0001,'teacher_weight':a.teacher_weight,'anchor_weight':a.anchor_weight,'entropy_weight':a.entropy_weight,'parent_sha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'knowledge':True,'training_seed':a.seed,'validation_seed':a.seed+10000000,'holdout_seed':a.seed+20000000}
 config['source_hashes']={x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in ROOT.iterdir() if x.suffix in ('.py','.mjs')}
 atomic_json(a.run/'config.json',config)
 def status(phase,**kw):atomic_json(a.run/'status.json',dict(status=phase,config=config,metrics=metrics,updated_at=time.time(),update=kw.pop('update',metrics[-1]['update'] if metrics else 0),**kw))
 with Environments(a.workers,True) as envs:
  def evaluate(candidate,count,seed,opponents):
   out={}
   for name in opponents:
    _,games,_,_=collect(envs,candidate,[baseline],count,2,seed,800,train=False,opponent=name,deterministic=True)
    out[name]={'summary':summarize(games),'games':games}
   return out
  opponents=('initial','teacher','rush','engine','denial','greedy')
  status('evaluating',update=0)
  initial=evaluate(model,a.validation_games,config['validation_seed'],opponents)
  def quality(r):return sum(sum(g['win_share'] or 0 for g in v['games'])/len(v['games']) for v in r.values())/len(r)
  best_score=quality(initial);best=copy.deepcopy(model);best_update=0
  atomic_json(a.run/'validation-initial.json',initial)
  checkpoint(a.run/'best.pt',best,opt,pool,saved['update'],config,metrics)
  for update in range(1,a.updates+1):
   if (a.run/'STOP').exists():break
   weights=pfsp_weights(payoffs,[f'old{i}' for i in range(len(pool))]+list(STYLES)+['greedy'])
   status('collecting',update=update,opponent_weights=weights)
   samples,games,speed,_=collect(envs,model,pool,a.episodes,2,a.seed+update*100003,800,opponent_weights=weights,deterministic_opponents=True,gae_lambda=.95,stop=a.run/'STOP')
   if (a.run/'STOP').exists():break
   update_payoffs(payoffs,games)
   status('optimizing',update=update)
   before=torch.cat([x.detach().flatten() for x in model.parameters()]).clone()
   losses=update_ppo(model,opt,samples,random,epochs=3,teacher_weight=a.teacher_weight,reference=baseline,anchor_weight=a.anchor_weight,entropy_weight=a.entropy_weight)
   row=dict(update=update,episodes=len(games),completed=sum(g['completed'] for g in games),samples=len(samples),collection_seconds=speed['seconds'],decisions_per_second=speed['decisions']/max(speed['seconds'],.001),truncated=sum(not g['completed'] for g in games),parameter_delta=float((torch.cat([x.detach().flatten() for x in model.parameters()])-before).norm()),opponent_weights=weights,**losses)
   if update%a.validation_every==0 or update==a.updates:
    status('evaluating',update=update)
    validation=evaluate(model,a.validation_games,config['validation_seed'],opponents)
    row['evaluation']={k:v['summary'] for k,v in validation.items()};row['validation_score']=quality(validation)
    atomic_json(a.run/f'validation-{update}.json',validation)
    if row['validation_score']>best_score:
     best_score=row['validation_score'];best=copy.deepcopy(model);best_update=update
     checkpoint(a.run/'best.pt',best,opt,pool,saved['update']+update,config,metrics+[row])
    if len(pool)<9:pool.append(copy.deepcopy(model).eval())
   metrics.append(row);atomic_json(a.run/'metrics.json',metrics)
   checkpoint(a.run/'latest.pt',model,opt,pool,saved['update']+update,config,metrics)
   atomic_json(a.run/'league.json',dict(payoffs=payoffs,best_update=best_update,best_validation=best_score))
   print(json.dumps(row),flush=True)
  if (a.run/'STOP').exists():
   if not (a.run/'latest.pt').exists():checkpoint(a.run/'latest.pt',model,opt,pool,saved['update'],config,metrics)
   status('stopped',update=metrics[-1]['update'] if metrics else 0);return
  status('evaluating',update=a.updates)
  holdout={label:evaluate(candidate,a.holdout_games,config['holdout_seed'],opponents) for label,candidate in [('baseline',baseline),('candidate',best)]}
  atomic_json(a.run/'holdout.json',dict(best_update=best_update,seed=config['holdout_seed'],results=holdout))
  status('complete',best_update=best_update,best_validation=best_score)
if __name__=='__main__':main()
