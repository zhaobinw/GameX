// Retrieve unmodified upstream images into a local ignored cache, pinned by SHA-256.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'data/assets-manifest.json'), 'utf8'));
const base = `https://raw.githubusercontent.com/roeey777/Splendor-AI/${manifest.commit}/${manifest.prefix}`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let cursor = 0, downloaded = 0, cached = 0;
async function worker() {
  while (cursor < manifest.assets.length) {
    const asset = manifest.assets[cursor++];
    const target = path.join(root, 'web/assets/classic', asset.path);
    try { if (digest(await readFile(target)) === asset.sha256) { cached++; continue; } } catch {}
    const response = await fetch(base + asset.path, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${asset.path}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== asset.sha256 || bytes.length !== asset.bytes) throw new Error(`素材校验失败: ${asset.path}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes); downloaded++;
  }
}
const results = await Promise.allSettled(Array.from({ length: 4 }, worker));
const failures = results.filter(r => r.status === 'rejected');
if (failures.length) { failures.forEach(r => console.error(r.reason.message)); process.exitCode = 1; }
else console.log(`经典素材校验通过：${cached} 已缓存，${downloaded} 已下载，共 ${manifest.assets.length} 项。来源与权利说明见 third_party/NOTICE.md。`);
