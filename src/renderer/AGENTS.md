# renderer · DOX 子域指南

## Purpose

负责桌面玩具的可见效果、输入、界面与渲染装配。先读[项目根指南](../../AGENTS.md)。

## Ownership

- [app/](app) 组装运行时和控制器；[view/](view) 表达画面；[input/](input) 处理命中及手势；[ui/](ui) 与 [management.ts](management.ts) 管理界面入口。
- [app/world-runtime.ts](app/world-runtime.ts) 是现有领域装配点；纯状态算法应落在 `src/world/`，新增代码遵循实际模块边界。

## Local Contracts

- 渲染与输入使用 preload 提供的类型化接口，不直接引入文件系统或 Win32 权限。涉及 preload/IPC 的修改同时遵循根指南。
- 真实图标大小和位置来自原生信息；不以整体放大、网格重排或同步摆动替代桌面融合。视觉方向以[美术要求](../../design-system/ART-DIRECTION.md)为依据。
- 发霉、生长、呼吸的局部形变不能简单用整张图等比缩放冒充；原型认可不代表生产集成已验收。
- 输入命中与点击穿透要与可见交互物一致；空白桌面、双击打开、拖动和普通窗口遮挡分别验证，不因测试窗口内成功就声明正式桌面通过。
- 默认浏览模式处理选择/打开/替身拖动；选定工具先处理工具动作，不执行图标选择或打开。Esc取消手势并返回浏览，工具切换、失焦和暂停取消旧手势。桌面子窗键盘焦点不可靠，Esc还须经过主进程桌面限定快捷键实测。
- 图标材质、焦化、拧干、摆动不污染文件名；白色名称独立于材质变形层。启动无手动播放按钮，安全接管后自动播放原3–5秒回放。
- startup.html是独立轻量反馈页，不导入Pixi/商城大模块；startupStage来自真实启动阶段，无虚构百分比。桌面扫描、存档与图集准备可并行，但缺失资源和安全接管检查不能跳过。
- 生产指针与悬停通过input/hit-tests.ts的visibleMushroomAt共用可见几何；普通/特殊幼菇不增加成熟命中门槛，特殊工具约束由动作层执行。
- 桌面采摘胆小菇/毁灭菇须拥有并装备铲子，剪刀只采普通菇；管理页采摘沿用已拥有铲子的动作约束。装备铲子时胆小菇探出，Esc返回浏览后恢复避让。动画换帧复用根部网格，命中读取当前帧透明度。
- 启动回放、日常演进、暂停和隐藏分别处理；日常效果的速度不使用 3–5 秒回放时长作为周期。
- `desktop-bridge`提交真实画布CSS尺寸和devicePixelRatio；`display-refresh`只重建视图、复用领域状态及解码纹理。图标位置/尺寸已投影，不再减主屏原点；标签尊重geometry.labelScale。带requestId的挂载缩放刷新只回viewportReady，避免递归等待desktopReady。

## Work Guidance

- 涉及演进或经济等逻辑时，读取 [world 指南](../world/AGENTS.md)，不要在画面层复制另一套规则。
- 新增纹理、图集或生成资产时维护现有来源记录与构建资源路径；源码可见与打包资源齐全需要分别验证。
- 管理设置复用SettingsPanel方法、Sfx与MicrophoneWind，不另建媒体通路。preferences快照为实际状态；麦克风读取/预览默认无权限请求，仅显式开启，关闭与迟到结果遵守原控制器取消逻辑。
- 视觉修改检查真实尺寸与必要的放大对照；避免用调试加速画面代表正式运行节奏。

## Verification

- `npm run typecheck` 与相关逻辑检查；需要可见运行效果时 `npm run build`。
- [scripts/qa-cdp.mjs](../../scripts/qa-cdp.mjs) 和 [scripts/qa-window.mjs](../../scripts/qa-window.mjs) 可辅助诊断，但不能替代正式原生输入和截图。
- 根据[当前原生/护理验收](../../docs/CARE-DESKTOP-UAT.md)与[项目 UAT 技能](../../.agents/skills/cyber-damp-uat/SKILL.md)记录观察结果，清楚区分预览、源码和便携包。

## Child DOX Index

<!-- dox-children:start -->
暂无独立子域指南；本文件覆盖本目录下的全部子目录。
<!-- dox-children:end -->
