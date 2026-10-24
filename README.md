# 回南天 Cyber Damp

Windows 桌面轻量玩具：天气驱动少量原生文件夹与快捷方式图标受潮、发霉或发焦；在普通护理窗口擦拭、采菇、收藏和购买小道具。

当前源码版本 0.1.25。2026-10-25 已按用户要求彻底退役旧覆盖层、替身输入、绳索物理、旧图集、专属预览及测试；当前构建仅含护理台和天气胶囊。原生图标变更/恢复、天气、当前材质、护理资产、品牌图标及旧存档迁移继续保留。清理前已有的交互和天气修改未回退。

**构建通过不等于用户验收通过。** 当前已知交互缺陷及留存判断见[体验评估](docs/REVIEW-RETENTION-2026-10-25.md)；本轮范围是旧版退役，并未顺带解决该报告中的全部缺陷。

## 当前入口

- 产品规格：[原生图标与天气胶囊 Goal v9](docs/superpowers/specs/2026-10-24-native-weather-goal-prompt.md)。胶囊层级及后续裁决见[执行记录](docs/GOAL-NATIVE-WEATHER-2026-10-24.md)。当前工作区保留默认长沙、离线默认天气和省市选择增量，默认数据须明确标识。
- 接口：[preload 契约 v1.14](docs/contracts/preload-api.md)。历史接口仅作档案，不再注册。
- 验收：[当前护理/原生桌面验收](docs/CARE-DESKTOP-UAT.md)及[项目 UAT 技能](.agents/skills/cyber-damp-uat/SKILL.md)。
- 清理范围、恢复位置与验证：[旧版退役记录](docs/LEGACY-RETIREMENT-2026-10-25.md)。

## 开发与构建

```powershell
npm install
npm run typecheck
npm test
npm run build
npm start
npm run dist:win
npm run qa:dox
```

Electron、TypeScript、Vite、koffi/Win32；护理台使用 Canvas/DOM。旧 Pixi、pixi-filters、Lucide 依赖已随旧入口退役移除。打包沿用锁定的本地 Electron 运行时。源码已更新不表示历史安装包已更新，本轮未重新分发安装包。

## 桌面与数据

只处理可支持的文件夹和普通 `.lnk` 图标引用，保留 Explorer 原生输入、原图标坐标和文件内容；不支持对象不强行转换。图标变更先登记原值，退出恢复用户原值，用户自行更改的值保留。文件夹图标属性也可能在 Explorer 其他位置显示。

本地数据位于 `%APPDATA%/cyber-damp/`；清理不触碰真实存档或恢复登记。v1/v2 旧存档的结构与迁移校验继续保留，不再加载旧游戏场景。新手奖励、每日额度、防霉与收藏规则以当前领域实现和有效规格为准。

天气胶囊不置顶；Win+D 后允许隐藏，通过托盘或程序入口唤回。关闭护理台回托盘，完全退出走图标引用恢复路径。

## 当前资产与历史资料

`src/renderer/public/assets/care/` 为当前护理素材，`public/brand/` 为品牌。`src/shared/material/effects.ts` 为桌面 ICO 与护理台共用材质。来源与作者工具见[资产清单](src/renderer/public/assets/care/PROVENANCE.md)及[当前预览目录](previews/visual-assets-2026-10-24/README.md)。

历史设计、评估、验收与交付哈希保留在 `docs/`，其中旧文件路径、玩法及性能数字只描述当时版本。旧版恢复脚本和覆盖层环境变量不再作为当前入口使用。
