# POINTER-EVENTS.md — 指针事件可断言元素清单 v1.0

> 项目：回南天 Cyber Damp | 设计师：颜好看 | 日期：2026-10-17
> 用途：Phase 3 UI 层实现 + QA 验收断言（Spec §9 AC-36 的展开表）
> 背景纪律：窗口常态是点击穿透（`setIgnoreMouseEvents` + hit-test 状态机）。DOM chrome 默认不吃事件；
> 只有真正的交互控件开启 `pointer-events: auto`，纯展示元素一律 `none`。
> 断言方法：`getComputedStyle(el).pointerEvents` 必须等于下表"必须值"。

## 1. 断言总表

选择器列为建议类名（与架构 §8 `renderer/ui/` 模块对应，前端可改名但须保持"静态=none / 交互=auto"的映射关系）。

### 1.1 HUD 常驻元素（ui-root.ts）

| 元素 | 选择器 / 角色 | 必须值 | 理由 |
|---|---|---|---|
| 气象牌面板 | `.weather-sign`（panel 容器） | `none` | 木牌是展示面；吃事件会挡住牌面下方的桌面图标与下层应用 |
| 气象牌迁徙按钮 | `.weather-sign__migrate`（button） | `auto` | 唯一交互点：切换城市 |
| 气象牌读数文本 | `.weather-sign__readout`（span） | `none` | 纯展示：城市/天气/湿度 |
| 金币 pill | `.coin-pill`（容器） | `none` | 纯读数展示，无交互 |
| 商店入口 | `.hud-btn--shop`（button） | `auto` | 打开杂货铺抽屉 |
| 设置入口 | `.hud-btn--settings`（button） | `auto` | 打开设置面板 |
| 工具箱入口 | `.hud-btn--toolbox`（button） | `auto` | 弹出工具面板 |
| 工具箱面板容器 | `.toolbox`（panel 容器） | `none` | 面板底不吃事件，避免挡住桌面 |
| 工具格 | `.tool-cell`（button） | `auto` | 选择工具（剪刀/吹风机/喷雾/吸湿盒/刮水器） |
| 工具格置灰项 | `.tool-cell[disabled]` / `.tool-cell[aria-disabled="true"]` | `none` | MVP 置灰工具（如麦克风吹气 P2）不可交互，且不挡穿透 |

### 1.2 提示气泡（Toast）

| 元素 | 选择器 / 角色 | 必须值 | 理由 |
|---|---|---|---|
| 气泡容器 | `.tip-bubble`（aside/article） | `none` | 锚定展示；挡住下方文件替身会误拦截双击打开 |
| 气泡关闭按钮 | `.tip-bubble__close`（button） | `auto` | 可点击关闭 |
| 气泡次要按钮 | `.tip-bubble__action`（button） | `auto` | "先去晾晒"等行动按钮 |
| 气泡正文 | `.tip-bubble__body`（p/span） | `none` | 纯文本 |
| 警示气泡容器（绳将断等） | `.tip-bubble--warn` | `none` | 同普通气泡；警示靠视觉（warn 边线）不靠吃事件 |

### 1.3 预警角标（架构师点名的纪律）

| 元素 | 选择器 / 角色 | 必须值 | 理由 |
|---|---|---|---|
| 绳索过载角标 | `.warn-badge`（span） | `none` | **AC-36 点名项**：角标是屏幕空间小贴纸，吃事件会挡住桌面下面的应用 |
| 任何 future 角标/贴片 | `[data-chrome="decor"]`（约定属性） | `none` | 统一约定：装饰性 chrome 一律挂此属性并禁事件 |

### 1.4 杂货铺抽屉（shop-panel.ts）

| 元素 | 选择器 / 角色 | 必须值 | 理由 |
|---|---|---|---|
| 抽屉根容器 | `.shop-drawer`（aside, role="dialog"） | `auto` | 模态表面：打开期间捕获范围内点击，避免误触桌面 |
| 抽屉静态文本（页眉/小节标题/摘要） | `.shop-drawer :is(h1,h2,h3,p,span):not(button):not(input)` | `none` | 纯展示 |
| 商品卡容器 | `.shop-card`（li/article） | `none` | 卡片是展示分组，不是按钮 |
| 购买/装备按钮 | `.buy-btn`（button） | `auto` | 交易交互 |
| 数量 stepper | `.qty-stepper :is(button,input)` | `auto` | 吸湿盒数量调整 |
| 关闭按钮 | `.shop-drawer__close`（button） | `auto` | 关闭抽屉 |

### 1.5 Demo 控制台（demo-console.ts）

| 元素 | 选择器 / 角色 | 必须值 | 理由 |
|---|---|---|---|
| 控制台根容器 | `.demo-console`（div, role="dialog", aria-modal="true"） | `auto` | 模态表面：焦点圈禁 + 打开期间捕获事件 |
| 控制台静态文本 | `.demo-console :is(h1,h2,h3,p,span,label):not(button):not(input)` | `none` | 纯展示；label 的点击交由关联 input/button 承载 |
| segmented 单选 | `.seg-option`（button, role="radio"） | `auto` | 时光倒流档位选择 |
| 一键按钮组 | `.console-btn`（button） | `auto` | 一键回南天/挂满/梅雨/出汗/培育 |
| 置灰按钮（毁灭菇"培育中"） | `.console-btn[aria-disabled="true"]` | `none` | 不可交互且不挡穿透 |
| 状态读数行 | `.console-readout`（dl/dd） | `none` | mono 纯展示 |
| 页脚快捷键提示 | `.console-footer`（footer） | `none` | 纯展示 |

### 1.6 设置面板（轻量面板，可后置）

| 元素 | 选择器 / 角色 | 必须值 | 理由 |
|---|---|---|---|
| 面板根容器 | `.settings-panel`（aside, role="dialog"） | `auto` | 模态表面 |
| veil 档位单选 | `.veil-seg-option`（button） | `auto` | 壁纸适配档位 |
| 音效开关 | `.sfx-toggle`（button, role="switch"） | `auto` | 音效开关 |

## 2. 边界情况（QA 易漏）

1. **in-world 交互区（Pixi canvas）不是 DOM**：绳、文件替身、蘑菇的命中由 canvas 层 hit-test + click-through 状态机负责。DOM chrome 的任何 `auto` 元素都不得覆盖 in-world 可交互元素的默认位置（HUD 锚定屏缘 + 任务栏避让即为此）。
2. **面板关闭态**：抽屉/控制台/工具箱面板在关闭时（display:none 或 visibility:hidden）不产生任何命中；打开动画进行中（translate 位移期间）容器即 `auto`，避免动画第一帧事件丢失。
3. **父 none 子 auto 是合法组合**：`pointer-events` 非继承属性，`.weather-sign`（none）内的按钮（auto）可点，这是本清单的核心模式；QA 断言须逐元素测，不能只测容器。
4. **focus 可达性不受影响**：`pointer-events: none` 不影响键盘 Tab 聚焦与 `:focus-visible`；纯展示元素本就不该进 Tab 序列（交互控件才 tabbable）。
5. **hit-test 状态机输入**：renderer 的命中检测应把"DOM 交互元素的 bounding rect"纳入计算（mousemove 在 auto 元素上时应判定为命中态、切 `setIgnoreMouseEvents(false)`）；空白处与非交互 chrome 上一律保持穿透。

## 3. QA 断言配方（可直接进测试）

```ts
// 语义：静态 chrome 全部 none；交互控件全部 auto
const STATIC_SELECTORS = [
  '.weather-sign', '.weather-sign__readout', '.coin-pill',
  '.toolbox', '.tip-bubble', '.tip-bubble__body', '.tip-bubble--warn',
  '.warn-badge', '[data-chrome="decor"]',
  '.shop-card', '.shop-drawer__title', '.shop-drawer__section-title',
  '.console-readout', '.console-footer',
];
const INTERACTIVE_SELECTORS = [
  '.weather-sign__migrate', '.hud-btn--shop', '.hud-btn--settings', '.hud-btn--toolbox',
  '.tool-cell:not([aria-disabled="true"])', '.tip-bubble__close', '.tip-bubble__action',
  '.buy-btn', '.qty-stepper button', '.shop-drawer__close',
  '.seg-option', '.console-btn:not([aria-disabled="true"])',
  '.veil-seg-option', '.sfx-toggle',
];
for (const sel of STATIC_SELECTORS) {
  for (const el of document.querySelectorAll(sel)) {
    console.assert(getComputedStyle(el).pointerEvents === 'none', `[AC-36] ${sel} 必须 pointer-events:none`);
  }
}
for (const sel of INTERACTIVE_SELECTORS) {
  for (const el of document.querySelectorAll(sel)) {
    console.assert(getComputedStyle(el).pointerEvents === 'auto', `[AC-36] ${sel} 必须 pointer-events:auto`);
  }
}
// 注意：断言只对"当前已渲染"的元素生效；面板关闭态下对应元素不在 DOM 或不可见，
// 需先打开目标面板再断言（shop/console/toolbox 各自 open 后跑对应段）。
```

## 4. 与 Spec §9 AC-36 的关系

AC-36 原文口径："非交互 DOM（预警角标/装饰贴片/读数文本/气泡正文）一律 pointer-events:none，仅交互控件（按钮/工具格/输入框/可拖拽标题栏）开 auto"。本文件是 AC-36 的元素级展开：QA 按第 3 节配方断言，前端按第 1 节表实现。两处冲突时以本文件元素表为准（更细），口径冲突以 Spec 为准并回找设计师修订。

---
*变更记录：v1.0（2026-10-17）初版，应 team-lead Phase 3 前点名要求编写。类名为建议值，前端改名须保持静态/交互映射不变。*
