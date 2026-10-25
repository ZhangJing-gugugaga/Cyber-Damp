# v0.2 玩法契约（草案 v1.15-draft）

状态：**草案，待员工 1 审阅**。2026-10-25 由员工 2 起草。类型源为 [`src/shared/types/gameplay.ts`](../../src/shared/types/gameplay.ts)，规格依据 [PRODUCT.md](../PRODUCT.md) 的 R4/R5/R6/R9。表中新通道**尚未注册**，preload 也还没有暴露；接线由员工 2 在领域函数交付后完成（计划 Task 11/13）。现行接口仍以 [preload 契约 v1.14](preload-api.md) 为准。

## 分工边界

| 内容 | 实现方 | 位置 |
|---|---|---|
| 品种判定、日额度槽位、分层护理、精细护理、孢子、蔓延、警报、今日菌讯、壁纸像素效果、存档 v4 迁移 | 员工 1（Mac） | `src/world/`、`src/shared/`（类型除外） |
| 类型与本契约、对象分类、IPC 处理器、preload、调度接线、图标合成、Win32 壁纸读写与恢复 | 员工 2（Windows） | `src/shared/types/`、`src/shared/object-category.ts`、`src/main/`、`src/preload/` |

浏览器模拟环境按 `NativeV2Api` 与 `WallpaperApi` 实现同名方法，不另造接口。

## 已上线的前置字段

- `DesktopEntry.objectCategory` 与 `NativeObjectView.objectCategory`：主进程扫描时用 `classifyObject` 判定，只用到对象种类和 `.lnk` 目标路径，不读文件正文，也不 stat 目标。类别集合为 `folder | archive | image | chat | code | game | browser | other`，测试见 `scripts/test-object-category.mjs`。

## 品种 ID

- 新品种 13 个：`bubble, moss, bell, lantern, archive, waterfall, ghosted, sleepless, timid, broken, pixel, undo, rain-crown`，依次对应美术 01–13。
- 旧品种 `oyster, enoki, shy, bolete, lava` 的 ID 原样保留。**社恐缩头菇用 `timid`，不能用 `shy`**，因为旧存档的 `shy` 是胆小菇。旧品种归入收藏页的"早期品种"区，新事件不再产生旧品种。
- 渲染层的 `SPECIES_LABEL` / `SPECIES_ASSET` 和主进程的 `SPECIES_SHAPE` 以后改为读取同一份 species manifest（由员工 1 生成），不再在三处各维护一张表。

## 新通道草案

| 出口 | 通道 | 载荷 → 结果 | 规则 |
|---|---|---|---|
| native.careProgressV2 | native:careProgressV2 | `CareProgressV2Payload` → `{ok,message?}` | family/stage 与存档不一致时拒绝（旧回执）；每层掩码 ≤4096 字符；progress 必须是有限数且在 0..1 内 |
| native.careCompleteV2 | native:careCompleteV2 | `{objectId}` → `CareCompleteV2Result` | 精细护理由领域层根据 `toolsUsed` 判定；奖励只发一次 |
| native.quickCare | native:quickCare | 不变 | 不发精细奖励，仍刷新防霉 |
| native.harvestV2 | native:harvestV2 | `HarvestV2Payload` → `HarvestV2Result` | `cutQuality` 夹取到 0..1；孢子掉落用存档种子判定，重复采摘返回失败 |
| native.plantSpore | native:plantSpore | `PlantSporePayload` → `{ok,message?}` | 孢子不足、对象不在桌面或对象不可写时失败且不扣孢子；占用次日或当日剩余槽位 |
| native.cancelPlant | native:cancelPlant | `{objectId}` → `{ok}` | 只能取消 pending 的播种，孢子退回 |
| native.setOverlayVariant | native:setOverlayVariant | `{variant:'A'\|'B'}` → `{ok}` | 用于实测比较；切换后只重新合成已有外观 |
| wallpaper.status | wallpaper:status | → `WallpaperView` | 只读 |
| wallpaper.setEnabled | wallpaper:setEnabled | `{on}` → `{ok,view?}` | 开启前先登记原值；遇到跳过条件时返回 skipped 和原因 |
| wallpaper.wipe | wallpaper:wipe | `{fogMask,progress}` → `{ok,view?}` | 只在松手或确认时调用；主进程限频，不逐帧设置壁纸 |

`native.status` 新增 `NativeStatusV4Fields`，对象视图新增 `NativeObjectViewV4Fields`。所有新通道限护理台 WebContents 调用，校验载荷；领域失败返回 `ok:false` 且不写盘，沿用 `mutateSave` 的语义。

## 存档 v4 草案

- `schemaVersion: 4`。v3 → v4 迁移：
  - `dailyEvents` 原记录补 `limit:1, alert:false, slots:[]`，表示旧日记录已结算；不重新计算，也不补发。
  - `collection` 原样保留。
  - 旧 `careProgress/careMask` 迁移为单层 `careSession`：受潮迁到 `droplets`，霉变迁到 `mold`，焦化迁到 `soot`。
  - `spores` 置空，`alert` 记为未激活。
- 新字段见 `NativeObjectSaveV4Fields`、`NativeSaveSectionV4Fields`。校验规则：拒绝非有限数，掩码长度 ≤4096，品种必须属于 `SpeciesId`，孢子数为非负整数。
- 壁纸的原值恢复登记**不放在游戏存档里**，由主进程单独存为 `wallpaper-restore.json`，与图标恢复登记同一模式。

## 待员工 1 审阅的问题

1. `CareSessionState.toolsUsed` 是否足够判定精细护理，还是需要按层记录工具贡献？
2. `DailyEventRecordV4.status` 的 success 语义（≥1 个槽位成功）是否满足 7 天回放测试的需要？
3. 播种占槽：选择"当日剩余槽位优先，否则顺延到次日"，还是"一律次日生效"？草案倾向前者。
4. `WallpaperEffectInput` 是否缺少必要的输入（例如雨强、时段）？

审阅意见写回本文件；确认后去掉"草案"字样，契约版本号改为 v1.15，并同步 preload-api.md、`src/preload/index.ts`、`src/renderer/types/damp.d.ts` 与 IPC 注册。
