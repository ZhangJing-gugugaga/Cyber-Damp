import koffi from 'koffi';
import { randomUUID } from 'node:crypto';

let protectedHandle: bigint | null = null;

/** A separate Win32 process outside Electron's job restores icons after kill. */
export async function protectDesktopIcons(handle: bigint): Promise<boolean> {
  if (protectedHandle === handle) return true;
  const kernel = koffi.load('kernel32.dll');
  const Startup = koffi.struct({
    cb: 'uint32', lpReserved: 'void *', lpDesktop: 'void *', lpTitle: 'void *',
    dwX: 'uint32', dwY: 'uint32', dwXSize: 'uint32', dwYSize: 'uint32',
    dwXCountChars: 'uint32', dwYCountChars: 'uint32', dwFillAttribute: 'uint32',
    dwFlags: 'uint32', wShowWindow: 'uint16', cbReserved2: 'uint16',
    lpReserved2: 'void *', hStdInput: 'void *', hStdOutput: 'void *', hStdError: 'void *',
  });
  const ProcessInfo = koffi.struct({ hProcess: 'void *', hThread: 'void *', dwProcessId: 'uint32', dwThreadId: 'uint32' });
  const create = kernel.func('CreateProcessW', 'bool', ['str16', koffi.inout(koffi.pointer('uint16')), 'void *', 'void *', 'bool', 'uint32', 'void *', 'str16', koffi.pointer(Startup), koffi.out(koffi.pointer(ProcessInfo))]);
  const eventCreate = kernel.func('void *CreateEventW(void *attrs, bool manual, bool initial, str16 name)');
  const wait = kernel.func('uint32 WaitForSingleObject(void *handle, uint32 timeout)');
  const close = kernel.func('bool CloseHandle(void *handle)');
  const lastError = kernel.func('uint32 GetLastError()');
  const eventName = `Local\\CyberDampRestore-${process.pid}-${randomUUID()}`;
  const event = eventCreate(null, true, false, eventName);
  if (!event) return false;
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DampRestore {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int cmd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
}
'@
$owner = [System.Diagnostics.Process]::GetProcessById(${process.pid})
$icons = [IntPtr]::new(${handle.toString()})
$ready = [System.Threading.EventWaitHandle]::OpenExisting('${eventName}')
[void]$ready.Set()
$ready.Dispose()
$owner.WaitForExit()
if ([DampRestore]::IsWindow($icons)) { [void][DampRestore]::ShowWindow($icons, 5) }
`;
  const executable = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  const command = Buffer.from(`"${executable}" -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}\0`, 'utf16le');
  const info: Record<string, unknown> = {};
  try {
    // CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB. No visible console.
    const ok = create(executable, command, null, null, false, 0x09000000, null, null, { cb: koffi.sizeof(Startup) }, info);
    if (!ok) { console.warn('[desktop-watchdog] CreateProcess failed:', lastError()); return false; }
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (wait(event, 0) === 0) { protectedHandle = handle; return true; }
      if (wait(info.hProcess, 0) === 0) { console.warn('[desktop-watchdog] Exited before ready'); return false; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    console.warn('[desktop-watchdog] Startup timed out');
    return false;
  } finally {
    close(event);
    if (info.hThread) close(info.hThread);
    if (info.hProcess) close(info.hProcess);
  }
}
