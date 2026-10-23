/**
 * desktop.ini 纯文本逻辑（无 Electron 依赖，供主进程与单测共用）
 *
 * R1：外科级编辑——只动 IconResource 行，其余内容字节级保留；
 * 无法安全解码时调用方必须跳过对象，绝不写坏用户文件。
 */

export const SECTION_HEADER = '[.ShellClassInfo]';

/** 解析 IconResource 行：返回原始引用（source 与 index）。 */
export function parseIconResource(text: string): { source: string | null; index: number | null } {
  const lines = text.split(/\r\n|\r|\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.toLowerCase().startsWith('iconresource=')) continue;
    const value = trimmed.slice('iconresource='.length).trim();
    const comma = value.lastIndexOf(',');
    const maybeIndex = comma >= 0 ? value.slice(comma + 1).trim() : '';
    const hasIndex = maybeIndex !== '' && /^-?\d+$/.test(maybeIndex);
    const source = hasIndex ? value.slice(0, comma).trim() : value;
    return { source: source || null, index: hasIndex ? Number(maybeIndex) : null };
  }
  return { source: null, index: null };
}

/**
 * 在 desktop.ini 文本中设置 IconResource 指向 iconPath：
 * 已有 IconResource 行 → 原位替换；否则插入 [.ShellClassInfo] 段首；
 * 无该段 → 追加新段。换行风格跟随文件现状，缺省 CRLF。
 */
export function setIconReferenceInIni(text: string, iconPath: string): { text: string; changed: boolean } {
  const newline = text.includes('\r\n') ? '\r\n' : text.includes('\n') || text.length === 0 ? '\n' : '\r\n';
  const lines = text.length === 0 ? [] : text.split(/\r\n|\r|\n/);
  const newLine = `IconResource=${iconPath},0`;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().toLowerCase().startsWith('iconresource=')) {
      if (lines[i].trim() === newLine) return { text, changed: false };
      lines[i] = newLine;
      return { text: lines.join(newline), changed: true };
    }
  }
  const sectionIndex = lines.findIndex((line) => line.trim().toLowerCase() === SECTION_HEADER.toLowerCase());
  if (sectionIndex >= 0) {
    lines.splice(sectionIndex + 1, 0, newLine);
    return { text: lines.join(newline), changed: true };
  }
  return { text: `${SECTION_HEADER}${newline}${newLine}${newline}${text}`, changed: true };
}

export interface DecodedIni {
  encoding: 'utf16le' | 'utf16be' | 'utf8' | 'gbk';
  hadBom: boolean;
  text: string;
}

/** BOM 探测 + 严格解码；utf8/gbk 都失败返回 null（调用方跳过）。 */
export function decodeIni(raw: Buffer): DecodedIni | null {
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    return { encoding: 'utf16le', hadBom: true, text: new TextDecoder('utf-16le').decode(raw.subarray(2)) };
  }
  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    return { encoding: 'utf16be', hadBom: true, text: new TextDecoder('utf-16be').decode(raw.subarray(2)) };
  }
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    return { encoding: 'utf8', hadBom: true, text: new TextDecoder('utf-8', { fatal: true }).decode(raw.subarray(3)) };
  }
  try {
    return { encoding: 'utf8', hadBom: false, text: new TextDecoder('utf-8', { fatal: true }).decode(raw) };
  } catch { /* fall through to GBK */ }
  try {
    return { encoding: 'gbk', hadBom: false, text: new TextDecoder('gbk', { fatal: true }).decode(raw) };
  } catch {
    return null;
  }
}

/** 按解码结果回编码；gbk/utf16be 统一转存为带 BOM 的 UTF-16LE（语义无损）。 */
export function encodeIni(decoded: DecodedIni, text: string): Buffer {
  const addBom = decoded.hadBom || decoded.encoding === 'gbk' || decoded.encoding === 'utf16be';
  if (decoded.encoding !== 'utf8') return Buffer.from(addBom ? `\ufeff${text}` : text, 'utf16le');
  return Buffer.from(addBom ? `\ufeff${text}` : text, 'utf8');
}
