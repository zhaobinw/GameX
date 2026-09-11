import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { purchaseGuide, tokenSummary } from '../web/purchase-guide.js';
import { actionSounds } from '../web/table-audio.js';
import { createGame, legalActions, step, observe, payments, DATA } from '../src/engine.js';

test('effective cost deducts permanent bonuses, never goes negative, and reports missing colors', () => {
  const player = { bonuses: { white: 5, blue: 1, red: 1 }, tokens: { white: 0, blue: 1, red: 2, gold: 0 } };
  const guide = purchaseGuide({ cost: { white: 3, blue: 4, red: 2 } }, player);
  assert.deepEqual(guide.effective, { white: 0, blue: 3, green: 0, red: 1, black: 0 });
  assert.deepEqual(guide.missing, { white: 0, blue: 2, green: 0, red: 0, black: 0 });
  assert.equal(guide.stillMissing, 2); assert.equal(guide.affordable, false);
});
test('gold is a shared pool across all deficits, not available once per color', () => {
  const player = { bonuses: {}, tokens: { blue: 1, gold: 2 } };
  const guide = purchaseGuide({ cost: { blue: 3, red: 2 } }, player);
  assert.equal(guide.goldNeeded, 4); assert.equal(guide.goldUsed, 2); assert.equal(guide.stillMissing, 2);
  assert.equal(guide.affordable, false);
  player.tokens.gold = 4;
  assert.equal(purchaseGuide({ cost: { blue: 3, red: 2 } }, player).affordable, true);
});
test('free purchases are distinguished from purchases requiring gold', () => {
  const player = { bonuses: { green: 4 }, tokens: { gold: 2 } };
  const free = purchaseGuide({ cost: { green: 3 } }, player);
  assert.equal(free.totalCost, 0); assert.equal(free.goldNeeded, 0); assert.equal(free.affordable, true);
  const wild = purchaseGuide({ cost: { blue: 2 } }, player);
  assert.equal(wild.totalCost, 2); assert.equal(wild.goldNeeded, 2); assert.equal(wild.stillMissing, 0); assert.equal(wild.affordable, true);
});
test('displayed totals count gold, track the limit and preserve overflow', () => {
  assert.deepEqual(tokenSummary({ white: 2, gold: 1 }), { total: 3, limit: 10, remaining: 7, excess: 0 });
  assert.deepEqual(tokenSummary({ white: 2, blue: 2, green: 2, red: 2, gold: 2 }), { total: 10, limit: 10, remaining: 0, excess: 0 });
  assert.deepEqual(tokenSummary({ white: 3, blue: 3, green: 3, gold: 3 }), { total: 12, limit: 10, remaining: 0, excess: 2 });
});
test('purchase hints agree with all server payment options through a real multiplayer game', () => {
  let state = createGame({ players: 3, seed: 'guide-validation' });
  for (let i = 0; i < 75 && state.phase !== 'ended'; i++) {
    const view = observe(state, state.currentPlayer);
    const player = view.players[state.currentPlayer];
    for (const c of DATA.cards) {
      assert.equal(purchaseGuide(c, player).affordable, payments(state.players[state.currentPlayer], c.id).length > 0, c.id);
    }
    const actions = legalActions(state), buy = actions.find(a => a.type === 'buy');
    state = step(state, buy || actions[(i * 7) % actions.length]);
  }
});
test('physical sounds follow quantities, empty-gold reservations, free purchases and noble visits', () => {
  assert.equal(actionSounds({ type: 'take', tokens: { white: 1, blue: 1, red: 1 } }).filter(c => c.kind === 'lay').length, 3);
  assert.ok(actionSounds({ type: 'return', tokens: { gold: 1 } }).some(c => c.kind === 'stack'));
  assert.equal(actionSounds({ type: 'reserve', tier: 1 }, { goldTaken: false }).some(c => c.kind === 'lay'), false);
  assert.equal(actionSounds({ type: 'reserve', tier: 1 }, { goldTaken: true }).some(c => c.kind === 'lay'), true);
  const freeBuy = actionSounds({ type: 'buy', payment: {} });
  assert.ok(freeBuy.some(c => c.kind === 'slide')); assert.equal(freeBuy.some(c => c.kind === 'collide'), false);
  const noble = actionSounds({ type: 'noble' }, { nobleVisited: true });
  assert.equal(noble.filter(c => c.kind === 'place').length, 1);
  assert.equal(actionSounds({ type: 'buy', payment: { white: 2 } }, { refilled: false }).filter(c => c.kind === 'slide').length, 1);
});
test('bundled CC0 sounds match their provenance hashes and have valid PCM WAV headers', () => {
  const base = new URL('../web/assets/audio/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', base)));
  assert.equal(manifest.license, 'CC0-1.0'); assert.equal(manifest.files.length, 14);
  for (const entry of manifest.files) {
    const bytes = readFileSync(new URL(`${entry.name}.wav`, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.length, entry.bytes); assert.ok(bytes.length > 1000);
  }
});
