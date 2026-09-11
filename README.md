# GameX

用于探索、实现各类游戏与游戏 AI 的项目空间。

## 探索方向

- 游戏原型：玩法、关卡、交互与仿真。
- 游戏 AI：规则策略、搜索与规划、强化学习、多智能体与大模型驱动的智能体。
- 实验评估：可复现的训练、对局、基准与结果分析。

## 目录结构

| 目录 | 用途 |
| --- | --- |
| `games/` | 独立游戏与玩法原型 |
| `agents/` | 游戏 AI、策略与训练项目 |
| `experiments/` | 跨项目实验、评估与复现记录 |
| `shared/` | 经实际复用验证的公共代码与接口 |
| `docs/` | 设计文档、研究笔记与技术决策 |

每个子项目独立选择语言、引擎与依赖管理方式。根目录暂不预设统一运行时或构建系统。

## 开始一个项目

1. 在 `games/<项目名>/` 或 `agents/<项目名>/` 下建立项目。
2. 添加项目 README，说明目标、环境要求、安装与运行命令、验证方式。
3. 优先完成可运行的最小原型，再逐步扩展。
4. AI 实验记录环境版本、随机种子、配置、评估指标与结果；大型模型和数据存储在仓库外。

协作约定见 [AGENTS.md](AGENTS.md)，实验记录格式见 [docs/experiments.md](docs/experiments.md)。

## Git 工作流

默认分支为 `main`。日常开发建议使用独立分支：

```bash
git switch -c feat/my-game
# 完成并验证修改后
git add <需要提交的文件>
git commit -m "feat: add initial game prototype"
git push -u origin feat/my-game
```

仓库地址：https://github.com/zhaobinw/GameX
