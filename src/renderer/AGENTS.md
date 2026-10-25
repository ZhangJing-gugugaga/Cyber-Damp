# renderer · DOX 子域指南

## Purpose

负责当前护理窗口与天气胶囊的界面、Canvas 擦拭、交互与反馈。先读[根指南](../../AGENTS.md)。

## Ownership

- [care.ts](care.ts)、[care.html](care.html)、[care.css](care.css) 为护理、收藏、小铺和设置。
- [capsule.ts](capsule.ts)、[capsule.html](capsule.html) 为天气小窗。
- [types/damp.d.ts](types/damp.d.ts) 对齐 preload 契约；素材位于 [public/assets/care/](public/assets/care/)（13 款品种子目录见其 [PROVENANCE](public/assets/care/species/PROVENANCE.md)）与 [public/brand/](public/brand/)。旧 app/view/input/ui、图集和专属预览入口已退役。
- 浏览器模拟环境（v0.2 员工 1）：[dev.html](dev.html) + [dev-entry.ts](dev-entry.ts) + [dev/](dev/)（mock-damp/mock-save/mock-weather）。mock 复用 `src/world`/`src/shared` 同一领域实现并持久化到 localStorage；生产 care.html 不加载 mock 代码；**改 care.html 后必须同步重新生成 dev.html**（由 care.html 派生：换标题 + 换 dev-entry 脚本）。
- v2 界面层：[care-v2.ts](care-v2.ts)（分层工具/剪刀/播种/菌讯卡/图鉴/墙面页），按特性探测挂载（preload 无 v2 通道时零行为）；与 care.ts 通过 `__careBridge` 与 `canvas-wrap[data-v2-claimed]` 桥接。探针：`scripts/probe-dev-flow.cjs`（API 级）、`scripts/probe-dev-ui.cjs`（手势级）、`scripts/shot-care-v2.cjs`（截图）。

## Local Contracts

- 通过类型化 preload 调用主进程，不直接获取文件系统或 Win32 权限。
- 护理在普通窗口内进行，不接管桌面点击、不隐藏/重排/替代原生图标。胶囊透明留白穿透，点击与拖动需分别验证。
- 桌面 ICO 和护理台复用 shared/material/effects 的款式；清理不自动采菇，采菇不清空污渍或部分进度。
- 当前护理素材和品牌继续复用；不因旧版退役删除现行资产。未接入的工具不伪装可用。
- 松手、取消和失焦的工具边界，以及掩码跨会话恢复，必须看实际行为；旧评估指出的缺陷不能仅因清理代码便写成已修复。

## Work Guidance

- 领域规则见 [world 指南](../world/AGENTS.md)，不在页面再造经济或天气规则。
- 新素材维护来源；原尺寸识别性、跟手反馈、状态同步与持久化分别核对。
- 默认天气明确标记，不冒充实时定位/天气。隐藏护理台不算离线，状态刷新不得打断正在擦拭的手势。

## Verification

- `npm run typecheck`、`npm test`、`npm run build`。
- 构建只包含护理台和胶囊。CDP 可诊断页面，原生点击、拖动、遮挡与感官结果按[项目技能](../../.agents/skills/cyber-damp-uat/SKILL.md)执行；不拿 HTML 预览替代原生验收。

## Child DOX Index

<!-- dox-children:start -->
暂无独立子域指南；本文件覆盖本目录下的全部子目录。
<!-- dox-children:end -->
