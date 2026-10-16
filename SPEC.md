# Spec - 回南天 Cyber Damp MVP v1.0

> 生成日期：2026-10-17
> 基于：PRD v1.1（PM 许清楚，2026-10-17 绳索口径补全版）+ 架构文档 v1.0（高见远，含绳索字节口径落盘）+ DESIGN.md v1.1（颜好看，架构对齐版）
> 状态：已锁定（Phase 2/3/4 唯一依据）

---

## 1. 产品定义

- **一句话描述**：全球首款支持「文件发霉、拉绳晾晒、赛博蘑菇采摘」的桌面湿度管理玩具——桌面文件按冷落度受潮发霉长蘑菇，玩家用家务工具箱晾晒除湿，采摘蘑菇卖币升级装备。
- **目标用户**：20-32 岁 Windows 桌面长期杂乱的轻办公人群 + 猎奇向独立游戏玩家（直播整活/B 站抖音录屏传播）。
- **核心问题**：把「面对杂乱桌面」从生产力焦虑重新框定为解压玩具——不清理、不美化，让文件乱得有生命力。

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 优先级 | 功能 | 验收标准摘要 | 来源 |
|--------|------|-------------|------|
| P0 | 开机时光坍缩演出（3s 精简版） | AC-01：3s 内完成初始化，≤10s 解锁交互 | PRD 跨模块 |
| P0 | 虚拟文件树 + mtime 四阶段冷落度 | AC-06~AC-11 | PRD 模块二 |
| P0 | 分格式差异化受潮（文档墨洇/图片褪色/音频鼓袋/压缩包胀气） | AC-10 | PRD 模块二 |
| P0 | 气象牌 + 本地气候档案切城 + 迁徙 1 次/日 | AC-03/AC-04 | PRD 模块一 |
| P0 | 程序化湿度系统 + 高湿挂雾 + 色温偏移 | AC-02 | PRD 模块一 |
| P0 | CPU>80% 电脑出汗（顶框汗珠滴落） | AC-05 | PRD 模块一 |
| P0 | 悬链线晾衣绳（边缘拖出 + 拖挂 + 对数配重下垂） | AC-12（双轨：下垂=sizeToMass 对数；崩断=Σ sizeBytes 字节 5GB/25GB/≥100GB） | PRD 模块三 |
| P0 | 拧毛巾手势除湿（画圈满 1 圈，humidity ×0.5） | AC-14 | PRD 模块三 |
| P0 | 剪刀采摘成熟蘑菇 + 脆响音效 | AC-15 | PRD 模块三 |
| P0 | 蘑菇三阶段生长 + N 平菇 + R 金针菇（0/1 粒子） | AC-17/AC-18 | PRD 模块四 |
| P0 | 赛博小蜗牛（食青苔留银道） | PRD 模块四 | PRD 模块四 |
| P0 | 除湿币 + 本地持久化存档 | AC-24 | PRD 模块五 |
| P0 | 杂货铺 UI + 购买流程（绳索 2 档 P0：麻绳免费/红塑料绳 100 币） | AC-21/AC-22 | PRD 模块五 |
| P0 | 老式绿头摇头电扇（250 币，绳浪风干加成） | AC-23 | PRD 模块五 |
| P0 | ASMR 音效最小集（WebAudio 程序合成，无音频资产） | PRD 跨模块 | PRD 跨模块 |
| P0 | 点击穿透（空白穿透/交互物拦截，仅跳变调用） | AC-26 | 跨模块 |
| P0 | 安全红线：零真实文件访问、零网络请求 | AC-25 | 跨模块 |
| P0 | WebGL 上下文丢失自动重建 + 错误边界降级 | AC-27 | 跨模块 |
| P0 | 全屏应用/锁屏自动暂停渲染物理 | AC-28 | 跨模块 |
| P0 | 新手引导（前 5 分钟体验流：悬停学习→拧干→晾晒→采摘→售卖→首购目标） | PRD §7.1 | PRD §7 |
| P1 | 304 不锈钢防风晒衣杆（800 币毕业装备，≥100GB 刚性） | AC-21 通用购买流 | P0 验收后紧接 |
| P1 | 胆小菇缩头行为（鼠标 120px 内缩回，盲剪捕捉；纯行为，杂交条件不做） | PRD 模块四 P1 | P0 验收后紧接，路演前必须可用 |
| P1 | 绳索断裂/配重失衡滑落挤团 + 霉菌交叉感染 | AC 模块三 P1 | P0 验收后 |
| P1 | 手持吹风机 + 过热焦化 + 保湿喷雾恢复 | PRD 模块三 P1 | P0 验收后 |
| P1 | 橡胶刮水器屏幕刮水 | PRD 模块三 P1 | P0 验收后 |
| P1 | Demo Mode 上帝控制台（Ctrl+Shift+D：一键回南天/一键挂满/一键培育/状态读数）。**容量预检硬约束**：一键挂满选文件必须 Σ bytes ≤ 当前绳型字节上限（超出贪心截断至下限内）；深 V 演示绳固定用红塑料绳（25GB 会下垂），304 钢杆刚性不下垂禁止用于深 V演示；手动挂载超限保持啪嗒滑脱戏剧效果不拦截（god console 是唯一例外） | AC-31 + AC-32 + AC-33 | 路演前必须插入 |
| P1 | 音频类八音盒走调旋律、压缩包假碎片 | PRD 模块二 P1 | P0 验收后 |
| P1 | 字符滴落（，；{}）+ 小扫把 | PRD 模块二 P1 | P0 验收后 |
| P2 | 本地事件埋点（JSONL，trackEvent 封装） | PRD §11 | 收尾 |

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| 真实桌面文件扫描/隐藏原生图标/替身托管 | 安全红线风险最高（Win32 句柄、杀软误报）；虚拟文件树完全替代玩法验证 | v2（先过安全评审，只读元数据导入） |
| 三维孟德尔杂交公式 + SR/SSR/UR 完整培育 | 用户指定搁置；状态机复杂度 MVP 无法验证 | v2 核心内容 |
| 麦克风真实吹气 | 硬件权限+风噪算法+演示环境不可控 | v2 再议 |
| 核爆毁灭菇爆炸链/焦痕弹坑 | 牵连周围图标状态批量修改，与 MVP 温和基调冲突 | v2 |
| 脱水木乃伊化/噼啪静电 | 干旱惩罚边缘分支，状态复杂度不划算 | v2 |
| 真实天气 API/每日迁徙服务端计数 | 零后端约束 | v2（若上后端） |
| UGC 工坊/皮肤市场 | Wallpaper Engine 工坊投毒事件证明审核成本巨坑 | v3+ |
| 多人联机/交易行 | 与零后端冲突；Banana 案例证明投机经济反噬口碑 | 永不 |
| macOS 版本 | Electron 透明穿透 macOS 行为差异大，双平台验收失焦 | v2 |
| 真 Mesh 顶点坍缩变形 | 用 sprite scale+skew+顶点偏移近似（架构 §5.3） | v2 |
| 水珠折射桌面真实背景 | 透明 WebGL 画布物理不可采样桌面像素；改为图标自身纹理局部折射+高光+暗环（视觉等价） | 技术不可行，永久降级方案 |
| 自动更新 | portable 目标无 app-update.yml；未签名 SmartScreen 提示 MVP 接受（README 写明） | 签名后 |

## 4. 技术架构（锁定 — 含版本锚定）

> 版本锚定：2026-10-16 经 npm registry dist-tags + 官方文档双重核验。开发一律按本表 API 形态书写，禁止凭记忆；升级任一版本前必须重跑核验。

| 层 | 技术 | 实际版本 | 锁定原因 |
|----|------|----------|----------|
| 桌面外壳 | Electron | 44.8.0 | 44 线最新稳定（Chromium 152/Node 24.18/V8 15.2），透明穿透 API 文档完备 |
| 渲染 | Pixi.js | 8.21.0 | v8 唯一主线；Filter/GlProgram 自定义 GLSL 一等公民；异步 init |
| 物理 | Matter.js | 0.20.0 | Composites.chain 绳索范式 + 刚体碰撞（挤团/摔落依赖） |
| 物理类型 | @types/matter-js | 0.20.2 | 与 0.20 对齐 |
| 图标 | Lucide | 1.58.0 | 零依赖 ISC；DOM 的 createIcons + Pixi 纹理两处消费；全项目唯一图标源 |
| 构建 | Vite | 8.3.4 | Rolldown+Oxc 工具链；renderer 零框架单页 |
| 语言 | TypeScript | 5.9.3 | 5.x 收官版 |
| Node 类型 | @types/node | 24.19.2 | 对齐 Electron 内置 Node 24 |
| 打包 | electron-builder | 26.15.3 | win.target: 'portable' 单文件免安装 |
| 存档 | 本地 JSON（node:fs 原子写） | 无依赖 | <100KB；tmp+rename 原子替换 |
| 天气源 | 本地种子模拟器（自研） | — | 零配置零 Key，确定性可回放 |
| 音效 | Web Audio 程序合成 | 浏览器内置 | 无二进制音频资产 |

**进程分层**（架构 §3）：main（窗口/穿透 IPC/CPU 采样/存档原子写）→ preload（contextBridge 唯一通道 `window.damp`）→ renderer（DOM 覆盖层 ui/ + Pixi 画布 view/ + Matter 世界 physics/ + 纯领域层 world/ + 输入层 input/）。铁律：依赖只向下；world/ 禁 import pixi/matter/electron；单文件 ≤300 行；入口文件只装配 <100 行。

**关键 API 形态锚点**（防幻觉）：
- `win.setIgnoreMouseEvents(ignore, { forward: true })`，仅命中态跳变时经 IPC 调用，禁止逐帧
- `const app = new Application(); await app.init({...})`（Pixi v8 异步 init，无同步构造）
- `new Filter({ glProgram: new GlProgram({vertex, fragment}), resources })`，uniform 走 `filter.resources.<group>.uniforms.<name>`
- `Composites.chain` + `Constraint.create({ bodyA, pointB })`（bodyB 缺省=世界锚点）
- Vite 8：`build.rollupOptions` → `build.rolldownOptions`（本项配置最小化，无此需求）

## 5. IPC 契约（锁定——本项目零 HTTP 面，以此替代 openapi）

> 机器可读契约：`docs/contracts/preload-api.md`（v1.0，架构师产出）。使用纪律四条（沉默逻辑错误高发区，作为验收断言）：
> 1. 穿透仅跳变调用，禁止逐帧；常态 `forward: true`
> 2. save 防抖 5s + beforeQuit flush
> 3. load 失败/版本不符返回 null 走新开局
> 4. CPU 采样 2s 间隔，main 侧计算，renderer 只接收

| 通道 | 方向 | 功能 |
|------|------|------|
| `window.damp.window.setIgnoreMouseEvents(ignore)` | R→M | 命中态跳变时切换穿透 |
| `window.damp.window.getBounds()` | R→M | 工作区 bounds |
| `window.damp.save.load()` | R→M | 读存档（失败返回 null） |
| `window.damp.save.save(data)` | R→M | 写存档（原子） |
| `window.damp.system.onCpu(cb)` | M→R | CPU 占用率推送（2s） |
| `window.damp.app.quit()` / `.version()` | R→M | 退出/版本 |

## 6. 数据模型（锁定）

> 机器可读契约：`docs/contracts/save-schema.json`（schemaVersion: 1）。只存逻辑态，不存 Matter 刚体；mtime/x/y/name/ext/size 来自确定性虚拟桌面生成器，不入存档。

- **FileNode**：`{ id, name, ext, category: 'doc-code'|'image-video'|'audio'|'archive', sizeBytes, mtime, x, y }`
- **FileRuntime**：`{ id, humidity: 0..1, mold: 0..1, char: 0..1, stage: 'fresh'|'damp'|'wet'|'moldy', state: 'idle'|'hung'|'drying'|'burnt', mushroom: { species, growth }|null }`
- **演化状态机**（world/evolution.ts 纯函数可单测）：humidity 趋向 env.humidity×0.9；mold += dt×0.004×humidity；mold>0.6 蘑菇萌生 growth += dt×0.01；heat>0.8 且 humidity<0.3 时 char += dt×0.01；char>0.6 锁定 burnt；hung+wind>0.5 风干 ×1.8
- **sizeToMass**：`0.4 + log10(max(kb,1)) × 0.8`（仅下垂深度：1KB→0.4 / 1MB→4.8 / 1GB→8.4 / 24GB→9.8；质量比 ≤35:1 防迭代抖动）
- **绳索崩断（字节判定，硬约束）**：该绳 Σ sizeBytes 超绳型字节上限时移除锚点约束——麻绳 5GB / 红塑料绳 25GB / 304 不锈钢杆 ≥100GB（MVP 文件树最大 24GB 等效不限）。GB 统一定义为 1024³ 字节（GiB 语义，与文件系统一致），在 shared/constants.ts 锁定 `GB = 1024**3`
- **下垂单一来源（防双源真相，硬约束）**：绳索形状 100% 由 Matter 物理解算涌现，sizeToMass 是唯一下垂驱动量。设计文档 sag_px 公式仅作视觉目标/验收参考，**禁止用作渲染输入**；代码中不得存在按文件大小直接计算绳形的分支（QA 以源码审查断言）
- **80% 预警态（P1 表现层）**：Σ sizeBytes ≥ 0.8 × 绳型字节上限时绳体颤抖 + 断裂粒子 + DOM 警示角标；不改变物理解算与崩断时机；DOM 预警角标必须 `pointer-events: none`（穿透窗口纪律）。崩断字节判定为 P0，预警表现为 P1
- **虚拟桌面生成器**：mulberry32（seed=日期派生，同日同桌面）；40-60 节点，4 类 ext 加权；sizeBytes 对数均匀 1KB~24GB；mtime 分布 0-400 天保证 ≥8 个 >30 天陈年老文件；初始布局用 PRD §7.2 十六个梗文件名（demo.mp4=2.3GB 演示深 V，低于麻绳 5GB 上限不误触断裂）
- **存档 schema**：`{ schemaVersion: 1, savedAt, player: { coins, owned, equipped }, weather: { city, migratedOn }, files: [...], ropes: [...], stats }`；tmp+rename 原子写；读失败降级新开局

## 7. 页面/界面清单（锁定）

| 界面 | 载体 | 核心组件 | 对应功能 |
|------|------|------|------|
| in-world 画布 | Pixi.js canvas（全工作区透明） | 文件替身/晾衣绳/蘑菇/蜗牛/粒子/Shader（水珠、霉斑、焦化、挂雾） | 模块二/三/四全部世界内交互 |
| 气象牌 | DOM（top-center 264x64） | 城市/天气图标/湿度 mono 读数/迁徙按钮（plane+剩余次数） | 模块一 |
| 金币 pill + 商店/设置 | DOM（top-right） | coins 图标+mono 数字滚动/44x44 入口 | 模块五 |
| 工具箱 | DOM（bottom-left 44x44 弹出） | 剪刀/吹风机/保湿喷雾/刮水器工具格 | 模块三 |
| 杂货铺侧栏 | DOM（右侧抽屉 360px 滑入 320ms） | 账簿页眉/三分区商品卡/购买按钮/五态 | 模块五 |
| 提示气泡 | DOM（锚定触发物） | 宣纸便利贴隐喻，6s 自动消失，警示切 warn 边线不消失 | 新手引导 |
| Demo 控制台 | DOM（模态 z=400 居中 560px，Ctrl+Shift+D） | 时间机器/场景预设/一键培育/状态读数 | P1 路演 |
| 时光坍缩演出 | Pixi + WebAudio（启动 3s） | 起雾→日历飞转→延时变质→啵啵长菇→孢子收尾 | 跨模块 P0 |

## 8. 设计 Token（锁定）

> 真相源：`design-system/design-tokens.css`（v1.1，四层 A1-identity/A1-structure/A2/B-slot/C-extension）。前端复制为 `src/renderer/ui/tokens.css` 由 index.html 引入；组件只写 `var(--token)`，唯一例外 #fff/#000。

- **主色**：陈铜金 `--accent: #C0952F`（唯一主色，**仅限 DOM chrome**；每屏可见 ≤2 处，只给 CTA/金币/选中）
- **in-world 画布色板**：世界色板（麻绳 #A88B5F/红塑料绳 #C0453A/不锈钢 #C9CDD3/青苔 #6E7F4E→#45542F/焦化 #4A3826 等）；金色仅三处允许进画布：金币粒子/+N 飘字/选中描边/晴天丁达尔光；干草绿不进画布（金绿域隔离）
- **字体**：display Noto Serif SC 600/700（旧书页气质）/ body Noto Sans SC 400-700 / mono JetBrains Mono（tabular-nums）；3500 常用字子集化随包，保留系统回退链
- **图标**：Lucide 1.58.0 唯一来源（DOM 层 `createIcons({ icons })` 显式子集注册 + `data-lucide` 占位；Pixi 画布实体程序化绘制不用图标贴图）；尺寸 16/20/24px 三档；项目自定义 SVG 集仅 DOM chrome 使用（悬链线绳/四种蘑菇剪影/湿度计指针/刮水器等）
- **主题**：暗色 veil 一套（透明桌面基底），`--panel-bg: rgba(16,19,15,0.90)`，`data-veil="high/low"` 适配极端壁纸
- **文件四阶段**：fresh 干宣纸 #E9E2CF / damp 冷凝 #C7D9DC+高光 #F4FAFB / wet 青苔 #6E7F4E / moldy 深苔 #45542F
- **Shader 基准色**：水珠高光 #F4FAFB / 霉斑 #6E7F4E→#45542F / 焦化 #4A3826 / 挂雾 --fog-cool #DFE9EA；滤镜只挂 Sprite 禁挂 stage；粒子 ≤300；DPR ≤2；hidden 暂停 ticker

## 9. 验收标准（锁定——QA 测试唯一依据）

> 继承 PRD v1.1 的 AC-01~AC-28（EARS 格式），以下为与 Spec 锁定相关的修订与新增：

| 编号 | 功能 | EARS 格式验收标准 | 优先级 |
|------|------|-------------------|--------|
| AC-01 | 启动 | While 应用启动，the system shall 在 3 秒内完成虚拟文件树初始化并进入开机演出，且不晚于 10 秒解锁交互控制权 | P0 |
| AC-02 | 挂雾 | While 全局湿度 ≥80%，the 渲染层 shall 在屏幕四边持续显示半透明水雾且桌面色温向冷偏移，帧率 ≥50fps | P0 |
| AC-03 | 迁徙 | When 用户在气象牌切换城市，the system shall 在 2 秒内完成本地气候档案切换、更新湿度目标并播放迁徙音效 | P0 |
| AC-04 | 干旱城 | While 所选城市为干旱档案，the system shall 使全局湿度持续走低且文件变质速度显著低于高湿城市 | P0 |
| AC-05 | 出汗 | When CPU 占用连续 5s >80%，the system shall 在屏幕顶框触发出汗效果且正下方文件湿度以每秒 10% 上升 | P0 |
| AC-06 | 冷落度 | When 虚拟文件树加载，the system shall 按 ΔT 映射四阶段：<3d fresh / 3-14d damp / 14-30d wet / >30d moldy | P0 |
| AC-07 | 轻度 | While 文件处于 damp，the 渲染层 shall 显示冷凝水珠且文件名标签墨水晕染模糊 | P0 |
| AC-08 | 中度 | While 文件处于 wet，the 渲染层 shall 显示边缘软化塌陷且四角绒毛青苔 | P0 |
| AC-09 | 重度 | While 文件处于 moldy，the 渲染层 shall 显示青苔覆盖率 >40% 且进入蘑菇生长流程 | P0 |
| AC-10 | 分格式 | When 文件为文档/代码类 shall 宣纸洇染；图片/视频类 shall 褪色油彩水膜；音频类 shall 底部蓄水鼓袋 | P0 |
| AC-11 | 健康态 | While 文件湿度 0 且 ΔT<3d，the 渲染层 shall 显示无异常干爽状态 | P0 |
| AC-12a | 绳下垂 | When 用户拖出晾衣绳并挂文件，the system shall 使绳垂度与所挂文件总重量（sizeToMass 对数映射）正相关，10KB 微垂、20GB 级深 V | P0 |
| AC-12b | 绳崩断 | When 该绳悬挂文件 Σ sizeBytes 超过绳型字节上限（麻绳 5GB/红塑料绳 25GB/不锈钢 ≥100GB），the system shall 移除锚点约束使文件摔落任务栏弹跳 | P0 |
| AC-13 | 风干 | When 文件挂上晾衣绳，the system shall 使其湿度以每分钟 5%-15%（受全局湿度影响）下降 | P0 |
| AC-14 | 拧干 | When 用户对湿度 >30% 文件顺时针画圈满 1 圈，the system shall 播放拧干动画并使湿度立即下降 50% | P0 |
| AC-15 | 采摘 | When 用户选剪刀点击成熟蘑菇，the system shall 播放采摘动画与脆响音效并将蘑菇移入库存 | P0 |
| AC-16 | 晴天 | While 全局湿度低（晴天档案），the 绳上文件风干速率 shall 为高湿环境 2 倍 | P0 |
| AC-17 | 平菇 | When 文件 ΔT >14 天，the system shall 按概率生成 N 级平菇并经萌发/幼菇/成熟三阶段至可采摘 | P0 |
| AC-18 | 金针菇 | When 文件为代码/程序类，the system shall 按概率生成 R 级金针菇，菌盖散落荧光绿 0/1 粒子 | P0 |
| AC-19 | 未成熟 | While 蘑菇未成熟，the 剪刀 shall 对其无效且不显示采摘提示 | P0 |
| AC-20 | 售卖 | When 用户售卖蘑菇，the system shall 按稀有度加币（N=5/R=30）并即时更新余额 | P0 |
| AC-21 | 购买 | When 金币 ≥ 价格且点击购买，the system shall 扣币、发货并立即生效（绳升级即时改外观承重，电扇放置即摇头） | P0 |
| AC-22 | 红塑料绳 | When 用户购买红塑料绳，the 承重上限 shall 从 5GB 提至 25GB 且绳外观更换为红色塑料绳 | P0 |
| AC-23 | 电扇 | When 用户购买并放置电扇，the 电扇 shall 自动摇头并对周围 300px 内绳上文件附加风干加成 | P0 |
| AC-24 | 存档 | When 应用重启，the system shall 从本地存档恢复金币/库存/道具/文件状态，且冷落度按真实时间差继续演进 | P0 |
| AC-25 | 安全 | While 应用运行，the system shall 不读取/修改/移动/重命名用户任何真实文件（QA 以文件系统监控全程验证） | P0 |
| AC-26 | 穿透 | When 鼠标位于透明空白区 shall 穿透至下层；When 位于文件/绳/道具 shall 拦截响应 | P0 |
| AC-27 | 容错 | When 前端未捕获错误，the system shall 记录事件、保持进程存活且不丢失存档 | P0 |
| AC-28 | 暂停 | While 用户运行全屏应用，the system shall 自动暂停渲染与物理模拟 | P0 |
| AC-29 | 蜗牛 | When 桌面同时 ≥3 个 mold 文件，the system shall 生成蜗牛食苔留银道；戳一下缩壳掉落 | P0 |
| AC-30 | 胆小菇(P1) | When 鼠标进入胆小菇 120px 半径，the 胆小菇 shall 0.2s 内缩回图标背面；移远后快速划剪可完成盲剪 | P1 |
| AC-31 | Demo 台(P1) | When 用户按 Ctrl+Shift+D，the system shall 呼出控制台；一键回南天使选中文件 3s 内走完出水→变软→长蘑菇 | P1 |
| AC-32 | Demo 挂满(P1) | When 用户点击一键挂满，the system shall 容量预检（Σ bytes ≤ 当前绳型字节上限，超出贪心截断），且点击后 5 秒内无崩断事件触发 | P1 |
| AC-33 | Demo 深V(P1) | While 深 V 演示进行中，the 演示绳 shall 保持绳型固有垂度特性（红塑料绳深下垂；304 钢杆刚性不垂） | P1 |
| AC-34 | 下垂单一来源(P0) | While 渲染晾衣绳，the 渲染层 shall 直接采样 Matter 绳链刚体坐标，代码中不得存在按文件大小直接计算绳形的分支（源码审查断言） | P0 |
| AC-35 | 80%预警(P1) | While 该绳 Σ sizeBytes ≥ 0.8 × 绳型字节上限，the 表现层 shall 显示绳体颤抖+断裂粒子+DOM 警示角标（pointer-events:none），且不得改变崩断判定时机 | P1 |

## 10. 边界与约束

- 响应式维度非移动断点：多显示器（HUD 锚主屏，in-world 覆盖工作区）、DPI 100-200%（--ui-scale 整体缩放）、任务栏避让（HUD 距屏缘 ≥16px）；监听 `display-metrics-changed` 重算 bounds
- 性能目标：冷启动到可交互 <3s；200 文件+2 绳+30 蘑菇同屏 ≥50fps；空闲内存 <300MB；空闲 CPU <5%
- 物理精度：Matter 质量比 ≤35:1；constraintIterations 4 / positionIterations 8；固定步长 16.666ms 累加器，禁止可变 dt 直喂
- 兼容：Windows 10/11 x64；WebGL2 不可用降级 Canvas 2D（特效简化）；不需要管理员权限；权限清单为空
- 并发：同文件多效果叠加不超 100% 湿度；最多 2 条绳并存
- 边界值：湿度钳制 0-100；文件上限 200（超按冷落度取前 200）；0 字节空文件重量下限保护（绳不下垂穿帮）
- 文案红线：禁止「一键清理/高效整理」类效率话术；空状态/错误文案必须产品特定（"货架搬空了。晾衣杆毕业之后，这家店只剩回忆。"）

## 11. 内嵌已知坑（架构 R1-R12 + Spec 锁定教训）

| 坑 | 技术栈指纹 | 根因 | 修法 |
|----|------------|------|------|
| Pixi v7→v8 API 断裂 | pixi.js-8 | 异步 init/Filter 新构造/Graphics build-then-fill/ESM-first | 一律按 v8 文档；await app.init()；禁 beginFill；tsc 门必过 |
| Vite 8 Rolldown/Oxc 换血 | vite-8 | rollupOptions→rolldownOptions、esbuild→oxc | 配置最小化，不用 rollupOptions |
| 绳索崩断按质量判定无差异 | matter-js-0.20 + 本项目 | 对数映射下 5GB vs 25GB 质量仅 5.8 vs 6.3 | 字节累计判定（AC-12b），sizeToMass 仅下垂 |
| Matter 质量比抖动 | matter-js-0.20 | 约束迭代解算，质量比 >40:1 抖 | ≤35:1；固定迭代数；固定步长 |
| setIgnoreMouseEvents 逐帧掉帧 | electron-44 | API 原生开销 | 仅跳变调用；常态 forward:true |
| 透明 WebGL 全屏滤镜掉帧 | pixi.js-8 + win | alpha 合成每帧全图采样 | 滤镜只挂 Sprite；粒子 ≤300；DPR ≤2；hidden 暂停 |
| matter-js CJS + @types 混乱 | matter-js-0.20 | 导入形态 | 统一 import Matter from 'matter-js' 解构 |
| lucide 无内置类型 | lucide-1.58 | tsc 报错 | ambient d.ts；显式子集注册 |
| 透明窗+alwaysOnTop 与全屏应用 z-order 冲突 | electron-44 + win | 系统级 | 专注模式降透明度而非抢焦点；powerMonitor 锁屏暂停 |
| WebGL 上下文丢失 | pixi.js-8 | GPU 重置 | webglcontextlost 阻止默认 + restore 重建纹理 |
| 存档并发/损坏 | 自研 save | 多开覆盖/写入中断 | 单实例锁；tmp+rename；schemaVersion 迁移 |
| 字体回退断裂 | font-subset | 子集化后缺字 | 3500 常用字+系统回退链 |

## 12. 端到端验证步骤（Spec 锁定最后一项）

```bash
# 1. 安装与类型门
npm install
npm run typecheck          # 断言：零错误

# 2. 构建与启动
npm run build              # dist/renderer + dist/main
npm start                  # 断言：透明无边框置顶窗口出现；空白处点击穿透，图标处拦截

# 3. 核心成功流（QA 按 AC-01~AC-29 逐条）
# - 冷启动 3-10s 延时演出：老文件出水珠→变软→长蘑菇；toast 报"X 个文件急需晾晒"
# - 左缘拖出晾衣绳：挂 10KB txt 微垂；挂 demo.mp4(2.3GB) 深 V；不误触断裂
# - 湿文件顺时针画圈 1 圈：拧麻花+飙水，humidity ×0.5
# - 气象牌切城敦煌：受潮速率下降；切回广州恢复；同日二次迁徙被拒
# - 剪成熟平菇：+5 币；商店买红塑料绳(100 币)：绳变红、承重 25GB
# - 放置电扇：摇头+绳浪
# - 退出重启：coins/装备/文件状态/绳上文件全恢复

# 4. 关键错误流
# - WebGL 上下文丢失：自动重建不白屏
# - save.json 损坏：降级新开局不崩
# - CPU >80%：顶框汗珠滴落

# 5. 代码组织门禁
find src -name '*.ts' -exec wc -l {} + | awk '$1>300'   # 断言：无 >300 行文件
# emoji 正则扫描 src/ 全部源文件                      # 断言：0 命中

# 6. 打包
npm run dist:win            # 断言：release/ 产出单文件 portable exe
```

## 13. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-10-17 | Spec v1.0 生成 | Phase 1 三文档确认后自动生成 | 全量锁定 |
| 2026-10-17 | AC-12 拆分为 AC-12a（下垂）/AC-12b（崩断）双轨 | 绳索承重单位漂移修正（架构师发现，PM 核验补全） | 模块三 |
| 2026-10-17 | 绳索崩断判定锁定字节累计（5GB/25GB/≥100GB） | 对数映射下按质量判三档无差异（沉默逻辑错误） | 模块三/五 |
| 2026-10-17 | 胆小菇缩头锁定 P1；不锈钢杆锁定 P1（P0 验收后紧接） | 总监裁定 | 模块四/五 |
| 2026-10-17 | 音频类蓄水鼓袋锁定 P0（不降级） | 总监裁定：模块二验收线含四类格式差异化 | 模块二 |
