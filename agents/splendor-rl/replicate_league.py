"""Predeclared additional 600-game head-to-head, with a fresh seed domain."""
import argparse,json,hashlib
from pathlib import Path
import torch
from env import Environments
from train import load,collect,summarize,atomic_json
from report_league import paired_values,interval
p=argparse.ArgumentParser();p.add_argument('run',type=Path);a=p.parse_args()
config=json.loads((a.run/'config.json').read_text())
torch.set_num_threads(1)
model,_=load(a.run/'best.pt');baseline,_=load(Path(config['source']))
seed=config['training_seed']+30000000
with Environments(8,True) as envs:
 _,games,_,record=collect(envs,model,[baseline],600,2,seed,800,train=False,opponent='initial',deterministic=True)
 atomic_json(a.run/'replication.json',dict(seed=seed,games=games,summary=summarize(games),ci95=interval(paired_values(games)),candidate_sha256=hashlib.sha256((a.run/'best.pt').read_bytes()).hexdigest()))
 if record:
  frames=envs.call([dict(env=0,op='frames',record=record)])[0]['frames']
  atomic_json(a.run/'replay-9000.json',dict(record=record,frames=frames,label='联赛候选 vs 旧版 · 独立复验'))
print(json.dumps(summarize(games)),flush=True)
