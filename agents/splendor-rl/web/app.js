const $=s=>document.querySelector(s),names={white:'白',blue:'蓝',green:'绿',red:'红',black:'黑',gold:'金'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog,frames=[],frame=0,timer=null,selected='',replayKey='';
const phaseNames={pretraining:'攻略预训练',starting:'准备中',collecting:'并行对弈',optimizing:'更新模型',evaluating:'独立评估',checkpoint_saved:'模型已保存',complete:'已完成',stopped:'已停止',failed:'失败'};
async function api(path,data){const r=await fetch(path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const v=await r.json();if(!r.ok)throw Error(v.error||'请求失败');return v;}
const displayLabel=s=>s.replace(/old0/g,'初始模型').replace(/old(\d+)/g,'历史对手 $1').replace(/current/g,'当前模型').replace(/greedy/g,'贪心基线').replace(/teacher/g,'攻略教师');
const pct=x=>x===null||x===undefined?'—':`${(x*100).toFixed(1)}%`;
const tokens=t=>Object.entries(t).filter(([,n])=>n).map(([c,n])=>`<span class="token ${c}">${names[c]}${n}</span>`).join('')||'—';
const card=id=>catalog.cards.find(c=>c.id===id),noble=id=>catalog.nobles.find(n=>n.id===id);
const picture=c=>c?`<img src="/game/${esc(c.image.replace(/^\//,''))}" alt="${c.tier?`${c.tier}级${names[c.bonus]}色卡，${c.points}分`:'贵族，3分'}">`:'<span>空</span>';
function pause(){clearInterval(timer);timer=null;$('#play').textContent='播放';}
function renderFrame(){
 if(!frames.length)return;const s=frames[frame];$('#timeline').value=frame;$('#frame-label').textContent=`${frame} / ${frames.length-1}`;
 const e=s.log.at(-1),who=e?`玩家 ${e.player+1}`:'';
 $('#event').textContent=frame===0?'开局':e?.type==='take'?`${who} 拿取筹码`:e?.type==='buy'?`${who} 购买${names[card(e.card).bonus]}色发展卡`:e?.type==='reserve'?`${who} 预留${e.card?'市场卡':'暗牌'}`:e?.type==='return'?`${who} 归还筹码`:e?.type==='visit'?`${who} 获得贵族，增加 3 分`:'行动完成';
 if(s.phase==='ended')$('#event').textContent+=` · 终局，玩家 ${s.winners.map(p=>p+1).join('、')} 获胜`;
 $('#board').innerHTML=`<div class="nobles"><span>公共贵族</span>${s.nobles.map(id=>picture(noble(id))).join('')}</div><div class="market">${[2,1,0].map(t=>`<div class="tier"><h3>${['I','II','III'][t]} 级 · 牌堆 ${s.decks[t]} 张</h3><div class="cards">${s.market[t].map(id=>picture(card(id))).join('')}</div></div>`).join('')}</div><p>公共筹码 ${tokens(s.bank)}</p><div class="seats">${s.players.map(p=>`<article class="seat ${p.id===s.currentPlayer?'active':''}"><h3>玩家 ${p.id+1} · ${p.score} 分 · 宝石 ${Object.values(p.tokens).reduce((a,b)=>a+b,0)} / 10</h3><div>筹码 ${tokens(p.tokens)}</div><div>发展卡折扣 ${tokens(p.bonuses)}</div><p>已购 ${p.purchased.length} 张 · 预留暗牌 ${p.reserved.length} 张</p><div class="nobles">${p.nobles.map(id=>picture(noble(id))).join('')}</div></article>`).join('')}</div>`;
}
async function loadReplay(){pause();const id=$('#replays').value;if(!id)return;const run=selected;const data=await api(`/api/replay?run=${encodeURIComponent(run)}&id=${encodeURIComponent(id)}`);if(run!==selected)return;frames=data.frames;frame=0;$('#timeline').max=frames.length-1;for(const id of ['play','previous','next','timeline'])$('#'+id).disabled=false;renderFrame();}
function resetReplay(){pause();frames=[];frame=0;replayKey='';$('#board').innerHTML='';$('#replays').innerHTML='<option value="">尚无完整对局</option>';$('#event').textContent='完成首轮采样后，此处将出现真实对局。';for(const id of ['play','previous','next','timeline'])$('#'+id).disabled=true;}
async function refresh(){
 try{
 const runs=await api('/api/runs');const wanted=selected||runs.filter(r=>r.pretrained&&r.update>0).reduce((best,r)=>r.update>(best?.update||0)?r:best,null)?.name||runs.reduce((best,r)=>(r.update||0)>(best?.update||0)?r:best,null)?.name||runs[0]?.name||'';
 $('#runs').innerHTML=runs.length?runs.map(r=>`<option value="${esc(r.name)}">${esc(r.name)}${r.pretrained?' · 攻略版':r.knowledge?' · 去先验对照':''} · ${phaseNames[r.status]||r.status}</option>`).join(''):'<option value="">暂无训练</option>';
 if(!wanted){$('#message').textContent='设置并行数和代数，然后开始训练。';return;}
 selected=wanted;$('#runs').value=selected;const run=selected;
 const s=await api(`/api/status?run=${encodeURIComponent(run)}`);if(run!==selected)return;
 $('#resume').disabled=!!s.config?.algorithm?.includes('PFSP');
 $('#resume').title=$('#resume').disabled?'联赛记录暂不支持一键续训':'';
 const rows=s.metrics||[],last=rows.at(-1);$('#phase').textContent=phaseNames[s.status]||'准备中';$('#generation').textContent=s.update||0;
 $('#games').textContent=rows.reduce((n,r)=>n+r.completed,0);$('#speed').textContent=Number.isFinite(last?.decisions_per_second)?last.decisions_per_second.toFixed(0):'—';$('#win-caption').textContent=s.config?.evaluate&&s.config?.opponent==='teacher'?'对攻略教师 · 胜局份额':s.config?.evaluate&&s.config?.opponent==='initial'?'对起点模型 · 胜局份额':'对贪心基线 · 胜局份额';$('#win').textContent=pct(last?.evaluation?.greedy?.win_share??s.evaluation?.win_share);
 $('#message').textContent=s.error||`${s.config?.algorithm?.includes('PFSP')?'多策略联赛 PPO':s.config?.teacher_policy?'手写教师评估（非神经网络）':s.config?.knowledge?'攻略预训练 + PPO':'基础 PPO'} · ${s.config?.players||2} 人对局 · ${s.config?.workers||4} 个并行环境 · ${s.config?.parameters?.toLocaleString()||'—'} 个模型参数${['complete','stopped'].includes(s.status)?(s.config?.algorithm?.includes('PFSP')?' · 可观看下方对局':' · 可继续训练或观看下方对局'):''}`;
 $('#history').innerHTML=rows.slice().reverse().map(r=>`<tr><td>${r.update}</td><td>${r.completed} / ${r.truncated ?? (r.episodes-r.completed)}</td><td>${pct(r.evaluation?.greedy?.win_share)}（${r.evaluation?.greedy?.completed ?? '—'} 局）</td><td>${pct(r.evaluation?.initial?.win_share)}</td><td>${pct(r.evaluation?.teacher?.win_share)}</td><td>${r.entropy.toFixed(3)}</td><td>${Number.isFinite(r.parameter_delta)?r.parameter_delta.toFixed(4):'—'}</td></tr>`).join('');
 const points=rows.filter(r=>Number.isFinite(r.evaluation?.greedy?.win_share)).map((r,i)=>`${10+i*480/Math.max(1,rows.length-1)},${75-r.evaluation?.greedy?.win_share*65}`).join(' ');
 $('#chart').innerHTML=points.length?`<svg viewBox="0 0 500 90" role="img" aria-label="贪心基线胜局份额趋势"><path d="M10 10V75H490" fill="none" stroke="#638478"/><polyline points="${points}" fill="none" stroke="#e2c78d" stroke-width="2"/>${points.split(' ').map(p=>`<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" fill="#e2c78d"/>`).join('')}</svg>`:'尚未完成第一代评估';
 const replays=await api(`/api/replays?run=${encodeURIComponent(run)}`);if(run!==selected)return;
 const key=run+JSON.stringify(replays);
 if(key!==replayKey){const previous=$('#replays').value;$('#replays').innerHTML=replays.length?replays.map(r=>`<option value="${r.id}">${esc(displayLabel(r.label))}</option>`).join(''):'<option value="">尚无完整对局</option>';replayKey=key;if(replays.some(r=>r.id===previous))$('#replays').value=previous;else if(replays.length){$('#replays').value=replays.at(-1).id;await loadReplay();}}
 }catch(e){$('#message').textContent=e.message;}
}
async function start(resume=false){try{const data={knowledge:$('#method').value==='knowledge',workers:Number($('#workers').value),players:Number($('#players').value),updates:Number($('#updates').value),episodes:Number($('#episodes').value)};if(resume)data.resume=selected;const r=await api('/api/start',data);selected=r.run;resetReplay();$('#message').textContent='训练已启动，正在准备模型…';}catch(e){$('#message').textContent=e.message;}}
$('#start').onclick=()=>start();$('#resume').onclick=()=>start(true);$('#stop').onclick=async()=>{try{await api('/api/stop',{run:selected});$('#message').textContent='已请求停止，将保留最近一次保存的模型。';}catch(e){$('#message').textContent=e.message;}};
$('#runs').onchange=()=>{selected=$('#runs').value;resetReplay();refresh();};$('#replays').onchange=()=>loadReplay().catch(e=>$('#message').textContent=e.message);
$('#play').onclick=()=>{if(timer){pause();return;}if(frame>=frames.length-1)frame=0;$('#play').textContent='暂停';timer=setInterval(()=>{frame=Math.min(frame+1,frames.length-1);renderFrame();if(frame===frames.length-1)pause();},Number($('#speed-select').value));};
$('#previous').onclick=()=>{pause();frame=Math.max(0,frame-1);renderFrame();};$('#next').onclick=()=>{pause();frame=Math.min(frames.length-1,frame+1);renderFrame();};$('#timeline').oninput=()=>{pause();frame=Number($('#timeline').value);renderFrame();};$('#speed-select').onchange=()=>{if(timer){pause();$('#play').click();}};
try{catalog=await api('/api/catalog');await refresh();setInterval(refresh,3000);}catch(e){$('#message').textContent=e.message;}
