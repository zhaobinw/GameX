"""Local table inference: encoded legal observations in, model action index out."""
import json
import sys
import torch
from train import load
from model import choose

torch.set_num_threads(1)
model, checkpoint = load(sys.argv[1])
model.eval()
print(json.dumps({'ready': True, 'knowledge': bool(checkpoint['config'].get('knowledge')), 'generation': checkpoint['update']}), flush=True)
for line in sys.stdin:
    try:
        item = json.loads(line)
        index = choose(model, [item], deterministic=True)[0][0]
        print(json.dumps({'index': index}), flush=True)
    except Exception as exc:
        print(json.dumps({'error': str(exc)}), flush=True)
