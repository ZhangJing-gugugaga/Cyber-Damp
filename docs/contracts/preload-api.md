# IPC 契约：window.damp

契约 v1.15，2026-10-26（v1.14 + v0.2 玩法通道与 wallpaper 组）。v1.14，2026-10-25：用户明确要求彻底退役旧版后，只保留原生图标护理与胶囊接口。contextIsolation 与 sandbox 均保持开启。历史接口已保存在[远端存档提交](https://github.com/ZhangJing-gugugaga/Cyber-Damp/tree/8442b3388bf4896b881ec48261d1bac45a126f63)，不在当前文件树保留并行接口。

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
| native.careProgressV2 | native:careProgressV2 | `CareProgressV2Payload`；会话经 `validateCareSession` 校验，损伤不一致的旧回执拒绝；落盘前镜像旧字段 |
| native.careCompleteV2 | native:careCompleteV2 | `{objectId}` → `CareCompleteV2Result`；精细判定在领域层，奖励只发一次 |
| native.harvestV2 | native:harvestV2 | `{objectId,cutQuality}` → `HarvestV2Result`；cutQuality 须为有限数，夹取 0..1 |
| native.plantSpore | native:plantSpore | `{objectId,species}`；仅新品种、仅当前桌面上的对象；失败不扣孢子 |
| native.cancelPlant | native:cancelPlant | `{objectId}`；只取消 pending，退回孢子 |
| native.setOverlayVariant | native:setOverlayVariant | `{variant:'A'\|'B'}`；只回显已有外观 |
| wallpaper.status | wallpaper:status | `WallpaperView`；只读 |
| wallpaper.setEnabled | wallpaper:setEnabled | `{on}`；Win32 接入前 `on:true` 一律 `ok:false` |
| wallpaper.wipe | wallpaper:wipe | `{fogMask,progress}`；Win32 接入前一律 `ok:false` |
| app.version | app:version | 版本字符串 |
| app.quit | app:quit | 合法发送方请求退出，经主进程恢复引用 |
| app.track | app:track | 本地事件名和原始类型属性，不增加网络上报 |

原生修改接口限护理台 WebContents；天气与胶囊穿透接口认可已登记的当前窗口。所有 payload 保持现有类型/范围校验。不得通过旧整档写通道覆盖主进程事件账本。

已移除：desktop.scan/open/wallpaper、save.load/write、icon.applyState/restoreAll、system.onCpu/onDisplayChanged、场景快照发布/命令转发、window.onCursor/getWorkArea/getInputSettings、app.desktopReady/viewportReady/onBeforeQuit。没有兼容空实现，也没有由 CD_LEGACY/CD_QA/CD_NO_ATTACH 启动旧场景的后门。

v0.2 增量：`native.status` 追加 `NativeStatusV4Fields`（forecast/alert/spores/planted/dailyLimit/dailyUsed/overlayVariant/fineCareCount），对象视图追加 `NativeObjectViewV4Fields`（objectCategory/careSession/plantedSpecies/glossUntil/neighbors）。规则与接线限制见[玩法契约 v1.15](gameplay-v2.md)。

默认长沙与离线默认天气为本轮之前的工作区增量，`defaulted` 必须由 UI 标注。本文记录接口，不证明完整护理手感或原生 UAT 已通过。
