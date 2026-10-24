# 当前存档契约

运行时权威为 `src/shared/types/save.ts`、`src/shared/save/save-schema.ts` 与 `src/main/save/save-store.ts`，不另维护与实现脱节的旧版JSON Schema。

- 接受schemaVersion 1/2/3，写入/迁移使用当前v3；损坏、非有限数或越界字段返回校验失败，不能静默吞掉非法状态。
- 保留player、weather、files、ropes、stats等兼容段，旧files/ropes仅供读取与迁移，不再启动旧场景。owned/币数与旧有效数据不能随资料清理丢失。
- native段包含首批固定计划、每日唯一账本、对象损伤/菇/护理进度/掩码、防霉到期、城市和最近天气、收藏、一次引导与暂停/恢复状态。
- v1/v2升级标记legacy-initialized，不重发首批与奖励；重复迁移保持幂等。字段细节和边界以类型及validateSave/migrateSave为准。
- 保存复用临时文件与原子rename。图标原值恢复登记、天气缓存与游戏存档分别管理；写图标前登记恢复信息，恢复核对引用归属。
- renderer没有整档save.write出口；领域操作由主进程校验后保存，不能用旧全档快照覆盖日事件账本。

不在文档、日志或Git中提交真实用户存档、认证信息或桌面目录清单。
