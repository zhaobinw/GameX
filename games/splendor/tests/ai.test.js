import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { prepareAI, selectAI, closeAI } from '../src/ai.js';
import { createGame, observe, legalActions, step, assertInvariants } from '../src/engine.js';
after(closeAI);
const available = existsSync(new URL('../../../agents/splendor-rl/runs/knowledge-v2-dev/latest.pt', import.meta.url));
test('trained model completes a real game using only observations and legal actions', {skip:!available, timeout:30000}, async () => {
  const info = await prepareAI(); assert.equal(info.knowledge, true);
  let state = createGame({players:2, seed:'human-ai-integration-1'});
  for(let i=0;i<500 && state.phase !== 'ended';i++) {
    const actions = legalActions(state);
    const action = await selectAI(observe(state,state.currentPlayer), actions);
    assert.ok(actions.includes(action));
    state = step(state,action); assertInvariants(state);
  }
  assert.equal(state.phase,'ended');
});
