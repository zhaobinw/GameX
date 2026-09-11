import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { encode } from '../../../agents/splendor-rl/features.mjs';
const location = relative => fileURLToPath(new URL(relative, import.meta.url));
let child, loading, pending, metadata;
async function modelPath() {
  if (process.env.SPLENDOR_AI_MODEL) return process.env.SPLENDOR_AI_MODEL;
  const runs = path.resolve(location('../../../agents/splendor-rl/runs/'));
  try {
    const selected = JSON.parse(await readFile(path.join(runs, 'table-model.json'), 'utf8'));
    const checkpoint = path.resolve(runs, selected.checkpoint);
    if (!checkpoint.startsWith(runs + path.sep)) throw new Error('模型路径无效');
    return checkpoint;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return path.join(runs, 'knowledge-v2-dev/latest.pt');
  }
}
function receive(message) {
  if (!pending) return;
  const {resolve, reject, timer} = pending; pending = null; clearTimeout(timer);
  message.error ? reject(new Error(message.error)) : resolve(message);
}
function response() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { receive({error:'AI 响应超时，请重试'}); child?.kill(); }, 30000);
    pending = {resolve, reject, timer};
  });
}
export async function prepareAI() {
  if (metadata && child) return metadata;
  if (loading) return loading;
  loading = (async () => {
    const checkpointPath = await modelPath();
    const ready = response();
    child = spawn(process.env.SPLENDOR_AI_PYTHON || location('../../../agents/splendor-rl/.venv/bin/python'),
      ['-u', location('../../../agents/splendor-rl/infer.py'), checkpointPath], {stdio:['pipe','pipe','pipe']});
    createInterface({input:child.stdout}).on('line', line => { try { receive(JSON.parse(line)); } catch { receive({error:'AI 返回了无效数据'}); } });
    child.stderr.on('data', data => console.error(String(data)));
    child.stdin.on('error', () => receive({error:'AI 连接中断'}));
    child.on('error', () => receive({error:'AI 无法启动，请检查模型与 Python 环境'}));
    child.on('exit', () => { child = null; metadata = null; receive({error:'AI 已停止，请重试'}); });
    metadata = await ready;
    return metadata;
  })();
  try { return await loading; } finally { loading = null; }
}
export async function selectAI(observation, actions) {
  const info = await prepareAI();
  const item = encode(observation, actions, info.knowledge);
  delete item.teacher;
  const result = response();
  child.stdin.write(JSON.stringify(item)+'\n');
  const {index} = await result;
  if (!Number.isInteger(index) || !actions[index]) throw new Error('AI 返回了非法行动');
  return actions[index];
}
export function closeAI() { child?.kill(); }
process.on('exit', () => child?.kill());
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { child?.kill(); process.exit(0); });
