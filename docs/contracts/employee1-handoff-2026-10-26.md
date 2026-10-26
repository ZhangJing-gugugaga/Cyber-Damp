# 员工 1 交付（v0.2 第一批）：领域核心 + 素材管线 + 模拟环境 + v2 界面

日期：2026-10-26。分支：`v0.2/employee1-gameplay`。所有验证在浏览器模拟环境（`dev.html`）与 Node 纯测试完成；**Windows 原生行为全部 NOT TESTED**（员工 2 接线后按对应 UAT 执行）。

## 总览

| 功能 | 纯逻辑 | 测试 | 界面 | Windows 依赖 |
|---|---|---|---|---|
| 品种判定（R5.1） | `src/shared/species/species-roll.ts` | test-species-roll | 图鉴卡 | 无（接线时需 status 提供类别） |
| 品种目录/留言 | `species-catalog.ts` / `species-text.ts` | 同上 | 收藏页 | 无 |
| 每日 3/5 槽位（R4.2） | `src/world/daily-v4.ts` | test-daily-v4 | — | 调度器换 v4 账本（见下） |
| 分层护理（R6） | `care-tools.ts`/`care-layers.ts`/`care-session.ts` | test-care-layers/tools | care-v2 工具行 | 无（IPC 载荷校验已定） |
| 采菇/孢子/播种 | `src/world/spores.ts` | test-spores | 剪刀手势+播种按钮 | 无 |
| 相邻蔓延（R5.2） | `src/world/mold-spread.ts` | test-mold-spread | — | 主进程用真实坐标调 buildAdjacency |
| 回南天警报（R5.3） | `src/world/damp-alert.ts` | test-damp-alert | 菌讯警报行 | 无 |
| 今日菌讯 | `src/world/daily-forecast.ts` | test-daily-v4 | 护理台卡片 | 无 |
| 壁纸效果（R9） | `src/shared/wallpaper/effects.ts`+`mask.ts` | test-wallpaper-effects | 墙面页 | 主进程读写系统壁纸（纯合成已就绪） |
| 素材管线（Task 3） | `scripts/build-species-assets.cjs` | test-species-assets | 图鉴/状态合成 | 员工 2 选定 A/B 后固化 overlayVariant |
| 浏览器模拟环境 | `src/renderer/dev/` | probe-dev-flow (13/13) | dev.html | 无 |
| v2 界面层 | `src/renderer/care-v2.ts` | probe-dev-ui (12/12) | care.html | preload 接线后自动生效 |

## 各功能交付明细（格式按计划书第六节）

### 1. 品种判定
- 输入：`SpeciesRollInput {category, weatherCode, humidity, temperatureC, localHour, seed, alertActive, plantedSpecies?}`。
- 输出：`NewSpeciesId | null`（未知天气→null；播种优先）。
- 权重表冻结于 `RARITY_BASE` + `speciesWeights`（雨天×bell6、雾×lantern6、RH≥85×bubble5/moss3、深夜×sleepless6、archive/image/chat/code 类别×4–8、警报开放 rain-crown 权重 2）。
- 员工 2 接入：日账本幼菇出现时由 `daily-v4.budSpeciesFor` 调用（已实现），主进程只需传 `categories` 映射。

### 2. 每日 3/5 槽位
- 存档：`DailyEventRecordV4`（limit/alert/slots）；v3→v4 迁移已实现（`save-schema.upgradeV3ToV4`：旧记录补 `limit:1,alert:false,slots:[]`；careMask→上层会话；spores 置空；警报未激活）。
- 语义（员工 2 注意）：`candidateOrder` 是**候选队列**，`attempts.length` 是消费游标，结算用 `settleDailyRecordV4(record, deps)`，幂等可续写；播种/蔓延槽由 `absorbPlantedSlots`/`insertSpreadSlots` 先插入，再统一结算。
- `native-scheduler.ts`（员工 2 文件）仍用 v3 单对象语义 —— **升级 v4 账本是下一个接线任务**；当前 v3 测试全绿不受影响。
- 我方动过员工 2 文件的一处：`native-event-scheduler.ts` 的 `speciesForWeather` 返回类型改为 `SpeciesId`（共享类型收紧的机械适配）。

### 3. 分层护理
- 会话：`CareSessionState`（每层 mask≤4096 字符 + progress + mold 层 softened 掩码）。
- 硬规则在领域层强制：喷壶只写软化（clear=0）、补色滚轮依赖同格烟灰已清、万能海绵全层、剪刀不参与护理。
- 效率数值（0.5/0.25/0.2）是**渲染层侵蚀节奏参数**：v2 界面用领域掩码做布尔清除，节奏差异由画布表现。员工 2 合成图标时同样按 `toolLayerRule().clear` 缩放。
- IPC：`careProgressV2` 载荷经 `validateCareSession`（NaN/越界/未知工具/超长掩码全部拒绝）；`careCompleteV2` 精细判定 = `judgeFineCare`（非快速 + 对口工具 + 全层完成），奖励只发一次。
- 90% 自动收尾：`autoFinishLayer`（渲染层在层进度 ≥0.9 时调用）。

### 4. 孢子/播种
- 采摘：`harvestV2`（4 币；cutQuality≥0.6 按存档种子 50% 掉同品种孢子；旧品种不掉）。
- 播种：`plantSpore`（当日剩余槽位优先，额度满顺延次日 pending；失败不扣孢子）；`cancelPlant` 只退 pending。
- UI：剪刀手势 cutQuality = 笔触到菇柄锚点 (128,205) 的距离归一——**近似实现**，员工 2 有真实菇层几何后可替换锚点。

### 5. 壁纸
- `composeWallpaperEffect(input)` 纯像素：湿度单调雾层（40% 起雾）、降水水痕、警报期墙角霉斑 0–3、警报强化 ×1.35；`fogMask`（care-mask 编码）内不上雾；1920×1080 单次合成实测约 120ms（测试打印值，非用户机器）。
- 员工 2 接入：天气变化/警报变化/确认擦拭时调用合成 → 写副本 → 设壁纸；擦雾只在松手/确认时 `wallpaper.wipe`。

### 6. 模拟环境（Mac 演示用）
- `npm run build` 后任意静态伺服 `dist/renderer`，开 `dev.html`；或 `npm run dev` 开 `http://localhost:5173/dev.html`。
- 控制面板：天气预设（晴/降雨/雾/高湿/警报/干热）、推进一天、重置模拟存档。
- 演示脚本 27 步（计划书第九节）已可执行 1–27 全部（截图证据 `previews/care-v2-mock-2026-10-26/`）；蔓延已接入每日编排（需要重度霉变邻接干净对象，默认模拟存档里 m-2/m-4/m-5 相邻，推进几天可见）。
- 探针（自包含，起静态服务）：先 `npm run build:mock`（生产构建不含 dev.html）；`scripts/probe-dev-flow.cjs`（API 级）、`scripts/probe-dev-ui.cjs`（手势级）、`scripts/probe-dev-stress.cjs`（交互压力：引导/练习/快速处理/v1 采摘/剪刀/播种/小铺/暂停/天气中途切换/页签，断言无未捕获异常）。
- 修复记录（2026-10-26 第二轮，cbc80b4+）：①care.ts/care-v2 所有 setPointerCapture 加 try/catch（合成或已释放指针会抛 NotFoundError 未捕获——用户报的"报错"来源）；②选中对象改为 care-selection-changed 事件驱动 + 1.2s 轮询兜底（原 2.5s 轮询导致剪刀等工具晚一拍出现）；③护理台菇层显示 13 款新品种素材（原误用旧版 round/cluster/fan 映射），主进程 state-icon.ts 的 SPECIES_SHAPE 同样需要员工 2 换成 species manifest 读取。

## 员工 2 审查修复（第三轮，2026-10-27）

| 审查项 | 处理 |
|---|---|
| #1 存档 v4 迁移清掉半清进度 | `upgradeFieldsToV4` 改为**纯增量**：保留并镜像 `careProgress/careMask`（进度只增不减，掩码取迁移后的上层）；已有 `careSession` 的对象不重建；文件 `schemaVersion` 保持 3（旧版 validateSave 可回退读取）。新增 `mirrorCareSessionToLegacy()`，员工 2 的 v2 写路径落盘前调用即可保持 v1 读取路径同步。回归测试覆盖“0.42 不变 0.21”“二次迁移不覆盖 v2 进度”。 |
| #2 蔓延+自然超额度 | `planDailyCandidateOrder` 与 `settleDailyRecordV4` 的自然容量统一按 `limit − 非自然槽` 计算；新增 3 个回归测试（3 蔓延+候选=3、1蔓延+1播种+1自然=3、警报期 2蔓延+3自然=5）。 |
| #3 模拟环境进安装包 | `vite.config.ts` 按模式分离：生产构建只含 care+capsule；`npm run build:mock`（`--mode mock`）或 dev server 才含 dev 入口。已验证生产产物无 `mock-panel/__mockDamp` 字样。探针启动前检查 dev.html 并提示先 `build:mock`。 |
| 次要：编排逻辑在 mock 里 | 抽出 `src/world/daily-cycle.ts` 的 `runDailyCycleV4(deps)`（暂停→警报→建记录→吸播种→规划蔓延→规划自然→结算→标记完成），mock 与主进程共用；新增 `scripts/test-daily-cycle.mjs`（7 例：暂停/同日幂等/默认天气不生成/警报 5 额/蔓延邻接/播种吸收/失败同身份）。 |
| 次要：模拟环境不跑蔓延 | `runDailyCycleV4` 接受真实/模拟邻接表，mock 传入自己的网格邻接；探针可观察到蔓延槽。 |
| 次要：播种探针断言太宽 | flow 探针明示“当日生效或满额顺延次日”两种合法结果，断言改为“登记 pending + 扣孢子”。 |
| 次要：AGENTS.md 与 v4 矛盾 | 根/世界指南与 PRODUCT.md 缺席合并条款改为 v0.2 日额度（3/5 共用额度）。 |
| 次要：probe-species-mushroom 假失败 | 改用 `imgs/loadState` 判定，退出码正确。 |

## 员工 2 审查修复（第四轮，2026-10-27）

| 审查项 | 处理 |
|---|---|
| #1 重启读档抹掉当天 v4 账本 | `upgradeFieldsToV4` 对 `dailyEvents` 增加 `'slots' in record` 判断：v4 记录原样保留（limit/slots/seed 不重写），只给 v3 旧记录补 `limit:1,alert:false,slots:[]`。回归测试：`runDailyCycleV4 → migrateSave → 再 cycle`，记录 deepEqual 不变、额度仍为 3、第二次为 terminal 不重复推进。 |
| #2 runDailyCycleV4 未检查 INIT | 新增 `wait-init` 动作：`native.init` 为 null（未生成）或 `status:'active'` 时返回 wait-init、不创建 DAILY 记录；`legacy-initialized`/`completed` 正常发放。测试覆盖四种 init 状态。员工 2 的调度器保留 INIT 分支作第二道防线。 |
| 小问题：build:mock 覆盖生产产物 | mock 构建改输出到 `dist/renderer-mock`；探针静态服务器只服该目录，`verifyMockBuild` 提示同上。生产 `dist/renderer` 不会被 mock 构建动到，`dist:win` 与 `uat:care-ui` 不再受探针顺序影响。 |

## 验证环境声明（员工 2 审查补充）

- 计划书设定员工 1 在 macOS 开发，但本批提交实际在 **Windows 本机**完成（Git 作者身份与员工 2 相同，无 Mac 端提交）。模拟环境是纯浏览器页面（Vite + Chromium），不自带平台相关代码；**未在 Apple 硬件上跑过**，不算 Mac 验收。
- `uat:care-ui` 首次拖动掩码检查在系统高负载时可能偶发失败（本轮并行跑多个 Electron 探针时出现 2 次“缺口格数/进度 0%”，单独重跑 22/22 通过；后续收尾/采菇/收藏均正常）——属探针时序敏感，不是产品回归；重跑前避免并行 Electron 负载。
- 13 款素材在 32/48px 的实际观感未由负责人确认，继续标 **NOT TESTED**（对照图在 `previews/species-assets-2026-10-26/`）。

## 已知限制 / NOT TESTED
- Windows 原生接线（IPC 注册、preload、图标合成、壁纸读写、调度器 v4 升级）：**NOT TESTED**。
- 幼菇素材为临时版（manifest 标 temporary）；最终幼菇需独立美术稿。
- 剪刀 cutQuality 锚点是近似值；A/B 合成版本待负责人在 Windows 桌面选定。
- 分层进度的"实际损伤格"口径当前用整图标损伤足迹近似（每层同分母）；员工 2 的图标引擎输出分层材质后可精确到层。
- 生产 care.html 已包含 care-v2 代码但被特性探测禁用（preload 无 v2 通道时零行为）。

## 素材来源
- 品种 SVG：美术包「蘑菇图标-差异化修改版/透明菌群/」（`_sources/`，13 文件）；PNG 由 `npm run assets:species` 重建；来源与临时性说明见 `src/renderer/public/assets/care/species/PROVENANCE.md`。
- 未使用「叠加图标/」预览中的第三方软件 logo；对照图底板为程序绘制的通用文件夹形状。
