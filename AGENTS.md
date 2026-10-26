# Cyber Damp · DOX 项目指南

<!-- dox-framework:start -->
## DOX 执行约定

本项目采用基于 [agent0ai/dox](https://github.com/agent0ai/dox/tree/765ae4ac02cc884eefcd41a3d0f71941721adb89) 的轻量分层指南。以下是长期规则，不是任务进度或已通过验收的声明。

- 修改前读取本文件，以及从项目根到目标目录沿途适用的 AGENTS.md；从根目录启动 Codex 不代表所有子域指南已自动加载。使用 `npm run qa:dox -- --paths <目标路径...>` 定位适用链，再实际读取列出的文件。
- 当前会话已读取且文件未变化时，无需为每个小补丁机械重读。更换目标目录或指南变化后，补读相关指南；缺失/损坏的指南必须先报告并修复或明确处理。
- 文档中的局部规则细化其子树的工作；不得扩大当前授权、降低真实数据保护或验收标准。冲突按用户最新明确决策及有效规格判定，不能只按文件时间或“距离更近”决定产品目标。
- 职责、公开接口、目录结构、验证命令或长期流程变化时，在完成任务前同步更新相关指南及父索引。普通实现细节、排版或临时排错不要求修改指南，也不要求生成“文档未变”的报告。
- 根指南保留全项目约束和子域索引；子指南只写当地职责与差异，不重复父规则。仅在形成稳定独立边界时新增子指南，不为每个目录建文件。
- 活动指南移除失效指令与链接；按用户最新要求，历史决策、UAT 和交付证据先保存到已核验的远端提交，再从最新文件树移除。当前规则与未解决问题迁入现行文档，不得把“待实现”改成“已通过”或改变产品目标。
- 持久项目偏好记录在此或相关子指南；跨项目偏好回到 Skillshare 的共享规则来源维护，不自行同步本项目规则到其他项目。
- 扫描限于相关源码、脚本和规格。跳过依赖、产物、安装包、日志、缓存和备份；不读取认证/环境配置或用户桌面文档内容来建立索引。
- 修改指南后运行 `npm run qa:dox`。该命令检查索引、路径、命令和规则链的结构，不能证明模型遵守规则或产品通过实测。
<!-- dox-framework:end -->

## Purpose

轻量、有趣的 Windows 桌面受潮发霉体验；不要自行扩展复杂经营、每日任务或强制护理系统。

## Ownership

- 根文件覆盖未单独建指南的目录，尤其 `src/preload/`、`src/shared/`、`scripts/`、`docs/` 和项目技能。
- 源码技术栈为 Electron、Canvas/DOM、TypeScript 和 Win32；实际依赖版本、脚本以 [package.json](package.json) 及锁文件为准。只改源码，不直接修补 `dist/` 或 `release/`。
- 本项目指南由项目维护；Skillshare 管全局技能与共享偏好，CC Switch 管供应商。不要让全局同步器覆盖本项目自维护文档树。

## Local Contracts

- 先由 [README](README.md) 确认规格入口。产品行为核对[当前产品规格](docs/PRODUCT.md)，已接受的后续裁决已合并于该文档；视觉任务读取[美术方向](design-system/ART-DIRECTION.md)，原生/护理验收读取[当前验收要求](docs/CARE-DESKTOP-UAT.md)。只读取任务需要的部分。
- 旧 PRD、SPEC、代码注释及技能中的冲突条款不覆盖已确认的新决策。旧覆盖层与其 3–5 秒回放已于 2026-10-25 由用户明确要求退役；发现新冲突且无法确定有效决策时说明并澄清。
- 不改写真实文件内容、名称、权限或 Explorer 图标位置；模拟损坏仅在存档和画面中。允许的桌面扫描/打开行为仍需遵守当前任务及测试授权，不运行未知可执行文件。
- 跨进程契约涉及 [preload 出口](src/preload/index.ts)、[共享类型](src/shared/types)、[IPC 注册](src/main/ipc/register-handlers.ts) 和[契约文档](docs/contracts/preload-api.md)（v0.2 玩法通道规则另见 [gameplay-v2](docs/contracts/gameplay-v2.md)，壁纸组注册于 [wallpaper-handlers](src/main/ipc/wallpaper-handlers.ts)）；新增或修改接口时核对这些位置，不只修一端。
- 保留用户已有修改；不擅自重置工作区、升级依赖或提交/推送。项目是否暂停、恢复或进入下一阶段，以当前用户授权为准，不把临时进度固化为全局禁令。

## Work Guidance

- 开发硬规则：编码前先搜索 GitHub 是否有现成项目；能复用的代码绝不重新写；Codex 只开发缺少的功能。优先盘点本项目旧版资产、代码与已有依赖，保留来源及必要的最小适配说明；跨项目规则的共享来源为 `D:/AI-Config/instructions/AGENTS.md`，由 Skillshare 维护和同步。
- 当前仅保留原生图标变化、天气胶囊与护理台，以及 v0.2 起由玩家主动开启的静态壁纸效果（PRODUCT R9），不再通过环境变量启用旧版。v0.2 双人分工与通道契约 v1.15 见[玩法契约](docs/contracts/gameplay-v2.md)（Win32 壁纸读写尚未接入）。当前资产/材质和旧存档迁移保留，边界见[产品规格](docs/PRODUCT.md)，未解决问题见[当前状态](docs/CURRENT-STATUS.md)。历史体验认可不代表当前通过。

- UI、桌面融合、领域逻辑分别进入下面的子域指南；涉及多个域时读取所有适用链。
- 复现缺陷后选择覆盖相关行为的检查；测试环境和产物模式必须与所声称验证的行为一致。
- 源码、独立预览、打包版本和用户感官确认分别记录；性能数字注明实测机器与显示条件，不杜撰预算或达标结果。

## Verification

- 文档树与加载路径：`npm run qa:dox`；定位规则链：`npm run qa:dox -- --paths src/main/index.ts`。
- 类型和跨进程接口：`npm run typecheck`；跨模块逻辑：`npm test`，后者已包含当前事件、护理、调度、迁移、天气与材质检查，不机械重复整套测试。
- 运行效果前：`npm run build`；交付便携包：`npm run dist:win`，相关行为在实际打包产物上验证。
- 护理与 IPC 端到端：`npm run uat:ipc`（真实 preload→IPC→临时存档的领域失败传播）、`npm run uat:ipc-v2`（v0.2 玩法与壁纸通道）、`npm run uat:care-ui`（护理台界面，Chromium 输入注入，临时存档，不触碰桌面；时序敏感，不与其他 Electron 探针并行）。三者需先 `npm run build`，证据范围是渲染层与 IPC 接线，不代替原生输入验收。
- 原生交互按[项目 UAT 技能](.agents/skills/cyber-damp-uat/SKILL.md)执行。CDP 只能辅助诊断，不能替代原生输入与截图。未运行或不可观察的项目记为 NOT TESTED。

## Child DOX Index

<!-- dox-children:start -->
- [src/main/AGENTS.md](src/main/AGENTS.md)：桌面接入、窗口、Win32、退出恢复与主进程职责。
- [src/renderer/AGENTS.md](src/renderer/AGENTS.md)：护理台、天气胶囊、Canvas 输入与视觉。
- [src/world/AGENTS.md](src/world/AGENTS.md)：纯领域状态、演进、模拟与逻辑测试。
<!-- dox-children:end -->
