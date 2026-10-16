# 《回南天 (Cyber Damp)》架构文档 v1.0

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 日期 | 2026-10-16 |
| 作者 | 首席架构师 高见远 |
| 状态 | 已锁定（Phase 2 开工依据） |
| 上游输入 | PRD.md v1.0（第 2/3/4/6 章）、项目总监大湾区靓仔派发口径 |
| 适用范围 | Windows 桌面端 MVP；macOS 与真实桌面扫描不在本期范围 |

## 0. 一句话架构结论

Electron 44.8.0 提供透明置顶穿透外壳，Pixi.js 8.21.0（WebGL）渲染游戏世界与写实 Shader，Matter.js 0.20.0 驱动悬链线与刚体，虚拟文件树作为 MVP 唯一数据源，Lucide 1.58.0 作为全项目唯一 SVG 图标库，零后端零数据库零认证，存档落盘 userData/save.json，electron-builder 26.15.x 出 Windows 便携版单文件。

---

## 1. 技术选型对比矩阵与最终锁定表

评分口径：学习成本 / 生态成熟度 / 部署成本 / 团队熟悉度 为高权重；扩展性低权重（MVP 不为三年后的规模买单）。评分 1-5 星。

### 1.1 桌面外壳（运行时）

| 方案 | 透明窗口+穿透 API 成熟度 | 打包体积 | 学习成本 | 生态 | 结论 |
| --- | --- | --- | --- | --- | --- |
| Electron 44.8 | 官方文档级支持（setIgnoreMouseEvents + forward），大量先例 | ~90MB 起 | 低（Web 技术栈直通） | 极丰富 | **选定** |
| Tauri 2.x | 支持透明/穿透，但 Windows WebView2 版本碎片化，穿透行为需逐版本验证 | ~3MB 起 | 高（Rust 工具链 + 新 API） | 中 | 否决：MVP 阶段不为省 80MB 引入 Rust 链与 WebView2 碎片化风险 |
| Unity URP 2D（PRD 方案 A） | 透明色键窗口成熟，但 Shader Graph 迭代慢、包体 60MB+、团队无 Unity 经验 | 大 | 高 | 中 | 否决：视觉上限高但迭代速度与团队熟悉度双输，详见 ADR-001 |
| WPF/.NET 原生 | 系统集成最好 | 小 | 高（无 WebGL Shader 管线） | 中 | 否决：水珠/霉斑 Shader 无法落地 |

### 1.2 渲染层

| 方案 | Shader/滤镜能力 | 2D 场景图 | 物理对接 | 结论 |
| --- | --- | --- | --- | --- |
| Pixi.js 8.21 | v8 全新 Filter/GlProgram 体系，自定义 GLSL 一等公民 | 成熟 | 无耦合，任意 JS 物理引擎可驱动 | **选定** |
| Phaser 3 | 内置 Arcade Physics，但物理能力不足以做绳索刚体；Shader 需走 Pipe 体系，自由度低 | 成熟 | 绑定过深 | 否决：绳索 + 写实滤镜双需求都不适配 |
| 裸 WebGL2 | 上限最高 | 无 | 无 | 否决：MVP 周期不允许自建场景图/合批/文本 |
| Three.js | 2D  overlay 场景用 3D 引擎属倒挂 | 3D 向 | 无 | 否决：场景规模不匹配 |

### 1.3 物理层

| 方案 | 绳索/约束 | 刚体碰撞 | 生态/文档 | 结论 |
| --- | --- | --- | --- | --- |
| Matter.js 0.20 | Composites.chain + Constraint 到世界锚点，官方 bridge/cloth 示例即绳索范式 | 有（文件挤团、摔落弹跳依赖它） | 极丰富，@types/matter-js 0.20.2 | **选定** |
| Planck.js（Box2D 移植） | 解算质量更高 | 有 | 社区与文档量小一档，API 面更大 | 否决：MVP 不需要 Box2D 级精度，学习成本不划算 |
| 自建 Verlet 绳 + 简易碰撞 | 绳索简单 | 无（挤团/交叉感染玩法做不了） | 无 | 否决：玩法依赖刚体碰撞，详见 ADR-003 |

### 1.4 构建与语言

| 方案 | 结论 |
| --- | --- |
| Vite 8.3.4 + TypeScript 5.9.3 | **选定**：渲染层零框架单页，Vite dev server + 构建足够；TS 5.9.3 为 5.x 最终线，生态认知度最高 |
| TypeScript 7.0.2（原生 Go 编译器） | 暂缓：发布仅 3 个月，编辑器/插件生态在迁移期，MVP 不抢鲜（见 ADR-006） |
| webpack 5 | 否决：配置重、dev 慢，无收益 |
| esbuild 裸用 | 否决：无 dev server/HMR |

### 1.5 图标库（P0 规则：必须锁定一套 SVG 图标库）

| 方案 | 体积/依赖 | 原生 DOM 用法 | Canvas 纹理化 | 结论 |
| --- | --- | --- | --- | --- |
| Lucide 1.58.0 | 零依赖，ISC | createIcons 扫描 data-lucide 属性，原生可用 | icon node 可序列化为 SVG 字符串再贴图 | **选定** |
| Font Awesome 6/7 | 免费档图标受限，CSS 体系偏重 | 需 FA 运行时 | 同左 | 否决：免费集覆盖不足本项目工具图标 |
| Heroicons | 仅 React/Vue 组件形态 | 需包一层框架 | 不可直用 | 否决：本项目 DOM 层不用框架 |
| 自绘 SVG 集 | 无依赖 | 可用 | 可用 | 否决：无版本管理、无增量图标、风格难统一 |

Lucide 锁定理由：零运行时依赖、ISC 协议、1500+ 图标覆盖全部工具/天气/商店语义、原生 DOM 直接可用（不绑框架）、图标以 `[tag, attrs, children]` node 形式导出，可同时服务 DOM 层与 Pixi 纹理层，一套数据两处消费。**全项目唯一图标来源，禁止 emoji 充当功能图标，禁止混用其他图标库。**

### 1.6 最终锁定表（每层技术 + 确切版本 + 锁定理由）

| 层 | 技术 | 锁定版本 | 锁定理由 |
| --- | --- | --- | --- |
| 桌面外壳 | Electron | 44.8.0 | 44 线为当前最新稳定线（Chromium 152 / Node 24.18 / V8 15.2），透明穿透 API 文档完备；45 尚在 beta |
| 渲染 | Pixi.js | 8.21.0 | v8 为当前唯一主线，WebGL 优先策略明确；7.x 已停止演进 |
| 物理 | Matter.js | 0.20.0 | 0.20.0 为 2024-06 后唯一稳定版，绳索/碰撞/序列化能力齐备 |
| 物理类型 | @types/matter-js | 0.20.2 | 与 matter-js 0.20 对齐，含 ts5.9 tag |
| 图标 | Lucide | 1.58.0 | 见 1.5 |
| 构建 | Vite | 8.3.4 | 当前稳定；渲染层无框架，配置面极小 |
| 语言 | TypeScript | 5.9.3 | 5.x 收官版，工具链认知度最高 |
| Node 类型 | @types/node | 24.19.2 | 与 Electron 44 内置 Node 24 主版本对齐 |
| 打包 | electron-builder | 26.15.3 | latest tag 所指稳定版；portable 目标文档明确（见 ADR-006） |
| 存档 | 本地 JSON（node:fs 原子写） | 无依赖 | 存档 < 100KB，JSON 直落；自写原子写约 40 行，不引 electron-store/lowdb |
| 天气源 | 本地种子模拟器 | 自研 | 满足"零配置零 Key"，确定性可回放（见 ADR-007） |
| 音效 | Web Audio 程序合成 | 浏览器内置 | 无二进制音频资产，雨声/滴水/脆剪全合成 |

---

## 2. 版本锚定表（2026-10-16 核验，防幻觉 API）

所有版本经 npm registry dist-tags 与官方文档双重核验。**开发与 Spec 一律按本表版本的 API 形态书写；升级任一版本前必须重跑本表核验。**

| 包 | 锚定版本 | 核验来源 | 关键 API 形态锚点 |
| --- | --- | --- | --- |
| electron | 44.8.0 | npm dist-tags latest；electronjs.org/blog/electron-44-0 | `new BrowserWindow({ transparent, frame:false, alwaysOnTop, hasShadow:false, backgroundColor:'#00000000' })`；`win.setIgnoreMouseEvents(ignore, { forward: true })`（macOS/Windows）；`win.setAlwaysOnTop(true, 'screen-saver')`；`app.getPath('userData')` |
| pixi.js | 8.21.0 | npm dist-tags latest；pixijs.com/8.x/guides/components/filters | `const app = new Application(); await app.init({...})`（异步 init，无同步构造）；`new Filter({ glProgram: new GlProgram({ vertex, fragment }), resources })`；uniform 更新走 `filter.resources.<group>.uniforms.<name>`；`app.canvas` 为挂载点；WebGL 为默认偏好（8.1 起顺序 webgl→webgpu→canvas） |
| matter-js | 0.20.0 | npm dist-tags latest；brm.io/matter-js/docs | `Composites.chain(composite, xOffsetA, yOffsetB, ...)`；`Constraint.create({ bodyA, pointB, stiffness, damping, length })`（bodyB 缺省即世界锚点）；`Body.setMass(body, mass)`；`Engine.update(engine, deltaMS)`；`Query.point(bodies, point)`；CJS 包，默认导入后解构 |
| @types/matter-js | 0.20.2 | npm dist-tags latest | 与 0.20.0 对齐 |
| lucide | 1.58.0 | npm dist-tags latest | `import { createIcons, icons } from 'lucide'`；`createIcons({ icons })` 替换 `[data-lucide]` 元素；无内置 TS 类型，需 ambient 声明 |
| vite | 8.3.4 | npm dist-tags latest；vite.dev/guide/migration | **Vite 8 = Rolldown + Oxc 工具链**：`build.rollupOptions` → `build.rolldownOptions`；`esbuild` 配置项 → `oxc`；`minify:'esbuild'` 已废弃；不再支持 ES5 降级 |
| typescript | 5.9.3 | npm dist-tags | 5.x 收官；TS 7（原生）在库但本期不用 |
| @types/node | 24.19.2 | npm old-version tag | 对齐 Electron 内置 Node 24 |
| electron-builder | 26.15.3 | npm dist-tags latest | `build.win.target: 'portable'` 出单文件便携 exe；portable 不生成 app-update.yml（无自动更新，MVP 可接受）；v27 为 ESM 化 alpha，不追 |

运行环境约束：开发机 Node >= 22.12（Vite 8 要求）；目标机 Windows 10/11 x64，任意支持 WebGL2 的 GPU（Chromium 152 自带 SwiftShader 软渲染兜底）。

---

## 3. 系统分层架构

### 3.1 进程图

```
+-----------------------------------------------------------------------+
|  MAIN 进程（Node，无 UI）                                              |
|  +------------------+  +-------------------+  +---------------------+ |
|  | 窗口管理          |  | 系统监控          |  | 存档存储            | |
|  | - 透明无边框置顶   |  | - os.cpus() 2s 采样|  | - userData/save.json| |
|  | - 全工作区 bounds  |  | - webContents.send|  | - tmp+rename 原子写 | |
|  | - display-metrics |  |   'system:cpu'    |  | - 读失败返回 null   | |
|  |   -changed 跟随   |  +-------------------+  +---------------------+ |
|  +------------------+                                                  |
|  IPC 路由：set-ignore-mouse-events / save:load / save:write / app:quit  |
+-----------------------------------------------------------------------+
        | contextBridge（唯一通道，contextIsolation=true，sandbox=true）
+-----------------------------------------------------------------------+
|  PRELOAD（隔离上下文）                                                 |
|  window.damp = { window:{setIgnoreMouseEvents,getBounds},              |
|                   save:{load,save}, system:{onCpu}, app:{quit,version} }|
+-----------------------------------------------------------------------+
        | 同一份 renderer 产物（Vite 构建）
+-----------------------------------------------------------------------+
|  RENDERER 进程（Chromium 152）                                        |
|  +----------------------------------------------------------------+  |
|  | DOM 覆盖层（ui/）：商店侧栏 / 气象牌 / 工具箱 / Demo 控制台 /    |  |
|  | Toast。Lucide 图标。pointer-events 按面板开关。                  |  |
|  +----------------------------------------------------------------+  |
|  | Pixi.js 画布（view/）：场景图层 / 文件替身 / 绳索 / 蘑菇 /       |  |
|  | 粒子 / Shader（水珠、霉斑、焦化、挂雾）                          |  |
|  +----------------------------------------------------------------+  |
|  | Matter.js 世界（physics/）：绳索约束链 / 文件刚体 / 挂夹约束 /   |  |
|  | 碰撞分组（绳-文件-任务栏）/ 点击命中 Query.point                  |  |
|  +----------------------------------------------------------------+  |
|  | 游戏领域层（world/，纯 TS）：文件实体 / 演化状态机 / 天气模拟 /   |  |
|  | 经济与商店 / 虚拟桌面生成器 / 存档序列化                          |  |
|  +----------------------------------------------------------------+  |
|  | 输入层（input/）：指针手势（拧、刮、剪、夹）/ 穿透命中状态机      |  |
|  +----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
```

### 3.2 分层依赖规则（由 code-organization.md 适配到桌面游戏形态）

```
ui/（表现层）      → 调 view/ 命令，读 world/ 状态；禁止直接操作物理体与存档 IO
world/（领域层）   → 只依赖 shared/；纯 TS 可单测；禁止 import pixi/matter/electron
physics/ view/（适配层）→ 依赖 world/ 类型定义 + pixi/matter；把领域状态翻译成画面与刚体
input/             → 依赖 world/ 与 view/ 的命中查询；把手势翻译成领域动作
main/ preload/     → 依赖 shared/ + electron/node；不接触游戏逻辑
shared/            → 叶子层，零依赖，类型与常量
```

铁律：依赖只向下；world/ 是被单向依赖的核心，任何渲染/物理细节不得渗入领域层。

---

## 4. 数据模型

### 4.1 虚拟文件节点（shared/types/file-node.ts）

```ts
export type ExtCategory = 'doc-code' | 'image-video' | 'audio' | 'archive';

export interface FileNode {
  id: string;            // 稳定 UUID（生成时确定，存档主键）
  name: string;          // 展示名，如 '季度汇报.docx'
  ext: string;           // 小写无点，如 'docx'
  category: ExtCategory; // 由 ext 映射，决定受潮/滴落物表现
  sizeBytes: number;     // 虚拟但真实量级，用于配重
  mtime: number;         // epoch ms；冷落度 = now - mtime
  x: number;             // 桌面工作区坐标（初始布局）
  y: number;
}
```

ext → category 映射表（constants.ts 锁定）：doc-code = docx/pdf/txt/md/py/c/js/exe；image-video = jpg/png/mp4/avi/mov；audio = mp3/wav/flac；archive = zip/rar/7z。未命中 ext 归 doc-code。

### 4.2 文件运行时状态（演化字段）

```ts
export type NeglectStage = 'fresh' | 'damp' | 'wet' | 'moldy';   // 由 mtime 推导
export type FileActionState = 'idle' | 'hung' | 'drying' | 'burnt';

export interface FileRuntime {
  id: string;
  humidity: number;   // 0..1 湿度
  mold: number;       // 0..1 霉变度
  char: number;       // 0..1 焦化度
  stage: NeglectStage;              // 派生：<3d fresh / 3-14d damp / 14-30d wet / >30d moldy
  state: FileActionState;           // 动作态
  mushroom: { species: MushroomSpecies; growth: number } | null; // growth 0..1，1 可采摘
}
```

### 4.3 演化状态机（world/evolution.ts，纯函数，可单测）

环境输入 `Env { humidity: number; heat: number; wind: number }`：

| 当前态 | 条件 | 转移 |
| --- | --- | --- |
| fresh/damp | env.humidity > 0.5 且 elapsed > 阈值 | humidity ↑（趋向 env.humidity×0.9） |
| damp/wet | humidity > 0.55 | mold += dt × 0.004 × humidity（青苔蔓延） |
| wet/moldy | mold > 0.6 | 蘑菇萌生：按 ext category 定菌种，growth += dt × 0.01 |
| 任意 | state=drying | humidity ↓（趋向 0.15） |
| 任意 | env.heat > 0.8 且 humidity < 0.3 | char += dt × 0.01（过热烘烤） |
| 任意 | char > 0.6 | state=burnt（焦化锁定，需保湿喷雾重置） |
| hung + wind > 0.5 | — | humidity 衰减 ×1.8（风干加成） |

玩家动作（均改字段不碰物理之外的东西）：拧（humidity ×0.5）；吹风机热风（heat=1 局部）；保湿喷雾（char→0，humidity +0.3）；夹子恒温烘干（state=drying 且不涨 char）。蜗牛事件：mold ≥ 0.7 的文件上 mold -= dt × 0.05（免费清洁）。

### 4.4 存档 JSON schema（docs/contracts/save-schema.json 为机器可读版）

```json
{
  "schemaVersion": 1,
  "savedAt": 0,
  "player": { "coins": 0, "owned": ["rope-1", "clip-1"], "equipped": { "rope": "rope-1", "clip": "clip-1" } },
  "weather": { "city": "guangzhou", "migratedOn": "2026-10-16" },
  "files": [
    { "id": "f-001", "humidity": 0.8, "mold": 0.4, "char": 0, "state": "idle",
      "mushroom": null }
  ],
  "ropes": [ { "id": "r-001", "ax": 120, "ay": 200, "bx": 1180, "by": 220, "tier": "rope-1", "fileIds": ["f-003"] } ],
  "stats": { "harvested": 0, "earned": 0, "playedMs": 0 }
}
```

存档策略：只存逻辑态，不存 Matter 刚体；加载时按 ropes/fileIds 重建物理。mtime/x/y/name/ext/size 来自虚拟桌面生成器（同 seed 确定性重建），不重复入存档。写入：tmp + rename 原子替换；读失败/版本不符返回 null 走新开局。

### 4.5 虚拟桌面生成器（world/virtual-desktop.ts）

确定性 PRNG（mulberry32，seed 由 `Date` 日期派生，保证同一天同一桌面）。产出 40-60 个 FileNode：4 类 ext 加权抽样；文件名池按类别分（季度汇报.docx / 毕业设计.zip / IMG_20230715.jpg / 039_混音最终版.flac / main.py / 新建文件夹 …）；sizeBytes 对数均匀分布（1KB ~ 24GB）；mtime 在 0-400 天前分布，保证至少 8 个 > 30 天的"陈年老文件"供开局延时演出。布局：网格 + 抖动，避开左右边缘 140px（晾衣绳吸附区）。

---

## 5. 核心交互的技术实现路径

### 5.1 透明置顶穿透窗口（main/window/create-overlay-window.ts）

```ts
const win = new BrowserWindow({
  transparent: true, frame: false, hasShadow: false, resizable: false,
  skipTaskbar: true, focusable: true, alwaysOnTop: true,
  backgroundColor: '#00000000',
  webPreferences: { preload, contextIsolation: true, sandbox: true },
});
win.setAlwaysOnTop(true, 'screen-saver'); // 压过任务栏
win.setBounds(workAreaBounds());          // 覆盖整个工作区（不含任务栏）
```

穿透控制走 Electron 官方教程模式：renderer 检测命中态变化时，经 IPC 让 main 调 `win.setIgnoreMouseEvents(true, { forward: true })` / `(false)`。**关键纪律：只在命中态跳变时调用，禁止每帧调用**（API 有原生开销，逐帧切会掉帧）；常态保持 `forward: true` 让 mousemove 持续送达 renderer 做命中测试。

### 5.2 悬链线晾衣绳（physics/rope-factory.ts）

```ts
import Matter from 'matter-js';
const { Bodies, Body, Composite, Composites, Constraint } = Matter;

export const CAT = { ROPE: 0x0001, FILE: 0x0002, TASKBAR: 0x0004 } as const;

export function createRope(world: Matter.World, ax: number, ay: number, bx: number, by: number) {
  const linkCount = 14;
  const seg = Math.hypot(bx - ax, by - ay) / (linkCount - 1);
  const links = Array.from({ length: linkCount }, (_, i) => {
    const t = i / (linkCount - 1);
    return Bodies.circle(ax + (bx - ax) * t, ay + (by - ay) * t, 3, {
      mass: 0.02, frictionAir: 0.03,
      collisionFilter: { category: CAT.ROPE, mask: 0 }, // 绳链互不碰撞也不撞文件
    });
  });
  const rope = Composite.create({ label: 'rope' });
  Composite.add(rope, links);
  Composites.chain(rope, 0, 0, 0, 0, { stiffness: 0.55, damping: 0.15, length: seg });
  // 两端点锚定到世界坐标（bodyB 缺省 = 世界锚点）
  Composite.add(rope, [
    Constraint.create({ bodyA: links[0], pointB: { x: ax, y: ay }, stiffness: 1, damping: 0.1, length: 0 }),
    Constraint.create({ bodyA: links[linkCount - 1], pointB: { x: bx, y: by }, stiffness: 1, damping: 0.1, length: 0 }),
  ]);
  World.add(world, rope);
  return { rope, links };
}
```

字节配重映射（physics/weight.ts）：

```ts
export function sizeToMass(sizeBytes: number): number {
  const kb = Math.max(sizeBytes / 1024, 1);
  return 0.4 + Math.log10(kb) * 0.8; // 1KB→0.4 / 10KB→1.2 / 1MB→4.8 / 1GB→8.4 / 24GB→9.8
}
```

挂载：文件刚体 `Bodies.rectangle(x, y, w, h, { collisionFilter: { category: CAT.FILE, mask: CAT.FILE | CAT.TASKBAR } })` + `Body.setMass(body, sizeToMass(sizeBytes))`，用Constraint 夹到最近绳链（pointA=夹口偏移）。滑落 = 提高 file frictionAir 低 + 绳倾角超阈值时夹子约束 stiffness 衰减；崩断 = 该绳 Σmass 超绳型 loadLimit 时移除锚点约束，文件自由落体撞任务栏（TASKBAR 静态刚体）弹跳。不锈钢杆 = 约束 stiffness 1.0 + engine constraintIterations 上调，视觉笔直不垂坠。

**已知精度约束（必须写进后续 Spec）**：Matter 约束解算为迭代式，质量比过大（>40:1）会抖。绳链总质量 0.28，文件最大质量 ~9.8 ≈ 35 倍，处于安全区；engine 固定 `constraintIterations: 4`、`positionIterations: 8`，固定步长 16.666ms 累加器驱动，禁止可变 dt 直喂。

### 5.3 Pixi v8 写实 Shader（view/shaders/）

v8 自定义滤镜标准形态（官方文档样例改造，uniform 组名 timeUniforms）：

```ts
import { Filter, GlProgram } from 'pixi.js';

const vertex = `
  in vec2 aPosition;
  out vec2 vTextureCoord;
  uniform vec4 uInputSize;
  uniform vec4 uOutputFrame;
  uniform vec4 uOutputTexture;
  vec4 filterVertexPosition(void) {
      vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
      position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
      position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
      return vec4(position, 0.0, 1.0);
  }
  vec2 filterTextureCoord(void) {
      return aPosition * (uOutputFrame.zw * uInputSize.zw);
  }
  void main(void) {
      gl_Position = filterVertexPosition();
      vTextureCoord = filterTextureCoord();
  }
`;

export class DropletFilter extends Filter {
  constructor() {
    super({
      glProgram: new GlProgram({
        vertex,
        fragment: `
          in vec2 vTextureCoord;
          in vec4 vColor;
          uniform sampler2D uTexture;
          uniform float uTime;
          uniform float uDroplets;
          void main(void) {
            vec2 uvs = vTextureCoord;
            // 程序化水滴高度场：环状凸起 + 重力下滑
            float h = 0.0;
            for (int i = 0; i < 4; i++) {
              float fi = float(i);
              vec2 c = vec2(0.25 + fi * 0.2, fract(sin(fi * 91.7) + uTime * 0.03));
              float d = length((uvs - c) * vec2(1.0, 1.4));
              h += smoothstep(0.09, 0.0, d);
            }
            vec2 offset = vec2(h * 0.012, h * 0.02); // 局部折射位移
            vec4 fg = texture2D(uTexture, clamp(uvs + offset, 0.0, 1.0));
            fg.rgb += vec3(0.35) * h * uDroplets;      // 高光
            fg.rgb *= 1.0 - 0.25 * step(0.02, h) * uDroplets; // 边缘暗环
            gl_FragColor = fg * vColor;
          }
        `,
      }),
      resources: { timeUniforms: { uTime: { value: 0, type: 'f32' }, uDroplets: { value: 0, type: 'f32' } } },
    });
  }
  tick(dt: number) {
    this.resources.timeUniforms.uniforms.uTime += 0.04 * dt;
  }
}
```

三个滤镜同一范式：霉斑（Ashima simplex 2D 噪声 + 阈值 + 边缘向中心蔓延 mask）、焦化（褐色矩阵 + 顶点内缩假网格变形）、挂雾（全屏噪声 alpha）。**约束：滤镜挂在单个 Sprite 上，禁止挂 stage 全屏**（全屏滤镜在透明窗口下每帧全图采样，Win 上掉帧明显）。焦化的"网格坍缩"MVP 用 `sprite.scale + skew + 顶点偏移近似`，真 Mesh 顶点变形列 P2。

**诚实约束（写入 Spec）**：透明合成窗口的 WebGL 画布**无法采样桌面背后的真实像素**，"水珠折射桌面背景"不可实现；方案为对图标自身纹理做局部折射偏移 + 高光 + 暗环，图标尺度下视觉等价。

### 5.4 开局延时演出（3-10s）

启动时序：main 创建窗口 → renderer init → `world/virtual-desktop.ts` 生成桌面 → 对 mtime 降序文件按 2-6s 错峰执行 `humidity/mold` 斜坡（easeInOutCubic）+ 粒子（水珠渗出的 sprite 滴落、蘑菇破土的 scale pop）+ WebAudio 合成雨声/啵声 → 结束后 toast 报告待晾晒数量并交还控制权。演出期间命中态锁定为穿透。

### 5.5 天气与硬件联动

weather-simulator.ts：城市表（广州/敦煌/吐鲁番/阿塔卡马/伦敦/东京…）各带基础温湿度 profile；`hash(city) + dayIndex` 作种子确定性产出当日 {tempC, humidity, condition}；rainy/storm → env.humidity ×2；sunny → 挂绳文件风干加成。迁徙限制 1 次/日存 save.weather.migratedOn。CPU：main 每 2s 采样 os.cpus() 增量算占用率，`webContents.send('system:cpu', usage)`；usage > 0.8 时 renderer 局部 env.humidity +0.3 并在屏幕顶框挂汗珠粒子。麦克风吹气列 P2（getUserMedia + AnalyserNode RMS，Electron 需 setPermissionRequestHandler 放行 media）。

---

## 6. 验收范围与优先级（五大模块最低可验证内容）

| 模块 | P0 必须（验收线） | P1 应做 | P2 可砍/后置 |
| --- | --- | --- | --- |
| 一 环境气候 | 气象牌切城（模拟源）、湿度影响受潮速率、迁徙 1 次/日、CPU 占用 >80% 出汗顶栏滴落 | 屏幕挂雾 + 刮水器刮雾 | 真实天气 API、麦克风吹气 |
| 二 文件生理学 | 4 类 ext 差异化受潮视觉（墨水洇染/褪色/蓄水袋/胀气）；文档滴黑字符、图片滴颜料、音频袋晃动、压缩包膨胀爆裂 | 字符黑灰堆积需扫进回收站 | 八音盒走调旋律（音频类播放） |
| 三 工具箱晾晒 | 边缘拉绳悬链线、对数配重、超重崩断摔落、拧麻花除湿（humidity ×0.5）、吹风机 + 过热焦化 + 保湿喷雾恢复 | 滑落挤团 + 霉菌交叉感染 | 真 Mesh 顶点坍缩（用 scale/skew 近似） |
| 四 蘑菇生态 | moldy 文件长蘑菇（N 平菇/狗尿苔 + R 二进制金针菇带 0/1 粒子）、growth 满可剪、卖币；蜗牛吃青苔留银道 | Demo 控制台一键发霉/一键挂满/胆小菇缩头行为（行为实现，杂交条件不做） | SR/SSR/UR 杂交培育公式全部搁置 |
| 五 杂货铺 | 卖菇得币；绳索 3 档（承重 6/25/∞刚性）、夹子 2 档、电扇（绳浪起伏）、加湿器（局部催熟） | 吸湿盒消耗品（泼洒半屏淹湿） | 商店动效打磨 |

**明确不做（out-of-scope）**：真实桌面扫描与 SysListView32 原生图标隐藏（绝对安全红线改由"虚拟替身"根本性规避——MVP 不碰任何真实文件）；macOS 构建；自动更新；联网账号；杂交公式；真网格变形。

---

## 7. 技术约束与风险清单

| # | 风险 | 影响 | 缓解（硬约束） |
| --- | --- | --- | --- |
| R1 | Pixi v7→v8 API 断裂（异步 init、Filter 新构造、Graphics build-then-fill、ESM-first） | 幻觉 API 高发区 | 全部按 v8 文档书写（本档 §2 已锚定）；`await app.init()`；禁 beginFill；构建门必过 tsc |
| R2 | Vite 8 换血 Rolldown/Oxc（rollupOptions→rolldownOptions、esbuild→oxc、minify 变化） | 配置幻觉 | vite.config.ts 保持最小化（无 rollupOptions 需求）；迁移表已锚定在 §2 |
| R3 | 透明全屏 WebGL 在 Win 上 alpha 合成开销 | 掉帧 | DPR 上限 2；滤镜只挂 Sprite 不挂 stage；粒子预算（同屏 ≤ 300）；`document.hidden` 时暂停 ticker；powerMonitor 锁屏暂停物理 |
| R4 | Matter 质量比/约束拉伸抖动 | 绳索不自然 | 质量比 ≤ 35:1；constraintIterations 4 / positionIterations 8；固定步长累加器；绳链 collisionFilter mask=0 |
| R5 | setIgnoreMouseEvents 逐帧调用 | 穿透掉帧 | 仅命中态跳变时经 IPC 调用；常态 forward:true |
| R6 | 多显示器/DPI/工作区变化 | 坐标错位 | 监听 screen 'display-metrics-changed' 重算 bounds；resolution=devicePixelRatio；坐标以工作区左上为原点 |
| R7 | matter-js 为 CJS + 类型为 @types | import 形态混乱 | 统一 `import Matter from 'matter-js'` 后解构；@types/matter-js 0.20.2 |
| R8 | lucide 无内置类型 | tsc 报错 | renderer/types/lucide.d.ts ambient 声明；createIcons({ icons }) 显式注册用到的子集 |
| R9 | electron-builder portable 无自动更新 + 未签名 SmartScreen 提示 | 分发体验 | MVP 接受；README 写明"更多信息→仍要运行"；后续走签名再谈更新 |
| R10 | WebGL 上下文丢失（GPU 重置） | 白屏 | 监听 canvas 'webglcontextlost' 阻止默认 + restore 后重建纹理 |
| R11 | 存档并发/损坏 | 进度丢失 | tmp+rename 原子写；读失败降级新开局；schemaVersion 不符走迁移或重开 |
| R12 | 单实例与退出保存 | 多开互相覆盖存档 | app.requestSingleInstanceLock()；quit 前 flushSave；崩溃守护钩子退出前尽力保存 |

---

## 8. 目录结构设计（单文件 ≤ 300 行、单一职责、入口只装配）

```
Cyber Damp/
├── package.json                  # 唯一依赖清单 + build 配置块（electron-builder）
├── electron-builder.yml          # 或并入 package.json build 字段
├── tsconfig.json                 # 基座
├── tsconfig.main.json            # main+preload+shared（CJS，module: commonjs）
├── tsconfig.renderer.json        # renderer（ESNext，DOM lib）
├── vite.config.ts                # 最小化：root=src/renderer，outDir=dist/renderer
├── docs/
│   ├── architecture.md           # 本文件
│   ├── decisions/ADR-001..007.md # 每条选型一条 MADR
│   └── contracts/
│       ├── preload-api.md        # IPC 契约（前后端唯一依据，替代 openapi：本项无 HTTP 面）
│       └── save-schema.json      # 存档 JSON Schema（机器可读）
└── src/
    ├── shared/                   # 叶子层：类型/常量/存档 schema，零依赖
    │   ├── types/file-node.ts        # FileNode / ExtCategory
    │   ├── types/file-runtime.ts     # FileRuntime / 状态枚举
    │   ├── types/save.ts             # SaveData / PlayerState / RopeSave
    │   ├── save/save-schema.ts       # 校验 + 版本迁移（手写，无 zod）
    │   └── constants.ts              # ext→category 映射、调参常量、CAT 位
    ├── main/                     # Node 侧，只做装配/窗口/IO/监控
    │   ├── index.ts                  # 入口：单实例锁、生命周期、注册 IPC（<100 行）
    │   ├── window/create-overlay-window.ts
    │   ├── window/display-tracker.ts # display-metrics-changed → setBounds
    │   ├── system/cpu-monitor.ts     # os.cpus() 增量采样 → send('system:cpu')
    │   ├── save/save-store.ts        # 原子 JSON 读写（<60 行）
    │   └── ipc/register-handlers.ts  # 通道注册（薄）
    ├── preload/
    │   └── index.ts                  # contextBridge 暴露 window.damp（<80 行）
    └── renderer/
        ├── index.html                # canvas 挂载点 + DOM 覆盖层骨架
        ├── index.ts                  # 引导：只装配 pixi/matter/world/ui/input
        ├── app/pixi-app.ts           # Application.init（WebGL、alpha 0、DPR 上限）
        ├── app/matter-world.ts       # Engine 配置 + 任务栏静态刚体
        ├── app/game-loop.ts          # ticker：固定步长物理 + 演化 tick + 视图同步
        ├── world/                    # 纯领域层（无 pixi/matter import，可单测）
        │   ├── file-entity.ts        # 实体：FileNode + FileRuntime 组合视图
        │   ├── evolution.ts          # 演化状态机（§4.3 表）
        │   ├── weather-simulator.ts  # 种子天气 + 迁徙限制
        │   ├── economy.ts            # 金币/出售/购买
        │   ├── shop-catalog.ts       # 道具表（价格/承重/效果参数）
        │   ├── mushroom-species.ts   # N×2 + R×1 定义与生长规则
        │   └── virtual-desktop.ts    # 确定性文件树生成
        ├── physics/
        │   ├── rope-factory.ts       # §5.2 绳索
        │   ├── weight.ts             # sizeToMass 对数映射
        │   ├── hang-controller.ts    # 夹子约束挂载/崩断判定
        │   └── hit-test.ts           # Query.point 命中封装
        ├── view/
        │   ├── layers.ts             # worldLayer / fxLayer 分层
        │   ├── file-sprite.ts        # 程序化图标替身 + 分类外观
        │   ├── rope-view.ts          # 绳链位置 → Graphics 曲线
        │   ├── mushroom-view.ts      # 菌盖/菌柄程序化绘制 + 0/1 粒子
        │   ├── particles.ts          # 水滴/墨点/颜料/孢子发射器
        │   └── shaders/droplet-filter.ts / mold-filter.ts / char-filter.ts / fog-filter.ts
        ├── input/
        │   ├── pointer-controller.ts # 指针状态机（拖/拧圈/刮/剪）
        │   ├── gestures.ts           # 拧麻花角累加、刮水轨迹、单击判定
        │   └── click-through.ts      # 命中态 → IPC setIgnoreMouseEvents
        ├── ui/                       # DOM 覆盖层
        │   ├── ui-root.ts            # 面板挂载与显隐
        │   ├── shop-panel.ts         # 杂货铺侧栏
        │   ├── weather-sign.ts       # 气象牌
        │   ├── toolbox.ts            # 工具箱（剪刀/吹风机/喷雾/刮水器）
        │   ├── demo-console.ts       # Demo 控制台（globalShortcut 呼出）
        │   └── icons.ts              # Lucide 注册 + icon→SVG string 工具
        ├── audio/sfx.ts              # WebAudio 合成音效库
        ├── save/save-controller.ts   # 渲染层存档编排（防抖 5s + 退出 flush）
        └── types/lucide.d.ts         # ambient 声明
```

硬规则（来自代码组织规范，出现即不合格）：入口文件（main/index.ts、renderer/index.ts）只装配不写业务且 < 100 行；任何源文件 ≤ 300 行（不含空行注释），超限按子功能拆文件；utils 只放纯函数；类型/schema 独立成文件；world/ 禁止 import pixi/matter/electron；ui/ 禁止直接操作物理体。

构建产物：`dist/renderer/`（Vite）+ `dist/main/`（tsc），electron-builder `files: ["dist/**"]`，main 入口 `dist/main/index.js`，`npm run dist:win` 出单文件 portable exe。

---

## 9. 端到端验证步骤（Phase 2 验收）

1. `npm install` → `npm run dev`：透明无边框窗口置顶出现，空白处点击穿透到下层应用，图标处拦截。
2. 冷启动 3-10s 延时演出：老文件依次出水珠→变软→长蘑菇；演出结束 toast 报数。
3. 从屏幕左/右边缘拖出晾衣绳：挂 10KB txt 绳微垂；挂 24GB 文件成深 V；总重超麻绳上限锚点滑脱、文件摔落任务栏弹跳。
4. 对一个湿文件顺时针画圈 2 圈：拧麻花 + 飙水粒子，humidity 降 50%。
5. 吹风机长按同一文件：char 上涨至焦化卷边；保湿喷雾点击恢复。
6. 气象牌切城到"敦煌"：受潮速率下降；切回"广州"恢复；同日二次迁徙被拒。
7. 运行大型软件使 CPU > 80%：屏幕顶框出现汗珠滴落。
8. 剪下成熟蘑菇：金币入账；商店买 304 不锈钢杆：新绳笔直挂 24GB 不下垂。
9. 退出重启：coins/装备/文件状态/绳上文件全部恢复（save.json 原子写验证）。
10. `npm run dist:win`：产出 portable 单文件 exe，全新 Windows 机器双击可玩。
11. 门禁：`npm run typecheck` 零错误；`find src -name '*.ts' | xargs wc -l` 无 > 300 行文件；回归：开局演出/绳索/商店/存档四条路径各跑一遍。

---

## 10. ADR 索引

| ADR | 决策 | 状态 |
| --- | --- | --- |
| ADR-001 | Electron 44 作为桌面外壳（否 Tauri/Unity/原生） | Accepted |
| ADR-002 | Pixi.js v8 作为渲染层（否 Phaser/裸 WebGL/Three） | Accepted |
| ADR-003 | Matter.js 0.20 作为物理层（否 Planck/自建） | Accepted |
| ADR-004 | 虚拟文件树为 MVP 唯一数据源，接口先行 | Accepted |
| ADR-005 | Lucide 锁定为唯一 SVG 图标库 + DOM 覆盖层/程序化画布分工 | Accepted |
| ADR-006 | Vite 8 + TS 5.9.3 + electron-builder portable | Accepted |
| ADR-007 | 本地种子模拟天气（否真实 API 接入） | Accepted |

全文见 docs/decisions/ 目录。
