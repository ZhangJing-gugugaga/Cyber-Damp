/**
 * 真实桌面桥（renderer → main IPC 薄封装）
 * 非 Electron 环境（浏览器直开）返回空列表，绝不回退到任何 Mock 文件。
 */
import type { DesktopEntry } from '../../shared/types/desktop';

export async function loadDesktopEntries(): Promise<DesktopEntry[]> {
  try {
    const entries = await window.damp?.desktop.scan({ scaleFactor: window.devicePixelRatio, width: window.innerWidth, height: window.innerHeight });
    return Array.isArray(entries) ? entries : [];
  } catch (err) {
    console.warn('[desktop] 扫描失败:', err);
    throw err;
  }
}

export async function openRealPath(realPath: string): Promise<boolean> {
  try {
    const res = await window.damp?.desktop.open(realPath);
    return Boolean(res?.ok);
  } catch (err) {
    console.warn('[desktop] 打开文件失败:', err);
    return false;
  }
}
