#!/usr/bin/env node
/**
 * 旧口径残留扫描器 —— docs/STALE-VALUE-BLACKLIST.md 配套脚本（唯一真相源）
 * 用法：node docs/scripts/scan-stale-values.mjs
 * 输出：文件:行号 [阻塞|非阻塞] pattern → 替代值 :: 命中文本
 * 退出码恒 0：扫描器只负责发现，分类（真残留/历史标注/禁止条款陈述豁免）由人工执行。
 * 改 pattern 只改本文件，并同步 STALE-VALUE-BLACKLIST.md 第 2/3 节。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const SCAN_EXTS = new Set(['.md', '.css', '.json', '.ts', '.tsx', '.js', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'logs', '.claude', '.workbuddy']);
// PRD.md = v1.0 历史存档（被 PRD_v1.1_MVP.md 取代），不扫；构建配置非文档，不扫；
// 黑名单文档与扫描器自身不扫（合法包含全部 pattern 的自匹配）
const SKIP_FILES = new Set([
  'PRD.md', 'package.json', 'package-lock.json',
  'tsconfig.json', 'tsconfig.main.json', 'tsconfig.renderer.json', 'tsconfig.test.json',
  'STALE-VALUE-BLACKLIST.md', 'scan-stale-values.mjs',
]);
// 行级豁免标记：命中行含此标记即跳过（分类结果的自文档化，防呆负提及/禁止条款陈述/历史标注用）
const EXEMPT_MARKER = 'stale-scan:exempt';

const BLOCKING = [
  { re: /\b1\.46\b/, why: 'sag 定标 k≈3.5' },
  { re: /\b5\.20\b/, why: '1GB→5.22（二进制 KB 口径；5.20 系十进制粗算）' },
  { re: /\b5\.80\b/, why: '5GB→5.78' },
  { re: /\b6\.28\b/, why: '25GB→6.33' },
  { re: /6GB|承重 6|(?<!\d)6\/25(?!\d)/, why: '字节承重 5GB/25GB/≥100GB（崩断按字节判）' },
  { re: /log10\(bytes/, why: 'sag 参考式改用 sizeToMass 表达' },
  { re: /mass:\s*0\.02/, why: '绳链 0.5/链（总 7.0）' },
  { re: /\b35:1\b/, why: '单挂点质量比 ≤40:1（包络内最坏约 27）' },
  { re: /\b9\.8\b/, why: '24GB→6.32（sizeToMass 实算锚点）' },
];

const NONBLOCK = [
  { re: /40-60/, why: '早期 PRNG 文件数；现行=16 命名锚文件（封闭 pin 集），仅历史标注可保留' },
  { re: /linear-gradient|radial-gradient|conic-gradient/, why: 'P0-2 禁渐变' },
  { re: /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/u, why: 'P0-1 禁 emoji 图标' },
  { re: /lorem ipsum|welcome to|sign up today/i, why: 'P0-3 禁模板文案（豁免：禁止条款陈述上下文）' },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (SCAN_EXTS.has(extname(name)) && !SKIP_FILES.has(name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT).sort();
let blockingHits = 0;
let nonblockHits = 0;
let filesWithHits = 0;

for (const f of files) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => {
    if (line.includes(EXEMPT_MARKER)) return; // 已声明豁免（原因写在标记后）
    for (const { re, why } of BLOCKING) {
      if (re.test(line)) {
        hits.push(`  L${i + 1} [阻塞] ${re.source} -> ${why} :: ${line.trim().slice(0, 90)}`);
        blockingHits++;
      }
    }
    for (const { re, why } of NONBLOCK) {
      if (re.test(line)) {
        hits.push(`  L${i + 1} [非阻塞] ${re.source} -> ${why} :: ${line.trim().slice(0, 90)}`);
        nonblockHits++;
      }
    }
  });
  if (hits.length > 0) {
    filesWithHits++;
    console.log(f);
    console.log(hits.join('\n'));
  }
}

console.log(`\n扫描 ${files.length} 个文件，${filesWithHits} 个有命中：阻塞级 ${blockingHits}，非阻塞级 ${nonblockHits}。`);
console.log('分类规则（真残留必修 / 历史标注保留 / 禁止条款陈述豁免）见 docs/STALE-VALUE-BLACKLIST.md。');
