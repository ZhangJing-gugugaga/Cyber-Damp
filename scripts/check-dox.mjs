import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = args.indexOf('--root');
const root = rootIndex < 0 ? defaultRoot : path.resolve(args[rootIndex + 1] ?? '');
if (rootIndex >= 0) args.splice(rootIndex, 2);
const json = args.includes('--json');
const input = args.filter(arg => arg !== '--json');
const pathsIndex = input.indexOf('--paths');
const targets = pathsIndex < 0 ? [] : input.slice(pathsIndex + 1);
const errors = [];
if (input.some((arg, i) => arg.startsWith('--') && i !== pathsIndex)) errors.push('未知参数');
if (pathsIndex >= 0 && !targets.length) errors.push('--paths 后需要至少一个目标路径');
const relative = value => path.relative(root, value).split(path.sep).join('/') || '.';
const inside = value => {
  const rel = path.relative(root, value);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
};
const exists = value => fs.existsSync(value);
const read = value => fs.readFileSync(value, 'utf8');
const scripts = JSON.parse(read(path.join(root, 'package.json'))).scripts ?? {};
const seen = new Set();
const stack = new Set();
const docs = [];
const edges = [];
const childStart = '<!-- dox-children:start -->';
const childEnd = '<!-- dox-children:end -->';
const links = text => [...text.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)].map(match => match[1]);

function resolveLink(owner, raw) {
  if (/^(?:https?:|mailto:|#)/i.test(raw)) return null;
  const decoded = decodeURIComponent(raw.replace(/^<|>$/g, '').split('#')[0]);
  const target = path.resolve(path.dirname(owner), decoded);
  if (!inside(target)) errors.push(`${relative(owner)} 链接越出项目: ${raw}`);
  else if (!exists(target)) errors.push(`${relative(owner)} 链接不存在: ${raw}`);
  return target;
}

function visit(file, parent = null) {
  if (!inside(file) || !exists(file)) return;
  if (stack.has(file)) { errors.push(`指南索引形成循环: ${relative(file)}`); return; }
  if (seen.has(file)) { errors.push(`指南被重复索引: ${relative(file)}`); return; }
  seen.add(file);
  stack.add(file);
  const text = read(file);
  docs.push({ path: relative(file), bytes: Buffer.byteLength(text) });
  if (parent && !path.dirname(file).startsWith(`${path.dirname(parent)}${path.sep}`)) errors.push(`子指南不在父域内: ${relative(file)}`);
  for (const heading of ['Purpose', 'Ownership', 'Local Contracts', 'Work Guidance', 'Verification', 'Child DOX Index']) {
    if (!text.includes(`## ${heading}`)) errors.push(`${relative(file)} 缺少 ${heading}`);
  }
  const start = text.indexOf(childStart), end = text.indexOf(childEnd);
  if (start < 0 || end < start || text.lastIndexOf(childStart) !== start || text.lastIndexOf(childEnd) !== end) {
    errors.push(`${relative(file)} 子域索引标记缺失或不唯一`);
  }
  for (const link of links(text)) resolveLink(file, link);
  for (const match of text.matchAll(/`npm run ([a-z][\w:-]*)/g)) {
    if (!(match[1] in scripts)) errors.push(`${relative(file)} 引用了不存在的 npm 脚本: ${match[1]}`);
  }
  if (start >= 0 && end > start) for (const link of links(text.slice(start, end))) {
    const child = resolveLink(file, link);
    if (!child || path.basename(child) !== 'AGENTS.md') { errors.push(`子域索引必须指向 AGENTS.md: ${link}`); continue; }
    edges.push({ parent: relative(file), child: relative(child) });
    visit(child, file);
  }
  stack.delete(file);
}

const entry = path.join(root, 'AGENTS.md');
if (!exists(entry)) errors.push('缺少项目根 AGENTS.md');
else {
  const text = read(entry);
  if (!text.includes('<!-- dox-framework:start -->') || !text.includes('<!-- dox-framework:end -->')) errors.push('根指南缺少 DOX 固定规则边界');
  visit(entry);
}
const skipped = new Set(['node_modules', 'dist', 'release', 'logs', 'previews', '.git', '.local', '.tools', '__pycache__']);
function discover(directory) {
  if (!exists(directory)) return;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory() && !skipped.has(item.name)) discover(file);
    else if (item.isFile() && item.name === 'AGENTS.md' && !seen.has(file)) errors.push(`未被索引的指南: ${relative(file)}`);
    else if (item.isFile() && item.name === 'AGENTS.override.md' && read(file).trim()) errors.push(`发现会覆盖指南的本地 override，请明确纳入加载分析: ${relative(file)}`);
  }
}
for (const directory of ['src', 'docs', 'scripts', '.agents']) discover(path.join(root, directory));
const rootOverride = path.join(root, 'AGENTS.override.md');
if (exists(rootOverride) && read(rootOverride).trim()) errors.push('项目根 AGENTS.override.md 会覆盖本指南');

const codexHome = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.codex');
const globalOverride = path.join(codexHome, 'AGENTS.override.md');
const globalFile = exists(globalOverride) && read(globalOverride).trim() ? globalOverride : path.join(codexHome, 'AGENTS.md');
const globalBytes = exists(globalFile) ? Buffer.byteLength(read(globalFile)) : 0;
const config = path.join(codexHome, 'config.toml');
const configuredCap = exists(config) ? read(config).match(/^\s*project_doc_max_bytes\s*=\s*(\d+)/m) : null;
const limit = configuredCap ? Number(configuredCap[1]) : 32768;
function chainFor(target) {
  const directory = exists(target) && fs.statSync(target).isDirectory() ? target : path.dirname(target);
  return docs.filter(doc => {
    const scope = path.dirname(path.join(root, doc.path));
    const rel = path.relative(scope, directory);
    return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
  }).sort((a, b) => a.path.split('/').length - b.path.split('/').length);
}
const routes = [];
for (const name of targets) {
  const target = path.resolve(root, name);
  if (!inside(target)) { errors.push(`目标越出项目: ${name}`); continue; }
  routes.push({ target: relative(target), chain: chainFor(target).map(doc => doc.path) });
}
const maxChainBytes = Math.max(globalBytes, ...docs.map(doc => globalBytes + chainFor(path.join(root, doc.path)).reduce((n, item) => n + item.bytes + 2, 0)));
if (maxChainBytes > limit) errors.push(`指南链 ${maxChainBytes} 字节超过 Codex 配置上限 ${limit}`);
const result = { ok: errors.length === 0, docs, edges, routes, globalInstructions: globalFile, maxChainBytes, limit, errors };
if (json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`DOX ${result.ok ? 'PASS' : 'FAIL'} · ${docs.length} 指南 · ${maxChainBytes}/${limit} 字节`);
  for (const route of routes) console.log(`${route.target}: ${route.chain.join(' -> ')}`);
  for (const error of errors) console.error(error);
}
process.exitCode = result.ok ? 0 : 1;
