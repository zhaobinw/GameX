# 第三方来源

## 采用的数据

- 来源：[roeey777/Splendor-AI](https://github.com/roeey777/Splendor-AI)
- 固定提交：`95f84d2e6e839c0ef09ca97bdc3b3048a792fb0b`
- 原文件：`src/splendor/splendor/splendor_utils.py` 的 `CARDS` 和 `NOBLES`。
- 原文件署名：Steven Spratley，基于 Guang Ho、Michelle Blom 的代码；日期 2021-01-04。
- 仓库许可署名：Copyright (c) 2024 roeey777；MIT 全文保留于 [Splendor-AI-LICENSE.txt](Splendor-AI-LICENSE.txt)。
- 转换：保留全部卡牌级别、颜色、成本、分数和贵族要求，转换为 JSON，添加稳定 ID 和对应图片路径。没有复用上游简化规则引擎或训练代码。

## 图像来源

同一固定提交下的 `src/splendor/splendor/resources/`：90 张 `cards_large`、10 张 `nobles_large`、6 张单枚宝石 `gems_large`，共 106 项约 10.6 MB。

图像按原文件直接使用，未 AI 重绘或改变图中的费用与分数。宝石图片中上游自带的数字叠印是第三方显示加工，不能据此宣称与实体筹码像素一致。图片来源、尺寸字节数与 SHA-256 见 `data/assets-manifest.json`。

Splendor 的游戏名称、经典插画与产品设计属于相应原权利人；原作由 Marc André 设计，Pascal Quidault 绘制，SPACE Cowboys 出版。本项目不隶属于或获得上述机构背书。

核查到上游仓库标注 MIT，但未找到出版商授予其原画再分发许可的说明，不能把仓库代码许可等同于原画授权。图片目前作为本地忽略缓存，不随 GameX 的 Git 提交分发；提供固定版本获取脚本及出处。公开发行原画前，这项授权出处仍需落实。

## 仅作比对、未复制代码的来源

- [bouk/splendimax](https://github.com/bouk/splendimax)：固定提交 `5ffcb148ee0093e3b47f612b04a1927301ff13ee` 的卡表；该提交未见顶层 LICENSE，未引入其引擎。
- [anicolao/splendor](https://github.com/anicolao/splendor)：固定提交 `5b3efd26f2e460b1bef3839a058270b536a13648` 的实体照片转录表，用于费用交叉检查；仓库 GPL-3.0。未复制其代码、照片、转录文件或生成插画到本仓库。
- [seal256/splendor](https://github.com/seal256/splendor)：固定提交 `263abc066c563a1c89dba4bdc408446a20ad9d1d` 的 10 张贵族要求，用于交叉检查；未复制其引擎。

比对脚本按固定 URL 读取源数据，只保存结果与哈希；不会执行下载的源码。

## 交互音效

采用 [Kenney Casino Audio 1.1](https://kenney.nl/assets/casino-audio) 中 14 段筹码与纸牌声音，作者 Kenney，许可 CC0 1.0。原始许可保留于 `web/assets/audio/License.txt`；下载地址、原始文件名、转换说明和前后 SHA-256 见同目录 `manifest.json`。

将选定 OGG 转为单声道 44.1 kHz、16 位 PCM WAV，随仓库分发；播放时按实际动作组合，使用轻微音量、声像与速度变化。这些是本项目增加的实体操作反馈，不是 Splendor 官方数字版音轨。
