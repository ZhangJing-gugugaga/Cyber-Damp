# world · DOX 子域指南

## Purpose

负责原生图标自然事件、护理、采摘和轻量经济的纯领域逻辑。先读[根指南](../../AGENTS.md)。

## Ownership

- [native-events.ts](native-events.ts) 定义首批、日额度、天气倾向与免疫。
- [native-care.ts](native-care.ts) 定义清理、采摘、奖励和购买。旧连续演进、物理绳索、颜料与旧商店已退役。
- 只依赖 shared 类型/常量，不依赖 Electron、DOM、Pixi、Win32 或文件 I/O。

## Local Contracts

- 时间、种子和天气显式输入，规则可重复验证。首批一次性固定计划；后续全局每天至多一个对象推进一级，暂停不积欠。
- 完整护理刷新连续 240h 防霉，仍可按天气受潮/发焦；清理保留菇，采菇保留损伤与部分护理进度，不重复结算。
- 经济辅助体验，不自行扩充经营或强制护理。价格与一次性奖励以有效规格及当前常量为准。
- 保留共享存档中的旧字段和 v1/v2→v3 迁移校验；退役旧玩法不等于删除用户数据。
- 遇到 NaN、非法存档和状态边界应明确拒绝，不为通过测试掩盖非法输入。

## Work Guidance

- 对照[当前产品规格](../../docs/PRODUCT.md)及最新用户裁决；历史规格不重新激活旧玩法。
- 新缺陷用固定条件覆盖行为；规则测试不能替代生产调度、原生引用和显示验证。

## Verification

- `npm run test:world` 检查事件与护理；`npm test` 另含调度、迁移、天气、材质与原生引用基础检查。
- [事件测试](../../scripts/test-native-events.mjs)、[护理测试](../../scripts/test-native-care.mjs)、[调度测试](../../scripts/test-native-scheduler.mjs)均不宣称完成真实桌面验收。

## Child DOX Index

<!-- dox-children:start -->
暂无独立子域指南；本文件覆盖本目录下的全部子目录。
<!-- dox-children:end -->
