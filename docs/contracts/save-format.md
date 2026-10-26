# 当前存档契约

运行时权威为 `src/shared/types/save.ts`、`src/shared/save/save-schema.ts` 与 `src/main/save/save-store.ts`，不另维护与实现脱节的旧版JSON Schema。

- 接受schemaVersion 1/2/3/4；当前 v3→v4 **字段迁移是纯增量**：新增 careSession/孢子/播种/警报与会话槽位，但保留并镜像旧 careProgress/careMask，文件 schemaVersion 仍写 3（旧版程序 validateSave 只认 1/2/3，回退可读）。员工 2 的 v4 读写路径就绪后再把版本号提升到 4。损坏、非有限数或越界字段返回校验失败，不能静默吞掉非法状态。
- 保留player、weather、files、ropes、stats等兼容段，旧files/ropes仅供读取与迁移，不再启动旧场景。owned/币数与旧有效数据不能随资料清理丢失。
- native段包含首批固定计划、每日唯一账本、对象损伤/菇/护理进度/掩码、防霉到期、城市和最近天气、收藏、一次引导与暂停/恢复状态。
- v4（gameplay-v2 契约）：对象新增 objectCategory/careSession/glossUntil；native 段新增 spores（孢子库存，仅13款新品种）、planted（播种登记）、alert（回南天警报）、fineCareCount、overlayVariant；日账本记录升级为含 limit/alert/slots 的槽位模型（v3 旧记录迁移时补 limit:1、alert:false、slots:[]，视为已结算）。旧单层 careMask/careProgress 迁为对应族上层的 careSession（受潮→droplets、霉变→mold、焦化→soot），**旧字段保留并镜像（只增不减）**，主进程 native-handlers 与旧版回退继续可读；收藏原样保留。已有 careSession 的对象重复迁移不重建（不覆盖 v2 写入进度）。v4 日账本记录（含 slots/limit/alert）读档时原样保留，迁移只给 v3 旧记录补字段——重启不会抹掉当天额度与回放证据。
- careMask为64×64擦拭掩码的base64：0.1.26起按512字节（全部4096格）编码；≤0.1.25旧值只有64字节（顶部8行），解码兼容并按原状恢复，旧存档中下部已丢失的擦拭记录不可恢复、不补造。编解码实现与往返回归见 `src/shared/care-mask.ts` 与 `scripts/test-care-mask.mjs`。
- v1/v2升级标记legacy-initialized，不重发首批与奖励；重复迁移保持幂等。字段细节和边界以类型及validateSave/migrateSave为准。
- 保存复用临时文件与原子rename。图标原值恢复登记、天气缓存与游戏存档分别管理；写图标前登记恢复信息，恢复核对引用归属。
- renderer没有整档save.write出口；领域操作由主进程校验后保存，不能用旧全档快照覆盖日事件账本。

不在文档、日志或Git中提交真实用户存档、认证信息或桌面目录清单。
