# MASTER.md — 回南天 Cyber Damp 全局设计源（机器可读优先）

> 人类可读契约见上级目录 `DESIGN.md`；本文件是页面级覆盖（`pages/<page>.md`）的合并基准。
> 写入规则：只追加/修正具体条目，禁止整篇重写。变更在文末记录表追加一行。

## 身份
- 项目：回南天 Cyber Damp（Windows 透明置顶桌面挂件，Electron + Pixi.js + Matter.js）
- 寄存器：Product（chrome 安静可预测；个性由 in-world 拟物层承担）
- 平台轴：Windows desktop overlay；适配维度 = 多显示器 / DPI(100-200%) / 点击穿透 / 任务栏避让，非移动断点
- 三轴：VARIANCE=7 / MOTION=6 / DENSITY=5
- 风格：湿墨拟物（宣纸受潮 + 生锈铁 + 长霉木 + 磨亮铜）；禁科技风渐变/霓虹/装饰毛玻璃

## 颜色（唯一真相源：design-tokens.css / design-tokens.json）
- 面板统一 veil：`--panel-bg` = ink-900 @ 90%（`data-veil="high"` 96% / `"low"` 82%）；对比：fg>=12:1，muted>=4.5:1
- 强调：`--accent` #C0952F 陈铜金（每屏可见 <=2 处，只给 CTA/金币/选中）
- 语义：success 干草绿 #7D9B5E / warn 琥珀 #D9A441 / danger 铁锈红 #B5462B / info 水青 #6FA3B0
- 三态：健康 `--damp-0-*` 干宣纸；潮湿 `--damp-1-*` 水珠+晕染；霉变 `--damp-2/3-*` 青苔+焦化
- 禁：紫到粉渐变（P0-2）、渐变文字、纯黑 #000/纯白 #fff 直上 UI、灰叠灰

## 字体
- display = Noto Serif SC 600/700（宋体气质，对接墨水洇染材质故事）
- body = Noto Sans SC 400/500/700；mono = JetBrains Mono 400/500（字节/金币/湿度/0-1 粒子，tabular-nums）
- 字号 8 级 11/12/13/14/16/20/24/32px；字重 400/500/700；正文行高 1.6 标题 1.25；CJK 小字 +0.01em；Caps 0.08em；标题 -0.01em

## 图标
- 锁定 Lucide v1.57.x（2px stroke / 24px grid）；尺寸只取 16 行内 / 20 按钮内 / 24 独立
- 自定义集（同描边语言）：clothesline-catenary、clothespin、mushroom-oyster/enoki/bolete/shy、dehumidifier-box、humidifier-mist、squeegee、wring-towel、humidity-gauge
- 禁 emoji 作功能图标（P0-1）

## 间距/圆角/阴影/动效
- 间距 4px 网格（4-80）；圆角 6/10/14/pill，卡片上限 14；hairline first，阴影只给真浮层（0 8px 24px rgba(6,8,6,0.45)）
- z：in-world 0 < HUD 100 < 气泡 200 < 抽屉 300 < 模态 400 < 演出 500 < toast 600
- 动效 UI：80/150/220/320ms，ease-standard/decel，禁 bounce；reduced-motion 归零 + 演出静态替代；指针目标 >=44px

## 组件要点
- 按钮 primary 金底深墨字 / secondary 透明 1px 边 / danger 仅破坏性且可撤销 150ms
- 商品卡 ink-700 + 1px border + radius 10 + padding 12；5 态全覆盖，文案产品特定
- 气泡 = 宣纸便利贴（damp-0 底 + 随机旋转 ±2°）；警示气泡 warn 边线不自动消失
- HUD 六件：气象牌(top-center 264x64) / 金币 pill / 商店 / 设置 (top-right) / 工具箱 (bottom-left) / 锚定气泡
- 老板键 Ctrl+Alt+H 专注模式（HUD 淡至 15%，in-world 暂停）
- Demo 控制台 Ctrl+Shift+D：时间机器 / 场景预设 / 一键培育 / 状态读数；焦点圈禁 + Esc 关闭

## 反 AI 模板（构建期校验）
- 禁：Welcome to / Lorem ipsum / Sign up today / 无缝 / 赋能 / 闭环 / 极致 / 一站式 / 数据驱动
- 禁：相同卡片网格无限重复、每节小型大写标签、编号 section 标记、幽灵卡片（1px 边 + blur>=16px 同现）
- 禁：border-left >1px 作装饰强调（警示场景除外）

## 变更记录
| 日期 | 变更 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-10-17 | v1.0 初版 | 基于 PRD v1.0 立项 | 全部 |
