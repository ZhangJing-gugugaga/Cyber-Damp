/**
 * desktop.ini 纯逻辑机械验证（R1 外科级编辑与编解码防线）
 * 运行：并入 npm test（scripts/test-all.mjs）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIconResource, setIconReferenceInIni, decodeIni, encodeIni } from '../dist/test/main/desktop/desktop-ini.js';

test('IconResource 解析：路径与索引', () => {
  const parsed = parseIconResource('[.ShellClassInfo]\r\nIconResource=C:\\cache\\a.ico,0\r\n');
  assert.equal(parsed.source, 'C:\\cache\\a.ico');
  assert.equal(parsed.index, 0);
  const noIndex = parseIconResource('IconResource=C:\\cache\\b.ico');
  assert.equal(noIndex.source, 'C:\\cache\\b.ico');
  assert.equal(noIndex.index, null);
  const negative = parseIconResource('IconResource=shell32.dll,-12');
  assert.equal(negative.index, -12);
});

test('IconResource 解析：无引用', () => {
  assert.deepEqual(parseIconResource('[.ShellClassInfo]\r\nLocalizedResourceName=@系统,\r\n'), { source: null, index: null });
  assert.deepEqual(parseIconResource(''), { source: null, index: null });
});

test('替换已有 IconResource 行，其余行原样保留', () => {
  const before = '[.ShellClassInfo]\r\nLocalizedResourceName=C:\\用户\r\nIconResource=C:\\old\\x.ico,2\r\nInfoTip=提示\r\n';
  const { text, changed } = setIconReferenceInIni(before, 'C:\\new\\y.ico');
  assert.equal(changed, true);
  assert.ok(text.includes('IconResource=C:\\new\\y.ico,0'));
  assert.ok(text.includes('LocalizedResourceName=C:\\用户'));
  assert.ok(text.includes('InfoTip=提示'));
  assert.ok(!text.includes('x.ico'));
  // CRLF 风格保持
  assert.ok(!text.replace(/\r\n/g, '').includes('\n'));
});

test('无 IconResource 时插入 [.ShellClassInfo] 段首', () => {
  const before = '[.ShellClassInfo]\r\nLocalizedResourceName=C:\\x\r\n';
  const { text } = setIconReferenceInIni(before, 'C:\\new\\y.ico');
  const section = text.indexOf('[.ShellClassInfo]');
  const icon = text.indexOf('IconResource=C:\\new\\y.ico,0');
  const localized = text.indexOf('LocalizedResourceName');
  assert.ok(section >= 0 && icon > section && localized > icon);
});

test('无任何段时追加新段', () => {
  const { text } = setIconReferenceInIni('', 'C:\\n\\z.ico');
  assert.equal(text, '[.ShellClassInfo]\nIconResource=C:\\n\\z.ico,0\n');
});

test('引用相同时不改写（幂等）', () => {
  const before = '[.ShellClassInfo]\r\nIconResource=C:\\same\\a.ico,0\r\n';
  const { text, changed } = setIconReferenceInIni(before, 'C:\\same\\a.ico');
  assert.equal(changed, false);
  assert.equal(text, before);
});

test('编解码：UTF-16LE BOM 往返', () => {
  const text = '[.ShellClassInfo]\r\nIconResource=C:\\缓存\\图.ico,0\r\n';
  const buf = Buffer.from('\ufeff' + text, 'utf16le');
  const decoded = decodeIni(buf);
  assert.equal(decoded?.encoding, 'utf16le');
  assert.ok(decoded?.hadBom);
  assert.equal(decoded?.text, text);
  const back = encodeIni(decoded, decoded.text);
  assert.deepEqual([...back], [...buf]);
});

test('编解码：UTF-8 BOM 往返', () => {
  const text = '[.ShellClassInfo]\nIconResource=C:\\缓存\\图.ico,0\n';
  const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
  const decoded = decodeIni(buf);
  assert.equal(decoded?.encoding, 'utf8');
  assert.equal(decoded?.text, text);
});

test('编解码：GBK 中文按语义读出并转存 UTF-16LE', () => {
  // 用 Node 内置支持编一段 GBK 源：GBK 无法直接编码，构造已知 GBK 字节
  // "提示" 的 GBK 字节为 CC E1 CA BE
  const gbkBytes = Buffer.from([
    0x5b, 0x2e, 0x53, 0x68, 0x65, 0x6c, 0x6c, 0x43, 0x6c, 0x61, 0x73, 0x73, 0x49, 0x6e, 0x66, 0x6f, 0x5d, 0x0d, 0x0a,
    0x49, 0x6e, 0x66, 0x6f, 0x54, 0x69, 0x70, 0x3d, 0xcc, 0xe1, 0xca, 0xbe, 0x0d, 0x0a,
  ]);
  const decoded = decodeIni(gbkBytes);
  assert.equal(decoded?.encoding, 'gbk');
  assert.ok(decoded?.text.includes('InfoTip=提示'));
  const out = encodeIni(decoded, decoded.text);
  const roundTripped = decodeIni(out);
  assert.equal(roundTripped?.encoding, 'utf16le');
  assert.ok(roundTripped?.text.includes('InfoTip=提示'));
});

test('编解码：非法二进制拒绝解码（防线）', () => {
  // 无 BOM、非 utf8 也非合法 GBK 的字节序列
  assert.equal(decodeIni(Buffer.from([0x81, 0x40, 0x81, 0x40, 0xff, 0xfe, 0x00])), null);
});
