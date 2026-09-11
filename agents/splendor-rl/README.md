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

## 算法和模型

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
