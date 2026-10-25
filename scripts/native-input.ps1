# UAT native input helper (Win32 SendInput/SetCursorPos + screen capture).
# Real OS-level input for the Cyber Damp UAT skill; coordinates are physical pixels.
# Usage:
#   powershell -NoProfile -File native-input.ps1 -Action click  -X 100 -Y 200
#   powershell -NoProfile -File native-input.ps1 -Action drag   -X 10 -Y 10 -X2 300 -Y2 40 -HoldMs 0
#   powershell -NoProfile -File native-input.ps1 -Action shot   -Out C:\path\shot.png
param(
  [string]$Action = 'click',   # move|click|dblclick|rightclick|drag|shot
  [int]$X = 0, [int]$Y = 0,
  [int]$X2 = 0, [int]$Y2 = 0,
  [int]$Steps = 20,
  [int]$HoldMs = 60,
  [int]$PauseShotMs = 0,       # >0: take -Out screenshot mid-drag (before button up)
  [string]$Out = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NI {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SendInput(uint n, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {
    public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public MOUSEINPUT mi; }
  public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004, RIGHTDOWN = 0x0008, RIGHTUP = 0x0010;
  public static void Mouse(uint flags) {
    INPUT[] i = new INPUT[1];
    i[0].type = 0; i[0].mi.dwFlags = flags;
    SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public static class DpiFix { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[DpiFix]::SetProcessDPIAware() | Out-Null

function Shot([string]$path) {
  Add-Type -AssemblyName System.Windows.Forms,System.Drawing
  $b = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height)
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.CopyFromScreen(0, 0, 0, 0, $b.Size)
  $b.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $b.Dispose()
}

switch ($Action) {
  'shot' { Shot $Out }
  'move' { [NI]::SetCursorPos($X, $Y) | Out-Null }
  'click' {
    [NI]::SetCursorPos($X, $Y) | Out-Null; Start-Sleep -Milliseconds 80
    [NI]::Mouse([NI]::LEFTDOWN); Start-Sleep -Milliseconds 40; [NI]::Mouse([NI]::LEFTUP)
  }
  'dblclick' {
    [NI]::SetCursorPos($X, $Y) | Out-Null; Start-Sleep -Milliseconds 80
    [NI]::Mouse([NI]::LEFTDOWN); Start-Sleep -Milliseconds 30; [NI]::Mouse([NI]::LEFTUP)
    Start-Sleep -Milliseconds 60
    [NI]::Mouse([NI]::LEFTDOWN); Start-Sleep -Milliseconds 30; [NI]::Mouse([NI]::LEFTUP)
  }
  'rightclick' {
    [NI]::SetCursorPos($X, $Y) | Out-Null; Start-Sleep -Milliseconds 80
    [NI]::Mouse([NI]::RIGHTDOWN); Start-Sleep -Milliseconds 40; [NI]::Mouse([NI]::RIGHTUP)
  }
  'drag' {
    [NI]::SetCursorPos($X, $Y) | Out-Null; Start-Sleep -Milliseconds 120
    [NI]::Mouse([NI]::LEFTDOWN); Start-Sleep -Milliseconds $HoldMs
    for ($i = 1; $i -le $Steps; $i++) {
      $nx = $X + [int](($X2 - $X) * $i / $Steps)
      $ny = $Y + [int](($Y2 - $Y) * $i / $Steps)
      [NI]::SetCursorPos($nx, $ny) | Out-Null
      Start-Sleep -Milliseconds 16
    }
    if ($PauseShotMs -gt 0 -and $Out) {
      Start-Sleep -Milliseconds 200; Shot $Out; Start-Sleep -Milliseconds $PauseShotMs
    }
    Start-Sleep -Milliseconds 120
    [NI]::Mouse([NI]::LEFTUP)
  }
  default { throw "unknown action $Action" }
}
