# 复用依据集中记录

按仓库最高开发原则（能找到开源实现的绝对不自己写）逐能力记录。第三方许可与来源必须保留在此；新变更先查本表与仓库既有模块，再考虑外部实现。

## 2026-10-25 修复轮（Goal 阶段一/二）

| 能力 | 当前实现 | 开源来源及版本/提交 | 采用方式 | 剩余缺口 | 验证结果 |
|---|---|---|---|---|---|
| 省市级联城市数据 | care.ts 级联选择器 | `china-division` npm（MIT，modood/Administrative-divisions-of-China） | 直接消费 provinces/cities JSON（既有） | 无 | 既有；本轮实窗确认 31 省份加载 |
| 多尺寸 ICO 封装 | icon/ico-builder.ts | `png-to-ico` 2.1.8（MIT） | 既有复用，未改动 | 无 | 既有 |
| Shell 图标像素提取 | desktop/shell-icons(-worker).ts + native/win32-icon-pixels.ts | 仓库既有（koffi+SHGetFileInfo 管线） | 仅改调用策略：8个/块并行、单块15s超时、失败按null回退；提取本体零改动 | 卡死对象所在的同块邻居也拿null（由getFileIcon回退/跳过） | 分块契约测试4项+真实桌面44项0.6–0.9s |
| 胶囊留白穿透与点击/拖动 | native/win32-capsule-hittest.ts + window/capsule-window.ts | Win32 官方 API（WM_NCHITTEST/HTTRANSPARENT/HTCAPTION，子类化经既有依赖 koffi 3.3.3）；Electron 官方 `hookWindowMessage`。Electron 官方 `setIgnoreMouseEvents(forward)` 方案实测失效（focusable:false 透明窗零事件），社区无现成替代包 | 平台原生机制的最小接线，未引入新依赖 | 原生输入验收（本会话环境拦截注入） | 结构装配无异常；NOT TESTED（环境） |
| 擦拭掩码编解码 | shared/care-mask.ts | Web 标准 `btoa`/`atob`（渲染层与 Node≥16 全局）；位打包为教科书级位运算，无合适第三方库（引入即过度） | 自写15行纯函数+兼容旧64字节解码 | 旧存档顶部8行以外记录已永久丢失（如实声明） | 往返回归5项（含逐字节位序、底部整行、旧格式、非法输入） |
| 跨日/唤醒触发 | desktop/resident-watch.ts | Electron 官方 `powerMonitor`；日期键/去重复用仓库纯领域层 `localDateKey` 与既有协调器 `runNativeEventCycle` | 60s 日期键比较+resume 事件接到同一协调器；不建第二套调度 | 真实跨日/睡眠唤醒实机 | 注入时钟探针（同日不触发、跨日恰一次）+ 装配测试 |
| 原始基准像素缓存 | native-event-scheduler.ts 内 base-*.png | 仓库既有 `composeStateIconPng` + `icon-cache` 目录惯例（内容寻址落盘） | 首次合成前落盘基准，全部合成路径统一取基准 | 无 | 探针：崩溃不恢复+重扫描回显 ICO 字节一致 |
| 损伤族选择统一 | world/native-events.ts `pickDailyFamily` | 仓库既有纯函数（原两处重复实现合并为一） | 调度器与预热共用同一实现 | 无 | 领域+调度测试与真机探针换族用例 |
| desktop.ini 二次写入 | desktop/icon-mutate.ts | 仓库既有 `setFileAttributes`（Win32 SetFileAttributesW） | 覆写前归一化属性（与恢复路径同一纪律） | 无 | 探针 EPERM→16/16 |
| 可操作练习样片 | care.ts 练习区块＋care.html/care.css | 复用 `shared/material/effects`（与桌面 ICO 同一材质）、care-assets-v1 素材、护理台画布手势模式与 overlay/panel 样式；无新依赖 | 纯渲染层组件：PointerEvent 手势、≥90% 自动收尾、采摘移除菇；不写存档不产币 | 视觉初稿待 huashu-design（本环境未暴露） | 真实应用流程：擦净/采摘/奖励只发一次/真实对象零变化/购买 24→16 币全实测 |

## 技能可用性（2026-10-25）

本会话环境未暴露 ECC intent-driven-development / product-capability / search-first / click-path-audit / verification-loop 与 huashu-design 技能（含 Skillshare 入口未提供）；已按 Goal 内嵌的范围/复用/路径审计/验收清单执行等效流程，设计初稿（阶段三）保留阻塞，不自行代替用户选择。
