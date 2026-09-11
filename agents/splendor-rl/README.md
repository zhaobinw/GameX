# Splendor 强化学习实验室

无界面并行自我对弈训练，独立 UI 查看真实指标与已完成对局。复用 `games/splendor/src/engine.js`，不经过浏览器点击，不复制或简化规则。

## 启动

需要 Node.js 20+、Python 3.12，以及 PyTorch / NumPy。已在本机创建项目独立环境。

```bash
cd /Users/zhaobinw/GameX/agents/splendor-rl
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python server.py
```

打开 [AI 实验室](http://127.0.0.1:4175/)。选择并行数、人数、每代对局数和代数，点击开始。训练独立运行，关闭页面不停止训练；停止按钮保留最近完整更新的模型。模型保存在忽略目录 `runs/`，不会上传 GitHub。原手动牌桌 4173 不受影响。观战卡图复用手动牌桌的本地缓存；若缺失，在游戏目录运行 `npm run assets`。

- “从选中模型续训”恢复模型、优化器、历史对手和随机状态，写入新记录。
- 观战可选择自我对弈、对历史初始模型或贪心基线的完整对局；支持播放、暂停、逐步和拖动进度。
- 进度显示完成/截断数量、采样速度、胜局份额、策略熵、参数变化。当前代处于采样中时，表格保留上一完整代的指标。
- 模型没有“永远越来越强”的保证；用独立评估验证，而非把参数更新等同于进化成功。

## 命令行

```bash
# 默认 4 个 Node worker，并行采样；每代 32 局，训练 40 代
.venv/bin/python train.py --workers 4 --episodes 32 --updates 40 --players 2

# 继续训练；使用新输出目录，原模型不覆盖
.venv/bin/python train.py --resume runs/某次训练/latest.pt --updates 20

# 与训练监控种子分离的留出评估，成对交换座位
.venv/bin/python train.py --evaluate runs/某次训练/latest.pt --eval-games 100 --eval-seed 177013
```

`--budget 800` 是每局采样决策预算。超限标记 truncated，既不判平也不计算胜负回报，并丢弃该局训练样本。频繁截断必须在报告中披露并检查策略，不能靠提高上限隐去问题。默认训练为 2 人，支持 3、4 人；改变人数时建议开新实验而非混合比较胜率。

`--resume` 仅支持本项目产生且可信的本地 checkpoint；PyTorch checkpoint 包含优化器和随机状态。完整重现需相同依赖、种子、线程/环境数与配置。中断时未完成的一代不恢复，从最近已保存代继续。

## 攻略先验与更强模型

新训练推荐选择“攻略预训练 + PPO”：64 局教师示范、30 epochs 策略蒸馏、按玩家分别计算 GAE、自我对弈及逐代衰减教师损失。旧模型继续支持原有 424/47 维输入；新模型使用 433/73 维策略特征，不能把旧权重直接硬塞进新结构。续训会自动识别模型模式。

[完整设计与战胜强人类的验证路线](STRONG_PLAY_DESIGN.md) · [V2 对照实验](../../experiments/splendor-rl-knowledge-v2.md)

```bash
.venv/bin/python train.py --knowledge --warmup-episodes 64 --episodes 32 --updates 12 --eval-games 20
```

教师只是训练标签，网络推理不加教师评分；仍以真实胜负为奖励。配置参数 `--warmup-epochs 0 --teacher-weight 0` 可运行去先验消融，`--deterministic` 和 `--teacher-policy` 分别评估确定性模型与手写教师，结果必须分开报告。

## V1 算法和模型

详见 [DESIGN.md](DESIGN.md)。当前实现约 9.4 万参数，CPU 批量推理和更新。模型接收 424 维当前座位视角特征，并逐项评分每个 47 维合法行动；合法行动数量动态变化，不使用固定上限截断。

主要输出：`config.json`（配置、版本和数据哈希）、`status.json`、`metrics.json`、`initial.pt`（含同一先验的初始基线）、`latest.pt`、每代 `generation-N.pt`、带公共观察帧的 `replay-N.json`。历史模型池包含初始模型及最多 5 个近期快照。UI 仅返回公共回放帧，不传完整随机种子或暗牌数据；完整复盘只存在本地训练文件中。

## 验证

```bash
node --test tests.mjs
.venv/bin/python -m unittest discover -s . -p 'test_*.py' -v
cd ../../games/splendor
npm test
npm run simulate -- --games 30
```

覆盖隐藏信息隔离、公共预留记忆、2–4 人特征维度、动态行动 mask、实际梯度更新、checkpoint 往返、并行种子复现、回放终局一致性、截断不判平。实测结果见 [实验报告](../../experiments/splendor-rl-first-run.md)。

## 多策略联赛训练（V3 / V4 实验）

[研究、真人复盘与实现边界](LEAGUE_DESIGN.md)。使用完整规则、旧模型及多风格固定策略对手，优先安排较难战胜的对手，并定期加入新快照。

```bash
.venv/bin/python league_train.py --source runs/knowledge-v2-dev/latest.pt --run runs/league-new --updates 64 --episodes 128 --workers 8 --seed 721019 --validation-games 120 --validation-every 8 --holdout-games 200 --teacher-weight .03 --anchor-weight .08 --entropy-weight .003
```

V4 用较弱的教师模仿和旧模型 KL 约束稳定更新，并降低熵奖励；这属于需要评估的算法变体，不代表预先确认更强。训练进度可在实验室的记录列表查看，联赛暂不支持一键续训。命令行 `--source` 可开始新实验，不能视为完整恢复旧联赛。STOP 文件在采样/更新边界生效，最终评估期间须等评估完成。正式棋力结论以留出报告为准。

真人复盘转换：`node replay_examples.mjs 输入复盘.json 输出样本.json 0`。只接受完整合法终局，输出玩家 1 当时能看到的编码及动作索引；样本请放在忽略目录 `runs/`。
