/** Metadata-only folder weight regression. Run: node --test scripts/test-folder-size.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const fixtureBase = path.resolve('logs/folder-size-tests');
const output = path.join(fixtureBase, 'compiled');
await fs.mkdir(fixtureBase, { recursive: true });
const compile = spawnSync(process.execPath, [
  'node_modules/typescript/bin/tsc', 'src/main/desktop/folder-size.ts',
  '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node',
  '--esModuleInterop', '--skipLibCheck', '--types', 'node', '--strict', '--outDir', output,
], { encoding: 'utf8' });
assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`);
const { folderSizeBytes } = createRequire(import.meta.url)(path.join(output, 'folder-size.js'));

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(fixtureBase, 'fixtures-'));
  try { return await run(root); }
  finally {
    // Only this invocation's newly-created test tree can be removed recursively.
    assert.equal(path.dirname(path.resolve(root)), fixtureBase);
    assert.ok(path.basename(root).startsWith('fixtures-'));
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('folder weight sums nested logical file bytes rather than Windows directory stat.size', async () => {
  await fixture(async (root) => {
    await fs.mkdir(path.join(root, 'nested', 'empty'), { recursive: true });
    await fs.writeFile(path.join(root, 'small.txt'), 'abc');
    await fs.writeFile(path.join(root, 'nested', 'data.bin'), Buffer.alloc(4097));
    const before = await fs.stat(path.join(root, 'small.txt'));
    const result = await folderSizeBytes(root);
    assert.deepEqual(result, { sizeBytes: 4100, files: 2, skippedEntries: 0, complete: true, limit: null });
    assert.notEqual((await fs.stat(root)).size, result.sizeBytes);
    assert.equal((await fs.stat(path.join(root, 'small.txt'))).mtimeMs, before.mtimeMs);
  });
});

test('a real multi-GB file gives its containing folder a multi-GB rope weight without reading contents', async () => {
  await fixture(async (root) => {
    const movie = path.join(root, 'movie.bin');
    await fs.writeFile(movie, '');
    const bytes = 2 * 1024 ** 3 + 1024;
    await fs.truncate(movie, bytes);
    const originalReadFile = fs.readFile;
    const originalOpen = fs.open;
    fs.readFile = async () => { throw new Error('File contents must never be read'); };
    fs.open = async () => { throw new Error('File contents must never be opened'); };
    try {
      const result = await folderSizeBytes(root);
      assert.equal(result.sizeBytes, bytes);
      assert.equal(result.complete, true);
      assert.equal(result.files, 1);
    } finally { fs.readFile = originalReadFile; fs.open = originalOpen; }
  });
});

test('junction/symlink subdirectories, root links and cycles are excluded', async () => {
  await fixture(async (root) => {
    const tree = path.join(root, 'tree');
    const outside = path.join(root, 'outside');
    await fs.mkdir(tree);
    await fs.mkdir(outside);
    await fs.writeFile(path.join(tree, 'count.txt'), '12345');
    await fs.writeFile(path.join(outside, 'exclude.txt'), 'do not count');
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    await fs.symlink(outside, path.join(tree, 'outside-link'), type);
    await fs.symlink(tree, path.join(tree, 'cycle'), type);
    const result = await folderSizeBytes(tree);
    assert.equal(result.sizeBytes, 5);
    assert.equal(result.complete, true);
    assert.equal(result.skippedEntries, 2);
    const rootLink = await folderSizeBytes(path.join(tree, 'outside-link'));
    assert.equal(rootLink.sizeBytes, 0);
    assert.equal(rootLink.skippedEntries, 1);
  });
});

test('access-denied directories and files disappearing after enumeration preserve reachable totals', async () => {
  await fixture(async (root) => {
    const locked = path.join(root, 'locked');
    const vanished = path.join(root, 'vanished.txt');
    await fs.mkdir(locked);
    await fs.writeFile(path.join(locked, 'secret.txt'), 'excluded');
    await fs.writeFile(vanished, 'gone');
    await fs.writeFile(path.join(root, 'reachable.txt'), 'safe');
    const originalOpenDir = fs.opendir;
    const originalLstat = fs.lstat;
    fs.opendir = async (name, ...args) => {
      if (name === locked) throw Object.assign(new Error('Denied'), { code: 'EACCES' });
      return originalOpenDir(name, ...args);
    };
    fs.lstat = async (name, ...args) => {
      if (name === vanished) await fs.unlink(vanished);
      return originalLstat(name, ...args);
    };
    try {
      const result = await folderSizeBytes(root);
      assert.equal(result.sizeBytes, 4);
      assert.equal(result.complete, false);
      assert.equal(result.skippedEntries, 2);
      assert.equal(result.limit, null);
    } finally { fs.opendir = originalOpenDir; fs.lstat = originalLstat; }
  });
});

test('entry/depth limits return bounded lower totals and exact entry limits can still finish', async () => {
  await fixture(async (root) => {
    for (let i = 0; i < 5; i++) await fs.writeFile(path.join(root, `${i}.txt`), 'x');
    assert.equal((await folderSizeBytes(root, { maxEntries: 5 })).complete, true);
    const entryLimited = await folderSizeBytes(root, { maxEntries: 3 });
    assert.equal(entryLimited.sizeBytes, 3);
    assert.equal(entryLimited.files, 3);
    assert.equal(entryLimited.complete, false);
    assert.equal(entryLimited.limit, 'entries');
    await fs.mkdir(path.join(root, 'nested'));
    await fs.writeFile(path.join(root, 'nested', 'skip.txt'), 'skip');
    const depthLimited = await folderSizeBytes(root, { maxDepth: 0 });
    assert.equal(depthLimited.sizeBytes, 5);
    assert.equal(depthLimited.complete, false);
    assert.equal(depthLimited.limit, 'depth');
  });
});

test('slow metadata is timed out without blocking the event loop and late directory handles close', async () => {
  await fixture(async (root) => {
    const originalOpenDir = fs.opendir;
    let lateClosed = false;
    fs.opendir = async (...args) => {
      await delay(100);
      const dir = await originalOpenDir(...args);
      const close = dir.close.bind(dir);
      dir.close = async () => { lateClosed = true; return close(); };
      return dir;
    };
    let heartbeat = false;
    const timer = setTimeout(() => { heartbeat = true; }, 1);
    const started = performance.now();
    try {
      const result = await folderSizeBytes(root, { timeoutMs: 30 });
      assert.equal(result.complete, false);
      assert.equal(result.limit, 'time');
      assert.ok(performance.now() - started < 250, 'Must not await a stalled filesystem request');
      assert.equal(heartbeat, true);
      await delay(130);
      assert.equal(lateClosed, true);
    } finally { clearTimeout(timer); fs.opendir = originalOpenDir; }
  });
});

test('an already-expired shared desktop deadline performs no traversal', async () => {
  await fixture(async (root) => {
    await fs.writeFile(path.join(root, 'file.txt'), 'x');
    const result = await folderSizeBytes(root, { deadlineMs: Date.now() - 1 });
    assert.equal(result.sizeBytes, 0);
    assert.equal(result.complete, false);
    assert.equal(result.limit, 'time');
  });
});

test('a timed-out directory read also releases its handle after the read settles', async () => {
  await fixture(async (root) => {
    const originalOpenDir = fs.opendir;
    let closed = false;
    fs.opendir = async (...args) => {
      const dir = await originalOpenDir(...args);
      const read = dir.read.bind(dir);
      const close = dir.close.bind(dir);
      let reading = false;
      dir.read = async () => {
        reading = true;
        await delay(100);
        try { return await read(); }
        finally { reading = false; }
      };
      dir.close = async () => {
        if (reading) throw Object.assign(new Error('Read pending'), { code: 'ERR_DIR_CONCURRENT_OPERATION' });
        closed = true;
        return close();
      };
      return dir;
    };
    try {
      const result = await folderSizeBytes(root, { timeoutMs: 30 });
      assert.equal(result.limit, 'time');
      await delay(130);
      assert.equal(closed, true);
    } finally { fs.opendir = originalOpenDir; }
  });
});
