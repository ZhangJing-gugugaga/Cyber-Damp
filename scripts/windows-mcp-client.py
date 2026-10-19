"""Run native CursorTouch Windows-MCP tools; preserve text and screenshot evidence.

uvx --from windows-mcp==0.8.8 python scripts/windows-mcp-client.py steps.json
An empty steps array lists the actual server tools and their input schemas.
"""
import asyncio
import base64
import json
import os
from pathlib import Path
import sys


def target_window_visible(point, title):
    """Read-only guard against clicking a window covering the desktop toy."""
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.WindowFromPoint.argtypes = [wintypes.POINT]
    user32.WindowFromPoint.restype = wintypes.HWND
    user32.GetParent.argtypes = [wintypes.HWND]
    user32.GetParent.restype = wintypes.HWND
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
    user32.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
    previous_dpi = user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))
    try:
        hwnd = user32.WindowFromPoint(wintypes.POINT(*point))
        for _ in range(12):
            if not hwnd:
                break
            name = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(hwnd, name, len(name))
            if name.value == title:
                return True
            hwnd = user32.GetParent(hwnd)
        return False
    finally:
        if previous_dpi:
            user32.SetThreadDpiAwarenessContext(previous_dpi)
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    steps = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig")) if len(sys.argv) > 1 else []
    evidence = Path("logs/native-uat")
    evidence.mkdir(parents=True, exist_ok=True)
    params = StdioServerParameters(command="uvx", args=["--offline", "--from", "windows-mcp==0.8.8", "windows-mcp", "serve"], env={**os.environ, "ANONYMIZED_TELEMETRY": "false", "PYTHONIOENCODING": "utf-8"})
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            if not steps:
                listing = await session.list_tools()
                print(json.dumps([t.model_dump() for t in listing.tools], ensure_ascii=True))
            for i, step in enumerate(steps):
                # A GUI approval itself counts as recent physical input. Allow a
                # bounded idle period; the server's own control guard still runs.
                await asyncio.sleep(max(0, min(30, float(step.get("settleSeconds", 0)))))
                if step.get("targetWindowTitle") and not target_window_visible(
                    step["arguments"]["loc"], step["targetWindowTitle"]
                ):
                    print(json.dumps({"isError": True, "reason": "Target window is occluded; no input sent."}), flush=True)
                    break
                result = await session.call_tool(step["tool"], step.get("arguments", {}))
                messages = []
                for j, block in enumerate(result.content):
                    if block.type == "image":
                        dest = evidence / f'{step.get("label", str(i))}-{j}.png'
                        dest.write_bytes(base64.b64decode(block.data))
                        messages.append({"screenshot": str(dest.resolve())})
                    elif block.type == "text":
                        messages.append(block.text)
                failed = result.is_error or any(isinstance(item, str) and 'Error capturing' in item for item in messages)
                record = {"step": step, "isError": failed, "result": messages}
                (evidence / f'{step.get("label", str(i))}.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
                print(json.dumps(record, ensure_ascii=True), flush=True)
                if failed:
                    # Respect Windows-MCP's physical user-control preemption.
                    # Stop dependent actions; rerun after the desktop is idle.
                    break
                if step.get("review"):
                    # Keep the same MCP session alive while the operator inspects
                    # the native screenshot. Never run the next action blindly.
                    print("REVIEW: type continue to run the next step; anything else stops.", flush=True)
                    answer = await asyncio.to_thread(input)
                    if answer.strip() != "continue":
                        break
                    # PTY review input can also be reported as physical keyboard
                    # activity on Windows. Wait out the normal idle interval.
                    await asyncio.sleep(12)


asyncio.run(main())
