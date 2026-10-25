/**
 * 桌面对象类别判定（R5 v0.2 品种输入）。只验证纯函数，不触碰桌面。
 * 运行：并入 npm test（scripts/test-all.mjs）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyObject } from '../dist/test/shared/object-category.js';
import { OBJECT_CATEGORIES } from '../dist/test/shared/types/gameplay.js';

const lnk = (targetPath) => classifyObject({ kind: 'lnk', targetPath });

test('文件夹恒为 folder，不看目标', () => {
  assert.equal(classifyObject({ kind: 'dir' }), 'folder');
  assert.equal(classifyObject({ kind: 'dir', targetPath: 'C:\\x\\wechat.exe' }), 'folder');
});

test('目标无扩展名的快捷方式视为文件夹', () => {
  assert.equal(lnk('D:\\Projects\\Cyber Damp'), 'folder');
});

test('按目标扩展名识别压缩包与图片', () => {
  assert.equal(lnk('E:\\Downloads\\素材.ZIP'), 'archive');
  assert.equal(lnk('E:\\Pictures\\截图 2026.png'), 'image');
});

test('按程序名识别聊天、编程、游戏、浏览器（大小写与分隔符无关）', () => {
  assert.equal(lnk('C:\\Program Files\\Tencent\\WeChat\\WeChat.exe'), 'chat');
  assert.equal(lnk('C:/Users/a/AppData/Local/Programs/Microsoft VS Code/Code.exe'), 'code');
  assert.equal(lnk('C:\\Program Files (x86)\\Steam\\steam.exe'), 'game');
  assert.equal(lnk('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'), 'browser');
  assert.equal(lnk('C:\\Program Files\\GIMP 2\\bin\\gimp-2.10.exe'), 'image');
});

test('steamapps/common 下的未知程序视为游戏', () => {
  assert.equal(lnk('D:\\SteamLibrary\\steamapps\\common\\Hades\\Hades.exe'), 'game');
});

test('未知目标与空目标为 other', () => {
  assert.equal(lnk('C:\\Tools\\something.exe'), 'other');
  assert.equal(lnk(''), 'other');
  assert.equal(lnk(undefined), 'other');
  assert.equal(lnk('C:\\Docs\\报告.docx'), 'other');
});

test('结果始终属于契约类别集合', () => {
  for (const p of ['a.zip', 'b.exe', 'c', 'qq.exe', 'x.png', '']) {
    assert.ok(OBJECT_CATEGORIES.includes(lnk(p)));
  }
});
