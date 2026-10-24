# IPC 契约：window.damp（Phase 2 唯一联调依据）

> 本项目无 HTTP 服务端，故无 OpenAPI 面。本文件是前后端（main/preload ↔ renderer）的唯一契约，作用等同于 openapi.yaml：renderer 与 main 均按本表实现，变更必须走 Team Lead 同步并升版本号。
> 契约版本：v1.12（2026-10-24）。contextIsolation: true，sandbox: true；preload 经 contextBridge 暴露。

## v1.12 护理台视觉修复（Goal v9 修复轮）

`native:status` 的对象条目增加 `careMask?: string`（64×64 擦拭掩码 base64，行优先 1bit/格）。`native:careProgress` 载荷增加可选 `mask`，与 `progress` 一同持久化——重开还原同一批擦除洞。`native:careComplete`/`native:quickCare` 成功时由领域层清空掩码与进度。CSP 修订：产品页 `style-src 'self' 'unsafe-inline'`（file:// 页面的外部样式表需要 'self'）；脚本仍走 `default-src 'self'`。渲染层新增 `window.damp.native` 出口（v1.11 表中的 icon:applyState/restoreAll 保留）。

## v1.11 天气与原生图标引用（Goal v9 阶段1）

新增三组通道（Goal v9 R1/R3；均仅接受场景 webContents 发送方，载荷浅校验，非法即拒绝）：

| 通道 / API | 方向 | 载荷 / 返回 |
| --- | --- | --- |
| `weather:current` / `damp.weather.current(location, forceRefresh?)` | R→M | `WeatherLocation {cityId,label,latitude,longitude}` → `WeatherLookup {status:'ok'\|'stale'\|'unavailable', snapshot?, ageMs?, usableForEvents?, error?}`。Open-Meteo `current` 快照；缓存 30 分钟、超时 8s、首次重试 2 次（1s/3s）、>24h 只展示不驱动事件（R3） |
| `weather:searchCity` / `damp.weather.searchCity(query)` | R→M | `{query}` → `{ok:true,options:CityOption[]} \| {ok:false,error}`；Open-Meteo 地理编码，失败保留输入重试，不自动选点 |
| `icon:applyState` / `damp.icon.applyState(items)` | R→M | `items[{id,realPath,kind:'dir'\|'lnk',sourcePngBase64,eventId?}]` → 逐项 `{ok}`/`{ok:false,reason,retryable}`。仅文件夹与普通 .lnk；main 生成多尺寸 ICO 缓存并写引用，写前落盘恢复登记（R1） |
| `icon:restoreAll` / `damp.icon.restoreAll()` | R→M | → 逐项 `{outcome:'restored'\|'kept-user-value'\|'missing'\|'failed', detail?}`。恢复用户原值；引用已非我方时保留用户值 |

`icon:applyState` 的 `sourcePngBase64` 输入不含桌面背景/文字/快捷方式箭头；箭头由 Explorer 原生绘制，不重复叠加。启动时 main 对未结算图标写入执行核对（补结算/丢弃/保留用户值），不新增 IPC。胶囊窗口位置记忆存 `userData`（测试可用 `CD_CAPSULE_STATE_DIR` 隔离），不经 renderer 通道。

## v1.10 启动阶段反馈

`SceneStatus`新增可选`startupStage: StartupStage`，共享枚举`launch/graphics/desktop/materials/takeover`。`management:command`沿用现有权限出口，新增`startup-stage {value:StartupStage}`，仅接受场景webContents及枚举值，ready后迟到消息不改变阶段或重新开窗。现有`management:status/get`向轻量启动反馈页传递真实阶段；preload和renderer声明沿用共享SceneStatus，无新通用执行权限。

启动反馈窗使用独立轻量文档、复用游戏材质，ready-to-show后showInactive，不置顶、不抢焦点、不占任务栏；取消沿既有quit路径恢复桌面。桌面安全就绪或出现错误时自动销毁，不等待用户确认，不添加最小展示时长或假百分比。窗口页面载入成功不等于场景接管完成。

## v1.9 桌面工具退出与自动启动

沿用`management:command`：`tool-mode {value:'on'|'off'}`仅场景发送方可请求；主进程利用既有原生桌面焦点探针，在工具开启、桌面前台、非隐藏/暂停时注册Electron Escape快捷键，其余情况释放。按下后通过同一通道发送`cancel-tool`，场景取消手势并选回hand（浏览）。注册冲突时取消工具模式，避免进入无法Esc退出的状态；未知发送方和值被拒绝。无需新增preload权限出口；共享ManagementCommand仍为既有action字符串契约。

取消启动管理窗确认，正式场景就绪后自动安全接管并播放3–5秒回放。恢复监护提前准备不等于允许提前隐藏图标，原安全和DPI确认要求仍有效。

## v1.8 管理窗外壳

沿用`management:command`，增加`window-close`与`window-minimize`两个动作，仅管理窗webContents可调用，场景或未知发送方被拒绝。关闭调用原窗口close路径，只隐藏管理窗，不改变场景paused/hidden状态；最小化使用Electron原生minimize，托盘/快捷键再次打开会restore并聚焦。无需新增preload出口或共享字段，ManagementCommand仍为既有action字符串载荷；IPC注册继续位于management-window.ts，而非重复注册到register-handlers.ts。

管理窗使用Electron原生frame:false/transparent与CSS app-region拖动；标题按钮明确no-drag。透明窗口按官方限制禁用原生边缘缩放/最大化，启动按当前主屏工作区适配固定面板尺寸；保留普通窗口层级，不置顶、不连接WorkerW、不授予任意窗口控制权限。

## v1.7 复用设置控制

`management:snapshot`增加可选`preferences: ManagementPreferences`：`sfx:boolean`、`veil:''|'low'|'high'`、`microphoneEnabled:boolean`、`microphoneState:'disabled'|'requesting'|'calibrating'|'ready'|'denied'|'unavailable'|'error'`。旧快照缺省时新控件禁用，不显示假成功。状态来自既有SettingsPanel及MicrophoneWind getter，不新建音效/媒体实现。

`management:command`增加`sfx`/`microphone`的`value:'on'|'off'`与`veil`的三个有效字符串。main仅接受本场景或管理窗发送方并校验值，再沿现有通道转发。preload不增权限出口，共享类型、renderer声明及IPC沿用同一管理契约。返回`ok`只代表转发，实际反馈与媒体状态由场景快照给出。

麦克风每次启动默认关闭，读取快照不请求媒体权限。开启由管理页用户动作触发，复用原有本机音量分析；关闭可取消未完成请求，迟到结果不覆盖新状态。设备断开/拒绝/不可用按真实状态显示。设置按原实现仅本次会话有效，不持久化麦克风开启，不新增录音、上传或自动权限授予。独立预览强制使用夹具，即使存在preload也不连接真实场景。

## v1.6 多屏画布与刷新

- `desktop:scan`接受可选共享`DesktopViewportRequest { scaleFactor, width?, height? }`。正式场景提供真实CSS宽高和devicePixelRatio，main限制调用方为场景窗口，校验缩放范围和CSS/物理窗口一致性；扫描期间显示配置变化则失败并保留Explorer。旧无参数调用只保留诊断兼容。
- 原生窗口覆盖所有显示器工作区的物理并集，包含负坐标；复用Win32窗口定位。Shell物理图标框/标签和光标统一换算到该窗口画布CSS像素，不混用各显示器的全局DIP坐标。`DesktopGeometry.labelScale`保留原显示器相对画布的文字比例。`window:getWorkArea`返回主屏工作区在画布内的CSS矩形，只用于把工具入口留在可见主屏，不能再次平移已投影图标；main内部初始窗口bounds才使用Electron DIP并集。
- `system:displayChanged`使用共享`DisplayChangedNotice { width, height, requestId? }`。配置变化先暂停宿主监护、恢复Explorer并隐藏场景，renderer取消手势，只重建视图并复用已解码图标、领域状态和护理记录；成功后复用`app:desktopReady`重新接入。条目并发变化或刷新失败时保持原生桌面，并显示`SceneStatus.displayError`，禁止强行显示旧布局。
- 挂载后的DPI若改变，main发送带`requestId`的刷新请求，在隐藏原图标前等待`app:viewportReady { requestId, ok }`。该接口只接受场景窗口、当前请求编号及与实际缩放一致的已验证扫描，八秒超时恢复原生桌面。此路径不递归等待`app:desktopReady`。无请求号的普通配置刷新仍使用原就绪路径。
- `management:command display-error`仅由场景报告；消息限300字，作为管理窗失败反馈，不加载路径、不授予文件写入能力。配置变化不修改Explorer位置或用户文件。

## v1.5 管理反馈补充

沿用现有preload出口、`management:status`、`management:snapshot`及management-window中的转发注册，不增加命令权限。共享`SceneStatus`增加可选`shortcutError`，让启动注册冲突显示在设置页；同一组合先前失败时允许重试，注册失败不注销旧组合。`ManagementSnapshot`增加可选`feedback: { sequence, ok, message }`，由场景动作完成后发布，管理窗按序显示护理/购买/采摘结果；没有该字段的旧快照照常显示。前端不得把主进程已转发命令的`ok`当作领域动作成功。

`management:command`的`navigate`动作只接受`value: 'care' | 'shop' | 'settings'`，在同一管理窗内导航，并通过`SceneStatus.page`同步当前页面。它不加载任意URL，不创建另一套管理窗。桌面商城/设置入口直接打开对应页；原`management:open`和托盘入口继续可用。

## v1.4 桌面清选补充

`window:cursor` 使用共享 `DesktopCursor` 类型，新增只读 `leftDown` 和 `desktopActive`。主进程沿用约30Hz光标探针读取左键与桌面焦点；渲染层仅在桌面空白按下边沿清除替身选中，不生成 pointerdown/up，不推进工具手势，也不拦截空白输入。其他应用中的点击不触发清选。IPC 注册中不新增可调用权限。

`management:snapshot` 沿用共享 `ManagementSnapshot`，新增可选只读 `equipped: { rope, clip }`，供同一管理窗标识使用中物品。旧快照缺省时只显示拥有状态。preload 管理出口及主进程现有转发不新增命令权限；购买、采摘仍回到原游戏动作，吸湿盒仍复用现有放置回调。

## v1.3 原生输入补充

| 通道 / API | 方向 | 载荷 / 返回 |
| --- | --- | --- |
| `window:cursor` / `window.damp.window.onCursor(cb)` | main → renderer | `DesktopCursor`：`{ x, y, leftDown, desktopActive }`，相对桌面画布的CSS坐标，约30Hz；返回卸载函数 |
| `window:getInputSettings` / `window.damp.window.getInputSettings()` | renderer → main | `{ doubleClickMs }`，Windows `GetDoubleClickTime` 结果 |
| `desktop:scan` | renderer → main | 用户与公共桌面条目；新增可选 `lastOpenedAt` 本地使用时间，原 `mtime` 保留真实值 |
| `desktop:open` | renderer → main | 成功后更新路径哈希对应的本地使用时间；只允许两处桌面根目录内路径及回收站 |
| `app:quit` | renderer → main | 先还原原生桌面，再异步等待存档 flush；后台监护停止重新挂载 |

穿透仍仅在命中态变化时调用 `setIgnoreMouseEvents`。原生光标探针只补充 hover，不伪造 down/up，也不直接推进拖拽。

## 1. 通道总表

| 通道 | 方向 | 类型 | 载荷 | 返回 |
| --- | --- | --- | --- | --- |
| `window:setIgnoreMouseEvents` | R→M | invoke | `{ ignore: boolean, forward?: boolean }` | `void` |
| `window:getWorkArea` | R→M | invoke | — | `{ x:number, y:number, width:number, height:number }` |
| `save:load` | R→M | invoke | — | `SaveData \| null` |
| `save:write` | R→M | invoke | `SaveData` | `{ ok: boolean }` |
| `system:cpu` | M→R | event | `number`（0..1 占用率，每 2s） | — |
| `system:displayChanged` | M→R | event | `{ width:number, height:number }` | — |
| `app:version` | R→M | invoke | — | `string` |
| `app:quit` | R→M | invoke | — | `void`（main 先广播 `app:beforeQuit` 给渲染层 flush） |
| `app:beforeQuit` | M→R | event | — | 渲染层 500ms 内完成 `save:write` |

## 2. 类型（TS，renderer 侧消费）

新增只读`desktop:wallpaper`（R→M invoke，无参数）：返回`DesktopWallpaper | null`，权威类型为`src/shared/types/wallpaper.ts`。只读取Windows IDesktopWallpaper选定的当前主屏壁纸、布局/背景色/显示区域并解码该图像；不接受任意路径、不截取其他窗口、不修改系统壁纸、不上传或保存壁纸。供生卖见手青期间的桌面水波使用，平时底图隐藏。字符串使用koffi.decode.string16读取，COM分配的字符串与接口均释放。

```ts
// shared/types/save.ts（权威定义处）
export interface SaveData {
  schemaVersion: 1;
  savedAt: number;
  player: { coins: number; owned: string[]; equipped: { rope: string; clip: string } };
  weather: { city: string; migratedOn: string }; // migratedOn: 'YYYY-MM-DD'
  files: Array<{ id: string; humidity: number; mold: number; char: number; state: 'idle'|'hung'|'drying'|'burnt'; mushroom: null | { species: string; growth: number } }>;
  ropes: Array<{ id: string; ax: number; ay: number; bx: number; by: number; tier: string; fileIds: string[] }>;
  stats: { harvested: number; earned: number; playedMs: number };
}
```

## 3. 使用纪律

1. `window:setIgnoreMouseEvents` 仅在命中态跳转时调用（input/click-through.ts），禁止每帧调用；常态保持 `forward: true`。
2. `save:write` 由渲染层防抖触发（停止操作 5s 后）或 `app:beforeQuit` 时同步 flush；main 侧 tmp+rename 原子落盘 `userData/save.json`。
3. `save:load` 返回 null（不存在/损坏/版本不符）时渲染层必须走"新开局"分支，禁止抛错中断启动。
4. `system:cpu` 仅用于环境湿度的次要输入，渲染层失联（hidden）时 main 停止发送。
5. 所有 invoke 的入参在 preload 出口做一次结构校验（浅校验），非法载荷直接丢弃并 console.warn。

## 4. preload 暴露形态（实现样板）

```ts
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('damp', {
  window: {
    setIgnoreMouseEvents: (ignore: boolean, forward = true) =>
      ipcRenderer.invoke('window:setIgnoreMouseEvents', { ignore, forward }),
    getWorkArea: () => ipcRenderer.invoke('window:getWorkArea'),
  },
  save: {
    load: () => ipcRenderer.invoke('save:load'),
    write: (data: unknown) => ipcRenderer.invoke('save:write', data),
  },
  system: {
    onCpu: (cb: (usage: number) => void) => {
      const h = (_: unknown, usage: number) => cb(usage);
      ipcRenderer.on('system:cpu', h);
      return () => ipcRenderer.off('system:cpu', h);
    },
    onDisplayChanged: (cb: (size: { width: number; height: number }) => void) => {
      const h = (_: unknown, size: { width: number; height: number }) => cb(size);
      ipcRenderer.on('system:displayChanged', h);
      return () => ipcRenderer.off('system:displayChanged', h);
    },
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    quit: () => ipcRenderer.invoke('app:quit'),
    onBeforeQuit: (cb: () => void) => {
      const h = () => cb();
      ipcRenderer.on('app:beforeQuit', h);
      return () => ipcRenderer.off('app:beforeQuit', h);
    },
  },
});
```
