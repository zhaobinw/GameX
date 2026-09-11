import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('HTTP service preserves rule authority, hidden information, revision checks and local-only writes', { timeout: 15000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.js', import.meta.url))], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const origin = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
    });
    const get = async path => { const r = await fetch(origin + path); return { status: r.status, data: await r.json() }; };
    const post = async (path, payload, headers = {}) => {
      const r = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: JSON.stringify(payload) });
      return { status: r.status, data: await r.json() };
    };
    const home = await fetch(origin + '/'); assert.equal(home.status, 200); assert.match(await home.text(), /璀璨宝石/);
    const js = await fetch(origin + '/app.js'); assert.equal(js.status, 200); assert.match(js.headers.get('content-type'), /javascript/);
    const first = (await get('/api/state')).data;
    assert.equal(first.revision, 0); assert.deepEqual(first.actions, []); assert.equal('seed' in first.state, false);
    const owner = (await get('/api/state?viewer=0')).data;
    assert.ok(owner.actions.some(a => a.type === 'reserve' && a.tier === 1));
    const invalid = await post('/api/move', { revision: 0, player: 0, action: { type: 'take', tokens: { white: -1 } } });
    assert.equal(invalid.status, 400); assert.deepEqual((await get('/api/state')).data, first);
    const moved = await post('/api/move', { revision: 0, player: 0, action: { type: 'reserve', tier: 1 } });
    assert.equal(moved.status, 200); assert.equal(moved.data.revision, 1);
    const ownAfter = (await get('/api/state?viewer=0')).data;
    const hiddenId = ownAfter.state.players[0].reserved[0];
    const otherAfter = (await get('/api/state?viewer=1')).data;
    assert.deepEqual(otherAfter.state.players[0].reserved, [null]);
    assert.equal(JSON.stringify(otherAfter).includes(hiddenId), false);
    assert.equal((await get('/api/replay')).status, 409);
    assert.equal((await post('/api/move', { revision: 0, player: 1, action: { type: 'reserve', tier: 1 } })).status, 409);
    assert.equal((await post('/api/new', { revision: 1, players: 4, firstPlayer: 2 }, { Origin: 'https://unrelated.example' })).status, 403);
    assert.equal((await get('/api/state')).data.revision, 1);
    assert.equal((await post('/api/new', { revision: 1, players: 4, firstPlayer: 2 })).status, 200);
    const four = (await get('/api/state')).data;
    assert.equal(four.state.players.length, 4); assert.equal(four.state.nobles.length, 5); assert.equal(four.state.bank.white, 7); assert.equal(four.state.currentPlayer, 2);
    assert.equal((await get('/api/state?viewer=99')).status, 400);
    assert.equal((await get('/nonexistent')).status, 404);
  } finally {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  }
});
