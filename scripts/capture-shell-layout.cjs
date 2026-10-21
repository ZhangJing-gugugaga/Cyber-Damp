/* Read-only Explorer layout evidence. No rearrangement, selection, or file reads.
 * Only our allocated IPC buffer is written in Explorer for LVM query messages.
 * Windows x64 only; run with node, output stays local. */
const koffi = require('koffi');
const fs = require('node:fs');
const path = require('node:path');
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Windows x64 required');
const u = koffi.load('user32.dll'), k = koffi.load('kernel32.dll');
const enumProc = koffi.proto('bool __stdcall LayoutEnumProc(void *hwnd, intptr_t data)');
const enumerate = u.func('bool EnumWindows(LayoutEnumProc *callback, intptr_t data)');
const find = u.func('void *FindWindowExW(void *parent, void *after, str16 cls, str16 title)');
const pidOf = u.func('uint32 GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)');
const send = u.func('intptr_t SendMessageTimeoutW(void *hwnd, uint32 msg, uintptr_t wp, intptr_t lp, uint32 flags, uint32 timeout, _Out_ uintptr_t *result)');
const dpi = u.func('void *SetThreadDpiAwarenessContext(intptr_t context)');
const getDpi = u.func('uint32 GetDpiForWindow(void *hwnd)');
koffi.struct('LayoutPoint', { x:'long', y:'long' });
const toScreen = u.func('bool ClientToScreen(void *hwnd, _Inout_ LayoutPoint *point)');
const open = k.func('void *OpenProcess(uint32 access, bool inherit, uint32 pid)');
const allocate = k.func('void *VirtualAllocEx(void *process, void *address, size_t size, uint32 type, uint32 protection)');
const free = k.func('bool VirtualFreeEx(void *process, void *address, size_t size, uint32 type)');
const write = k.func('bool WriteProcessMemory(void *process, void *address, void *buffer, size_t size, _Out_ size_t *written)');
const read = k.func('bool ReadProcessMemory(void *process, void *address, _Out_ uint8 *buffer, size_t size, _Out_ size_t *count)');
const close = k.func('bool CloseHandle(void *handle)');
let list = null;
const cb = koffi.register(hwnd => {
  const def = find(hwnd, null, 'SHELLDLL_DefView', null);
  if (def) list = find(def, null, 'SysListView32', null);
  return !list;
}, koffi.pointer(enumProc));
try { enumerate(cb, 0); } finally { koffi.unregister(cb); }
if (!list) throw Error('Explorer desktop list view unavailable; no fallback layout');
const query = (msg, index = 0, pointer = 0) => {
  const out = [0];
  if (!send(list, msg, index, pointer, 2, 1500, out)) throw Error(`Shell query timeout/error ${msg}`);
  return Number(out[0]);
};
const processId = [0]; pidOf(list, processId);
const processHandle = open(0x38, false, processId[0]);
if (!processHandle) throw Error('Cannot open Shell query buffer');
let remote = null;
const previous = dpi(-4);
try {
  remote = allocate(processHandle, null, 4096, 0x3000, 4);
  if (!remote) throw Error('Cannot allocate Shell query buffer');
  const addr = BigInt(koffi.address(remote));
  const transfer = data => { const n=[0]; if (!write(processHandle, remote, data, data.length, n) || Number(n[0]) !== data.length) throw Error('IPC buffer write failed'); };
  const receive = length => { const b=Buffer.alloc(length), n=[0]; if (!read(processHandle, remote, b, length, n) || Number(n[0]) !== length) throw Error('IPC buffer read failed'); return b; };
  const origin={x:0,y:0}; if (!toScreen(list, origin)) throw Error('Shell origin unavailable');
  const count = query(0x1004);
  if (count < 0 || count > 10000) throw Error('Invalid Shell count');
  const items=[];
  for (let i=0; i<count; i++) {
    const item=Buffer.alloc(4096);
    item.writeUInt32LE(1,0); item.writeInt32LE(i,4);
    item.writeBigUInt64LE(addr+128n,24); item.writeInt32LE(1900,32);
    transfer(item); query(0x1073,i,addr);
    const label=receive(4096).subarray(128).toString('utf16le').split('\0')[0];
    const rectangles={};
    for (const [name,code] of [['bounds',0],['icon',1],['label',2]]) {
      const input=Buffer.alloc(16);input.writeInt32LE(code,0);transfer(input);
      if (!query(0x100e,i,addr)) throw Error(`No ${name} rect at ${i}`);
      const b=receive(16);
      rectangles[name]={x:b.readInt32LE(0)+origin.x,y:b.readInt32LE(4)+origin.y,width:b.readInt32LE(8)-b.readInt32LE(0),height:b.readInt32LE(12)-b.readInt32LE(4)};
    }
    transfer(Buffer.alloc(8));
    if (!query(0x1010,i,addr)) throw Error(`No item position at ${i}`);
    const positionBytes=receive(8);
    items.push({index:i,displayName:label,position:{x:positionBytes.readInt32LE(0)+origin.x,y:positionBytes.readInt32LE(4)+origin.y},...rectangles});
  }
  if (query(0x1004)!==count) throw Error('Shell changed during capture; retry');
  const result={capturedAt:new Date().toISOString(),method:'LVM_GETITEMRECT/GETITEMTEXT, physical screen coordinates, per-monitor-v2 querying thread',dpi:getDpi(list),origin,count,items};
  const dest=path.resolve(process.argv[2] || 'logs/mildew-native/baseline/shell-layout.json');
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(result,null,2));
  console.log(JSON.stringify({path:dest,count,dpi:result.dpi,iconRects:[...new Set(items.map(i=>`${i.icon.width}x${i.icon.height}`))]}));
} finally {
  if (remote) free(processHandle,remote,0,0x8000);
  close(processHandle);
  if (previous) dpi(BigInt(koffi.address(previous)));
}
