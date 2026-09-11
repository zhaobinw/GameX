import copy, random, tempfile, unittest
from pathlib import Path
import torch
from env import Environments
from model import Policy,batch,choose
from train import collect,utility,update_ppo,checkpoint,load

class TrainingTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):torch.set_num_threads(1)
 def test_shared_victory_utility(self):
  self.assertEqual(utility([0,1],0,2),0)
  self.assertAlmostEqual(sum(utility([0,1],p,3) for p in range(3)),0)
 def test_mask_and_actual_gradient(self):
  with Environments(2) as e:
   item=e.call([dict(env=0,op='reset',setup=dict(seed='mask'))])[0]
   model=Policy(len(item['state']),len(item['actions'][0]));small=copy.deepcopy(item)
   small['actions']=small['actions'][:1];small['prior']=small['prior'][:1]
   logits,_=model(*batch([item,small]));self.assertTrue((logits[1,1:]<-1e8).all())
   ids,logs,values=choose(model,[small]);self.assertEqual(ids,[0])
   samples,games,_,record=collect(e,model,[copy.deepcopy(model)],4,2,721,500)
   self.assertTrue(all(g['completed'] for g in games));self.assertTrue(samples)
   opt=torch.optim.Adam(model.parameters(),lr=.0003);before=copy.deepcopy(model.state_dict())
   result=update_ppo(model,opt,samples,random.Random(1),epochs=2)
   self.assertGreater(result['gradient_norm'],0)
   self.assertTrue(any(not torch.equal(before[k],model.state_dict()[k]) for k in before))
   with tempfile.TemporaryDirectory() as d:
    path=Path(d)/'model.pt';checkpoint(path,model,opt,[model],1,{},[]);restored,c=load(path)
    self.assertTrue(all(torch.equal(v,restored.state_dict()[k]) for k,v in model.state_dict().items()))
 def test_cutoff_is_not_a_draw_or_training_sample(self):
  with Environments(2) as e:
   item=e.call([dict(env=0,op='reset',setup=dict(seed='cut'))])[0]
   model=Policy(len(item['state']),len(item['actions'][0]))
   samples,games,_,_=collect(e,model,[],2,2,7,1)
   self.assertEqual(samples,[]);self.assertTrue(all(not g['completed'] and g['utility'] is None for g in games))
 def test_parallel_seed_reproducibility_and_replay(self):
  with Environments(2) as e:
   item=e.call([dict(env=0,op='reset',setup=dict(seed='repeat'))])[0]
   model=Policy(len(item['state']),len(item['actions'][0]))
   _,g1,_,r=collect(e,model,[model],2,2,91,600,train=False)
   _,g2,_,_=collect(e,model,[model],2,2,91,600,train=False)
   self.assertEqual(g1,g2);self.assertIsNotNone(r)
   frames=e.call([dict(env=0,op='frames',record=r)])[0]['frames']
   self.assertEqual(frames[-1]['phase'],'ended')
   self.assertTrue(all(id is None for f in frames for p in f['players'] for id in p['reserved']))
if __name__=='__main__':unittest.main()
