import koffi from 'koffi';
const u = koffi.load('user32.dll');
const POINT = koffi.struct('ProbePoint', { x:'long', y:'long' });
const at = u.func('void *WindowFromPoint(ProbePoint point)');
const parent = u.func('void *GetParent(void *hwnd)');
const cls = u.func('int GetClassNameW(void *hwnd, _Out_ uint16 *text, int max)');
const title = u.func('int GetWindowTextW(void *hwnd, _Out_ uint16 *text, int max)');
const style = u.func('long GetWindowLongW(void *hwnd, int index)');
const visible = u.func('bool IsWindowVisible(void *hwnd)');
let h = at({x:Number(process.argv[2] || 1808),y:Number(process.argv[3] || 44)});
const chain = [];
while (h && chain.length < 8) {
  const a=Buffer.alloc(512), b=Buffer.alloc(512);
  cls(h,a,256); title(h,b,256);
  chain.push({hwnd:String(koffi.address(h)),class:a.toString('utf16le').split('\0')[0],title:b.toString('utf16le').split('\0')[0],exStyle:style(h,-20)>>>0,visible:visible(h)});
  h=parent(h);
}
console.log(JSON.stringify(chain));
