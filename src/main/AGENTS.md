# main · DOX 子域指南

## Purpose

负责 Electron 生命周期、原生图标引用、普通窗口、IPC、持久化和系统能力。先读[根指南](../../AGENTS.md)。

## Ownership

- [index.ts](index.ts) 只装配；[window/](window) 承载胶囊和护理台，[desktop/](desktop) 承载枚举、事件与引用恢复。
- [ipc/register-handlers.ts](ipc/register-handlers.ts) 注册天气/应用/窗口公共通道，[ipc/native-handlers.ts](ipc/native-handlers.ts) 注册护理与原生状态（含 v0.2 玩法通道），[ipc/wallpaper-handlers.ts](ipc/wallpaper-handlers.ts) 注册壁纸组（Win32 接入前如实拒绝开启）；接口联动 preload、共享类型和根契约。
- v0.2 每日推进：[desktop/native-event-scheduler.ts](desktop/native-event-scheduler.ts) 的 `executeDailyV4` 只提供时钟、种子、存在性、类别、坐标邻接与图标写入，规则调用 `world/daily-cycle.runDailyCycleV4`；先预演收集图标计划、异步合成，再同输入正式结算。图标合成 [icon/state-icon.ts](icon/state-icon.ts) 读 13 款品种素材并支持 A/B 版本。

## Local Contracts

- 只运行原生图标产品；旧覆盖层、WorkerW 挂载、隐藏 Explorer 图标、替身输入、旧场景环境分支已退役，不重新引入。
- 图标写前保存恢复信息；恢复用户原值，用户自行改值不得覆盖。失败保留可用原生桌面，不改文件内容、名称或图标坐标。
- 胶囊与护理台是普通窗口，胶囊不抢焦点、不压普通应用；Win+D 隐藏是已接受行为，托盘可唤回。
- 护理台关闭仅隐藏；完全退出恢复引用。渲染页面不能获得任意文件/命令能力，IPC 校验发送方与载荷。
- `CD_UAT`/`CD_UAT_DATA_DIR` 可隔离存档，`CD_NATIVE_PROBE_DIR` 可限制探针对象；测试不得默认改动用户真实存档。

## Work Guidance

- Shell 图标提取复用 [desktop/shell-icons-worker.ts](desktop/shell-icons-worker.ts) 与 [native/win32-icon-pixels.ts](native/win32-icon-pixels.ts)，不把同步提取移回主线程。
- 窗口行为核对 [window/capsule-window.ts](window/capsule-window.ts)、[window/management-window.ts](window/management-window.ts) 和 [native/win32-foreground.ts](native/win32-foreground.ts)。
- 原生枚举不递归读取文档内容；事件与护理复用同一合成/恢复管线。保留旧存档迁移，不能因旧场景已删而清空用户数据。

## Verification

- `npm run typecheck`、`npm test`、`npm run build`。
- v0.2 通道：`npm run uat:ipc-v2`（需先 `npm run build`；真实 preload→IPC→临时存档，不写桌面）。A/B 合成样张：`node_modules/.bin/electron scripts/shot-state-icon-ab.cjs`（只读 Shell 提取，输出 previews/，不代替桌面观感验收）。
- 原生验证遵守[项目 UAT 技能](../../.agents/skills/cyber-damp-uat/SKILL.md)；[scripts/uat-icon-mutate.cjs](../../scripts/uat-icon-mutate.cjs)、[scripts/uat-native-loop.cjs](../../scripts/uat-native-loop.cjs) 会创建探针并写引用，先读前提，不对当前用户环境盲跑。
- 程序化、源码运行、安装包和感官验收分别记录；未观察项记 NOT TESTED。

## Child DOX Index

<!-- dox-children:start -->
暂无独立子域指南；本文件覆盖本目录下的全部子目录。
<!-- dox-children:end -->
