/** Explorer rectangle queries only. Writes solely an allocated query buffer. */
import koffi from 'koffi';

export interface ShellRect { x: number; y: number; width: number; height: number }
export interface ShellRects { dpi: number; origin: { x: number; y: number }; items: Array<{ icon: ShellRect; label: ShellRect }> }
const callbackType = koffi.proto('bool __stdcall CDLayoutEnum(void *hwnd, intptr_t data)');
koffi.struct('CDLayoutPoint', { x: 'long', y: 'long' });

export function readShellRects(): ShellRects {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Windows x64 required');
  const u = koffi.load('user32.dll'), k = koffi.load('kernel32.dll');
  const enumerate = u.func('bool EnumWindows(CDLayoutEnum *callback, intptr_t data)');
  const find = u.func('void *FindWindowExW(void *parent, void *after, str16 cls, str16 title)');
  const pidOf = u.func('uint32 GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)');
  const send = u.func('intptr_t SendMessageTimeoutW(void *hwnd, uint32 msg, uintptr_t wp, intptr_t lp, uint32 flags, uint32 timeout, _Out_ uintptr_t *result)');
  const dpiContext = u.func('void *SetThreadDpiAwarenessContext(intptr_t context)');
  const dpiFor = u.func('uint32 GetDpiForWindow(void *hwnd)');
  const toScreen = u.func('bool ClientToScreen(void *hwnd, _Inout_ CDLayoutPoint *point)');
  const open = k.func('void *OpenProcess(uint32 access, bool inherit, uint32 pid)');
  const alloc = k.func('void *VirtualAllocEx(void *process, void *address, size_t size, uint32 type, uint32 protection)');
  const free = k.func('bool VirtualFreeEx(void *process, void *address, size_t size, uint32 type)');
  const write = k.func('bool WriteProcessMemory(void *process, void *address, void *buffer, size_t size, _Out_ size_t *count)');
  const read = k.func('bool ReadProcessMemory(void *process, void *address, _Out_ uint8 *buffer, size_t size, _Out_ size_t *count)');
  const close = k.func('bool CloseHandle(void *handle)');
  let list: unknown = null;
  const cb = koffi.register((hwnd: unknown) => {
    const def = find(hwnd, null, 'SHELLDLL_DefView', null);
    if (def) list = find(def, null, 'SysListView32', null);
    return !list;
  }, koffi.pointer(callbackType));
  try { enumerate(cb, 0); } finally { koffi.unregister(cb); }
  if (!list) throw new Error('Explorer desktop list unavailable');
  const query = (msg: number, index = 0, pointer = 0n): number => {
    const result = [0];
    if (!send(list, msg, index, pointer, 2, 1000, result)) throw new Error('Explorer query timed out');
    return Number(result[0]);
  };
  const pid = [0]; pidOf(list, pid);
  const processHandle = open(0x38, false, pid[0]);
  if (!processHandle) throw new Error('Explorer buffer unavailable');
  let remote: unknown = null;
  const previous = dpiContext(-4);
  try {
    remote = alloc(processHandle, null, 16, 0x3000, 4);
    if (!remote) throw new Error('Explorer buffer allocation failed');
    const address = BigInt(koffi.address(remote));
    const origin = { x: 0, y: 0 };
    if (!toScreen(list, origin)) throw new Error('Explorer origin unavailable');
    const count = query(0x1004);
    if (count < 0 || count > 10000) throw new Error('Invalid Explorer count');
    const rect = (index: number, part: number): ShellRect => {
      const b = Buffer.alloc(16), n = [0]; b.writeInt32LE(part, 0);
      if (!write(processHandle, remote, b, 16, n) || Number(n[0]) !== 16) throw new Error('Explorer buffer write failed');
      if (!query(0x100e, index, address)) throw new Error('Explorer rectangle unavailable');
      if (!read(processHandle, remote, b, 16, n) || Number(n[0]) !== 16) throw new Error('Explorer buffer read failed');
      return { x: b.readInt32LE(0) + origin.x, y: b.readInt32LE(4) + origin.y,
        width: b.readInt32LE(8) - b.readInt32LE(0), height: b.readInt32LE(12) - b.readInt32LE(4) };
    };
    const items = Array.from({ length: count }, (_, index) => ({ icon: rect(index, 1), label: rect(index, 2) }));
    if (query(0x1004) !== count) throw new Error('Explorer changed during capture');
    return { dpi: dpiFor(list), origin, items };
  } finally {
    if (remote) free(processHandle, remote, 0, 0x8000);
    close(processHandle);
    if (previous) dpiContext(BigInt(koffi.address(previous)));
  }
}
