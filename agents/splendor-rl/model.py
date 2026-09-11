"""Candidate-action PPO model: dynamic legal actions, no fixed action truncation."""
import numpy as np
import torch
from torch import nn

class Policy(nn.Module):
    def __init__(self, state_dim, action_dim, hidden=128):
        super().__init__()
        self.config = dict(state_dim=state_dim, action_dim=action_dim, hidden=hidden)
        self.encoder = nn.Sequential(nn.Linear(state_dim, hidden), nn.Tanh(), nn.Linear(hidden, hidden), nn.Tanh())
        self.actor = nn.Sequential(nn.Linear(hidden+action_dim, hidden), nn.Tanh(), nn.Linear(hidden, 1))
        self.critic = nn.Linear(hidden, 1)
        nn.init.zeros_(self.actor[-1].weight); nn.init.zeros_(self.actor[-1].bias)
    def forward(self, states, actions, mask, prior):
        h = self.encoder(states)
        logits = self.actor(torch.cat((h[:, None, :].expand(-1, actions.shape[1], -1), actions), -1)).squeeze(-1)
        return (logits+prior).masked_fill(~mask, -1e9), self.critic(h).squeeze(-1)

def batch(items, device='cpu'):
    n=max(len(x['actions']) for x in items)
    if n<1: raise ValueError('No legal actions')
    a=np.zeros((len(items),n,len(items[0]['actions'][0])),np.float32)
    mask=np.zeros((len(items),n),bool);prior=np.zeros((len(items),n),np.float32)
    for i,x in enumerate(items):
        k=len(x['actions']);a[i,:k]=x['actions'];mask[i,:k]=True;prior[i,:k]=x['prior']
    return tuple(torch.as_tensor(x,device=device) for x in (np.asarray([x['state'] for x in items],np.float32),a,mask,prior))

@torch.no_grad()
def choose(model, items, generator=None, deterministic=False):
    logits,values=model(*batch(items,next(model.parameters()).device))
    probs=logits.softmax(-1)
    selected=logits.argmax(-1) if deterministic else torch.multinomial(probs,1,generator=generator).squeeze(-1)
    logp=logits.log_softmax(-1).gather(1,selected[:,None]).squeeze(-1)
    return selected.cpu().tolist(),logp.cpu().tolist(),values.cpu().tolist()
