import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createGame, step, observe, legalActions, DATA, replayRecord } from './engine.js';

const root = path.resolve(fileURLToPath(new URL('../web/', import.meta.url)));
let state = createGame({ seed: randomBytes(16).toString('hex') });
let revision = 0;
let port = Number(process.env.PORT || 4173);
const origin = () => `http://127.0.0.1:${port}`;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav' };
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 16384) throw new Error('请求过大');
  }
  return JSON.parse(text);
}

const server = http.createServer(async (req, res) => {
  try {
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return json(res, 403, { error: '仅供本机使用' });
    const url = new URL(req.url, origin());
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const viewer = url.searchParams.has('viewer') ? Number(url.searchParams.get('viewer')) : null;
      return json(res, 200, { state: observe(state, viewer), actions: viewer === state.currentPlayer ? legalActions(state) : [], revision });
    }
    if (req.method === 'GET' && url.pathname === '/api/catalog') return json(res, 200, DATA);
    if (req.method === 'GET' && url.pathname === '/api/replay') {
      if (state.phase !== 'ended') return json(res, 409, { error: '为保护暗牌，完整复盘仅在对局结束后导出' });
      return json(res, 200, replayRecord(state));
    }
    if (req.method === 'POST' && ['/api/new', '/api/move'].includes(url.pathname)) {
      const requestOrigin = req.headers.origin;
      if (requestOrigin && ![origin(), `http://localhost:${port}`].includes(requestOrigin)) return json(res, 403, { error: '来源不匹配' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: '需要 JSON 请求' });
      const payload = await body(req);
      if (payload.revision !== revision) return json(res, 409, { error: '棋局已变化，请刷新后重试' });
      if (url.pathname === '/api/new') state = createGame({ players: payload.players, firstPlayer: payload.firstPlayer, seed: randomBytes(16).toString('hex') });
      else state = step(state, payload.action, payload.player);
      revision++;
      return json(res, 200, { revision });
    }
    if (req.method !== 'GET') return json(res, 405, { error: '不支持的请求' });
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) return json(res, 403, { error: '路径无效' });
    try {
      const bytes = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes);
    } catch { json(res, 404, { error: '文件不存在；若缺少卡图，请运行 npm run assets' }); }
  } catch (error) { json(res, 400, { error: error.message }); }
});
server.listen(port, '127.0.0.1', () => { port = server.address().port; console.log(`Splendor 本地牌桌: ${origin()}`); });
