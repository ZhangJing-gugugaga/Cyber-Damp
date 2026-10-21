# IPC 契约：window.damp（Phase 2 唯一联调依据）

> 本项目无 HTTP 服务端，故无 OpenAPI 面。本文件是前后端（main/preload ↔ renderer）的唯一契约，作用等同于 openapi.yaml：renderer 与 main 均按本表实现，变更必须走 Team Lead 同步并升版本号。
> 契约版本：v1.6（2026-10-21）。contextIsolation: true，sandbox: true；preload 经 contextBridge 暴露。

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
