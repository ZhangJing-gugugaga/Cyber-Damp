# IPC 契约：window.damp

契约 v1.14，2026-10-25：用户明确要求彻底退役旧版后，只保留原生图标护理与胶囊接口。contextIsolation 与 sandbox 均保持开启。历史接口已保存在[远端存档提交](https://github.com/ZhangJing-gugugaga/Cyber-Damp/tree/8442b3388bf4896b881ec48261d1bac45a126f63)，不在当前文件树保留并行接口。

所有方法经 contextBridge 暴露；定义对齐 `src/preload/index.ts`、`src/renderer/types/damp.d.ts`、`src/shared/types/` 与 `src/main/ipc/`。

| 出口 | 通道 | 载荷/结果 |
|---|---|---|
| management.get | management:get | 返回 `{status}`，含 paused/shortcut/shortcutError?/capsuleHidden? |
| management.open | management:open | 显示护理台 |
| management.command | management:command | `{action:'window-close'|'window-minimize'|'shortcut',value?:string}`；窗口控制限护理台发送方 |
| management.onStatus | management:status | 订阅窗口状态，返回取消函数 |
| window.setIgnoreMouseEvents | window:setIgnoreMouseEvents | `{ignore:boolean,forward:boolean}`；只作用于合法发送方自己的窗口 |
| weather.current | weather:current | WeatherLocation 加 forceRefresh；返回 WeatherLookup；校验坐标与发送方 |
| weather.searchCity | weather:searchCity | `{query}`；返回 `{ok,options}` 或 `{ok:false,error}`；保留中文城市补后缀与排序 |
| native.status | native:status | NativeStatusSnapshot，当前对象/天气/暂停/收藏/余额/拥有/引导等投影 |
| native.setLocation | native:setLocation | `{cityId,label,latitude,longitude}`；触发已有事件协调器，不增加日额度 |
| native.setPaused | native:setPaused | `{paused}`；写原生存档并同步托盘 |
| native.careProgress | native:careProgress | `{objectId,progress,mask?}`；部分进度与掩码 |
| native.careComplete | native:careComplete | `{objectId}`；完整护理、防霉、保留菇 |
| native.quickCare | native:quickCare | `{objectId}`；与完整护理同规则，不自动采菇 |
| native.harvest | native:harvest | `{objectId}`；独立采摘、收藏与结算 |
| native.buy | native:buy | `{itemId}`；扣币与拥有原子保存 |
| native.onboardingDone | native:onboarding | 一次性完成/跳过奖励 |
| native.restoreAndPause | native:restoreAndPause | 还原引用并暂停，保留进度 |
| native.resume | native:resume | 显式继续并回显 |
| native.setAutostart | native:setAutostart | `{on}`；回读实际系统状态 |
| native.getAutostart | native:getAutostart | `{on}` |
| app.version | app:version | 版本字符串 |
| app.quit | app:quit | 合法发送方请求退出，经主进程恢复引用 |
| app.track | app:track | 本地事件名和原始类型属性，不增加网络上报 |

原生修改接口限护理台 WebContents；天气与胶囊穿透接口认可已登记的当前窗口。所有 payload 保持现有类型/范围校验。不得通过旧整档写通道覆盖主进程事件账本。

已移除：desktop.scan/open/wallpaper、save.load/write、icon.applyState/restoreAll、system.onCpu/onDisplayChanged、场景快照发布/命令转发、window.onCursor/getWorkArea/getInputSettings、app.desktopReady/viewportReady/onBeforeQuit。没有兼容空实现，也没有由 CD_LEGACY/CD_QA/CD_NO_ATTACH 启动旧场景的后门。

v0.2 增量：`native.status` 的对象视图已带可选 `objectCategory`（扫描时由 `.lnk` 目标元数据判定）。其余 v0.2 通道见[玩法契约草案 v1.15-draft](gameplay-v2.md)，尚未注册，不属于本表。

默认长沙与离线默认天气为本轮之前的工作区增量，`defaulted` 必须由 UI 标注。本文记录接口，不证明完整护理手感或原生 UAT 已通过。
