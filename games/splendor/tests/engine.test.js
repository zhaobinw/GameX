import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, legalActions, step, DATA, COLORS, payments, observe, score, bonuses, card, assertInvariants, replayRecord, replay } from '../src/engine.js';

function take(state, tokens) { return step(state, { type: 'take', tokens }); }
function remove(state, id) {
  state.decks.forEach(d => { const i = d.indexOf(id); if (i >= 0) d.splice(i, 1); });
  state.market.forEach((row, tier) => { const i = row.indexOf(id); if (i >= 0) row[i] = state.decks[tier].shift() || null; });
  state.players.forEach(p => { p.purchased = p.purchased.filter(c => c !== id); p.reserved = p.reserved.filter(c => c !== id); });
}
function grantCard(state, player, id) { remove(state, id); state.players[player].purchased.push(id); }
function grantTokens(state, player, tokens) { for (const [c, n] of Object.entries(tokens)) { state.bank[c] -= n; state.players[player].tokens[c] += n; } }
function expose(state, id) {
  remove(state, id); const tier = card(id).tier - 1;
  const old = state.market[tier][0]; if (old) state.decks[tier].push(old);
  state.market[tier][0] = id;
}
function grantBonuses(state, player, desired) {
  for (const [color, count] of Object.entries(desired)) {
    for (const c of DATA.cards.filter(c => c.bonus === color && c.points === 0).slice(0, count)) grantCard(state, player, c.id);
  }
}

test('official inventory is 90 cards / 10 nobles, with 40/30/20 tiers and known asymmetric costs', () => {
  assert.equal(DATA.cards.length, 90); assert.equal(new Set(DATA.cards.map(c => c.id)).size, 90);
  assert.deepEqual([1, 2, 3].map(t => DATA.cards.filter(c => c.tier === t).length), [40, 30, 20]);
  assert.equal(DATA.nobles.length, 10); assert.equal(new Set(DATA.nobles.map(n => n.id)).size, 10);
  for (const color of COLORS) assert.equal(DATA.cards.filter(c => c.bonus === color).length, 18);
  assert.equal(DATA.nobles.filter(n => Object.values(n.cost).every(v => v === 4)).length, 5);
  assert.equal(DATA.nobles.filter(n => Object.values(n.cost).every(v => v === 3)).length, 5);
  assert.deepEqual(card('black-5w').cost, { white: 5 });
  assert.ok(DATA.nobles.some(n => n.cost.white === 4 && n.cost.blue === 4));
});
for (const players of [2, 3, 4]) test(`setup for ${players} players respects component counts and selected first player`, () => {
  const s = createGame({ players, seed: 'setup', firstPlayer: players - 1 });
  assert.deepEqual(s.decks.map(d => d.length), [36, 26, 16]);
  assert.equal(s.nobles.length, players + 1); assert.equal(s.bank.gold, 5);
  assert.equal(s.bank.white, [4, 5, 7][players - 2]); assert.equal(s.currentPlayer, players - 1);
  assertInvariants(s);
});
test('seeded games and move replay reproduce exactly', () => {
  const setup = { seed: 'repro', players: 3, firstPlayer: 2 };
  const s = createGame(setup); assert.deepEqual(createGame(setup), s);
  assert.notDeepEqual(createGame({ ...setup, seed: 'other' }).market, s.market);
  const next = take(s, { white: 1, blue: 1, green: 1 });
  assert.deepEqual(replay(replayRecord(next)), next); assert.equal(s.players[2].tokens.white, 0);
});
test('taking two of a color checks bank BEFORE taking; taking gold is never allowed', () => {
  let s = take(createGame(), { white: 2 }); assert.equal(s.bank.white, 2);
  assert.throws(() => take(s, { white: 2 }));
  assert.throws(() => take(s, { gold: 1, red: 1, blue: 1 }));
  assert.throws(() => take(s, { red: 3 }));
  assert.throws(() => take(s, { red: 1 }));
});
test('different-color shortage uses number of nonempty colors, not total token count', () => {
  const s = createGame({ players: 2 });
  for (const c of ['white', 'blue', 'green']) { grantTokens(s, 0, { [c]: 2 }); grantTokens(s, 1, { [c]: 2 }); }
  assert.equal(s.bank.red + s.bank.black, 8);
  const next = take(s, { red: 1, black: 1 }); assert.equal(next.currentPlayer, 1); assertInvariants(next);
  assert.throws(() => take(s, { red: 1 }));
});
test('one remaining gem color permits one gem, without allowing a voluntary short take', () => {
  const s = createGame({ players: 3 });
  for (const c of ['white', 'blue', 'green', 'red']) { grantTokens(s, 1, { [c]: 2 }); grantTokens(s, 2, { [c]: 2 }); grantTokens(s, 0, { [c]: 1 }); }
  const next = take(s, { black: 1 }); assertInvariants(next);
});
test('ten-token cap permits taking then returning, including just-taken gems', () => {
  const s = createGame({ players: 4 });
  grantTokens(s, 0, { white: 2, blue: 2, green: 2, red: 2, black: 2 });
  const next = take(s, { white: 1, blue: 1, green: 1 });
  assert.equal(next.phase, 'return'); assert.equal(next.currentPlayer, 0);
  assert.equal(next.players[0].turns, 0); assert.equal(Object.values(next.players[0].tokens).reduce((a, b) => a + b), 13);
  assert.throws(() => take(next, { red: 2 }));
  assert.throws(() => step(next, { type: 'return', tokens: { white: 1 } }));
  const done = step(next, { type: 'return', tokens: { white: 1, blue: 1, green: 1 } });
  assert.equal(done.currentPlayer, 1); assertInvariants(done);
});
test('public reservation replaces its market slot and gets gold; third is final allowed reservation', () => {
  const s = createGame(), id = s.market[0][0], replacement = s.decks[0][0];
  const next = step(s, { type: 'reserve', card: id });
  assert.deepEqual(next.players[0].reserved, [id]); assert.equal(next.market[0][0], replacement);
  assert.equal(next.players[0].tokens.gold, 1); assertInvariants(next);
  for (const extra of next.decks[0].slice(0, 2)) { remove(next, extra); next.players[0].reserved.push(extra); }
  next.currentPlayer = 0;
  assert.equal(legalActions(next).filter(a => a.type === 'reserve').length, 0);
});
test('blind reservation is available without gold and never leaks identity or seed', () => {
  const s = createGame(); grantTokens(s, 1, { gold: 5 }); const id = s.decks[2][0];
  const next = step(s, { type: 'reserve', tier: 3 });
  assert.equal(next.players[0].reserved[0], id); assert.equal(next.players[0].tokens.gold, 0);
  assert.equal(observe(next, 0).players[0].reserved[0], id);
  assert.deepEqual(observe(next, 1).players[0].reserved, [null]);
  const publicState = observe(next);
  assert.equal(JSON.stringify(publicState).includes(id), false);
  assert.equal('seed' in publicState, false); assert.equal('moves' in publicState, false);
  assert.ok(publicState.decks.every(Number.isInteger)); assertInvariants(next);
});
test('reservation at ten tokens receives gold and permits returning that same gold', () => {
  const s = createGame({ players: 4 }); grantTokens(s, 0, { white: 2, blue: 2, green: 2, red: 2, black: 2 });
  const next = step(s, { type: 'reserve', tier: 1 }); assert.equal(next.phase, 'return');
  const done = step(next, { type: 'return', tokens: { gold: 1 } }); assert.equal(done.bank.gold, 5); assertInvariants(done);
});
test('purchases use discounts; all exact gold substitution choices are available', () => {
  const s = createGame(); const id = 'black-4b'; expose(s, id);
  grantBonuses(s, 0, { blue: 2 }); grantTokens(s, 0, { blue: 2, gold: 2 });
  const options = payments(s.players[0], id); assert.equal(options.length, 3);
  const payment = options.find(p => p.gold === 2);
  const next = step(s, { type: 'buy', card: id, payment });
  assert.equal(next.players[0].tokens.blue, 2); assert.equal(next.players[0].tokens.gold, 0);
  assert.equal(next.players[0].purchased.includes(id), true); assert.equal(score(next.players[0]), 1); assertInvariants(next);
});
test('a reserved card can be bought for free with bonuses and frees a reservation slot', () => {
  const s = createGame(); const id = 'black-3g'; remove(s, id); s.players[0].reserved.push(id);
  grantBonuses(s, 0, { green: 3 });
  const next = step(s, { type: 'buy', card: id, payment: {} });
  assert.equal(next.players[0].reserved.length, 0); assert.equal(bonuses(next.players[0]).black, 1); assertInvariants(next);
});
test('depleted decks leave an empty market slot; empty decks cannot be blind-reserved', () => {
  const s = createGame(); const ids = [...s.decks[2]];
  for (const id of ids) grantCard(s, 1, id);
  const id = s.market[2][0];
  assert.equal(legalActions(s).some(a => a.type === 'reserve' && a.tier === 3), false);
  const next = step(s, { type: 'reserve', card: id }); assert.equal(next.market[2][0], null); assertInvariants(next);
});
test('multiple nobles require exactly one choice, after every type of action', () => {
  const s = createGame({ players: 3 });
  s.nobles = ['noble-4w4b', 'noble-4b4g', 'noble-4r4B', 'noble-4g4r'];
  grantBonuses(s, 0, { white: 4, blue: 4, green: 4 });
  const next = take(s, { white: 1, blue: 1, green: 1 });
  assert.equal(next.phase, 'noble'); assert.equal(next.currentPlayer, 0); assert.equal(next.players[0].turns, 0);
  assert.equal(legalActions(next).length, 2);
  const done = step(next, { type: 'noble', noble: 'noble-4b4g' });
  assert.deepEqual(done.players[0].nobles, ['noble-4b4g']); assert.equal(done.currentPlayer, 1);
  assert.ok(done.nobles.includes('noble-4w4b')); assertInvariants(done);
});
test('a single noble visit is automatic and cannot be bought using tokens', () => {
  const s = createGame(); s.nobles = ['noble-4w4b', 'noble-4r4B', 'noble-4g4r'];
  grantBonuses(s, 0, { white: 4, blue: 4 });
  const next = step(s, { type: 'reserve', tier: 1 });
  assert.deepEqual(next.players[0].nobles, ['noble-4w4b']); assert.equal(score(next.players[0]), 3); assertInvariants(next);
  const plain = createGame(); grantTokens(plain, 0, { white: 4, blue: 4 });
  assert.throws(() => step(plain, { type: 'noble', noble: 'noble-4w4b' }));
});
test('noble gained by a purchase counts toward 15 and triggers the final round', () => {
  const s = createGame(); s.nobles = ['noble-4w4b', 'noble-4r4B', 'noble-4g4r'];
  grantBonuses(s, 0, { white: 3, blue: 4 });
  for (const c of DATA.cards.filter(c => c.points === 4).slice(0, 3)) grantCard(s, 0, c.id);
  const target = DATA.cards.find(c => c.bonus === 'white' && c.points === 0 && !s.players[0].purchased.includes(c.id));
  expose(s, target.id);
  const b = bonuses(s.players[0]);
  grantTokens(s, 0, Object.fromEntries(COLORS.map(c => [c, Math.max(0, (target.cost[c] || 0) - b[c])])));
  const action = legalActions(s).find(a => a.type === 'buy' && a.card === target.id);
  const next = step(s, action); assert.ok(score(next.players[0]) >= 15); assert.equal(next.finalRound, true); assert.equal(next.phase, 'action'); assertInvariants(next);
});
test('last round continues until the player before selected first player, then shares complete ties', () => {
  const s = createGame({ players: 2, firstPlayer: 1 });
  const fives = DATA.cards.filter(c => c.points === 5), fours = DATA.cards.filter(c => c.points === 4);
  for (const p of [0, 1]) { grantCard(s, p, fives[p].id); grantCard(s, p, fours[p * 2].id); grantCard(s, p, fours[p * 2 + 1].id); grantCard(s, p, DATA.cards.find(c => c.points === 2 && !s.players.some(p => p.purchased.includes(c.id))).id); }
  let next = take(s, { white: 1, blue: 1, green: 1 });
  assert.equal(next.finalRound, true); assert.equal(next.phase, 'action'); assert.equal(next.currentPlayer, 0);
  next = take(next, { white: 1, blue: 1, green: 1 });
  assert.equal(next.phase, 'ended'); assert.deepEqual(next.winners, [0, 1]); assert.deepEqual(next.players.map(p => p.turns), [1, 1]);
  assert.equal(legalActions(next).length, 0); assertInvariants(next);
});
test('equal prestige is broken by fewer purchased cards; reserved cards do not count', () => {
  const s = createGame();
  for (let p = 0; p < 2; p++) {
    for (const points of [5, 4, 4, 2]) grantCard(s, p, DATA.cards.find(c => c.points === points && !s.players.some(q => q.purchased.includes(c.id))).id);
  }
  grantCard(s, 1, DATA.cards.find(c => c.points === 0).id);
  for (const id of s.decks[0].slice(0, 3)) { remove(s, id); s.players[0].reserved.push(id); }
  const next = take(take(s, { white: 1, blue: 1, green: 1 }), { white: 1, blue: 1, green: 1 });
  assert.deepEqual(next.winners, [0]); assertInvariants(next);
});
test('invalid actions do not mutate state or permit forged card costs or negative quantities', () => {
  const s = createGame(), original = structuredClone(s);
  for (const action of [{ type: 'pass' }, { type: 'take', tokens: { red: -1, blue: 2 } }, { type: 'take', tokens: { red: 1.5 } }, { type: 'buy', card: s.market[2][0], payment: {}, cost: {}, points: 99 }, { type: 'reserve', card: 'fake' }, { type: 'reserve', tier: 1, card: s.market[0][0] }]) assert.throws(() => step(s, action));
  assert.throws(() => step(s, legalActions(s)[0], 1)); assert.deepEqual(s, original);
});
test('observation objects are detached from authoritative state', () => {
  const s = createGame(), o = observe(s, 0); o.bank.gold = 999; o.market[0][0] = 'fake';
  assert.equal(s.bank.gold, 5); assert.notEqual(s.market[0][0], 'fake');
});
