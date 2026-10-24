# Goal v9 执行记录：原生图标与天气胶囊 Windows 试玩版

日期：2026-10-24。依据：[Goal Prompt v9](superpowers/specs/2026-10-24-native-weather-goal-prompt.md)。
本文件持续记录：现状盘点、复用台账（A21）、阶段推进、验收表（A01–A24）状态。
状态取值：PASS / FAIL / NOT TESTED / 待用户视觉确认 / 待用户裁决。

> **2026-10-24 用户裁决（胶囊层级降级，已定案不再研究）**：优先保证不干扰原生桌面、不压普通应用；允许 Win+D 后胶囊隐藏，通过托盘或程序入口唤回。原"桌面及 Win+D 可见"要求按此修订，**不得记为 PASS**；验收按修订后行为（Win+D 隐藏 + 唤回入口可用）实测。

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
- [x] 阶段 2（切片 1，进行中）：纯领域层与存档迁移。
  - `src/shared/types/native.ts`：R4/R5 权威类型与常量（K 集合、强度权重、重度上限 2、菇权重、DAILY 权重上限、240h 免疫换算——交付说明标注"十天=连续240小时"）。
  - `src/world/native-events.ts`（纯领域，时钟/种子注入）：R5 权重表逐行实现（降水/雾/高湿/晴热/普通、未知码 null 不推进）；霉变免疫硬排除 + 剩余正权重自然归一；推进一级规则（霉变重→幼菇→成熟菇，其他损伤重度满级）；`planInit`（K∈{5..10}、N=min(K,候选)、mtime 旧→新 + ID 稳定序、同种子全计划固定）；`planDailyOrder`（w=1+min(d,30)/无基准31、加权不放回最多3个、免疫/满级/换族过滤）；`decideNativeBranch`（R4.4 八分支按序唯一匹配）；`applyCareImmunity`（任一主要损伤完整清理刷新240h窗口）。
  - 存档 v3：`SaveData.native` 可选段（INIT 计划/日记录/对象状态/最后快照/暂停）；`migrateSave` v1/v2→v3 标记 `legacy-initialized`（R4.1 旧用户不重发首批/奖励），脏数据整体拒绝；新安装无 native = 未初始化。
  - 测试：`test-native-events.mjs`（17 项，覆盖 A04 K/N/最旧N个/种子固定、A05 强度上限与菇状态、A06 分支表、A07 免疫边界、A08 护理刷新、A09 权重表逐行+未知码、DAILY 权重与候选过滤）、`test-save-migration.mjs`（4 项）。全套 139/139、typecheck、build 通过。
  - [ ] 切片 2（待做）：main 编排器（扫描候选→分支→INIT/DAILY 执行→icon:applyState 接线→额度记账）、缺席合并、跨午夜核对、回执结算。
- [x] 阶段 2（完成）：编排器纯核心 `native-scheduler.ts`（依赖注入、14 项机械验证全绿）+ 生产适配器 `native-event-scheduler.ts`（真实扫描/天气/图标引擎接线、确定性预热 + 同步回调、幼菇品种、restored 恢复暂停态、退出恢复钩子）。跨午夜核对：有写入证据 → success 关闭；确定未写入 → 删除不补债（R4.2）。
- [x] 阶段 3（核心闭环完成）：玩家闭环真机端到端 **14/14 PASS**（`scripts/uat-native-loop.cjs`，真实 Explorer 桌面 + 隔离存档 + `CD_NATIVE_PROBE_DIR` 限定）：INIT 在探针对象上真实写入（K=9、候选 2、N=2 受限分支按实数）→ 存档 INIT completed + 当日 init_occupied → 退出恢复逐字节还原 → 重启回显重写 → "恢复桌面并暂停/继续游戏"。截图 logs/native-loop/。
  - 领域层 `world/native-care.ts`（9 项测试）：完整清理+240h 免疫、采摘不重复结算、收藏品种/来源、引导 24 币一次性、大海绵 12 币（+30% 擦洗）、护理垫 8 币。
  - 产品模式（NATIVE_MODE，H2）：无覆盖层、无图标隐藏；胶囊窗（生产页面、userData 位置记忆、托盘显隐、acrylic）+ 护理窗四页（擦拭 ≥90% 自动收尾、快速处理、采摘、收藏、小铺、设置）+ 一次性引导 + 自启 + 恢复并暂停/继续游戏 + 完全退出。
  - 待收口（如实标注）：A16 工具族细分（喷壶/烟灰海绵/补色滚轮）、A14/A15/A17/A18 用户视觉与操作细节、A24 性能采样。
- [ ] 阶段 4：交付阶段（NSIS 安装、卸载恢复、DPI、性能采样、使用说明、原生 UAT）。

## 3. 验收表（A01–A24）

| 编号 | 状态 | 证据/说明 |
|---|---|---|
| A01 | PASS（引用与显示层）/ 待用户视觉确认（输入全套） | 引用级替换/恢复 19/19 + 回环 14/14 真实桌面探针；Explorer 显示变化截图（logs/icon-probe、logs/native-loop）；单击/双击/框选/拖放原生输入走查待用户试玩 |
| A02 | PASS | 产品模式无覆盖层/无图标隐藏（NATIVE_MODE 分支）；胶囊点击区域仅本体（透明留白穿透） |
| A03 | PASS | 既有 desktop.ini 内容逐字节保留/还原（uat-icon-mutate 19/19）；.lnk 目标/参数/说明不变；恢复原值非系统默认 |
| A04 | PASS（规则面+受限分支实测） | 种子化 K/N 测试；回环探针 K=9、候选 2、N=2 按实数；真实桌面全量对象的首批与重启/升级分支待用户实机（老用户已由 legacy-initialized 保护） |
| A05 | PASS（规则面） | 纯核心 14 项：崩溃续作/3 次失败自动跳过/成功跳过分记 |
| A06 | PASS（规则面） | 八分支、同日去重、缺席合并、跨午夜核对（证据→success/无债）、retryable 同 ID 测试；双开由单实例锁+串行循环保证 |
| A07 | PASS（规则面） | 240h 边界测试（239h/240h−1ms/240h/+1ms） |
| A08 | PASS（规则面） | completeCare 刷新免疫；半清/采菇不刷新由渲染层阈值与领域约定保证（completeCare 仅在 ≥90% 收尾调用） |
| A09 | PASS（规则面） | R5 权重表逐行+官方码+未知码+冷落权重测试 |
| A10 | PASS（数据面）/ 待用户视觉确认（胶囊排版） | 实网 9/9；胶囊显示四要素+更新时间+离线标注（capsule.ts）；排版待用户看 |
| A11 | PASS（程序化）/ 待用户视觉确认 | 360×56 顶部居中距顶 24 DIP 探针断言；位置记忆 userData；DPI 夹回逻辑在位，混合 DPI 实测待用户 |
| A12 | PASS（修订版行为） | 不置顶/不抢焦点/skipTaskbar 探针断言；全屏级覆盖自动隐藏+恢复探针 PASS；**Win+D 隐藏为用户裁决降级**，托盘唤回入口在位；acrylic Win10 实测生效，Win11 背板未实测 |
| A13 | NOT TESTED（实机重启登录） | setLoginItemSettings 已接、反馈实际状态；下次登录行为需用户注销/重启验证 |
| A14 | NOT TESTED（32/48px 视觉） | 占位材质下轻度可见性未做像素级检查；正式材质接入后重测 |
| A15 | PASS（程序化）/ 待用户视觉确认 | 护理进度保存/继续（careProgress 持久化+预洗进度重建）；工具在松手/失焦停止（pointer 事件边界）；桌面逐帧刷新不存在（仅事件时写） |
| A16 | NOT TESTED | 喷壶/烟灰海绵/补色滚轮未实现；海绵+快速处理可用（快速处理=清理+免疫、不自动采菇，规则已测） |
| A17 | PASS（规则面）/ 待用户视觉确认 | 成熟菇在图标外观可见（菇斑合成）；采摘结算/收藏持久化测试；先洗后采/先采后洗语义测试 |
| A18 | PASS（规则面） | 引导 24 币一次性/购买原子/失败不扣款测试；断网路径=城市搜索失败重试+无快照不可用（weather 实测 9/9）；双路径 UI 实操待用户 |
| A19 | PASS（程序化）/ 待用户实机 | 退出恢复逐字节还原（回环探针）；恢复并暂停→天气刷新/重启不回显（restored 门禁+测试）；用户自行改图标保留（kept-user-value 测试）；卸载执行待用户（卸载器已注册 HKCU） |
| A20 | PASS（本机安装运行） | NSIS /S 静默安装成功（%LOCALAPPDATA%\Programs\cyber-damp）、卸载器注册、启动进入产品模式（用户已实机启动护理台）；天气用途=Open-Meteo 非商业+署名 |
| A21 | PASS | 本文件第 1 节台账逐模块记录 |
| A22 | PASS（服务面）/ 待用户视觉确认（署名可见） | 缓存 30min/超时 8s/重试 2 次/24h 老化实现+取数实测；署名在设置页与胶囊悬停（capsule.ts title、care 设置页） |
| A23 | PASS（进行中） | 09c7de1 / cd1305d / 602c549 / 67fcbe2 及后续提交均经 git ls-remote 验证 |
| A24 | NOT TESTED（固定场景采样） | 未见达标数据不记 PASS；已知量级：图标预热+写引用为事件时操作，胶囊 30 分钟节奏，无逐帧循环 |

## 4. 交付记录

- 安装包 `release/Cyber Damp Setup 0.1.23.exe`（SHA256 `a1068016…cc5c8db`，全值见[使用说明](USAGE-NATIVE-TRIAL-2026-10-24.md)）；portable 同目录。
- 本机安装验证：静默安装成功、卸载器 HKCU 注册、已安装实例进入产品模式（用户实机启动护理台）。
- 旧用户保护：v1/v2 存档升级标记 legacy-initialized（运行中实例的数据已就地修补）。
- 使用说明：[docs/USAGE-NATIVE-TRIAL-2026-10-24.md](USAGE-NATIVE-TRIAL-2026-10-24.md)。
- 已知限制见使用说明"已知限制"节。

