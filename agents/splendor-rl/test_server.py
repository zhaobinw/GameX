import json,subprocess,sys,unittest,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parent
class ServerTests(unittest.TestCase):
 def test_local_status_assets_and_write_guards(self):
  process=subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--port','0'],stdout=subprocess.PIPE,text=True)
  try:
   origin=process.stdout.readline().strip().split()[-1]
   def request(path,data=None,headers=None):
    req=urllib.request.Request(origin+path,data=None if data is None else json.dumps(data).encode(),headers=headers or {})
    try:
     with urllib.request.urlopen(req) as r:return r.status,r.read()
    except urllib.error.HTTPError as e:return e.code,e.read()
   self.assertEqual(request('/')[0],200)
   self.assertIsInstance(json.loads(request('/api/runs')[1]),list)
   self.assertEqual(len(json.loads(request('/api/catalog')[1])['cards']),90)
   self.assertEqual(request('/api/start',{}, {'Content-Type':'application/json','Origin':'https://example.com'})[0],403)
   self.assertEqual(request('/api/start',{}, {'Content-Type':'text/plain'})[0],415)
   self.assertEqual(request('/api/start',[], {'Content-Type':'application/json'})[0],400)
   self.assertEqual(request('/api/start',{'workers':-1}, {'Content-Type':'application/json'})[0],400)
   self.assertEqual(request('/api/status?run=..')[0],400)
   self.assertEqual(request('/../train.py')[0],404)
  finally:
   process.terminate();process.wait(timeout=5);process.stdout.close()
if __name__=='__main__':unittest.main()
