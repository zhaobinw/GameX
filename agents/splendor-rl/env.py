import json
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parent
class Environments:
    def __init__(self, count):
        self.count=count
        self.process=subprocess.Popen(['node',str(ROOT/'env.mjs'),str(count)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,bufsize=1)
    def call(self, commands):
        self.process.stdin.write(json.dumps(commands,separators=(',',':'))+'\n');self.process.stdin.flush()
        line=self.process.stdout.readline()
        if not line: raise RuntimeError('Environment process exited')
        result=json.loads(line)
        if isinstance(result,dict): raise RuntimeError(result.get('error','Invalid bridge response'))
        return result
    def close(self):
        if self.process.poll() is None:
            self.process.stdin.close()
            try:self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:self.process.kill();self.process.wait()
        self.process.stdout.close()
    def __enter__(self):return self
    def __exit__(self,*args):self.close()
