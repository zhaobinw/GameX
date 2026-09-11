import copy, unittest
from league import pfsp_weights, update_payoffs, strategy_scores, STYLES
from train import collect, load
from env import Environments, ROOT

class LeagueTests(unittest.TestCase):
 def test_pfsp_focuses_losses_without_forgetting(self):
  w=pfsp_weights({'easy':(99,100),'hard':(1,100)},['easy','hard','new'])
  self.assertAlmostEqual(sum(w.values()),1)
  self.assertGreater(w['hard'],w['new']);self.assertGreater(w['new'],w['easy']);self.assertGreater(w['easy'],0)
 def test_cutoffs_do_not_enter_payoffs(self):
  p={};update_payoffs(p,[{'completed':False,'opponent':'x','win_share':None}]);self.assertEqual(p,{})
  update_payoffs(p,[{'completed':True,'opponent':'x','win_share':.5}]);self.assertEqual(p['x'],(.5,1))
 def test_styles_preserve_actions_and_observation(self):
  with Environments(1,True) as e:
   item=e.call([dict(env=0,op='reset',setup=dict(seed='styles'))])[0];saved=copy.deepcopy(item)
   for style in STYLES:self.assertEqual(len(strategy_scores(item,style)),len(item['legal']))
   self.assertEqual(item,saved)
 def test_league_records_correct_opponent_and_only_learner_samples(self):
  path=ROOT/'runs/knowledge-v2-dev/latest.pt'
  if not path.exists():self.skipTest('Local trained weights unavailable')
  model,_=load(path)
  with Environments(2,True) as e:
   samples,games,_,_=collect(e,model,[model],2,2,181,800,opponent_weights={'rush':1.},deterministic_opponents=True,gae_lambda=.95)
  self.assertTrue(samples);self.assertTrue(all(g['opponent']=='rush' and g['completed'] for g in games))
  self.assertTrue(all(x['logp'] is not None for x in samples))
 def test_paired_report_keeps_draws_and_penalizes_cutoffs(self):
  from report_league import paired_values,interval
  games=[{'game':0,'completed':True,'win_share':1.},{'game':1,'completed':True,'win_share':0.},{'game':2,'completed':True,'win_share':.5},{'game':3,'completed':False,'win_share':None}]
  self.assertEqual(paired_values(games).tolist(),[.5,.25])
  self.assertEqual(interval(paired_values(games[:2])),[.5,.5])
  with self.assertRaises(ValueError):paired_values(games[:1])
 def test_reference_regularization_does_not_update_reference(self):
  import torch,random
  from train import update_ppo
  path=ROOT/'runs/knowledge-v2-dev/latest.pt'
  if not path.exists():self.skipTest('Local trained weights unavailable')
  model,_=load(path);reference=copy.deepcopy(model);before=copy.deepcopy(reference.state_dict())
  with Environments(2,True) as e:samples,_,_,_=collect(e,model,[reference],2,2,198,800,opponent_weights={'teacher':1.},gae_lambda=.95)
  result=update_ppo(model,torch.optim.Adam(model.parameters(),lr=.0001),samples,random.Random(10),epochs=1,teacher_weight=.03,reference=reference,anchor_weight=.08,entropy_weight=.003)
  self.assertGreater(result['gradient_norm'],0)
  self.assertTrue(all(torch.equal(v,reference.state_dict()[k]) for k,v in before.items()))
