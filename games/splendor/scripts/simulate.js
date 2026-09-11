import { createGame, legalActions, step, assertInvariants, random, score, replay, replayRecord } from '../src/engine.js';
import assert from 'node:assert/strict';

const index = process.argv.indexOf('--games');
const count = index >= 0 ? Number(process.argv[index + 1]) : 30;
if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('--games 须为 1–10000');
const results = [];
for (let i = 0; i < count; i++) {
  const players = 2 + i % 3, seed = `validation-${i}`;
  const policyRandom = random(`policy-${i}`);
  let state = createGame({ players, seed, firstPlayer: i % players });
  let decisions = 0;
  while (state.phase !== 'ended' && decisions < 3000) {
    assertInvariants(state);
    const actions = legalActions(state);
    if (!actions.length) break;
    // Validation opponent only: always buys when possible, otherwise chooses any legal action.
    // It receives the legal action list, not hidden deck contents.
    const purchases = actions.filter(a => a.type === 'buy');
    const choices = purchases.length ? purchases : actions;
    state = step(state, choices[Math.floor(policyRandom() * choices.length)]);
    decisions++;
  }
  assertInvariants(state);
  assert.equal(state.phase, 'ended', `validation-${i}: unfinished at test budget; not a game-rule draw`);
  assert.deepEqual(replay(replayRecord(state)), state);
  results.push({ players, seed, decisions, rounds: state.players[0].turns, scores: state.players.map(score), winners: state.winners });
}
console.log(JSON.stringify({ games: count, completed: results.length, replayVerified: results.length, results }, null, 2));
