# 回南天 Cyber Damp

Windows 透明置顶桌面玩具：桌面文件按冷落度受潮发霉、拉绳晾晒、采蘑菇卖币升级。
技术栈：Electron 44 + Pixi.js 8 + Matter.js + TypeScript（零后端、零网络、零真实文件访问）。

## 快速开始

```bash
npm install
npm run typecheck      # 类型门（renderer + main）
npm run test:constants # 常量锚点断言
npm run test:world     # 领域层单测（18 项）
npm run build          # dist/renderer + dist/main
npm start              # 启动（读取 dist 产物）
```

## Windows 打包

```bash
npm run dist:win       # release/Cyber Damp 0.1.0.exe（portable 单文件）
```

> 未代码签名：首次运行可能出现 SmartScreen 提示，选择“更多信息 → 仍要运行”。
> 打包产物已包含 koffi（Win32 全屏检测原生依赖）。

## 数据与隐私

- 存档：`%APPDATA%\cyber-damp\save.json`（tmp+rename 原子写；写入前过 schema 校验）
- 本地埋点：`%APPDATA%\cyber-damp\events.jsonl`（匿名 uid，无网络、无原始堆栈）
- 虚拟桌面为纯合成数据，不读取/修改任何真实文件；无遥测上传

## 验收与 QA 工具

透明置顶窗无法被常规窗口截图工具捕获，项目内置 QA 脚本与**可捕获 QA 模式**（仅开发用）：

```bash
# QA 模式：不透明普通窗口（可被 CursorTouch/Windows-MCP 截屏与点击）；
# 关闭穿透与全屏自动隐藏；Demo 台额外出现「胆小菇测试」按钮（AC-30 现场验收）
CD_QA=1 ./node_modules/electron/dist/electron.exe .

# 常规模式 + 调试端口（真实渲染层输入 + 页面截图）
./node_modules/electron/dist/electron.exe --remote-debugging-port=9222 .

# 派发鼠标/键盘步骤（JSON：click/drag/circle/key/eval/shot/quit）
node scripts/qa-cdp.mjs '[{"type":"click","x":760,"y":760}]'

# 读取主窗口可见性 / 穿透态（AC-26/28 断言）
node scripts/qa-window.mjs

# 沿地面扫描定位并戳蜗牛（AC-29）
node scripts/qa-poke.mjs
```

## 功能范围

- P0 五模块全部实现（含 AC-28 全屏/锁屏暂停、新手引导、本地埋点）
- P1 已实现：304 钢杆、胆小菇缩头、绳断裂/滑落、吹风机/过热/喷雾、刮水器、Demo 控制台、
  80% 承重预警、音频类八音盒走调旋律、压缩包假碎片、字符滴落 + 小扫把清扫
- 明确不做：真实文件访问、网络、UGC、多人联机、macOS（见 SPEC §3）

## 已知边界

- 无自动更新（portable 目标）；未签名，首启可能触发 SmartScreen
- `npm audit` 剩余 moderate 项均在 electron-builder 构建链（dev 依赖，不进产物）
