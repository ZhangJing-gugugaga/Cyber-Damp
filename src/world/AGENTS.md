# world · DOX 子域指南

## Purpose

负责文件受潮、霉变、生长、材料和轻量交互的纯领域状态及模拟。先读[项目根指南](../../AGENTS.md)。

## Ownership

- [file-entity.ts](file-entity.ts) 管实体，[evolution.ts](evolution.ts) 管演进；其他文件承载布局、材料、天气、绳索及辅助经济规则。
- 可依赖 `src/shared/` 的契约与常量；领域层不依赖 Electron、Pixi、DOM、原生句柄或桌面文件 I/O。

## Local Contracts

- 对时间、随机和环境条件使用显式输入，保持相关测试可复现；不把帧数当作固定秒数。
- 霉变、损坏和护理改变模拟状态，不操作用户真实文件。来源文件身份、改名/修改识别与存档恢复行为遵循有效规格，不能只依赖 mtime 猜测全部身份变化。
- 检查 NaN、非有限数、越界值及存档边界；不要仅为了通过测试而隐藏非法输入或更改已确认数值。
- 经济与道具是辅助体验，不自行增加经营目标、惩罚或未批准的正式数值。
- economy.ts的harvestPrice复用现有临时单菇计价，普通采摘与剪落物售卖共用；剪落时记录品相。生长不形成额外成熟禁采，特殊工具约束保留，D05正式经济平衡仍待确认。
- 日常菇生长共用shared/constants.ts的既有普通菇速率；特殊菇不得沿用旧版8秒长满，dryCare同时阻止其新生与继续长大。Opening的4秒展示进度与日常逻辑分离。
- 类型或存档语义改变时核对 `src/shared/`、渲染装配及持久化消费方；保持已有有效存档的处理路径明确。

## Work Guidance

- 修改前核对现有行为与[已确认产品决策](../../docs/superpowers/specs/2026-10-19-care-and-desktop-design.md)，不要仅从旧代码注释推断新目标。
- 缺陷使用固定条件构造回归场景；复用现有测试风格，避免为每个实现细节建立一份镜像测试。

## Verification

- 世界逻辑：`npm run test:world`；共享常量：`npm run test:constants`。
- `npm test` 会先编译并覆盖世界、特殊蘑菇、颜料、掉落、共享常量等现有场景；需要跨模块回归时使用它，避免重复运行已覆盖的整套检查。
- 相关入口为 [scripts/test-world.mjs](../../scripts/test-world.mjs)、[scripts/test-special-mushrooms.mjs](../../scripts/test-special-mushrooms.mjs)、[scripts/test-pigment.mjs](../../scripts/test-pigment.mjs) 和 [scripts/test-falling.mjs](../../scripts/test-falling.mjs)。领域测试通过不代表原生视觉通过。

## Child DOX Index

<!-- dox-children:start -->
暂无独立子域指南；本文件覆盖本目录下的全部子目录。
<!-- dox-children:end -->
