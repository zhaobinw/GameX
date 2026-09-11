// GameX implementation of the published Splendor base rules. No house rules.
import { readFileSync } from 'node:fs';

export const DATA = JSON.parse(readFileSync(new URL('../data/base-game.json', import.meta.url)));
export const COLORS = ['white', 'blue', 'green', 'red', 'black'];
export const TOKENS = [...COLORS, 'gold'];
const cards = new Map(DATA.cards.map(c => [c.id, c]));
const nobles = new Map(DATA.nobles.map(n => [n.id, n]));
export const card = id => cards.get(id);
export const noble = id => nobles.get(id);
const emptyTokens = () => Object.fromEntries(TOKENS.map(c => [c, 0]));
const total = values => Object.values(values).reduce((a, b) => a + b, 0);
const requireRule = (ok, message) => { if (!ok) throw new Error(message); };

// Versioned deterministic PRNG. This is only a shuffle mechanism, never an AI observation.
export function random(seed) {
  let a = 2166136261;
  for (const c of String(seed)) { a ^= c.charCodeAt(0); a = Math.imul(a, 16777619); }
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(values, rng) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createGame({ players = 2, seed = 'splendor', firstPlayer = 0 } = {}) {
  requireRule(Number.isInteger(players) && players >= 2 && players <= 4, '人数须为 2–4');
  requireRule(Number.isInteger(firstPlayer) && firstPlayer >= 0 && firstPlayer < players, '先手座位无效');
  const rng = random(seed);
  const decks = [1, 2, 3].map(t => shuffle(DATA.cards.filter(c => c.tier === t).map(c => c.id), rng));
  const market = decks.map(d => d.splice(0, 4));
  return {
    version: 1, seed: String(seed), firstPlayer, currentPlayer: firstPlayer,
    players: Array.from({ length: players }, (_, id) => ({ id, tokens: emptyTokens(), purchased: [], reserved: [], nobles: [], turns: 0 })),
    bank: Object.fromEntries(TOKENS.map(c => [c, c === 'gold' ? 5 : [4, 5, 7][players - 2]])),
    decks, market, nobles: shuffle(DATA.nobles.map(n => n.id), rng).slice(0, players + 1),
    phase: 'action', finalRound: false, winners: [], log: [], moves: []
  };
}
export function bonuses(player) {
  return Object.fromEntries(COLORS.map(c => [c, player.purchased.filter(id => card(id).bonus === c).length]));
}
export function score(player) {
  return player.purchased.reduce((s, id) => s + card(id).points, 0) + player.nobles.reduce((s, id) => s + noble(id).points, 0);
}
function costAfterBonus(player, id) {
  const b = bonuses(player), c = card(id);
  return Object.fromEntries(COLORS.map(color => [color, Math.max(0, (c.cost[color] || 0) - b[color])]));
}

// Enumerate all legal payments, including voluntarily substituting gold for owned gems.
export function payments(player, id) {
  const cost = costAfterBonus(player, id), result = [];
  function visit(i, payment, gold) {
    if (gold > player.tokens.gold) return;
    if (i === COLORS.length) { result.push({ ...payment, gold }); return; }
    const c = COLORS[i];
    for (let n = Math.min(cost[c], player.tokens[c]); n >= 0; n--) {
      visit(i + 1, { ...payment, [c]: n }, gold + cost[c] - n);
    }
  }
  visit(0, {}, 0);
  return result;
}
function selections(colors, size) {
  if (size === 0) return [[]];
  return colors.flatMap((c, i) => selections(colors.slice(i + 1), size - 1).map(rest => [c, ...rest]));
}
function returns(tokens, count) {
  const result = [];
  function visit(i, remaining, selected) {
    if (i === TOKENS.length) { if (!remaining) result.push(selected); return; }
    const c = TOKENS[i];
    for (let n = 0; n <= Math.min(tokens[c], remaining); n++) visit(i + 1, remaining - n, { ...selected, [c]: n });
  }
  visit(0, count, {});
  return result;
}
function eligibleNobles(state) {
  const b = bonuses(state.players[state.currentPlayer]);
  return state.nobles.filter(id => COLORS.every(c => b[c] >= (noble(id).cost[c] || 0)));
}

export function legalActions(state, playerId = state.currentPlayer) {
  if (state.phase === 'ended' || playerId !== state.currentPlayer) return [];
  const p = state.players[playerId];
  if (state.phase === 'return') return returns(p.tokens, total(p.tokens) - 10).map(tokens => ({ type: 'return', tokens }));
  if (state.phase === 'noble') return eligibleNobles(state).map(id => ({ type: 'noble', noble: id }));
  const actions = [], available = COLORS.filter(c => state.bank[c] > 0);
  if (available.length) {
    for (const colors of selections(available, Math.min(3, available.length))) actions.push({ type: 'take', tokens: Object.fromEntries(colors.map(c => [c, 1])) });
  }
  for (const c of COLORS) if (state.bank[c] >= 4) actions.push({ type: 'take', tokens: { [c]: 2 } });
  if (p.reserved.length < 3) {
    for (const row of state.market) for (const id of row) if (id) actions.push({ type: 'reserve', card: id });
    state.decks.forEach((d, i) => { if (d.length) actions.push({ type: 'reserve', tier: i + 1 }); });
  }
  for (const id of [...state.market.flat().filter(Boolean), ...p.reserved]) {
    for (const payment of payments(p, id)) actions.push({ type: 'buy', card: id, payment });
  }
  // No invented pass, time limit or stalemate victory. An unspecified deadlock stays unresolved.
  return actions;
}
function vector(value) {
  requireRule(value && typeof value === 'object' && !Array.isArray(value), '筹码数量无效');
  requireRule(Object.keys(value).every(c => TOKENS.includes(c)), '筹码颜色无效');
  requireRule(Object.values(value).every(n => Number.isInteger(n) && n >= 0), '筹码数量须为非负整数');
  return TOKENS.map(c => value[c] || 0).join(',');
}
function actionKey(a) {
  requireRule(a && typeof a === 'object' && !Array.isArray(a), '行动无效');
  if (a.type === 'take' || a.type === 'return') return `${a.type}:${vector(a.tokens)}`;
  if (a.type === 'buy') return `buy:${a.card}:${vector(a.payment)}`;
  if (a.type === 'reserve') {
    requireRule(Boolean(a.card) !== (a.tier !== undefined), '预留目标须为一张牌或一个牌堆');
    return a.card ? `reserve:${a.card}` : `reserve-tier:${a.tier}`;
  }
  if (a.type === 'noble') return `noble:${a.noble}`;
  throw new Error('未知行动');
}
function transfer(state, p, tokens, direction) {
  for (const c of TOKENS) {
    const n = (tokens[c] || 0) * direction;
    p.tokens[c] += n; state.bank[c] -= n;
  }
}
function removeMarket(state, id) {
  const tier = card(id).tier - 1, index = state.market[tier].indexOf(id);
  requireRule(index >= 0, '卡牌不在市场');
  state.market[tier][index] = state.decks[tier].shift() || null;
}
function receive(state, id) {
  state.players[state.currentPlayer].nobles.push(id);
  state.nobles.splice(state.nobles.indexOf(id), 1);
  state.log.push({ player: state.currentPlayer, type: 'visit', noble: id });
}
function endTurn(state) {
  const p = state.players[state.currentPlayer];
  p.turns++;
  if (score(p) >= 15) state.finalRound = true;
  const next = (state.currentPlayer + 1) % state.players.length;
  if (state.finalRound && next === state.firstPlayer) {
    state.phase = 'ended';
    const bestScore = Math.max(...state.players.map(score));
    const contenders = state.players.filter(p => score(p) === bestScore);
    const fewest = Math.min(...contenders.map(p => p.purchased.length));
    state.winners = contenders.filter(p => p.purchased.length === fewest).map(p => p.id);
  } else { state.phase = 'action'; state.currentPlayer = next; }
}
function afterAction(state) {
  if (total(state.players[state.currentPlayer].tokens) > 10) { state.phase = 'return'; return; }
  const eligible = eligibleNobles(state);
  if (eligible.length > 1) { state.phase = 'noble'; return; }
  if (eligible.length === 1) receive(state, eligible[0]);
  endTurn(state);
}

// Atomic immutable transition. The caller supplies only IDs and quantities; never prices or points.
export function step(state, action, playerId = state.currentPlayer) {
  requireRule(playerId === state.currentPlayer && state.phase !== 'ended', '当前不能行动');
  const key = actionKey(action);
  const accepted = legalActions(state).find(a => actionKey(a) === key);
  requireRule(accepted, '不符合当前阶段的官方基础规则');
  const next = structuredClone(state), p = next.players[playerId];
  next.moves.push({ player: playerId, action: structuredClone(accepted) });
  next.log.push({ player: playerId, ...structuredClone(accepted) });
  switch (accepted.type) {
    case 'take': transfer(next, p, accepted.tokens, 1); afterAction(next); break;
    case 'return': transfer(next, p, accepted.tokens, -1); afterAction(next); break;
    case 'noble': receive(next, accepted.noble); endTurn(next); break;
    case 'reserve': {
      let id = accepted.card;
      if (id) removeMarket(next, id);
      else id = next.decks[accepted.tier - 1].shift();
      p.reserved.push(id);
      if (next.bank.gold) transfer(next, p, { gold: 1 }, 1);
      afterAction(next); break;
    }
    case 'buy': {
      transfer(next, p, accepted.payment, -1);
      const index = p.reserved.indexOf(accepted.card);
      if (index >= 0) p.reserved.splice(index, 1);
      else removeMarket(next, accepted.card);
      p.purchased.push(accepted.card);
      afterAction(next); break;
    }
  }
  return next;
}

// Engine state is privileged. This projection is the boundary for UI and future AI agents.
export function observe(state, viewer = null) {
  requireRule(viewer === null || Number.isInteger(viewer) && viewer >= 0 && viewer < state.players.length, '观察座位无效');
  return {
    version: state.version, currentPlayer: state.currentPlayer, firstPlayer: state.firstPlayer,
    phase: state.phase, finalRound: state.finalRound, winners: [...state.winners],
    bank: { ...state.bank }, market: structuredClone(state.market), nobles: [...state.nobles],
    decks: state.decks.map(d => d.length),
    players: state.players.map(p => ({ ...structuredClone(p), reserved: p.id === viewer ? [...p.reserved] : p.reserved.map(() => null), bonuses: bonuses(p), score: score(p) })),
    // Previously public market reservations remain knowable in history; blind card identities never enter it.
    log: structuredClone(state.log)
  };
}
export function replay(record) {
  requireRule(record.version === 1, '不支持的复盘版本');
  let state = createGame(record.setup);
  for (const move of record.moves) state = step(state, move.action, move.player);
  return state;
}
export function replayRecord(state) {
  return { version: 1, setup: { players: state.players.length, seed: state.seed, firstPlayer: state.firstPlayer }, moves: structuredClone(state.moves) };
}
export function assertInvariants(state) {
  const ids = [...state.decks.flat(), ...state.market.flat().filter(Boolean), ...state.players.flatMap(p => [...p.purchased, ...p.reserved])];
  requireRule(ids.length === 90 && new Set(ids).size === 90 && ids.every(id => cards.has(id)), '发展卡守恒失败');
  const ns = [...state.nobles, ...state.players.flatMap(p => p.nobles)];
  requireRule(ns.length === state.players.length + 1 && new Set(ns).size === ns.length && ns.every(id => nobles.has(id)), '贵族守恒失败');
  for (const c of TOKENS) {
    const values = [state.bank[c], ...state.players.map(p => p.tokens[c])];
    requireRule(values.every(n => Number.isInteger(n) && n >= 0), '筹码数量无效');
    requireRule(values.reduce((a, b) => a + b, 0) === (c === 'gold' ? 5 : [4, 5, 7][state.players.length - 2]), '筹码守恒失败');
  }
  state.players.forEach(p => {
    requireRule(p.reserved.length <= 3, '预留上限失败');
    requireRule(total(p.tokens) <= 10 || state.phase === 'return' && p.id === state.currentPlayer, '筹码上限失败');
  });
  requireRule(state.market.every((row, i) => row.length === 4 && (state.decks[i].length === 0 || row.every(Boolean))), '市场补牌失败');
  return true;
}
