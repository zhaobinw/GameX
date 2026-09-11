"""Headless historical self-play PPO with complete, per-seat trajectories."""
import argparse, copy, hashlib, json, math, os, platform, random, subprocess, time
from pathlib import Path
import numpy as np
import torch
from torch.distributions import Categorical
from env import Environments, ROOT
from model import Policy, batch, choose

SCHEMA=1
DATA=ROOT/'../../games/splendor/data/base-game.json'

def atomic_json(path, value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False));temp.replace(path)

def checkpoint(path, model, optimizer, pool, update, config, metrics):
    value=dict(schema=SCHEMA,model_config=model.config,model=model.state_dict(),optimizer=optimizer.state_dict(),pool=[x.state_dict() for x in pool],update=update,config=config,metrics=metrics,data_hash=hashlib.sha256(DATA.read_bytes()).hexdigest(),torch_rng=torch.get_rng_state(),python_rng=random.getstate(),numpy_rng=np.random.get_state())
    temp=Path(str(path)+'.tmp');torch.save(value,temp);temp.replace(path)

def load(path):
    # Local checkpoints produced by this project only; never load untrusted pickle files.
    c=torch.load(path,map_location='cpu',weights_only=False)
    if c['schema']!=SCHEMA or c['data_hash']!=hashlib.sha256(DATA.read_bytes()).hexdigest():raise ValueError('Checkpoint schema or card data mismatch')
    model=Policy(**c['model_config']);model.load_state_dict(c['model']);return model,c

def greedy(item, rng):
    buys=[i for i,a in enumerate(item['legal']) if a['type']=='buy']
    if buys:
        best=max(item['prior'][i] for i in buys)
        return rng.choice([i for i in buys if item['prior'][i]==best])
    return rng.randrange(len(item['legal']))

def utility(winners, seat, players):
    share=1/len(winners) if seat in winners else 0
    return (players*share-1)/(players-1)

def collect(envs, model, pool, episodes, players, seed, budget, train=True, opponent='greedy', stop=None):
    rng=random.Random(seed);generator=torch.Generator().manual_seed(seed)
    active={};next_game=0;finished=[];samples=[];steps=0;replay=None
    models={'current':model,**{f'old{i}':p for i,p in enumerate(pool)}}
    def setup(slot, game):
        # Evaluation pairs use the same deck/first player, swapping learner seats.
        game_seed=f'{"train" if train else "evaluation"}-{seed}-{game if train else game//2}'
        learner=game%players
        assignments=[]
        for p in range(players):
            if p==learner:assignments.append('current')
            elif not train:assignments.append('greedy' if opponent=='greedy' else 'old0')
            else:
                roll=rng.random()
                assignments.append('current' if roll<.5 else rng.choice(list(models)[1:]) if roll<.85 and pool else 'greedy')
        active[slot]={'game':game,'learner':learner,'assignments':assignments,'trajectories':[[] for _ in range(players)]}
        return dict(env=slot,op='reset',setup=dict(players=players,seed=game_seed,firstPlayer=(game//players)%players if train else 0))
    commands=[]
    for slot in range(min(envs.count,episodes)):
        commands.append(setup(slot,next_game));next_game+=1
    for command,item in zip(commands,envs.call(commands)):active[command['env']]['item']=item
    started=time.monotonic()
    while active:
        if stop and stop.exists():break
        grouped={};chosen={}
        for slot,g in active.items():
            item=g['item'];which=g['assignments'][item['seat']]
            if not item['actions']:continue
            if which=='greedy':chosen[slot]=(greedy(item,rng),None,None)
            else:grouped.setdefault(which,[]).append(slot)
        for which,slots in grouped.items():
            indices,logps,values=choose(models[which],[active[s]['item'] for s in slots],generator)
            for s,i,l,v in zip(slots,indices,logps,values):chosen[s]=(i,l,v)
        commands=[]
        for slot,(index,logp,value) in chosen.items():
            g=active[slot];item=g['item'];seat=item['seat']
            if train and g['assignments'][seat]=='current':
                g['trajectories'][seat].append(dict(state=item['state'],actions=item['actions'],prior=item['prior'],index=index,logp=logp,value=value))
            commands.append(dict(env=slot,op='step',index=index,record=True,check=False))
        results=envs.call(commands) if commands else []
        for cmd,item in zip(commands,results):active[cmd['env']]['item']=item;steps+=1
        reset=[]
        for slot,g in list(active.items()):
            item=g['item'];ended=item['ended'];cut=item['decisions']>=budget or not item['actions']
            if not ended and not cut:continue
            finished.append(dict(game=g['game'],completed=ended,decisions=item['decisions'],scores=item['scores'],winners=item['winners'],learner=g['learner'],utility=utility(item['winners'],g['learner'],players) if ended else None,win_share=(1/len(item['winners']) if g['learner'] in item['winners'] else 0) if ended else None))
            if ended:
                if replay is None:
                    replay=item.get('record')
                    if replay:replay['policies']=g['assignments']
                if train:
                    for seat,trajectory in enumerate(g['trajectories']):
                        target=utility(item['winners'],seat,players)
                        for x in trajectory:x['return']=target;samples.append(x)
                elif replay is None:replay=item.get('record')
            del active[slot]
            if next_game<episodes:reset.append(setup(slot,next_game));next_game+=1
        for cmd,item in zip(reset,envs.call(reset) if reset else []):active[cmd['env']]['item']=item
    return samples,finished,dict(decisions=steps,seconds=time.monotonic()-started),replay

def update_ppo(model, optimizer, samples, rng, epochs=4, minibatch=128):
    if not samples:raise RuntimeError('No completed training episodes; increase decision budget or inspect policy. Truncations are not draws.')
    advantages=np.array([x['return']-x['value'] for x in samples],np.float32)
    advantages=(advantages-advantages.mean())/max(advantages.std(),1e-6)
    stats=[]
    for _ in range(epochs):
        indices=list(range(len(samples)));rng.shuffle(indices)
        for start in range(0,len(indices),minibatch):
            ids=indices[start:start+minibatch];items=[samples[i] for i in ids]
            logits,values=model(*batch(items));dist=Categorical(logits=logits)
            selected=torch.tensor([x['index'] for x in items]);old=torch.tensor([x['logp'] for x in items]);target=torch.tensor([x['return'] for x in items]);adv=torch.tensor(advantages[ids])
            logp=dist.log_prob(selected);ratio=(logp-old).exp()
            policy=-torch.minimum(ratio*adv,ratio.clamp(.8,1.2)*adv).mean()
            value=(values-target).square().mean();entropy=dist.entropy().mean()
            loss=policy+.5*value-.01*entropy
            if not torch.isfinite(loss):raise RuntimeError('Nonfinite PPO loss')
            optimizer.zero_grad();loss.backward();norm=torch.nn.utils.clip_grad_norm_(model.parameters(),.5)
            if not torch.isfinite(norm):raise RuntimeError('Nonfinite gradient')
            optimizer.step()
            kl=((ratio-1)-(logp-old)).mean().item()
            stats.append(dict(loss=loss.item(),policy_loss=policy.item(),value_loss=value.item(),entropy=entropy.item(),kl=kl,clip_fraction=((ratio-1).abs()>.2).float().mean().item(),gradient_norm=float(norm)))
        if np.mean([s['kl'] for s in stats[-math.ceil(len(samples)/minibatch):]])>.03:break
    return {k:float(np.mean([x[k] for x in stats])) for k in stats[0]}

def summarize(results):
    completed=[g for g in results if g['completed']]
    n=len(completed);share=sum(g['win_share'] for g in completed)
    return dict(games=len(results),completed=n,truncated=len(results)-n,win_share=share/n if n else None,mean_utility=float(np.mean([g['utility'] for g in completed])) if n else None,mean_decisions=float(np.mean([g['decisions'] for g in results])) if results else 0)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--run',type=Path,default=ROOT/'runs'/time.strftime('%Y%m%d-%H%M%S'))
    parser.add_argument('--updates',type=int,default=10);parser.add_argument('--episodes',type=int,default=16)
    parser.add_argument('--workers',type=int,default=4);parser.add_argument('--players',type=int,choices=[2,3,4],default=2)
    parser.add_argument('--budget',type=int,default=800);parser.add_argument('--eval-games',type=int,default=8)
    parser.add_argument('--seed',type=int,default=20260912);parser.add_argument('--resume',type=Path)
    parser.add_argument('--evaluate',type=Path);parser.add_argument('--eval-seed',type=int,default=908172)
    args=parser.parse_args()
    if not(1<=args.workers<=32 and 1<=args.episodes<=1024 and 1<=args.updates<=100000 and 1<=args.eval_games<=10000 and 10<=args.budget<=10000):parser.error('Invalid training limits')
    torch.set_num_threads(1);random.seed(args.seed);np.random.seed(args.seed);torch.manual_seed(args.seed)
    run=args.run.resolve();run.mkdir(parents=True,exist_ok=True)
    if (run/'config.json').exists():raise ValueError('Use a new run directory; --resume accepts a checkpoint from the previous run')
    config=vars(args).copy();config={k:str(v) if isinstance(v,Path) else v for k,v in config.items()}
    config.update(schema=SCHEMA,algorithm='historical-self-play PPO, episodic Monte Carlo advantage',gamma=1.,clip=.2,entropy=.01,learning_rate=.0003,python=platform.python_version(),torch=torch.__version__,numpy=np.__version__,device='cpu',platform=platform.platform(),data_hash=hashlib.sha256(DATA.read_bytes()).hexdigest(),git_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip())
    config['source_hashes']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(ROOT.glob('*')) if p.suffix in ('.py','.mjs')}
    atomic_json(run/'config.json',config)
    metrics=[];state={'status':'starting','run':run.name,'config':config,'metrics':metrics,'updated_at':time.time()}
    def status(**kw):state.update(kw,updated_at=time.time());atomic_json(run/'status.json',state)
    try:
      with Environments(args.workers) as envs:
        item=envs.call([dict(env=0,op='reset',setup=dict(players=args.players,seed='dimensions'))])[0]
        model=Policy(len(item['state']),len(item['actions'][0]));start=0
        optimizer=torch.optim.Adam(model.parameters(),lr=.0003)
        initial=copy.deepcopy(model).eval();pool=[copy.deepcopy(initial)]
        if args.resume or args.evaluate:
            model,c=load(args.resume or args.evaluate)
            if model.config['state_dim']!=len(item['state']) or model.config['action_dim']!=len(item['actions'][0]):raise ValueError('Feature dimensions mismatch')
            optimizer=torch.optim.Adam(model.parameters(),lr=.0003);optimizer.load_state_dict(c['optimizer']);start=c['update']
            pool=[]
            for weights in c['pool']:
                old=Policy(**model.config);old.load_state_dict(weights);old.eval();pool.append(old)
            initial=copy.deepcopy(pool[0]);torch.set_rng_state(c['torch_rng']);random.setstate(c['python_rng']);np.random.set_state(c['numpy_rng'])
        config.update(parameters=sum(p.numel() for p in model.parameters()),model=model.config)
        atomic_json(run/'config.json',config)
        if args.evaluate:
            status(status='evaluating')
            _,games,speed,record=collect(envs,model,[initial],args.eval_games,args.players,args.eval_seed,args.budget,train=False)
            atomic_json(run/'evaluation.json',dict(summary=summarize(games),games=games,seed=args.eval_seed,speed=speed))
            if record:atomic_json(run/'replay-0.json',dict(record=record,frames=envs.call([dict(env=0,op='frames',record=record)])[0]['frames'],label='独立评估：模型 vs 贪心基线'))
            status(status='complete',evaluation=summarize(games));return
        checkpoint(run/'initial.pt',initial,torch.optim.Adam(initial.parameters(),lr=.0003),[initial],0,config,[])
        for update in range(start+1,start+args.updates+1):
            if (run/'STOP').exists():break
            status(status='collecting',update=update,opponents=len(pool))
            before=torch.cat([p.detach().flatten() for p in model.parameters()]).clone()
            samples,games,speed,training_record=collect(envs,model,pool,args.episodes,args.players,args.seed+update*100003,args.budget,stop=run/'STOP')
            if (run/'STOP').exists():break
            if training_record:
                frames=envs.call([dict(env=0,op='frames',record=training_record)])[0]['frames']
                atomic_json(run/f'replay-{update*3}.json',dict(record=training_record,frames=frames,label=f'第 {update} 代自我对弈 · '+ ' / '.join(training_record['policies'])))
            status(status='optimizing',update=update)
            losses=update_ppo(model,optimizer,samples,random)
            delta=float((torch.cat([p.detach().flatten() for p in model.parameters()])-before).norm())
            status(status='evaluating',update=update)
            evaluations={}
            for opponent in ['greedy','initial']:
                _,eg,es,record=collect(envs,model,[initial],args.eval_games,args.players,args.eval_seed,args.budget,train=False,opponent=opponent,stop=run/'STOP')
                evaluations[opponent]=summarize(eg)
                if record:
                    frames=envs.call([dict(env=0,op='frames',record=record)])[0]['frames']
                    atomic_json(run/f'replay-{update*3+(1 if opponent=="greedy" else 2)}.json',dict(record=record,frames=frames,label=f'第 {update} 代 vs {"贪心基线" if opponent=="greedy" else "初始模型"} · 模型玩家 1'))
            completed=sum(g['completed'] for g in games)
            row=dict(update=update,episodes=len(games),completed=completed,truncated=len(games)-completed,samples=len(samples),decisions=speed['decisions'],collection_seconds=speed['seconds'],decisions_per_second=speed['decisions']/max(.001,speed['seconds']),parameter_delta=delta,evaluation=evaluations,**losses)
            metrics.append(row);atomic_json(run/'metrics.json',metrics)
            if update%2==0:
                pool.append(copy.deepcopy(model).eval())
                if len(pool)>6:pool.pop(1) # Preserve initial baseline plus recent snapshots.
            checkpoint(run/'latest.pt',model,optimizer,pool,update,config,metrics)
            checkpoint(run/f'generation-{update}.pt',model,optimizer,pool,update,config,metrics)
            print(json.dumps(row,ensure_ascii=False),flush=True);status(status='checkpoint_saved',update=update)
        if not (run/'latest.pt').exists():checkpoint(run/'latest.pt',model,optimizer,pool,start,config,metrics)
        status(status='stopped' if (run/'STOP').exists() else 'complete')
    except Exception as e:
        status(status='failed',error=str(e));raise

if __name__=='__main__':main()
