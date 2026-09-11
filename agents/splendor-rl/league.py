"""Strategy hypotheses and prioritized opponents, never deployment logits."""
import numpy as np
STYLES=('teacher','rush','engine','denial')
def strategy_scores(item,style='teacher'):
    scores=np.array(item['teacher'],dtype=np.float64)
    if style=='teacher':return scores
    for i,(a,encoded) in enumerate(zip(item['legal'],item['actions'])):
        f=encoded[-26:]
        if style=='rush':
            scores[i]+=1.3*f[0]+f[1]-.25*f[2]
            if a['type']=='reserve':scores[i]-=.45*f[14]+.5*f[6]
        elif style=='engine':scores[i]+=.9*f[2]+1.8*f[3]+.25*f[5]
        elif style=='denial':scores[i]+=2.5*f[4]+.6*f[1]
        else:raise ValueError('Unknown strategy')
    return scores

def pfsp_weights(payoffs,names):
    raw=[]
    for name in names:
        wins,games=payoffs.get(name,(0.,0))
        rate=(wins+2)/(games+4) # Beta smoothing; uniform floor prevents forgetting.
        raw.append(.08+(1-rate)**2)
    return {n:w/sum(raw) for n,w in zip(names,raw)}

def update_payoffs(payoffs,games):
    for g in games:
        if not g['completed']:continue
        name=g['opponent'];wins,count=payoffs.get(name,(0.,0))
        payoffs[name]=(wins*.98+g['win_share'],count*.98+1)
