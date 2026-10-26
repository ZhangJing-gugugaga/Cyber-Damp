# 护理台 v3 方向稿（huashu-design 三方向门）

状态：**三个方向已出稿，等用户选择**。选定前不进入产品实现。用户选择后，记录在 `direction-approved.md`（含展示了哪几版、截图路径和用户原话）。

| 文件 | 内容 |
|---|---|
| [spec.md](spec.md) | 三版共用的设计 spec（用户原话、受众、核心信息、尺寸、约束、素材） |
| [directions.md](directions.md) | 六张方向卡、轮盘抽签记录、挑三张的理由 |
| [thumbs.html](thumbs.html) | 六个候选缩略图（截图 `shots/thumbs.png`） |
| [dir-1.html](dir-1.html) | ② 晾衣绳（可玩） |
| [dir-2.html](dir-2.html) | ⑥ 菌圈（可玩） |
| [dir-3.html](dir-3.html) | ③ 洗护工位（可玩） |
| `assets/engine.js` | 三版共用的擦拭、音效、粒子、弹簧引擎 |
| `assets/objects/` + `objects.js` | 用 `prep-assets.cjs` 生成：Windows 自带对象的真实 Shell 图标，经产品 `state-icon.ts` 合成的干净图、损伤图和长菇图 |

打开方式：用浏览器直接打开 `dir-*.html`（窗口 960×640）。素材路径相对仓库根目录，必须在仓库内打开。
截图：`node_modules/.bin/electron design-system/care-v3/shot.cjs dir-1.html dir-2.html dir-3.html`。

诚实说明：
- 墙、盆、绳、苔地、石、花瓣、转台等场景物件都是程序化占位，不是最终美术。
- 图标和菇是真实素材；幼菇是临时素材。
- 层进度在演示里按总进度依次分配给各层，产品里按员工 1 的分层掩码计算。
- 精细护理、孢子掉落在演示里用的是简化判定。
- 本机没有安装 huashu-design 的脚本（`design_lint` / `ref_board` / `learn`）：外观账本为空，现实参照没有截图，只引用公开资料。
