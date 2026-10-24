# MASTER.md — 回南天 Cyber Damp 全局设计源（机器可读优先）

> **历史档案（2026-10-25 已退役）**：本文件正文保留旧版本的设计、约束与验收语境，不再作为当前实现或开发门槛；文中“唯一依据”“已锁定”“开发暂停”等表述仅描述当时状态。当前入口见 [README](../README.md)、[原生产品规格](../docs/superpowers/specs/2026-10-24-native-weather-goal-prompt.md)及最新用户裁决。旧图集、覆盖层、旧 token 和专属检查已退出活动代码，正文路径可能仅存在于历史记录或仓库外备份。

2026-10-21实现增量：管理窗与折叠桌面工具共用 `src/renderer/ui/rain-cabinet.css` 六个基础色；独立管理以物品分类/列表/详情/购买状态为中心。两种布局和连续材质预览的入口见 [样片说明](../previews/material-library/README.md)，源码与验收限制见 [体验记录](../docs/EXPERIENCE-INCREMENT-2026-10-21.md)。下方旧深色token仍供保留的旧面板使用，不将其误记为本轮已认可视觉。

> 2026-10-21 当前设计覆盖：[修订目标与计划](../docs/superpowers/specs/2026-10-21-experience-direction-and-plan.md)。采用游戏交互后台与收拢工具入口，复用旧版资产，补回原生选中反馈；下方旧色值/布局记录仅作历史与复用参考，不能阻止当前 UI 重构。

> **2026-10-19 下一版设计更新：** [护理、经济与桌面融合设计](../docs/superpowers/specs/2026-10-19-care-and-desktop-design.md) 优先于本文的冲突条款。已确定平滑漫画风、独立管理窗口、清洁度收益/游戏内损坏、3–5 秒每次启动回放、90% 遮挡上限（仍须辨认原图）及严格保持原生图标大小与布局。旧版写实/核爆/蜗牛护理/固定六秒/网格重排等要求不再作为下一版目标。开发按最新计划推进；这些是设计要求，本文历史实现与测试记录不代表新标准已通过。

> 人类可读契约见上级目录 `DESIGN.md`；本文件是页面级覆盖（`pages/<page>.md`）的合并基准。
> 写入规则：只追加/修正具体条目，禁止整篇重写。变更在文末记录表追加一行。
> 上游对齐：docs/architecture.md v1.0（2026-10-17 对齐锁定）
> 配套断言清单：`design-system/POINTER-EVENTS.md`（Spec §9 AC-36 元素级展开）

## 身份
- 项目：回南天 Cyber Damp（Windows 透明置顶桌面挂件，Electron 44.8.0 + Pixi.js 8.21.0 + Matter.js 0.20.0）
- 寄存器：Product（chrome 安静可预测；个性由 in-world 拟物层承担）
- 平台轴：Windows desktop overlay；适配维度 = 多显示器 / DPI(100-200%) / 点击穿透 / 任务栏避让，非移动断点
- 三轴：VARIANCE=7 / MOTION=6 / DENSITY=5
- 下一版风格：与原生图标融合的平滑漫画风，连续受潮和生长、柔和体积、克制纹理，避免过度写实不适。以 [ART-DIRECTION.md](ART-DIRECTION.md) 为准；下方旧 token 仍为当前实现记录，本次未更改运行时样式。

## 实现分工（架构 §3/§8 锁定）
- DOM 覆盖层（`src/renderer/ui/`）：气象牌 weather-sign.ts / 商店 shop-panel.ts / 工具箱 toolbox.ts / Demo 控制台 demo-console.ts / HUD 骨架 ui-root.ts / Lucide 注册 icons.ts；plain CSS + 设计 token，无 CSS 框架
- Pixi 画布（`src/renderer/view/`）：文件替身/绳/蘑菇/粒子/Shader。原生图标使用真实图像；下一版素材与程序化形变结合，不再要求实体全部用 Graphics 绘制。显示尺寸和位置服从原生桌面，不由素材像素尺寸决定。
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
- 绳索三档**字节**承重（架构 §5.2 活规格）：麻绳 5GB / 红塑料绳 25GB / 不锈钢杆 ≥100GB（MVP 文件树最大 24GB 等效不限）；崩断判定按 Σ sizeBytes（预警阈值 ≥0.8× 绳型上限），sizeToMass（0.4 + log10(kb)×0.8）仅用于下垂深度与配重表现，禁止用作崩断阈值
- 绳渲染唯一真相源：绳形 100% 由 Matter 解算涌现；sag_px = clamp(3.5 × sizeToMass², 2, 140)（10KB→5px / 24GB→140px）仅作视觉目标与验收参考，**禁止前端用它驱动绳渲染**（双源真相禁忌）
- 物理驱动（架构 §5.2 调参包络）：sizeToMass 对数跨度仅 5.3 倍（10KB→1.20 vs 24GB→6.32），直接驱动给不出 PRD 对比度（线性定标试验 10KB 垂 27px 为证），故刚体质量用指数化质量 mass_eff = sizeToMass^p（p 默认 2，包络 1.8-2.4）；sag 参考平方式与物理 p=2 同构、按构造一致；绳链 0.5/链（总 7.0），判据 10KB 1.44 ≤0.3×绳重纹丝不动 / 24GB 39.9 ≥4×绳重深 V；重文件 mass_eff>10 视觉 2-3 夹多点挂载
- sizeToMass 实算锚点（两位小数，与代码对表唯一参考，见 DESIGN.md §6.3）：1KB→0.40 / 10KB→1.20 / 1MB→2.81 / 1GB→5.22（1048576KB，log10=6.0206 非整 6）/ 20GB→6.26 / 24GB→6.32；根因对 5GB→5.78 vs 25GB→6.33（差 0.55，崩断必须按字节判的数学证据）
- 指针事件纪律：窗口常态点击穿透；非交互 DOM 元素（预警角标/装饰贴片/读数文本/气泡正文）一律 pointer-events:none，仅交互控件开 auto；元素级断言清单见 POINTER-EVENTS.md
- Demo 一键挂满：按字节降序贪心预检挂载（累计不超绳型上限）；深 V 演示必须用红塑料绳，304 不锈钢杆刚性笔直禁用于深 V 演示；手动超限保持啪嗒滑脱戏剧效果不拦截
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
| 2026-10-17 | v1.3 sag 参考式 + 指针事件纪律 | sag_px 改 clamp(3.5 × sizeToMass², 2, 140) 参考式并禁作绳渲染输入（Matter 解算唯一真相源）；预警阈值 ≥0.8× 字节上限；非交互 DOM 元素 pointer-events:none | 全部 |
| 2026-10-17 | v1.4 锚点固化 + 断言清单 | sizeToMass 锚点表两位小数固化（1GB→5.22 精度修正：1048576KB 的 log10=6.0206 非整 6）；新增 POINTER-EVENTS.md（AC-36 元素级断言表 + QA 配方） | 全部 |
| 2026-10-17 | v1.5 同步调参包络 | 架构 §5.2 新增 mass_eff=sizeToMass^p（p=2）物理驱动与验收包络；sag 参考曲线对应 p=2 落在包络内；重文件 2-3 夹多点挂载视觉；Demo 一键挂满容量预检 + 深 V 禁不锈钢杆 | 全部 |
| 2026-10-17 | v1.6 指数化根因 + 同构声明 | §6.3 补：线性对数跨度 5.3 倍给不出 PRD 对比度（根因）；sag 平方式与物理 p=2 同构按构造一致；绳链 0.5/链与两条挂载判据；锚点表附 5GB/25GB 根因对 | 全部 |
| 2026-10-19 | 下一版平滑漫画风与原生尺寸约束 | 用户新决策；详见 ART-DIRECTION.md，原始 token 未改 | 美术、窗口与素材标准 |
