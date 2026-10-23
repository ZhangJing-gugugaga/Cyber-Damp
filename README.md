# 回南天 Cyber Damp

本轮开发进展：[启动反馈与后台图标提取](docs/STARTUP-EXPERIENCE-2026-10-23.md)、[输入与启动修复](docs/INTERACTION-PERFORMANCE-2026-10-22.md)、[体验增量与包记录](docs/EXPERIENCE-INCREMENT-2026-10-21.md)、[2026-10-22原生回归](docs/NATIVE-UAT-2026-10-22.md)。用户最新反馈重新打开卡顿与工具冲突问题，历史性能认可不代表当前通过；完整Goal仍未验收。

> **2026-10-21 当前方向：** 开发进行中。用户已认可原生排版与样片迁移方向，并明确当前性能满足使用要求；下一轮集中修复图标准确性、可见对象的点击操作，以及独立商城/设置的完整体验。现按用户进一步反馈执行 [修订目标与开发计划](docs/superpowers/specs/2026-10-21-experience-direction-and-plan.md)：复用旧版、恢复单击选中、统一游戏式 UI，并扩充多种动态样片。工作区源码、下方历史 0.1.9 便携包与最终用户验收分别记录，不能混用。
>
> [护理、经济与桌面融合设计](docs/superpowers/specs/2026-10-19-care-and-desktop-design.md) 与用户最新决策优先于本文旧实现描述。平滑漫画风、3–5 秒启动回放、90% 遮挡上限（仍须辨识原图）、严格保持原生图标大小与布局仍有效；旧版写实/核爆/蜗牛护理/固定六秒/网格重排不再作为目标。历史测试不代表新标准已通过。

Windows 桌面玩具：真实桌面文件受潮、发霉，拖动替身拉绳晾晒，采蘑菇升级家务装备。

当前开发体验包 **0.1.22**：新增真实阶段启动提示与后台图标提取，等待期间保留原生桌面，就绪后自动关闭提示并播放；浏览/工具动作分离，Esc退出工具，白色文件名独立于材质，启动安全就绪后自动回放；保留已认可商城/HUD美术与窗口壳。部分原生回归通过，完整矩阵和性能感官确认未通过；下方0.1.9记录属于历史交付。真实麦克风/音频听感尚未验收。技术栈：Electron 44、Pixi.js 8、TypeScript、koffi / Win32，材质变形使用 PixiJS Filters 6。

## 启动与构建

```powershell
npm install
npm run typecheck
npm test
npm run test:world
npm run test:constants
npm run build
npm start
npm run dist:win
```

Windows打包复用`node_modules/electron/dist`中已安装的锁定版本运行时（electron-builder官方`electronDist`能力），无需为每次打包重复下载Electron。需先按锁文件安装依赖。

本机优先运行完整目录中的`release/win-unpacked/Cyber Damp.exe`；分发使用`release/Cyber Damp-0.1.21-win.zip`，解压一次后双击其中exe，保留同目录资源。单文件`release/Cyber Damp 0.1.21.exe`每次启动重新解包，本机这轮总启动明显更慢，不作为优先体验入口。版本、哈希与未测范围见上方本轮修复记录；完整UAT仍未通过。

设置面板中的“退出回南天”走恢复原生桌面的路径；本机0.1.16原生退出恢复实测62ms，0.1.11强制终止恢复94ms，不推广成所有版本/机器均已通过。程序不移动、不改写真实文件和 Explorer 的图标坐标。

## 真实桌面与本地数据

- 扫描用户桌面（支持重定向）和公共桌面，追加回收站。同名项按用户桌面优先去重。
- 优先从 Windows Shell 获取256px图标原画；旧图标提供者回退到系统小图，再失败才使用 Electron 接口。
- 双击替身通过系统默认程序打开原文件，并本地记录最近使用时间；当前护理设计要求清洗由用户明确触发，打开文件不自动清除受潮或霉斑。
- 存档和匿名本地事件保存在 `%APPDATA%/cyber-damp/`；`desktop-usage.json` 只保存路径哈希与打开时间，不保存文件内容。
- 尚无使用记录的文件以最后修改时间估算冷落程度，不能据此声称掌握了历史真实打开时间。

旧 MVP 文档中的“合成桌面 / 禁止真实文件访问 / 透明置顶”范围已被本次用户 UAT 的真实桌面与桌面图层要求取代。当前宿主为 `SHELLDLL_DefView`，普通应用窗口应完整遮挡桌面玩具。

## 代理指南（DOX）

项目采用[根 AGENTS.md](AGENTS.md)及主进程、渲染、领域逻辑三个子域指南。修改前按目标目录读取适用规则；规格、接口和长期流程改变时维护指南及索引。配置面向 Codex，不依赖额外服务。

运行 `npm run qa:dox` 检查文档树；运行 `npm run qa:dox -- --paths src/main/index.ts` 定位规则链。检查通过表示文档结构有效，不代表产品运行或原生 UAT 已通过。

## 项目级工具与原生验收

`.codex/config.toml` 配置了 CursorTouch Windows-MCP 0.8.8。项目技能位于 `.agents/skills/cyber-damp-uat/SKILL.md`。

当前会话未热加载 MCP 配置时，可通过同一 stdio 服务运行：

```powershell
uvx --from windows-mcp==0.8.8 python scripts/windows-mcp-client.py scripts/native-drag-uat.json
```

原生鼠标、截图和错误结果留在 `logs/native-uat/`（不纳入 Git）。遇到 MCP 用户控制权抢占时，驱动会停止后续依赖动作。

```powershell
./node_modules/electron/dist/electron.exe scripts/check-desktop.cjs
node scripts/test-desktop-restore.mjs normal
node scripts/test-desktop-restore.mjs
```

恢复测试需要已运行的生产桌面实例；normal 模式另需 `--remote-debugging-port=9222`。最后一个命令会有意终止当前项目的桌面实例。

CDP 只作为诊断辅助，不能替代原生桌面 UAT。完整标准：[用户原文](docs/UAT-SOURCE.md)；执行结果与尚未完成的功能：[修复及验收记录](docs/REPAIR-UAT.md)。

## 视觉资产

两张透明 PNG 图集、完整菌柄见手青及电扇分层素材由内置 image_gen 生成，已随构建打包。提示词和消费位置见 `src/renderer/assets/PROVENANCE.json`、`bolete-intact.provenance.json`、`fan-parts.provenance.json`。电扇底座固定，扇头和叶轮分别活动；文件图标仍来自 Windows Shell。

**完整终极 UAT 尚未通过。** 0.1.9修复吸湿盒倾斜时透明角落被涂成矩形蓝块的问题，保留沙漠干燥、壁纸/状态栏水波及此前修复。68项机械检查与单列12种原生WebGL2边界组合通过；源码真实拖动可见水面波动，倾倒后颗粒恢复并重新积水。最终便携包实启29项、无测试夹具，正常退出13ms、强杀65ms恢复，24项打包资源一致。清澈水流观感、声音/吹气、拧干及独立Computer Use截图/鼠标等仍待完成。源码玩法录像不冒充所有玩法均在最终包重测，详见[验收记录](docs/REPAIR-UAT.md)。
