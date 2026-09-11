"""Local training control and replay viewer; isolated from the human table."""
import argparse, json, mimetypes, os, subprocess, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
from env import ROOT

RUNS=ROOT/'runs';WEB=ROOT/'web';GAME=(ROOT/'../../games/splendor/web').resolve()
lock=threading.Lock();job=None;job_log=None

def read(path, default=None):
    try:return json.loads(path.read_text())
    except FileNotFoundError:return default

def safe_run(name):
    if not name or Path(name).name!=name or name in ('.','..'):raise ValueError('无效的训练记录')
    return RUNS/name

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def json(self,value,status=200):
        data=json.dumps(value,ensure_ascii=False,allow_nan=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
    def valid_host(self):return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}')
    def do_GET(self):
      try:
        if not self.valid_host():return self.json({'error':'仅供本机使用'},403)
        url=urlparse(self.path);q=parse_qs(url.query)
        if url.path=='/api/runs':
            values=[]
            for folder in sorted(RUNS.glob('*'),key=lambda p:p.stat().st_mtime,reverse=True):
                if folder.is_dir() and (folder/'status.json').exists():
                    s=read(folder/'status.json',{});c=s.get('config',{});values.append(dict(name=folder.name,status=s.get('status'),update=s.get('update',0),knowledge=c.get('knowledge',False),pretrained=c.get('pretrained',bool(c.get('distillation')))))
            return self.json(values)
        if url.path in ['/api/status','/api/replays','/api/replay']:
            folder=safe_run(q.get('run',[''])[0])
            if url.path=='/api/status':return self.json(read(folder/'status.json',{}))
            if url.path=='/api/replays':return self.json([dict(id=p.stem,label=read(p,{}) .get('label',p.stem)) for p in sorted(folder.glob('replay-*.json'),key=lambda p:int(p.stem.split('-')[-1]))])
            rid=q.get('id',[''])[0]
            if not rid.startswith('replay-') or not rid[7:].isdigit():raise ValueError('无效的复盘')
            value=read(folder/(rid+'.json'))
            if value is None:return self.json({'error':'未找到复盘'},404)
            # Full record is retained locally for validation; serve only public frames.
            return self.json(dict(frames=value['frames'],label=value['label']))
        if url.path=='/api/catalog':return self.json(read(ROOT/'../../games/splendor/data/base-game.json'))
        if url.path.startswith('/game/'):
            root=GAME;relative=unquote(url.path[6:])
        else:root=WEB;relative=unquote(url.path.lstrip('/') or 'index.html')
        path=(root/relative).resolve()
        if not path.is_relative_to(root.resolve()) or not path.is_file():return self.json({'error':'未找到文件'},404)
        data=path.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(path)[0] or 'application/octet-stream');self.send_header('Cache-Control','no-cache');self.end_headers();self.wfile.write(data)
      except (ValueError,TypeError) as e:self.json({'error':str(e)},400)
    def do_POST(self):
      global job,job_log
      try:
        if not self.valid_host():return self.json({'error':'仅供本机使用'},403)
        if self.headers.get('Origin') not in (None,f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'):return self.json({'error':'来源不匹配'},403)
        if not self.headers.get('Content-Type','').startswith('application/json'):return self.json({'error':'需要 JSON'},415)
        size=int(self.headers.get('Content-Length',0))
        if not 0<size<8192:raise ValueError('请求大小无效')
        data=json.loads(self.rfile.read(size))
        if not isinstance(data,dict):raise ValueError('请求必须是对象')
        with lock:
            if self.path=='/api/stop':
                folder=safe_run(data.get('run'));(folder/'STOP').touch();return self.json({'ok':True})
            if self.path!='/api/start':return self.json({'error':'未知操作'},404)
            if job and job.poll() is None:return self.json({'error':'已有训练正在运行，请先停止或等待完成'},409)
            if job_log:job_log.close()
            workers=int(data.get('workers',4));updates=int(data.get('updates',10));players=int(data.get('players',2));episodes=int(data.get('episodes',16))
            if not (1<=workers<=16 and 1<=updates<=1000 and players in (2,3,4) and 2<=episodes<=128):raise ValueError('训练配置超出范围')
            name=time.strftime('%Y%m%d-%H%M%S')+f'-{time.time_ns()%100000:05d}';folder=safe_run(name);folder.mkdir(parents=True)
            command=[sys.executable,str(ROOT/'train.py'),'--run',str(folder),'--workers',str(workers),'--updates',str(updates),'--players',str(players),'--episodes',str(episodes)]
            if data.get('knowledge',True):command+=['--knowledge']
            if data.get('resume'):
                previous=safe_run(data['resume'])/'latest.pt'
                if not previous.is_file():raise ValueError('该记录还没有可续训的模型')
                command+=['--resume',str(previous)]
            job_log=(folder/'console.log').open('w');job=subprocess.Popen(command,stdout=job_log,stderr=subprocess.STDOUT,cwd=ROOT)
            return self.json({'run':name})
      except (ValueError,TypeError,OSError) as e:self.json({'error':str(e)},400)

def main():
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=4175);args=p.parse_args();RUNS.mkdir(exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Splendor AI 实验室: http://127.0.0.1:{server.server_port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
if __name__=='__main__':main()
