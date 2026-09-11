import { purchaseGuide, tokenSummary, GEM_COLORS } from './purchase-guide.js';
import { TableAudio } from './table-audio.js';
const $ = selector => document.querySelector(selector);
const colors = ['white', 'blue', 'green', 'red', 'black', 'gold'];
const names = { white: '白', blue: '蓝', green: '绿', red: '红', black: '黑', gold: '金' };
let catalog, state, actions = [], revision, viewer = null, selection = {}, busy = false;
const modal = $('#modal'), handoff = $('#handoff');
const sounds = new TableAudio(updateAudioControls);
const getCard = id => catalog.cards.find(c => c.id === id);
const getNoble = id => catalog.nobles.find(n => n.id === id);
const sum = values => Object.values(values).reduce((a, b) => a + b, 0);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tokenText = values => colors.filter(c => values[c]).map(c => `${names[c]}${values[c]}`).join(' · ') || '无需筹码';
const chips = values => colors.filter(c => values[c]).map(c => `<span class="chip ${c}" title="${names[c]}色 ${values[c]}">${names[c]}${values[c]}</span>`).join('') || '<span>—</span>';
function cardLabel(c) { return `${c.tier}级${names[c.bonus]}色卡，${c.points}分，费用${tokenText(c.cost)}`; }
function error(message) { $('#error').textContent = message; $('#error').hidden = false; setTimeout(() => { $('#error').hidden = true; }, 6000); }
async function request(url, data) {
  const response = await fetch(url, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败');
  return result;
}
function openModal(html) { $('#modal-body').innerHTML = html; if (!modal.open) modal.showModal(); }
function guideStatus(g) {
  if (g.totalCost === 0) return '免费购买';
  if (g.goldNeeded === 0) return '宝石已足';
  if (g.affordable) return `用黄金 ${g.goldNeeded} 可购`;
  return g.goldUsed ? `黄金可抵 ${g.goldUsed} · 还差 ${g.stillMissing}` : `还差 ${g.stillMissing} 枚`;
}
function guideMarkup(c) {
  if (viewer !== state.currentPlayer || state.phase === 'ended') return '';
  const g = purchaseGuide(c, state.players[viewer]);
  const costs = GEM_COLORS.filter(color => g.effective[color]).map(color => `<span class="chip ${color} ${g.missing[color] ? 'cost-short' : ''}" title="${names[color]}色：折扣后需 ${g.effective[color]}，缺 ${g.missing[color]}">${names[color]}${g.effective[color]}</span>`).join('');
  return `<span id="guide-${c.id}" class="card-guide ${g.affordable ? 'can-afford' : ''}"><span class="guide-label">折后费用</span><span class="effective-cost">${costs || '<strong>免费</strong>'}</span>${g.goldNeeded ? `<span class="missing-cost">缺 ${tokenText(g.missing)}</span>` : ''}<span class="guide-status">${guideStatus(g)}</span></span>`;
}
function playerTokenSummary(p) {
  const t = tokenSummary(p.tokens);
  return `<div class="token-summary ${t.excess ? 'over-limit' : t.total === 10 ? 'at-limit' : ''}" aria-label="玩家 ${p.id + 1} 共 ${t.total} 枚宝石，含黄金，上限 10 枚"><div><span>宝石总数 <small>含黄金</small></span><strong>${t.total}<small> / 10</small></strong></div><div class="token-track" aria-hidden="true"><span style="width:${Math.min(100, t.total * 10)}%"></span></div><span class="token-capacity">${t.excess ? `超出 ${t.excess} 枚 · 须归还` : t.total === 10 ? '已达上限 · 仍可先拿再归还' : `距离上限还可持有 ${t.remaining} 枚`}</span></div>`;
}
function priceBreakdown(c) {
  if (viewer !== state.currentPlayer || state.phase === 'ended') return '';
  const player = state.players[viewer], g = purchaseGuide(c, player);
  return `<table class="price-breakdown"><caption>玩家 ${viewer + 1} · 费用明细</caption><thead><tr><th>宝石</th><th>原价</th><th>折扣</th><th>应付</th><th>持有</th><th>还缺</th></tr></thead><tbody>${GEM_COLORS.filter(color => c.cost[color]).map(color => `<tr><th><span class="chip ${color}">${names[color]}</span></th><td>${c.cost[color]}</td><td>−${Math.min(c.cost[color], player.bonuses[color] || 0)}</td><td><strong>${g.effective[color]}</strong></td><td>${player.tokens[color]}</td><td class="${g.missing[color] ? 'short-number' : ''}">${g.missing[color]}</td></tr>`).join('')}</tbody></table><p class="purchase-status ${g.affordable ? 'can-afford' : ''}">${guideStatus(g)}</p><p class="hint">持有黄金 ${g.goldAvailable} 枚，可替代任意颜色。各色“还缺”在使用黄金前计算${g.goldNeeded ? `，合计需补 ${g.goldNeeded} 枚` : ''}。</p>`;
}
function cardButton(id, reserved = false) {
  if (!id) return '<div class="empty-card">牌堆已空</div>';
  const c = getCard(id), affordable = actions.some(a => a.type === 'buy' && a.card === id);
  const guide = guideMarkup(c);
  return `<div class="development-wrap"><button class="development ${affordable ? 'affordable' : ''}" data-card="${id}" aria-label="${reserved ? '预留：' : ''}${cardLabel(c)}" ${guide ? `aria-describedby="guide-${id}"` : ''}><img src="${c.image}" alt="${cardLabel(c)}" loading="eager"></button>${guide}</div>`;
}
function logText(entry) {
  const who = `玩家 ${entry.player + 1}`;
  if (entry.type === 'take') return `${who} 拿取 ${tokenText(entry.tokens)}`;
  if (entry.type === 'return') return `${who} 归还 ${tokenText(entry.tokens)}`;
  if (entry.type === 'reserve') return `${who} 预留 ${entry.card ? cardLabel(getCard(entry.card)) : `${entry.tier}级牌堆顶牌（暗牌）`}`;
  if (entry.type === 'buy') return `${who} 购买 ${cardLabel(getCard(entry.card))}`;
  if (entry.type === 'visit') return `${who} 获得贵族（${tokenText(getNoble(entry.noble).cost)}），+3 分`;
  return '';
}
function render() {
  const current = state.players[state.currentPlayer], returning = state.phase === 'return';
  const phaseText = { action: '选择一个行动', return: `归还 ${sum(current.tokens) - 10} 枚筹码`, noble: '选择一位来访贵族', ended: '对局结束' }[state.phase];
  $('#table').innerHTML = `${state.phase === 'ended' ? `<section class="winner"><h2>${state.winners.map(id => `玩家 ${id + 1}`).join('、')}${state.winners.length > 1 ? ' 共同获胜' : ' 获胜'}</h2><p>分数优先；同分时已购发展卡较少者胜，再相同则共享胜利。</p><button id="export-replay">下载复盘</button></section>` : ''}
  <div class="layout"><section class="board" aria-label="公共市场">
    ${viewer === state.currentPlayer && state.phase !== 'ended' ? `<p class="market-guide-note">按玩家 ${viewer + 1} 的发展卡折扣与持有宝石计算 · 黄金可补足缺色</p>` : ''}
    <div class="nobles" aria-label="贵族">${state.nobles.map(id => { const n = getNoble(id), eligible = actions.some(a => a.type === 'noble' && a.noble === id); return `<button class="noble-card ${eligible ? 'eligible' : ''}" data-noble="${id}" aria-label="贵族，3分，要求${tokenText(n.cost)}${eligible ? '，可选择' : ''}"><img src="${n.image}" alt="贵族：${tokenText(n.cost)}"></button>`; }).join('')}</div>
    ${[2, 1, 0].map(t => `<div class="market-row"><button class="deck" data-tier="${t + 1}" aria-label="预留${t + 1}级牌堆顶牌，剩余${state.decks[t]}张" ${actions.some(a => a.type === 'reserve' && a.tier === t + 1) ? '' : 'disabled'}><strong>${['I', 'II', 'III'][t]}</strong><span>${state.decks[t]} 张</span><span>暗抽预留</span></button>${state.market[t].map(id => cardButton(id)).join('')}</div>`).join('')}
  </section><aside class="side"><h2>${state.phase === 'ended' ? '最终牌桌' : `玩家 ${state.currentPlayer + 1} 的回合`}</h2><p class="status">${phaseText}${state.finalRound && state.phase !== 'ended' ? ' · 最后一轮' : ''}</p><h3>${returning ? '从持有筹码中归还' : '公共筹码池'}</h3>
    <div class="bank">${colors.map(c => { const count = returning ? current.tokens[c] : state.bank[c]; return `<button class="gem-button ${selection[c] ? 'selected' : ''}" data-gem="${c}" aria-label="${names[c]}色筹码，可用${count}，已选${selection[c] || 0}" ${viewer === null || (!returning && (c === 'gold' || state.phase !== 'action')) || !count ? 'disabled' : ''}><img src="${catalog.tokens[c]}" alt="${names[c]}色筹码"><span>${names[c]} · ${count}</span><small>${selection[c] ? `已选 ${selection[c]}` : '　'}</small></button>`; }).join('')}</div>
    <p class="hint">${returning ? '可归还原有或刚拿到的筹码，包括黄金。' : '拿 3 色各 1 枚，或从至少 4 枚的一色中拿 2 枚。黄金通过预留获得。'}</p>
    <p class="hint" aria-live="polite">已选 ${sum(selection)} 枚${returning ? ` / 须归还 ${sum(current.tokens) - 10} 枚` : ''}。再次点击可调整数量。</p>
    ${returning ? `<div class="token-line">牌池 ${chips(state.bank)}</div>` : ''}
    <div class="actions"><button id="confirm-tokens" class="primary" ${matchingSelection() ? '' : 'disabled'}>${returning ? '归还筹码' : '拿取筹码'}</button><button id="clear-tokens">清空选择</button></div>
    <p class="hint">${state.phase === 'noble' ? '点击上方高亮的贵族。一次回合只能获得一位。' : '点击发展卡购买或预留；点击左侧牌堆可暗抽预留。'}</p><p class="hint">持有 ${sum(current.tokens)} / 10 枚 · 预留 ${current.reserved.length} / 3 张</p>
  </aside></div>
  <section class="players" style="--players:${state.players.length}" aria-label="玩家区域">${state.players.map(p => `<article class="player ${p.id === state.currentPlayer ? 'active' : ''}"><div class="player-head"><strong>玩家 ${p.id + 1}${p.id === state.firstPlayer ? ' · 先手' : ''}</strong><span class="points">${p.score} 分</span></div>${playerTokenSummary(p)}<div class="token-line">筹码 ${chips(p.tokens)}</div><div class="token-line">折扣 ${chips(p.bonuses)}</div><button data-player="${p.id}">已购 ${p.purchased.length} 张 · 贵族 ${p.nobles.length} 位</button><div class="reserve-row">${p.reserved.map(id => id ? cardButton(id, true) : '<div class="hidden-card">预留暗牌</div>').join('')}</div></article>`).join('')}</section>
  <details class="history"><summary>对局记录 · 已完成 ${Math.min(...state.players.map(p => p.turns))} 轮</summary><ol>${state.log.map(logText).filter(Boolean).map(text => `<li>${esc(text)}</li>`).join('')}</ol></details>`;
  document.querySelectorAll('[data-card]').forEach(el => el.onclick = () => showCard(el.dataset.card));
  document.querySelectorAll('[data-tier]').forEach(el => el.onclick = () => reserveDeck(Number(el.dataset.tier)));
  document.querySelectorAll('[data-noble]').forEach(el => el.onclick = () => showNoble(el.dataset.noble));
  document.querySelectorAll('[data-player]').forEach(el => el.onclick = () => showPlayer(Number(el.dataset.player)));
  document.querySelectorAll('[data-gem]').forEach(el => el.onclick = () => {
    const c = el.dataset.gem, maximum = returning ? current.tokens[c] : Math.min(2, state.bank[c]);
    selection[c] = ((selection[c] || 0) + 1) % (maximum + 1); sounds.select(); render();
  });
  $('#confirm-tokens').onclick = () => { const action = matchingSelection(); if (action) move(action); };
  $('#clear-tokens').onclick = () => { selection = {}; render(); };
  const exportButton = $('#export-replay');
  if (exportButton) exportButton.onclick = async () => {
    try { const replay = await request('/api/replay'); const url = URL.createObjectURL(new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'splendor-replay.json'; a.click(); URL.revokeObjectURL(url); } catch (e) { error(e.message); }
  };
  document.querySelectorAll('img').forEach(img => img.onerror = () => { img.onerror = null; img.alt = '原图未加载'; error('经典版素材未加载，请在项目目录运行 npm run assets。'); });
}
function matchingSelection() {
  const type = state.phase === 'return' ? 'return' : 'take';
  return actions.find(a => a.type === type && colors.every(c => (a.tokens[c] || 0) === (selection[c] || 0)));
}
async function refresh() {
  const result = await request('/api/state' + (viewer === null ? '' : `?viewer=${viewer}`));
  state = result.state; actions = result.actions; revision = result.revision;
  if (state.phase !== 'ended' && viewer !== state.currentPlayer) {
    viewer = null; actions = [];
    state.players.forEach(p => { p.reserved = p.reserved.map(() => null); });
    $('#handoff-title').textContent = `轮到玩家 ${state.currentPlayer + 1}`;
    if (!handoff.open) handoff.showModal();
  }
  render();
}
async function move(action) {
  if (busy) return { ok: false, error: '上一步仍在处理中' }; busy = true;
  try {
    const before = state;
    await request('/api/move', { action, player: viewer, revision });
    if (modal.open) modal.close(); selection = {};
    await refresh();
    const marketTier = action.card ? before.market.findIndex(row => row.includes(action.card)) : -1;
    sounds.action(action, {
      goldTaken: action.type === 'reserve' && before.bank.gold > 0,
      refilled: marketTier >= 0 && before.decks[marketTier] > 0,
      nobleVisited: state.log.slice(before.log.length).some(entry => entry.type === 'visit'),
    });
    return { ok: true, revision, currentPlayer: state.currentPlayer, phase: state.phase };
  } catch (e) { error(e.message); await refresh(); return { ok: false, error: e.message }; }
  finally { busy = false; }
}
function showCard(id) {
  const c = getCard(id), buying = actions.filter(a => a.type === 'buy' && a.card === id), reserving = actions.find(a => a.type === 'reserve' && a.card === id);
  openModal(`<div class="card-detail"><img src="${c.image}" alt="${cardLabel(c)}"><div><h2>${c.tier}级 · ${names[c.bonus]}色发展卡</h2><p>${c.points} 声望 · 永久${names[c.bonus]}色折扣 +1</p><div class="payment">原价 ${chips(c.cost)}</div>${priceBreakdown(c)}${buying.length ? `<label>支付方式<select id="payment-choice" aria-label="支付方式">${buying.map((a, i) => `<option value="${i}">${tokenText(a.payment)}</option>`).join('')}</select></label><button class="primary" id="buy-card">购买</button>` : '<p class="hint">当前不能购买</p>'}${reserving ? `<p><button id="reserve-card">预留${state.bank.gold ? '并拿 1 枚黄金' : '（黄金已空）'}</button></p>` : ''}</div></div>`);
  if ($('#buy-card')) $('#buy-card').onclick = () => move(buying[Number($('#payment-choice').value)]);
  if ($('#reserve-card')) $('#reserve-card').onclick = () => move(reserving);
}
function reserveDeck(tier) {
  const action = actions.find(a => a.type === 'reserve' && a.tier === tier);
  if (!action) return;
  openModal(`<h2>预留 ${tier} 级牌堆顶牌</h2><p>只有你能查看这张牌。预留后只能通过购买将它移出手牌。</p><button id="reserve-blind" class="primary">确认暗抽预留${state.bank.gold ? '并拿 1 枚黄金' : ''}</button>`);
  $('#reserve-blind').onclick = () => move(action);
}
function showNoble(id) {
  const n = getNoble(id), action = actions.find(a => a.type === 'noble' && a.noble === id);
  openModal(`<div class="card-detail"><img src="${n.image}" alt="贵族"><div><h2>贵族 · 3 声望</h2><p>需要已购发展卡提供以下折扣，不消耗卡牌或筹码。</p><div class="payment">${chips(n.cost)}</div>${action ? '<button id="choose-noble" class="primary">选择这位贵族</button>' : ''}</div></div>`);
  if (action) $('#choose-noble').onclick = () => move(action);
}
function showPlayer(id) {
  const p = state.players[id];
  openModal(`<h2>玩家 ${id + 1} · ${p.score} 分</h2><p>已购买 ${p.purchased.length} 张发展卡</p><div class="modal-grid">${p.purchased.map(cid => { const c = getCard(cid); return `<img src="${c.image}" alt="${cardLabel(c)}">`; }).join('')}</div><p>已获得 ${p.nobles.length} 位贵族</p><div class="modal-grid">${p.nobles.map(nid => `<img src="${getNoble(nid).image}" alt="贵族 ${tokenText(getNoble(nid).cost)}">`).join('')}</div>`);
}
$('#close-modal').onclick = () => modal.close();
handoff.addEventListener('cancel', e => e.preventDefault());
$('#ready').onclick = async () => { viewer = state.currentPlayer; handoff.close(); try { await refresh(); } catch (e) { error(e.message); } };
$('#new-button').onclick = () => {
  openModal('<h2>新对局</h2><p>按顺时针安排座位，选择最年轻玩家作为先手。开始后将替换当前本地对局。</p><label>人数<select id="player-count"><option>2</option><option>3</option><option>4</option></select></label><label>先手<select id="first-player"><option value="0">玩家 1</option><option value="1">玩家 2</option></select></label><button id="start-new" class="primary">开始新对局</button>');
  $('#player-count').onchange = () => { $('#first-player').innerHTML = Array.from({ length: Number($('#player-count').value) }, (_, i) => `<option value="${i}">玩家 ${i + 1}</option>`).join(''); };
  $('#start-new').onclick = async () => {
    try { await request('/api/new', { players: Number($('#player-count').value), firstPlayer: Number($('#first-player').value), revision }); viewer = null; selection = {}; modal.close(); await refresh(); sounds.action({ type: 'new' }); } catch (e) { error(e.message); }
  };
};
$('#rules-button').onclick = () => openModal(`<h2>经典基础版</h2><p>每回合执行一次拿筹码、预留或购买。超过 10 枚须归还；满足多个贵族条件时只选择一位。达到 15 分触发最后一轮，所有玩家回合数相同后结算。</p><p>这是同机轮流的本地研究环境。换人时请交接屏幕；服务重启会清除当前对局。</p><p><a href="https://cdn.svc.asmodee.net/production-unboxnowcom/uploads/2022/02/Splendor-EN.pdf" target="_blank" rel="noreferrer">经典版官方规则（英文）</a></p><p><a href="https://github.com/roeey777/Splendor-AI" target="_blank" rel="noreferrer">卡牌数据与经典版图片来源</a>。原画归原权利人；第三方仓库标注 MIT，未附出版商原画授权说明。</p><p>开发者 Marc André · 插画 Pascal Quidault · 出版 SPACE Cowboys。本项目非官方产品。</p>`);
function updateAudioControls() {
  $('#sound-toggle').textContent = sounds.enabled ? '音效已开启' : '音效已静音';
  $('#sound-toggle').setAttribute('aria-pressed', String(sounds.enabled));
  $('#sound-volume').value = Math.round(sounds.volume * 100);
  $('#sound-level').textContent = `${Math.round(sounds.volume * 100)}%`;
  $('#sound-preview').disabled = !sounds.enabled || sounds.volume === 0;
  $('#sound-status').textContent = sounds.failure ? '部分音效未加载，可刷新后重试。' : sounds.buffers.size === 14 ? '音效就绪 · 筹码碰撞与纸牌摩擦' : '筹码碰撞与纸牌摩擦';
}
document.addEventListener('pointerdown', () => sounds.unlock(), { capture: true });
document.addEventListener('keydown', () => sounds.unlock(), { capture: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) sounds.stop(); });
$('#sound-toggle').onclick = () => { sounds.setEnabled(!sounds.enabled); if (sounds.enabled) sounds.unlock(); };
$('#sound-volume').oninput = event => sounds.setVolume(Number(event.target.value) / 100);
$('#sound-preview').onclick = () => { sounds.unlock(); sounds.action({ type: 'buy', payment: { white: 2, blue: 1 } }); };
updateAudioControls();
try { catalog = await request('/api/catalog'); await refresh(); } catch (e) { $('#table').textContent = '牌桌暂时无法加载。'; error(e.message); }

// These tools use the visible seat and cannot open the handoff curtain or inspect deck order.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const definitions = [
    {
      name: 'read_splendor_table', title: '读取璀璨宝石牌桌',
      description: 'Read the currently visible table and legal actions. Reserved cards are visible only for the seat whose handoff curtain has been opened. This does not start a turn.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute(input) {
        if (!input || typeof input !== 'object' || Object.keys(input).length) throw new Error('此工具不接受参数');
        return structuredClone({ revision, viewer, state, actions });
      }
    },
    {
      name: 'play_splendor_action', title: '执行璀璨宝石行动',
      description: 'Commit one legal action by its zero-based index from read_splendor_table at the same revision. Updates the visible table and may end the turn. Requires the current player to have opened the handoff curtain.',
      inputSchema: { type: 'object', properties: { revision: { type: 'integer' }, actionIndex: { type: 'integer', minimum: 0 } }, required: ['revision', 'actionIndex'], additionalProperties: false },
      annotations: { readOnlyHint: false },
      async execute(input) {
        if (!input || Object.keys(input).some(k => !['revision', 'actionIndex'].includes(k)) || !Number.isInteger(input.actionIndex) || input.actionIndex < 0 || input.revision !== revision || !actions[input.actionIndex] || viewer === null || handoff.open) throw new Error('行动无效、棋局已变化，或尚未交接回合');
        const result = await move(actions[input.actionIndex]);
        if (!result.ok) throw new Error(result.error);
        return result;
      }
    }
  ];
  for (const definition of definitions) {
    try { Promise.resolve(document.modelContext.registerTool(definition, { signal: lifecycle.signal })).catch(e => console.warn('WebMCP registration failed:', e.message)); }
    catch (e) { console.warn('WebMCP unavailable:', e.message); }
  }
}
