"""Paired-deck bootstrap; all scheduled games count, truncations score zero."""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from train import atomic_json

def paired_values(games):
    pairs={}
    for g in games:pairs.setdefault(g['game']//2,[]).append(g['win_share'] if g['completed'] else 0.)
    if any(len(v)!=2 for v in pairs.values()):raise ValueError('Incomplete seat pairs')
    return np.array([np.mean(pairs[k]) for k in sorted(pairs)])

def interval(values):
    rng=np.random.default_rng(190911)
    draws=rng.choice(values,size=(10000,len(values)),replace=True).mean(axis=1)
    return [float(x) for x in np.quantile(draws,[.025,.975])]

def report(run):
    data=json.loads((run/'holdout.json').read_text());r=data['results'];rows={};diffs=[]
    for opponent in r['baseline']:
        b=r['baseline'][opponent];c=r['candidate'][opponent]
        bv=paired_values(b['games']);cv=paired_values(c['games']);delta=cv-bv;diffs.append(delta)
        rows[opponent]=dict(baseline=b['summary'],candidate=c['summary'],scheduled_baseline=float(bv.mean()),scheduled_candidate=float(cv.mean()),delta=float(delta.mean()),delta_ci95=interval(delta),candidate_ci95=interval(cv))
    overall=np.mean(diffs,axis=0)
    replication=None
    if (run/'replication.json').exists():
        rep=json.loads((run/'replication.json').read_text())
        if rep['candidate_sha256']!=hashlib.sha256((run/'best.pt').read_bytes()).hexdigest():raise ValueError('Replication checkpoint mismatch')
        combined=np.concatenate([paired_values(r['candidate']['initial']['games']),paired_values(rep['games'])])
        replication=dict(seed=rep['seed'],summary=rep['summary'],combined_games=len(combined)*2,combined_win_share=float(combined.mean()),combined_ci95=interval(combined))
    head_lower=replication['combined_ci95'][0] if replication else rows['initial']['candidate_ci95'][0]
    promoted=head_lower>.5 and interval(overall)[0]>0
    result=dict(run=run.name,best_update=data['best_update'],holdout_seed=data['seed'],paired_decks=len(overall),bootstrap_samples=10000,rows=rows,mean_delta=float(overall.mean()),mean_delta_ci95=interval(overall),promotion_passed=promoted,replication=replication)
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('run',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
    result=report(a.run);atomic_json(a.output,result);print(json.dumps(result,ensure_ascii=False,indent=2))
