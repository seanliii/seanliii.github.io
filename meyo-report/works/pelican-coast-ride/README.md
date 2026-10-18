# 鹈鹕骑自行车 · Pelican Coast Ride

[在线体验](https://seanliii.github.io/meyo-report/works/pelican-coast-ride/index.html) · [作品集与来源说明](https://seanliii.github.io/meyo-report/#pelican-work)

当前是 **2026-10-18 操控修正版**，基于 Meyo 军团在个人云实例中生成的首版。
不是从参考作者仓库直接复制的整款游戏，也不是世界级质量或普遍超过单模型的证明。
首版由 Codex 原生执行框架＋Kimi K3 制作；本轮由操作员按用户反馈修正操控，
不冒充 OpenRouter/Jev 已自主返工。首版源码包仍可下载，Git 历史保留。

## 本轮修了什么

- A/←向左，D/→向右；触屏左右键使用同一方向，不再反转。
- 静音/画质按钮改为在正确的页面元素上绑定，真实点击会生效。
- 手机窄屏按钮分两行，不再互相覆盖；竖屏尾随镜头围绕骑手取景，顶部信息不互挡。
- 切出窗口或标签后暂停、清除按住的方向，回来不会继续卡着转向。
- 暂停页增加可点击/触摸的“继续骑行”；按住暂停键不会反复暂停与恢复。

先前检查只验证“数值变化”，没有核“向左真的朝左”，因此漏掉反向缺陷。
现在 `tests/controls_browser.py` 用实际键盘和触屏输入检查方向、移动、按钮触达和恢复。
浏览器触屏模拟不等于已完成各种真实手机的兼容性验收。

## 玩什么

点“开始骑行”，W/↑加速，S/↓刹车，A/D变道；空格跳跃，T炫技，B车铃，
C切换镜头，M静音，P/Esc暂停；暂停后也可以点“继续骑行”。移动端长局手感和音频没有全面验收。

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
index.html                 当前操控修正版
favicon.svg / poster.jpg   原工程配套图
source/pelican-bike/        当前源码、构建脚本、dist 与保留的原始 README
source/vendor/             原 Three.js 依赖和补齐的 MIT 许可
provenance.json             版本、来源和哈希
tests/controls_browser.py   真实方向、触控布局、失焦与恢复验收
```

在有 Python 3 的环境运行 `python3 source/pelican-bike/build.py`，
会重新生成 `source/pelican-bike/dist/index.html`，当前文件哈希见 `provenance.json`。
安装了 Playwright 和 Google Chrome 后，可运行
`python3 tests/controls_browser.py https://seanliii.github.io/meyo-report/works/pelican-coast-ride/index.html`。
测试保持 Chromium 沙箱，结束后关闭自己创建的浏览器，不发模型请求。

[保留的首版完整包](https://seanliii.github.io/meyo-report/downloads/pelican-coast-ride-20261018.zip)
中 HTML 的 SHA256 仍为 `4a90ade8ba628ac8858409db0377c7d3f7dd047d7d4e4eaba5d257468495cdb3`。

`source/pelican-bike/README.md` 原字节保留，但其中“零外部依赖”和自述验收
不能作为本包的准确归因：Three.js 已内联，含依赖不等于不依赖。
成员自己的浏览器脚本未作为安全验收依据，也没有放进本包。

## 已知边界与下一步

- 先前在军团隔离预览中会因 `localStorage` 权限报错；GitHub Pages 独立静态页面
  是不同的交付环境。本次没有放宽军团安全策略，没有宣称原预览缺陷已修复。
- 主角偏暗、局部剪影、平面化场景和美术细节仍需改进。本版用于展示真实制作与迭代过程。
- 基础骑行/跳跃/车铃/镜头/暂停有独立真实操作记录；不是完整长局、移动端或声音认证。
- 本次是明确记录的操作员定点修复；没有重新制作游戏、替换引擎或修改原云端军团。
  静态发布不产生模型调用，没有把人工修正冒充军团自动进化。
