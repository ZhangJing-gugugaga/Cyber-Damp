# MASTER.md — 回南天 Cyber Damp 全局设计源（机器可读优先）

> 人类可读契约见上级目录 `DESIGN.md`；本文件是页面级覆盖（`pages/<page>.md`）的合并基准。
> 写入规则：只追加/修正具体条目，禁止整篇重写。变更在文末记录表追加一行。
> 上游对齐：docs/architecture.md v1.0（2026-10-17 对齐锁定）

## 身份
- 项目：回南天 Cyber Damp（Windows 透明置顶桌面挂件，Electron 44.8.0 + Pixi.js 8.21.0 + Matter.js 0.20.0）
- 寄存器：Product（chrome 安静可预测；个性由 in-world 拟物层承担）
- 平台轴：Windows desktop overlay；适配维度 = 多显示器 / DPI(100-200%) / 点击穿透 / 任务栏避让，非移动断点
- 三轴：VARIANCE=7 / MOTION=6 / DENSITY=5
- 风格：湿墨拟物（宣纸受潮 + 生锈铁 + 长霉木 + 磨亮铜）；禁科技风渐变/霓虹/装饰毛玻璃

## 实现分工（架构 §3/§8 锁定）
- DOM 覆盖层（`src/renderer/ui/`）：气象牌 weather-sign.ts / 商店 shop-panel.ts / 工具箱 toolbox.ts / Demo 控制台 demo-console.ts / HUD 骨架 ui-root.ts / Lucide 注册 icons.ts；plain CSS + 设计 token，无 CSS 框架
- Pixi 画布（`src/renderer/view/`）：文件替身/绳/蘑菇/粒子/Shader，实体全部程序化 Graphics 绘制，不用图标贴图
- 工程红线：滤镜只挂 Sprite 不挂 stage；同屏粒子 <= 300；DPR <= 2；document.hidden 暂停 ticker

## 颜色（唯一真相源：design-tokens.css / design-tokens.json）
- 面板统一 veil：`--panel-bg` = ink-900 @ 90%（`data-veil="high"` 96% / `"low"` 82%）；对比：fg>=12:1，muted>=4.5:1
- 强调：`--accent` #C0952F 陈铜金（每屏可见 <=2 处，只给 CTA/金币/选中）；**域隔离：仅 DOM chrome；进画布只限三处 sanctioned crossing（金币粒子/+N 飘字、工具/商店上下文激活时文件替身选中描边、气象牌晴天丁达尔光束）**
- 语义：success 干草绿 #7D9B5E（仅 DOM chrome，**不进画布**）/ warn 琥珀 #D9A441 / danger 铁锈红 #B5462B / info 水青 #6FA3B0
- 阶段命名对齐领域层 NeglectStage：fresh(<3d) / damp(3-14d) / wet(14-30d) / moldy(>30d)；色板 `--damp-0-*` 干宣纸、`--damp-1-*` 水珠+晕染、`--damp-2/3-*` 青苔+焦化；in-world 的绿全部是霉变 token，无 success 绿
- Shader 基准色（架构 §5.3）：水珠高光 `--damp-1-water-hi` #F4FAFB；霉斑 `--damp-2-moss`→`--damp-3-moss-deep` #6E7F4E→#45542F；焦化 `--damp-3-char` #4A3826；挂雾 `--fog-cool` #DFE9EA
- 诚实约束：透明 WebGL 画布不采样桌面背景像素；水珠 = 图标自身纹理局部折射偏移 + 近白高光 + 暗环
- 禁：紫到粉渐变（P0-2）、渐变文字、纯黑 #000/纯白 #fff 直上 UI、灰叠灰

## 字体
- display = Noto Serif SC 600/700（宋体气质，对接墨水洇染材质故事）
- body = Noto Sans SC 400/500/700；mono = JetBrains Mono 400/500（字节/金币/湿度/0-1 粒子，tabular-nums）
- 字号 8 级 11/12/13/14/16/20/24/32px；字重 400/500/700；正文行高 1.6 标题 1.25；CJK 小字 +0.01em；Caps 0.08em；标题 -0.01em

## 图标
- 锁定 Lucide 1.58.0（2px stroke / 24px grid，data-lucide + createIcons 显式子集注册）；尺寸只取 16 行内 / 20 按钮内 / 24 独立
- 自定义集（同描边语言，仅 DOM chrome 用）：clothesline-catenary、clothespin、mushroom-oyster/enoki/bolete/shy、dehumidifier-box、humidifier-mist、squeegee、wring-towel、humidity-gauge
- 禁 emoji 作功能图标（P0-1）

## 间距/圆角/阴影/动效
- 间距 4px 网格（4-80）；圆角 6/10/14/pill，卡片上限 14；hairline first，阴影只给真浮层（0 8px 24px rgba(6,8,6,0.45)）
- z：in-world 0 < HUD 100 < 气泡 200 < 抽屉 300 < 模态 400 < 演出 500 < toast 600
- 动效 UI：80/150/220/320ms，ease-standard/decel，禁 bounce；reduced-motion 归零 + 演出静态替代；指针目标 >=44px

## 组件要点
- 按钮 primary 金底深墨字 / secondary 透明 1px 边 / danger 仅破坏性且可撤销 150ms
- 商品卡 ink-700 + 1px border + radius 10 + padding 12；5 态全覆盖，文案产品特定
- 气泡 = 宣纸便利贴（damp-0 底 + 随机旋转 ±2°）；警示气泡 warn 边线不自动消失
- HUD 六件：气象牌(top-center 264x64，本地种子天气 ADR-007，迁徙 1 次/日) / 金币 pill / 商店 / 设置 (top-right) / 工具箱 (bottom-left) / 锚定气泡
- 老板键 Ctrl+Alt+H 专注模式（HUD 淡至 15%，in-world 暂停）
- Demo 控制台 Ctrl+Shift+D：时间机器 / 场景预设 / 一键培育 / 状态读数；焦点圈禁 + Esc 关闭
- 绳索三档**字节**承重（架构 §5.2 活规格）：麻绳 5GB / 红塑料绳 25GB / 不锈钢杆 ≥100GB（MVP 文件树最大 24GB 等效不限）；崩断判定按 Σ sizeBytes，sizeToMass（0.4 + log10(kb)×0.8）仅用于下垂深度与配重表现，禁止用作崩断阈值
- 蘑菇优先级：P0 = 平菇 N（含狗尿苔变体）+ 二进制金针菇 R + 蜗牛食苔；P1 = 胆小菇缩头行为；SR/SSR/UR 杂交公式搁置

## 反 AI 模板（构建期校验）
- 禁：Welcome to / Lorem ipsum / Sign up today / 无缝 / 赋能 / 闭环 / 极致 / 一站式 / 数据驱动
- 禁：相同卡片网格无限重复、每节小型大写标签、编号 section 标记、幽灵卡片（1px 边 + blur>=16px 同现）
- 禁：border-left >1px 作装饰强调（警示场景除外）

## 变更记录
| 日期 | 变更 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-10-17 | v1.0 初版 | 基于 PRD v1.0 立项 | 全部 |
| 2026-10-17 | v1.1 对齐架构 v1.0 | Lucide 1.58.0 + createIcons 约定；plain CSS 无框架；阶段命名 fresh/damp/wet/moldy；本地种子天气 ADR-007；水珠折射诚实约束；滤镜挂 Sprite；粒子 300/DPR 2；蘑菇优先级分级；新增 --fog-cool、--shroom-oyster-variant | 全部 |
| 2026-10-17 | v1.2 绳索字节制 + 强调色域隔离 | 崩断判定改字节（麻绳 5GB / 红塑料绳 25GB / 不锈钢杆 ≥100GB），sizeToMass 仅用于下垂深度与配重表现；陈铜金仅 DOM chrome + 三处 sanctioned crossing；--success 不进画布 | 全部 |
