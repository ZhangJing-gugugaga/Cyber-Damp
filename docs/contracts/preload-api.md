# IPC 契约：window.damp（Phase 2 唯一联调依据）

> 本项目无 HTTP 服务端，故无 OpenAPI 面。本文件是前后端（main/preload ↔ renderer）的唯一契约，作用等同于 openapi.yaml：renderer 与 main 均按本表实现，变更必须走 Team Lead 同步并升版本号。
> 契约版本：v1.3（2026-10-18）。contextIsolation: true，sandbox: true；preload 经 contextBridge 暴露。

## v1.3 原生输入补充

| 通道 / API | 方向 | 载荷 / 返回 |
| --- | --- | --- |
| `window:cursor` / `window.damp.window.onCursor(cb)` | main → renderer | `{ x, y }`，相对主屏工作区的 DIP 坐标，约30Hz；返回卸载函数 |
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
