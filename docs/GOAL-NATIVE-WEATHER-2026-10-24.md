# Goal v9 执行记录：原生图标与天气胶囊 Windows 试玩版

日期：2026-10-24。依据：[Goal Prompt v9](superpowers/specs/2026-10-24-native-weather-goal-prompt.md)。
本文件持续记录：现状盘点、复用台账（A21）、阶段推进、验收表（A01–A24）状态。
状态取值：PASS / FAIL / NOT TESTED / 待用户视觉确认 / 待用户裁决。

## 0. 现状盘点（阶段 0）

- 分支 `experience/visual-playground`，基线提交 `9f95656`（与 Goal 资产基线一致）。
- 工作区含 104 处未提交/未跟踪修改，归属已核实为两轮**已文档化但未提交**的旧增量：
  - [2026-10-23 启动体验与性能增量](STARTUP-EXPERIENCE-2026-10-23.md)：Shell 图标后台 Worker（`shell-icons*.ts`、`win32-icon-pixels.ts`）、启动提示窗（`startup-window.ts`）、并行资源读取。
  - 2026-10-22/23 PVZ 参考资产与架构评估：`previews/pvz-original-reference/`、`pvz-frames.ts`、`REVIEW-ARCHITECTURE-EXPERIENCE-2026-10-23.md`。
- 处置：不做 reset/stash/clean；上述修改保留在工作区，只提交本 Goal 相关变更；旧增量中被本 Goal 复用的文件随功能提交。
- 基线健康（2026-10-24 实测）：`npm run typecheck` 通过；`npm test` 104/104 通过。
- 旧全屏覆盖层/替身/输入转发架构按 H2 在本 Goal 中退出交付范围，相关旧文件保留历史，不删除。

## 1. 复用台账（A21）

格式：能力 → 来源（版本/文件/函数）→ 处置 → 新增缺口 → 验证结果。

| 能力 | 来源 | 处置 | 新增缺口 | 验证结果 |
|---|---|---|---|---|
| Shell 桌面枚举与几何 | 本仓库 `src/main/desktop/native-desktop-scan.ts`（scanNativeDesktop）、`shell-layout-worker.ts` | 直接调用 | 无 | 既有 104 测试通过 |
| 对象类型区分（dir/file/recycle/shell） | `native-desktop-scan.ts:47-60`、`FileKind`（src/shared/types/file-node.ts） | 直接调用 | 需把"文件夹/普通 .lnk"细分为可处理子集 | 实测：dir+普通 .lnk 全链路 19/19 PASS（scripts/uat-icon-mutate.cjs） |
| .lnk 元数据读取 | Electron `shell.readShortcutLink`（native-desktop-scan.ts:28） | 直接调用 | 写路径（`shell.writeShortcutLink` update）缺失 | 实测：update 改 icon 生效；恢复需 `replace` 全快照（update 对空 icon 不生效）；目标/参数/说明不变 |
| Shell 图标像素提取 | `win32-icon-pixels.ts`（extractShellIconPixels，koffi SHDefExtractIconW 等） | 直接调用（原图素材输入） | 无 | 既有测试与 10-23 诊断覆盖 |
| 崩溃恢复"进程外守护"模式 | `desktop-watchdog.ts`（protectDesktopIcons，CreateProcessW breakaway） | 模式参考；本 Goal 的图标引用恢复改为写前落盘 + 启动核对（R1），不沿用 ShowWindow 守护 | 图标原值快照存储缺失 | 待阶段 1 |
| 窗口模板 | `management-window.ts`（frameless/close-hide/Tray/powerMonitor）、`startup-window.ts`（轻量 splash/showInactive） | 直接调用 | 顶部胶囊窗需新建：位置记忆、DPI 夹回、全屏隐藏 | 待阶段 1 |
| 存档原子写与校验 | `save-store.ts`（loadSave/writeSave 原子 rename）、`save-schema.ts`（validateSave/migrateSave，schemaVersion 1–2） | 直接调用 + schema 迁移 | 需新增图标恢复登记、INIT/DAILY 事件、免疫窗口字段 | 待阶段 2 |
| IPC 契约模式 | `preload/index.ts`、`register-handlers.ts`（域:动作、sender 校验）、`docs/contracts/preload-api.md` | 直接沿用 | 新增 weather/图标变更/胶囊控制通道 | 待阶段 1–3 |
| 图标原值恢复登记 | 新建 `icon-restore-store.ts`（save-store 同款 tmp+rename 原子写）+ `icon-mutate.ts`（写前 pending → applied；启动核对） | 新写（无可复用实现） | desktop.ini hidden+system 下覆写会 EPERM，恢复前须先清属性 | 实测：逐字节还原、属性还原、用户改值保留、登记清空，均 PASS |
| main 进程 HTTP | Node 22 全局 fetch + AbortSignal.timeout（Electron 44） | 直接调用（无先例、零包袱） | 无 | 实测：Open-Meteo 实网取数 1050ms，缓存命中 7ms，无效坐标 400 → unavailable，9/9 PASS |
| 天气领域接口形状 | `world/weather-simulator.ts`（DayWeather 形状、湿度乘数） | 仅作演示/测试保留（旧 ADR-007 明确标识），生产数据源换 Open-Meteo（R3） | main 进程 HTTP、缓存、重试、地理编码缺失 | 实测：见上行；校验规则单测 5 项（scripts/test-weather-validate.mjs） |
| 多尺寸 ICO 封装 | `png-to-ico` 2.1.8（MIT，零依赖；Goal R0 指定，`require` 直出函数）+ Electron `nativeImage.resize` | 新增依赖 png-to-ico | 无 | 实测：7 尺寸 ICO 生成、文件头合法、Explorer 接受并显示 |
| 玻璃材质 | 本机为 Windows 10 22H2（10.0.19045）：`SetWindowCompositionAttribute` ACCENT_ENABLE_ACRYLICBLURBEHIND（`win32-glass.ts`，koffi.alloc/encode）；Win11 22H2+ 的 DWM 背板分支已写、待真实 Win11 实测 | 最小移植（官方/半官方 API） | `koffi.new` 在 koffi 3 不存在，须用 alloc+encode；koffi.struct/func 声明需在调用前登记 | 实测：acrylic 生效（logs/capsule-probe/1-capsule-visible.png），模式诚实上报 |
| 全屏检测 | `win32-foreground.ts`：SetWinEventHook(EVENT_SYSTEM_FOREGROUND / OBJECT_LOCATIONCHANGE / OBJECT_DESTROY) + GetForegroundWindow/GetWindowRect 覆盖判定 | 最小补充（官方 API） | 异步回调必须 `koffi.register(cb, 'WinEventProc *')`；直接传 JS 函数触发 V8 HandleScope 致命错；不能用 SKIPOWNPROCESS（本进程覆盖窗事件也要触发复查） | 实测：覆盖→自动隐藏→撤除→自动恢复（不抢焦点），11/11 PASS |
| 托盘/电源监控 | `management-window.ts:94,152` | 直接调用 | 自启 `setLoginItemSettings` 缺失 | 待阶段 3 |

## 2. 阶段推进

- [x] 阶段 0：现状盘点（本文件第 0 节）。
- [x] 阶段 1：原生可行性。三项实测结论：
  - **图标替换/恢复（R1）**：真实桌面探针 `scripts/uat-icon-mutate.cjs` 19/19 PASS——desktop.ini 外科级编辑保留原有行、hidden/system 属性、恢复逐字节还原原值；.lnk 仅 icon 变化、目标/参数/说明不动、replace 语义恢复原快照；用户改值→保留用户值；恢复登记清空；Explorer 即时可见刷新（截图 logs/icon-probe/）。**关键发现**：hidden+system 属性下覆写会 EPERM（恢复前先清属性）；`writeShortcutLink 'update'` 无法写回空 icon（恢复用 `replace` + 完整快照）。
  - **胶囊小窗（R2）**：原型 `scripts/uat-capsule-probe.cjs` 11/11 PASS——360×56 顶部居中距顶 24 DIP 精确落位、showInactive 不抢焦点、skipTaskbar、非置顶、acrylic 玻璃在 Win10 经 SetWindowCompositionAttribute 生效（诚实上报模式）、SetWinEventHook 前台/位置/销毁事件驱动"全屏级覆盖→自动隐藏→撤除→自动恢复"。**层级结论**：不采用 WorkerW 嵌入（该层在图标输入层之下，可点击需输入钩取/转发，违反 H2）；采用普通非置顶顶层窗口。**已知冲突（待用户确认降级）**：Win+D 会最小化非置顶胶囊，与"桌面及 Win+D 可见"不可兼得；托盘/程序入口可唤回。真实 Win+D 与拖动手感留原生 UAT。
  - **天气接入（R3）**：实网 `scripts/uat-weather-fetch.cjs` 9/9 PASS——中文地理编码（杭州）、current 快照四要素、缓存命中、无效输入 unavailable、缓存落盘按坐标分开；首次取数 1050ms（上限 28s）。
  - 阶段 1 期间 `npm run typecheck` 与 `npm test`（118 项）全绿；新通道契约记入 preload-api v1.11。
- [ ] 阶段 2：事件与规则。
- [ ] 阶段 3：体验阶段。
- [ ] 阶段 4：交付阶段。

## 3. 验收表（A01–A24）

| 编号 | 状态 | 证据/说明 |
|---|---|---|
| A01 | NOT TESTED | 阶段1探针已证引用级替换/恢复可行（19/19）；Explorer 原生输入全套（单击/双击/框选/拖放）留阶段 4 原生 UAT |
| A02 | 待用户裁决 | 旧覆盖层不属本 Goal 交付；胶囊层级的 Win+D 冲突待用户确认降级（见第 2 节阶段1结论） |
| A10 | PASS（数据面） | 实网取数 9/9：同一 current 快照、更新时间、缓存/超时/无效分支；WMO 映射校验单测 5 项。UI 呈现待阶段 3 |
| A21 | PASS（进行中） | 本文件第 1 节台账逐模块记录来源与验证结果 |
| A22 | PASS（服务面） | 缓存 30min/超时 8s/重试 2 次/24h 老化按默认实现并实测取数路径；署名 UI 待阶段 3 |
| A24 | NOT TESTED | 性能预算待固定场景实测 |
| 其余 | NOT TESTED | 待对应阶段实施 |
