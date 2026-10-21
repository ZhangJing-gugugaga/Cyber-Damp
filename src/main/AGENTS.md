# main · DOX 子域指南

## Purpose

负责 Electron 生命周期、原生桌面集成、窗口、IPC、持久化和系统能力。先读[项目根指南](../../AGENTS.md)。

## Ownership

- [index.ts](index.ts) 负责装配；窗口与桌面处理分别在 [window/](window)、[native/](native) 和 [desktop/](desktop)。不要把业务继续堆入入口。
- [ipc/register-handlers.ts](ipc/register-handlers.ts) 对接 preload 与共享类型；修改跨进程边界时同时读取项目根的契约规则。
- 本文件仅约束 `src/main/` 子树，不取代其他域的指南。

## Local Contracts

- 原生桌面布局读取、宿主挂载、图标隐藏、首帧显示与失败恢复是有顺序的流程；失败时保留可用的 Explorer 桌面，不把未就绪状态视为可接管。
- 退出、渲染崩溃、挂载失败和原生宿主失效都要考虑恢复路径；不要仅验证“窗口关了”，遗漏原生图标可见性及原坐标。
- IPC 对来自渲染端的载荷做类型及范围检查；仅暴露需要的能力，不把任意文件/命令执行能力透传给渲染端。
- `CD_QA`、`CD_NO_ATTACH` 与正式桌面路径不同。其结果不能证明正式挂载、点击穿透或退出恢复已通过。

## Work Guidance

- 窗口层级或 Win32 改动先定位 [native/win32-desktop.ts](native/win32-desktop.ts)、[window/create-overlay-window.ts](window/create-overlay-window.ts) 及相关调用方。
- 修改扫描/布局时核对用户桌面、公共桌面与 Shell 项目的身份和坐标；不通过网格重排或改变原图标大小掩盖不一致。
- 不在本子域引入 Pixi 渲染或把原生句柄细节泄漏给纯领域层。
- 多屏使用工作区物理并集与共享 `desktop-viewport` 投影；场景扫描携带CSS尺寸/devicePixelRatio，原生窗口、光标、Shell坐标共用同一基准。显示变化先恢复Explorer，重建视图后接回；挂载引起DPI变化时走viewportReady确认，不提前隐藏原图标。接口细节见根契约文档。

## Verification

- `npm run typecheck`；涉及存档/共享契约的逻辑再运行相应测试，跨模块修改使用 `npm test`。
- 原生诊断入口为 [scripts/check-desktop.cjs](../../scripts/check-desktop.cjs) 和 [scripts/test-desktop-restore.mjs](../../scripts/test-desktop-restore.mjs)。先阅读脚本前提；恢复脚本可能终止生产实例，不自动运行破坏当前工作环境的验证。
- 需要原生验证时使用[项目 UAT 技能](../../.agents/skills/cyber-damp-uat/SKILL.md)，保留正常/异常退出的真实证据。

## Child DOX Index

<!-- dox-children:start -->
暂无独立子域指南；本文件覆盖本目录下的全部子目录。
<!-- dox-children:end -->
