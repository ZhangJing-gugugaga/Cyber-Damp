# 回南天 Cyber Damp

Windows 桌面轻量玩具：天气驱动少量原生文件夹与快捷方式图标受潮、发霉或发焦；在普通护理窗口擦拭、采菇、收藏和购买小道具。

当前源码版本 0.1.25，构建仅含护理台和天气胶囊。原生图标变更/恢复、天气、当前材质、护理资产、品牌图标及旧存档迁移继续保留。

**构建通过不等于用户验收通过。** 已有能力、已知缺陷与未测范围见[当前实现状态](docs/CURRENT-STATUS.md)。

## 当前入口

- 产品规格：[当前产品规格](docs/PRODUCT.md)。已合并默认长沙、离线默认天气、省市选择、Win+D 与旧版退役的有效决定。
- 接口：[preload 契约 v1.14](docs/contracts/preload-api.md)。历史接口仅作档案，不再注册。
- 验收：[当前护理/原生桌面验收](docs/CARE-DESKTOP-UAT.md)及[项目 UAT 技能](.agents/skills/cyber-damp-uat/SKILL.md)。
- 存档兼容：[当前存档契约](docs/contracts/save-format.md)。

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

旧规格、日期报告、评估与接口档案已先推送保存于[存档提交8442b33](https://github.com/ZhangJing-gugugaga/Cyber-Damp/tree/8442b3388bf4896b881ec48261d1bac45a126f63)。最新文件树只保留现行规范与素材；需要历史资料时从该提交按文件查看或恢复。
