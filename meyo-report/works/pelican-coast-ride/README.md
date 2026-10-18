# 鹈鹕骑自行车 · Pelican Coast Ride

[在线体验](https://seanliii.github.io/meyo-report/works/pelican-coast-ride/index.html) · [作品集与来源说明](https://seanliii.github.io/meyo-report/#pelican-work)

这是 Meyo 军团在个人云实例中生成、修改并保存的 **2026-10-18 首版演示**。
不是从参考作者仓库直接复制的整款游戏，也不是世界级质量或普遍超过单模型的证明。
生成者为 Codex 原生执行框架＋Kimi K3；后续切换 OpenRouter/Jev 的配置没有被算成本版游戏改进。

## 玩什么

点“开始骑行”，W/↑加速，S/↓刹车，A/D变道；空格跳跃，T炫技，B车铃，
C切换镜头，M静音，P/Esc暂停。触屏按钮由原工程提供；移动端手感和音频没有全面验收。

## 哪里是自己做的，哪里复用了

- 原生工具记录保留了创建 `src/game.js`、逐段写入角色/单车/场景/玩法、
  创建模板、构建以及后续修正的过程。这里公开实际源码，不公开私人会话和原生思考日志。
- **Three.js 0.160.1 是复用的开源引擎**，不是军团原创。
  MIT 许可见 `source/vendor/LICENSE.three.txt`，来源见 [CREDITS.md](CREDITS.md)。
- 同题需求与参照来自 `riba2534/claude-opus-5-5-demo` 的 README。
  作者对模型的归因属于作者自述；参考仓库未观察到根 LICENSE，因此本包不包含其游戏源码或媒体。
- “未观察到直接复制”不是逐字原创性的法律保证，也不代表通用图形/玩法技巧都是新发明。

## 文件与复现

```text
index.html                 当前可玩文件（原生成文件的逐字节副本）
favicon.svg / poster.jpg   原工程配套图
source/pelican-bike/        原始源码、构建脚本、dist 与原始 README
source/vendor/             原 Three.js 依赖和补齐的 MIT 许可
provenance.json             版本、来源和哈希
```

在有 Python 3 的环境运行 `python3 source/pelican-bike/build.py`，
会重新生成 `source/pelican-bike/dist/index.html`。本次重新构建的 SHA256
与发布文件一致：`4a90ade8ba628ac8858409db0377c7d3f7dd047d7d4e4eaba5d257468495cdb3`。

`source/pelican-bike/README.md` 原字节保留，但其中“零外部依赖”和自述验收
不能作为本包的准确归因：Three.js 已内联，含依赖不等于不依赖。
成员自己的浏览器脚本未作为安全验收依据，也没有放进本包。

## 已知边界与下一步

- 先前在军团隔离预览中会因 `localStorage` 权限报错；GitHub Pages 独立静态页面
  是不同的交付环境。本次没有放宽军团安全策略，没有宣称原预览缺陷已修复。
- 主角偏暗、局部剪影、平面化场景和美术细节仍需改进。本版用于展示真实制作与迭代过程。
- 基础骑行/跳跃/车铃/镜头/暂停有独立真实操作记录；不是完整长局、移动端或声音认证。
- 本次由操作员整理发布、补齐依赖署名和作品集入口，游戏逻辑未代写或修改。
  静态发布不产生模型调用；没有把作品重新送入付费生成。
