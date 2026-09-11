# Splendor · 璀璨宝石

复刻目标：**经典版基础游戏，2–4 人，Marc André 设计、Pascal Quidault 插画**。不混入 Duel、扩展、周年新版插画或自创卡牌。

已落地本地可玩环境：独立规则引擎、90 张发展卡、10 张贵族、经典版图像缓存、同机轮流界面和自动对局验证。**当前是首个可玩实现，不是已完成全部视觉细节审定的 1:1 成品。**

## 启动

需要 Node.js 20 或更高版本，无 npm 第三方运行依赖。

```bash
cd /Users/zhaobinw/GameX/games/splendor
npm run assets
npm start
```

打开 [本地牌桌](http://127.0.0.1:4173/)。首次获取素材需要网络；之后全部游戏过程可离线运行。`PORT=4174 npm start` 可使用其他端口。

“新对局”可选择 2、3、4 人及最年轻玩家的先手座位。按顺时针编号。每次交接后点击“开始我的回合”，再查看自己的预留牌。

- 点击筹码选择数量，再确认拿取；重复点击可循环调整。
- 点击发展卡，选择购买及支付方式，或预留。
- 点击牌堆按钮暗抽预留顶牌。
- 先拿筹码，超过 10 枚后在牌桌上点击手中要归还的颜色，再确认归还；确认前可取消本次拿取并改选其他行动。多个贵族满足条件时须选择一位。
- 达到 15 分会完成当前轮；对局结束后可下载完整复盘。
- 玩家面板显示宝石总数 / 10（含黄金），达到上限和需要归还时有醒目提示。
- 市场和自己的预留牌显示当前玩家的折后费用、缺少颜色及黄金补足情况；点击卡牌可查看原价、折扣、应付、持有和缺额明细。
- 右上角“音效”可试听、调节音量和静音，设置自动保存在本机。拿取、归还、支付、购牌、预留、补牌、贵族到访及新对局配有筹码与纸牌物理音效；首次点击后启用。

服务仅监听本机。当前对局保存在进程内存中，刷新网页不会重开，停止服务会丢失未完成对局。同机模式依赖玩家交接屏幕，不是带身份认证的在线多人服务。

## 规则与研究证据

- [调研、开源项目审计、素材方案和差距](docs/research.md)
- [数据核对报告](docs/data-audit.json)
- [验证记录](docs/validation.md)
- [第三方来源与权利说明](third_party/NOTICE.md)
- [经典版官方规则](https://cdn.svc.asmodee.net/production-unboxnowcom/uploads/2022/02/Splendor-EN.pdf)

## 验证

```bash
npm test
npm run simulate -- --games 30
npm run assets
python3 scripts/audit-data.py
```

前三项分别验证规则场景、完整对局及复盘、全部图片哈希；最后一项联网比对固定版本的社区数据，不执行下载的代码。Python 仅供数据审计，不是游戏运行依赖。

模拟器中的 3000 次决策预算仅用于发现测试不收敛，超出会报错，绝不作为游戏规则判平。验证对手是“有牌可买就买，否则随机合法行动”的检查策略，不代表有训练成果或强 AI。

## 接入游戏 AI

规则层位于 `src/engine.js`，不依赖界面：

```js
import { createGame, observe, legalActions, step } from './src/engine.js';

let state = createGame({ players: 2, seed: 'experiment-001', firstPlayer: 0 });
const observation = observe(state, state.currentPlayer);
const actions = legalActions(state);
// 把 observation 和 actions 交给策略；不要把完整 state 交给策略。
state = step(state, actions[0]);
```

行动阶段为 `action → return（按需）→ noble（按需）→ 下一位玩家 / ended`。归还和贵族选择是同一回合的后续决定，不额外消耗回合。所有黄金支付组合保留在合法行动中。

`observe` 隐藏种子、牌堆顺序和对手预留牌；公开市场预留的已知身份仍能从公开历史记住。暗抽只记录层级，不记录卡牌身份。完整状态和完整复盘是可信宿主权限，不能用于泄露信息的 AI 评估。

页面还提供 `read_splendor_table` 与 `play_splendor_action` WebMCP 工具，使用同一规则引擎、当前可见座位和修订号，不能绕过交接幕帘。

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/engine.js` | 规则、合法行动、观察隔离、复盘、守恒检查 |
| `src/server.js` | 本机 HTTP 服务与权威状态 |
| `web/` | 中文本地牌桌 |
| `data/base-game.json` | 完整基础版数据和原图映射 |
| `data/assets-manifest.json` | 固定来源、106 项图片哈希 |
| `scripts/` | 获取图片、数据审计与对局验证 |
| `tests/` | 规则回归场景 |

尚待补齐：经典牌背等视觉细节、100 个卡面与实体版逐项人工签核、原画的出版商授权出处。没有把替代插画或简化规则作为“完全复刻”交付。

## 强化学习实验室

[自我对弈训练、模型设计与启动说明](../../agents/splendor-rl/README.md)。独立服务位于 [4175](http://127.0.0.1:4175/)，支持无界面并行 PPO 训练、历史模型对抗、停止/续训、评估指标与真实对局回放；不占用当前手动对局。
