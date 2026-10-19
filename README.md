# 回南天 Cyber Damp

Windows 桌面玩具：真实桌面文件受潮、发霉，拖动替身拉绳晾晒，采蘑菇升级家务装备。

当前修复版 **0.1.9**。技术栈：Electron 44、Pixi.js 8、TypeScript、koffi / Win32，材质变形使用 PixiJS Filters 6。

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

便携版：`release/Cyber Damp 0.1.9.exe`。未签名；完整终极 UAT 仍未通过，逐项状态见下方验收记录。

设置面板中的“退出回南天”会恢复原生桌面；正常退出与强杀恢复已分别做原生可见性计时测试。程序不移动、不改写真实文件和 Explorer 的图标坐标。

## 真实桌面与本地数据

- 扫描用户桌面（支持重定向）和公共桌面，追加回收站。同名项按用户桌面优先去重。
- 优先从 Windows Shell 获取256px图标原画；旧图标提供者回退到系统小图，再失败才使用 Electron 接口。
- 双击替身通过系统默认程序打开原文件，清除受潮，并本地记录最近使用时间。
- 存档和匿名本地事件保存在 `%APPDATA%/cyber-damp/`；`desktop-usage.json` 只保存路径哈希与打开时间，不保存文件内容。
- 尚无使用记录的文件以最后修改时间估算冷落程度，不能据此声称掌握了历史真实打开时间。

旧 MVP 文档中的“合成桌面 / 禁止真实文件访问 / 透明置顶”范围已被本次用户 UAT 的真实桌面与桌面图层要求取代。当前宿主为 `SHELLDLL_DefView`，普通应用窗口应完整遮挡桌面玩具。

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
