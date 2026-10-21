/** Query Explorer's desktop view through COM. Never selects/moves/opens items.
 * Slots follow Microsoft WinSDK ExDisp.h / ShObjIdl_core.h, not IDispatch order.
 * Call from a worker when integrated: Explorer RPC must not block the main UI.
 */
import koffi from 'koffi';

function guid(value: string): Buffer {
  const hex = value.replace(/-/g, '');
  const b = Buffer.from(hex, 'hex');
  b.subarray(0, 4).reverse(); b.subarray(4, 6).reverse(); b.subarray(6, 8).reverse();
  return b;
}
const ids = {
  windows: guid('9BA05972-F6A8-11CF-A442-00A0C90A8F39'),
  windowsInterface: guid('85CB6900-4D95-11CF-960C-0080C7F4EE85'),
  provider: guid('6D5140C1-7436-11CE-8034-00AA006009FA'),
  browser: guid('000214E2-0000-0000-C000-000000000046'),
  topBrowser: guid('4C96BE40-915C-11CF-99D3-00AA004AE837'),
  folderView: guid('1AF3A467-214F-4298-908E-06B03E0B39F9'),
  item: guid('43826D1E-E718-42EE-BC55-A1E261C37BFE'),
};
koffi.struct('CDShellViewPoint', { x: 'long', y: 'long' });
const proto = {
  query: koffi.proto('long __stdcall CDViewQuery(void *self, void *iid, _Out_ void **out)'),
  release: koffi.proto('uint32 __stdcall CDViewRelease(void *self)'),
  find: koffi.proto('long __stdcall CDViewFind(void *self, void *location, void *root, int cls, _Out_ long *hwnd, int options, _Out_ void **out)'),
  service: koffi.proto('long __stdcall CDViewService(void *self, void *service, void *iid, _Out_ void **out)'),
  active: koffi.proto('long __stdcall CDViewActive(void *self, _Out_ void **out)'),
  size: koffi.proto('long __stdcall CDViewSize(void *self, _Out_ uint32 *mode, _Out_ int *size)'),
  count: koffi.proto('long __stdcall CDViewCount(void *self, uint32 flags, _Out_ int *count)'),
  item: koffi.proto('long __stdcall CDViewItem(void *self, int index, void *iid, _Out_ void **out)'),
  pidl: koffi.proto('long __stdcall CDViewPidl(void *self, int index, _Out_ void **out)'),
  position: koffi.proto('long __stdcall CDViewPosition(void *self, void *pidl, _Out_ CDShellViewPoint *point)'),
  name: koffi.proto('long __stdcall CDViewName(void *self, uint32 kind, _Out_ void **out)'),
};
export interface ShellViewItem {
  index: number; displayName: string; parsingName: string; x: number; y: number;
}
export interface ShellViewSnapshot { iconSize: number; viewMode: number; items: ShellViewItem[] }

export function readShellView(): ShellViewSnapshot {
  if (process.platform !== 'win32') throw new Error('Windows Shell unavailable');
  const ole = koffi.load('ole32.dll');
  const init = ole.func('long CoInitializeEx(void *reserved, uint32 flags)');
  const uninit = ole.func('void CoUninitialize()');
  const create = ole.func('long CoCreateInstance(void *clsid, void *outer, uint32 context, void *iid, _Out_ void **out)');
  const free = ole.func('void CoTaskMemFree(void *memory)');
  const initialized = init(null, 2);
  const owned: unknown[] = [];
  const call = (object: unknown, slot: number, signature: ReturnType<typeof koffi.proto>, ...args: unknown[]): number => {
    const table = koffi.decode(object, 'void *');
    return Number(koffi.call(koffi.decode(table, slot * koffi.sizeof('void *'), 'void *'), signature, object, ...args));
  };
  const check = (hr: number, operation: string): void => { if (hr < 0) throw new Error(`${operation}: HRESULT 0x${(hr >>> 0).toString(16)}`); };
  const acquire = (operation: (out: unknown[]) => number): unknown => {
    const out: unknown[] = [null]; check(operation(out), 'Shell interface');
    if (!out[0]) throw new Error('Empty Shell interface'); owned.push(out[0]); return out[0];
  };
  const name = (object: unknown, kind: number): string => {
    const out: unknown[] = [null];
    try { check(call(object, 5, proto.name, kind, out), 'Shell name'); return out[0] ? koffi.decode.string16(out[0]) : ''; }
    finally { if (out[0]) free(out[0]); }
  };
  try {
    const windows = acquire(out => create(ids.windows, null, 5, ids.windowsInterface, out));
    const desktop = acquire(out => call(windows, 15, proto.find, Buffer.alloc(24), Buffer.alloc(24), 8, [0], 1, out));
    const provider = acquire(out => call(desktop, 0, proto.query, ids.provider, out));
    const browser = acquire(out => call(provider, 3, proto.service, ids.topBrowser, ids.browser, out));
    const view = acquire(out => call(browser, 15, proto.active, out));
    const folder = acquire(out => call(view, 0, proto.query, ids.folderView, out));
    const mode = [0], size = [0], count = [0];
    check(call(folder, 36, proto.size, mode, size), 'Shell icon size');
    check(call(folder, 7, proto.count, 2, count), 'Shell item count'); // SVGIO_ALLVIEW
    if (size[0] < 8 || size[0] > 1024 || count[0] < 0 || count[0] > 10000) throw new Error('Invalid Shell dimensions/count');
    const items: ShellViewItem[] = [];
    for (let index = 0; index < count[0]; index++) {
      const item = acquire(out => call(folder, 29, proto.item, index, ids.item, out));
      const pidl: unknown[] = [null];
      try {
        check(call(folder, 6, proto.pidl, index, pidl), 'Shell item PIDL');
        const point = { x: 0, y: 0 };
        check(call(folder, 11, proto.position, pidl[0], point), 'Shell item position');
        items.push({ index, displayName: name(item, 0), parsingName: name(item, 0x80028000), ...point });
      } finally { if (pidl[0]) free(pidl[0]); owned.pop(); call(item, 2, proto.release); }
    }
    const after = [0]; check(call(folder, 7, proto.count, 2, after), 'Shell count recheck');
    if (after[0] !== count[0]) throw new Error('Desktop changed during query; retry');
    return { iconSize: size[0], viewMode: mode[0], items };
  } finally {
    for (const object of owned.reverse()) call(object, 2, proto.release);
    if (initialized >= 0) uninit();
  }
}
