/**
 * 护理台页面（Goal v9 修复轮）：雨天玻璃外壳 + 认可材质同源污染层。
 * 污染层与桌面 ICO 用同一 shared/material/effects 实现、同一款式派生（对象 ID 稳定）；
 * 擦拭只作用于污染层（原图/蘑菇不受影响）；64×64 掩码持久化，重开还原同一批擦除洞。
 */
import { applyDamageMaterial, damageVariant } from '../shared/material/effects';
import { CARE_MASK_CELLS, decodeCareMask, encodeCareMask } from '../shared/care-mask';
import { isNewSpeciesId } from '../shared/types/gameplay';
import './care-v2';
import { DEFAULT_LOCATION } from '../shared/native-defaults';
import type { NativeObjectView, NativeStatusSnapshot } from '../shared/types/native-status';
import type { CityOption } from '../shared/types/weather';

type CitySearchResult = { ok: true; options: CityOption[] } | { ok: false; error: string };

let status: NativeStatusSnapshot | null = null;
let currentId: string | null = null;
let wiping = false;
let lastSaved = 0;
let dirtInitial = 1;
/** 当前对象的损伤层标记（与 dirtInitial 对应；null 表示无可擦损伤） */
let dirtLayer: Uint8Array | null = null;
/** 64×64 擦拭掩码（本地工作副本，节流持久化；编解码见 shared/care-mask） */
let mask: Uint8Array = new Uint8Array(new ArrayBuffer(CARE_MASK_CELLS));
const MASK_GRID = 64;
const MASK_CELL = 256 / MASK_GRID;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let onboardStep = 0;
/** 引导内已成功设置城市（引导第 1 步"完成练习"的前置条件） */
let obCityChosen = false;

async function fetchStatus(): Promise<NativeStatusSnapshot> {
  return (await window.damp!.native.status())!;
}

function toast(message: string): void {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2600);
}

function ensureCoins(): void { $('coins').textContent = String(status?.coins ?? 0); }

// ---------- 标签页 ----------

for (const tab of document.querySelectorAll<HTMLButtonElement>('#tabs .tab')) {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${tab.dataset.tab}`));
  });
}

$('win-close').addEventListener('click', () => { void window.damp!.management.command({ action: 'window-close', value: '' }); });
$('win-min').addEventListener('click', () => { void window.damp!.management.command({ action: 'window-minimize', value: '' }); });

// ---------- 窗口内确认对话（不使用原生消息框） ----------

let confirmResolve: ((ok: boolean) => void) | null = null;
function confirmDialog(title: string, text: string, okLabel = '确认'): Promise<boolean> {
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  ($('confirm-ok') as HTMLButtonElement).textContent = okLabel;
  $('confirm-dialog').classList.remove('hidden');
  return new Promise((resolve) => { confirmResolve = resolve; });
}
$('confirm-ok').addEventListener('click', () => { $('confirm-dialog').classList.add('hidden'); confirmResolve?.(true); });
$('confirm-cancel').addEventListener('click', () => { $('confirm-dialog').classList.add('hidden'); confirmResolve?.(false); });

// ---------- 对象列表 ----------

function familyLabel(family: string): string {
  return family === 'damp' ? '受潮' : family === 'mold' ? '霉变' : '焦化';
}

/**
 * 列表状态（优先级：可采摘 > 待护理/部分完成 > 有幼菇 > 已干净）。
 * 干净但带菇的对象也保留在列表中，不会因为没有污渍而消失。
 */
function listStateOf(o: NativeObjectView): { rank: number; label: string; harvest: boolean } {
  if (o.damage?.mushroom === 'mature') return { rank: 0, label: '🍄可采', harvest: true };
  if (o.damage && o.damage.stage > 0) {
    const fam = familyLabel(o.damage.family);
    return o.careProgress > 0
      ? { rank: 1, label: `部分完成·${fam}`, harvest: false }
      : { rank: 1, label: `待护理·${fam}`, harvest: false };
  }
  if (o.damage?.mushroom === 'young') return { rank: 2, label: '有幼菇', harvest: false };
  return { rank: 3, label: '已干净', harvest: false };
}

/** 没有可操作对象时说明实际原因（不只给空白页） */
function emptyReason(): string {
  if (!status) return '正在读取状态…';
  if (status.restored) return '桌面已还原并暂停，点设置里的"继续游戏"恢复。';
  if (status.initStatus === 'not-generated') return '首批尚未开始：等待有效天气后，最久未动的对象会开始变化。';
  if (status.initStatus === 'active') return '首批进行中：完成后这里会列出受影响的对象。';
  if (status.restored) return '桌面外观已还原。点击设置中的“继续游戏”后恢复。';
  return '当前没有受影响的对象。';
}

function renderList(): void {
  const list = $('object-list');
  list.innerHTML = '';
  const objects = (status?.objects ?? []).filter((o) => o.present);
  const ordered = [...objects].sort((a, b) => listStateOf(a).rank - listStateOf(b).rank || b.lastAdvanceAt - a.lastAdvanceAt);
  const actionable = ordered.some((o) => listStateOf(o).rank <= 2);
  if (!actionable) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = ordered.length === 0 ? emptyReason() : '都收拾好了，桌面很干净。';
    list.appendChild(empty);
    const practiceBtn = document.createElement('button');
    practiceBtn.className = 'primary';
    practiceBtn.style.margin = '8px 0 0';
    practiceBtn.textContent = '练习一下擦拭与采菇';
    practiceBtn.addEventListener('click', openPractice);
    list.appendChild(practiceBtn);
  }
  for (const obj of ordered) {
    const state = listStateOf(obj);
    const item = document.createElement('div');
    item.className = `obj-item${obj.id === currentId ? ' selected' : ''}`;
    item.title = obj.displayName;
    const img = document.createElement('img');
    img.className = 'obj-icon';
    img.src = obj.iconDataUrl || '';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = obj.displayName;
    const flag = document.createElement('span');
    flag.className = 'flag' + (state.harvest ? ' harvest' : '');
    flag.textContent = state.label;
    item.append(img, name, flag);
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.addEventListener('click', () => { selectObject(obj.id); });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectObject(obj.id); }
    });
    list.appendChild(item);
  }
}

// ---------- 污染层（与桌面 ICO 同一材质实现/款式） ----------

const base = $('base-icon') as HTMLImageElement;
const dirt = $('dirt-layer') as HTMLCanvasElement;
const mushroomEl = $('mushroom-layer') as HTMLImageElement;
const dirtCtx = dirt.getContext('2d', { willReadFrequently: true })!;

const MUSHROOM_ASSET: Record<string, string> = {
  oyster: 'round', enoki: 'cluster', shy: 'fan', bolete: 'round', lava: 'fan',
};

function maskToBase64(): string {
  return encodeCareMask(mask);
}

function base64ToMask(value: string): Uint8Array | null {
  return decodeCareMask(value);
}

function clearMask(): void {
  mask = new Uint8Array(new ArrayBuffer(CARE_MASK_CELLS));
}

/**
 * 把掩码表现为污染层上的擦除洞。按格整块填充（4×4px），与 wipeAt 的标记规则配套：
 * 凡与擦除圆相交的格都被标记，因此回放的擦除区域一定覆盖实际擦过的区域，
 * 重开后进度只会相同或更高，不会缩水。
 */
function applyMaskToCanvas(): void {
  dirtCtx.globalCompositeOperation = 'destination-out';
  for (let gy = 0; gy < MASK_GRID; gy += 1) {
    for (let gx = 0; gx < MASK_GRID; gx += 1) {
      if (!mask[gy * MASK_GRID + gx]) continue;
      dirtCtx.fillRect(gx * MASK_CELL, gy * MASK_CELL, MASK_CELL, MASK_CELL);
    }
  }
  dirtCtx.globalCompositeOperation = 'source-over';
}

/**
 * 损伤层 = 材质实际改变了 RGB 的像素。进度只计这些像素被擦掉的比例，
 * 不再按整枚图标的不透明面积计算（图标本身的颜色与轮廓不计入）。
 */
/** 256×256 画布的像素总数（损伤层按像素，不是 64×64 掩码格） */
const CANVAS_PIXELS = 256 * 256;

function buildDamageLayer(pristine: Uint8ClampedArray, damaged: Uint8ClampedArray): Uint8Array {
  const layer = new Uint8Array(CANVAS_PIXELS);
  for (let p = 0; p < CANVAS_PIXELS; p += 1) {
    const i = p * 4;
    if (pristine[i + 3] < 24) continue;
    const delta = Math.abs(damaged[i] - pristine[i]) + Math.abs(damaged[i + 1] - pristine[i + 1]) + Math.abs(damaged[i + 2] - pristine[i + 2]);
    if (delta > 6) layer[p] = 1;
  }
  return layer;
}

function remainingDamage(ctx: CanvasRenderingContext2D, layer: Uint8Array | null): number {
  if (!layer) return 0;
  const sample = ctx.getImageData(0, 0, 256, 256).data;
  let left = 0;
  for (let p = 0; p < CANVAS_PIXELS; p += 1) {
    if (layer[p] && sample[p * 4 + 3] > 24) left += 1;
  }
  return left;
}

function buildDirt(obj: NativeObjectView): void {
  base.src = obj.iconDataUrl || '';
  mushroomEl.classList.add('hidden');
  mushroomEl.src = '';
  dirtCtx.clearRect(0, 0, 256, 256);
  clearMask();
  dirtLayer = null;
  if (!obj.iconDataUrl) return;

  const img = new Image();
  img.onload = () => {
    dirtCtx.clearRect(0, 0, 256, 256);
    if (obj.damage && obj.damage.stage > 0) {
      dirtCtx.drawImage(img, 0, 0, 256, 256);
      const pristine = new Uint8ClampedArray(dirtCtx.getImageData(0, 0, 256, 256).data);
      const imageData = dirtCtx.getImageData(0, 0, 256, 256);
      const type = damageVariant(obj.id, obj.damage.family);
      applyDamageMaterial({ data: imageData.data, width: 256, height: 256, stage: obj.damage.stage as 1 | 2 | 3, type });
      dirtCtx.putImageData(imageData, 0, 0);
      dirtLayer = buildDamageLayer(pristine, imageData.data);
      // 满污渍基准必须在恢复擦除洞之前量取：否则重开窗口会把已保存的
      // 进度重新算成 0%（存档里 62.7%、进度条归 0 的实测缺陷）。
      dirtInitial = Math.max(dirtLayer.reduce((sum, v) => sum + v, 0), 1);
      // 恢复已保存的擦除洞（同一批，不随机）
      const saved = obj.careMask ? base64ToMask(obj.careMask) : null;
      if (saved) { mask = saved; applyMaskToCanvas(); }
    }
    // 蘑菇独立层（清洗不掉菇、擦不到）；空 src 会渲染破图占位符，须隐藏。
    // 13 款新品种用 species 素材目录（成熟/幼菇 256），旧品种沿用 round/cluster/fan 形状。
    if (obj.damage && obj.damage.mushroom !== 'none') {
      const stage = obj.damage.mushroom === 'mature' ? 'mature' : 'bud';
      const species = obj.mushroomSpecies;
      mushroomEl.classList.remove('hidden');
      mushroomEl.src = species && isNewSpeciesId(species)
        ? `./assets/care/species/${species}/${stage}-256.png`
        : `./assets/care/${MUSHROOM_ASSET[species ?? 'oyster'] ?? 'round'}-${stage}.png`;
    }
    updateProgressUi();
  };
  img.src = obj.iconDataUrl;
}

/** 仍留在损伤层上的像素数（只计 dirtLayer 标记的像素，逐像素统计） */
function measureDirt(): number {
  return remainingDamage(dirtCtx, dirtLayer);
}

function currentWipeable(): boolean {
  const obj = status?.objects.find((o) => o.id === currentId);
  return Boolean(obj && obj.damage && obj.damage.stage > 0);
}

function updateProgressUi(): void {
  let pct = 0;
  if (currentWipeable() && dirtInitial > 0) {
    pct = Math.max(0, Math.min(99, Math.round((1 - measureDirt() / dirtInitial) * 100)));
  }
  $('progress-fill').style.width = `${pct}%`;
  $('progress-text').textContent = `${pct}%`;
}

function scrubRadius(): number {
  const owned = status?.owned ?? [];
  return owned.includes('big-sponge') ? 26 : 20; // 大海绵 +30%
}

function canvasPoint(event: PointerEvent): { x: number; y: number } {
  const rect = dirt.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * (256 / rect.width), y: (event.clientY - rect.top) * (256 / rect.height) };
}

/** 写入护理进度与掩码；存档失败时明确提示，不让玩家误以为已保存。 */
function saveProgress(objectId: string, progress: number): Promise<void> {
  return window.damp!.native.careProgress(objectId, progress, maskToBase64()).then((result) => {
    if (!result.ok && result.message?.includes('存档')) toast(result.message);
  });
}

/**
 * 擦除一个圆并记录掩码。格子只要与圆相交就标记（而不是只看格中心），
 * 保证 applyMaskToCanvas 重放时覆盖范围 ⊇ 实际擦过的区域。
 */
function wipeAt(x: number, y: number): void {
  const r = scrubRadius();
  dirtCtx.globalCompositeOperation = 'destination-out';
  dirtCtx.beginPath();
  dirtCtx.arc(x, y, r, 0, Math.PI * 2);
  dirtCtx.fill();
  dirtCtx.globalCompositeOperation = 'source-over';
  const gx0 = Math.max(0, Math.floor((x - r) / MASK_CELL));
  const gx1 = Math.min(MASK_GRID - 1, Math.floor((x + r) / MASK_CELL));
  const gy0 = Math.max(0, Math.floor((y - r) / MASK_CELL));
  const gy1 = Math.min(MASK_GRID - 1, Math.floor((y + r) / MASK_CELL));
  for (let gy = gy0; gy <= gy1; gy += 1) {
    for (let gx = gx0; gx <= gx1; gx += 1) {
      const left = gx * MASK_CELL;
      const top = gy * MASK_CELL;
      const nx = Math.max(left, Math.min(x, left + MASK_CELL));
      const ny = Math.max(top, Math.min(y, top + MASK_CELL));
      if (Math.hypot(nx - x, ny - y) <= r) mask[gy * MASK_GRID + gx] = 1;
    }
  }
}

/** 从上一采样点到当前点按小步补擦：快速拖动不会在采样点之间留下断点。 */
function wipeSegment(from: { x: number; y: number }, to: { x: number; y: number }): void {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(2, scrubRadius() / 3);
  const n = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    wipeAt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
}

let lastPoint: { x: number; y: number } | null = null;
let progressFrame = 0;
/** 进度与画面每帧即时刷新，与存档节流解耦（R6 手感要求）。 */
function scheduleProgressUi(): void {
  if (progressFrame) return;
  progressFrame = requestAnimationFrame(() => { progressFrame = 0; updateProgressUi(); });
}

const wrap = $('canvas-wrap');
wrap.addEventListener('pointerdown', (event) => {
  // care-v2 分层工具接管画布期间，v1 单层擦拭让位（见 care-v2.ts）
  if (wrap.dataset.v2Claimed === '1') return;
  if (!currentWipeable() || currentId === null) return;
  wiping = true;
  try { wrap.setPointerCapture(event.pointerId); } catch { /* 合成指针/指针已释放时不阻断擦拭 */ }
  const p = canvasPoint(event);
  lastPoint = p;
  wipeAt(p.x, p.y);
  scheduleProgressUi();
});
wrap.addEventListener('pointermove', (event) => {
  if (!wiping) return;
  const p = canvasPoint(event);
  wipeSegment(lastPoint ?? p, p);
  lastPoint = p;
  scheduleProgressUi();
  const now = Date.now();
  if (now - lastSaved > 1200 && currentId !== null) {
    lastSaved = now;
    const progress = Math.max(0, Math.min(0.98, 1 - measureDirt() / dirtInitial));
    void saveProgress(currentId, progress);
  }
});
const endWipe = () => {
  if (!wiping) return;
  wiping = false;
  lastPoint = null;
  // 没有可擦损伤层（图标未就绪或已干净）时不计算进度，避免误判为完成
  if (currentId === null || dirtLayer === null) return;
  const fraction = 1 - measureDirt() / dirtInitial;
  void saveProgress(currentId, Math.max(0, Math.min(0.98, fraction)));
  updateProgressUi(); // 松手立即落到最终值，不等下一次节流刷新
  if (fraction >= 0.9) void finishCare(false); // 最后少量残渍自动收尾
};
wrap.addEventListener('pointerup', endWipe);
wrap.addEventListener('pointercancel', endWipe);
wrap.addEventListener('pointerleave', () => { if (wiping) endWipe(); });
// 失焦、隐藏立即停工具（R6：松手、失焦、切换对象、关窗时停止；进度按已擦部分保存）
window.addEventListener('blur', () => endWipe());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') endWipe(); });

/** 完成护理后自然引向下一个仍需处理的对象（待护理/部分完成/有菇），没有则停在原地。 */
function advanceToNextObject(fromId: string | null): void {
  const next = (status?.objects ?? [])
    .filter((o) => o.present && o.id !== fromId && listStateOf(o).rank <= 2)
    .sort((a, b) => listStateOf(a).rank - listStateOf(b).rank || b.lastAdvanceAt - a.lastAdvanceAt)[0];
  if (next) selectObject(next.id);
}

async function finishCare(quick: boolean): Promise<void> {
  if (!currentId) { toast('先在左侧选择一个对象'); return; }
  const finishedId = currentId;
  const result = quick
    ? await window.damp!.native.quickCare(finishedId)
    : await window.damp!.native.careComplete(finishedId);
  toast(result.message ?? (result.ok ? '清理完成' : '清理失败'));
  await reload();
  // 成功后保留完成状态（toast）并引向下一个对象；失败保持当前对象不变
  if (result.ok && !wiping) advanceToNextObject(finishedId);
}

$('btn-quick').addEventListener('click', () => void finishCare(true));

let harvesting = false;
$('btn-harvest').addEventListener('click', async () => {
  if (!currentId) { toast('先在左侧选择一个对象'); return; }
  // 重复点击只结算一次：请求未返回前拒绝再次提交
  if (harvesting) return;
  harvesting = true;
  const harvestedId = currentId;
  const knownSpecies = new Set(Object.keys(status?.collection ?? {}));
  try {
    const result = await window.damp!.native.harvest(harvestedId);
    if (!result.ok) { toast(result.message ?? '暂无可采的菇'); await reload(); return; }
    // 菇离开对象的短动画，动画结束后再刷新，避免重建画布打断动效
    mushroomEl.classList.add('leaving');
    $('coins').classList.remove('bump');
    void $('coins').offsetWidth;
    $('coins').classList.add('bump');
    await new Promise((resolve) => setTimeout(resolve, 360));
    await reload();
    const fresh = Object.keys(status?.collection ?? {}).filter((s) => !knownSpecies.has(s));
    const label = fresh.length > 0 ? `新收藏：${SPECIES_LABEL[fresh[0]] ?? fresh[0]}。` : '';
    toast(`${label}${result.message ?? '已采摘'}`);
  } finally {
    mushroomEl.classList.remove('leaving');
    harvesting = false;
  }
});

function selectObject(id: string): void {
  // 切换对象前先结算当前笔触（进度落盘到原对象，不串到新对象）
  if (wiping) endWipe();
  currentId = id;
  // care-v2 订阅该事件即时刷新工具行（不靠轮询，避免剪刀等工具晚一拍出现）
  document.dispatchEvent(new CustomEvent('care-selection-changed'));
  const obj = status?.objects.find((o) => o.id === id);
  if (!obj) return;
  $('stage-name').textContent = obj.displayName;
  $('stage-name').title = obj.displayName;
  const badge = $('stage-badge');
  if (obj.damage && obj.damage.stage > 0) {
    badge.textContent = `${familyLabel(obj.damage.family)}·${['', '轻', '中', '重'][obj.damage.stage]}`;
    badge.classList.remove('hidden', 'harvest');
  } else if (obj.damage?.mushroom === 'mature') {
    badge.textContent = '成熟菇';
    badge.classList.remove('hidden');
    badge.classList.add('harvest');
  } else {
    badge.classList.add('hidden');
  }
  $('btn-harvest').classList.toggle('hidden', obj.damage?.mushroom !== 'mature');
  $('btn-quick').classList.toggle('hidden', !currentWipeable());
  buildDirt(obj);
  renderList();
}

// ---------- 收藏 ----------

const SPECIES_ASSET: Record<string, string> = { oyster: 'round-mature', enoki: 'cluster-mature', shy: 'fan-bud', bolete: 'round-mature', lava: 'fan-mature' };
const SPECIES_LABEL: Record<string, string> = { oyster: '平菇', enoki: '金针菇', shy: '胆小菇', bolete: '牛肝菌', lava: '熔岩菇' };

/** 收藏展示全部现有品种：已发现显示来源与首次时间，未发现明确标注（不给获取倒计时或掉落承诺）。 */
function renderCollection(): void {
  const grid = $('collection-grid');
  grid.innerHTML = '';
  const found = status?.collection ?? {};
  const discovered = Object.keys(found).length;
  $('collection-empty').classList.toggle('hidden', discovered > 0);
  const summary = document.createElement('div');
  summary.className = 'sub';
  summary.style.gridColumn = '1 / -1';
  summary.textContent = `已发现 ${discovered} / ${Object.keys(SPECIES_LABEL).length} 个品种`;
  grid.appendChild(summary);
  for (const species of Object.keys(SPECIES_LABEL)) {
    const entry = found[species];
    const card = document.createElement('div');
    card.className = entry ? 'card' : 'card undiscovered';
    const img = document.createElement('img');
    img.src = `./assets/care/${SPECIES_ASSET[species] ?? 'round-mature'}.png`;
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = entry ? SPECIES_LABEL[species] : '未发现';
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = entry
      ? `首次获得 ${new Date(entry.firstSeenAt).toLocaleDateString()} · 来自 ${entry.sourceName}`
      : `采到成熟菇后记录（${SPECIES_LABEL[species]}）`;
    card.append(img, title, sub);
    grid.appendChild(card);
  }
}

// ---------- 小铺 ----------

const SHOP_ITEMS = [
  { id: 'big-sponge', name: '大海绵', price: 12, desc: '擦洗范围 +30%，清理更快。', asset: 'sponge-active' },
  { id: 'care-mat', name: '护理垫', price: 8, desc: '立即更换护理台垫子外观。', asset: 'mat' },
];

function renderShop(): void {
  const list = $('shop-list');
  list.innerHTML = '';
  const note = document.querySelector('#page-shop .shop-note');
  if (note) note.textContent = `当前余额 ${status?.coins ?? 0} 菇币。护理工具开局可用；购买立即生效。`;
  for (const item of SHOP_ITEMS) {
    const row = document.createElement('div');
    row.className = 'shop-item';
    const img = document.createElement('img');
    img.src = `./assets/care/${item.asset}.png`;
    const info = document.createElement('div');
    info.className = 'info';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.name;
    const desc = document.createElement('div');
    desc.className = 'sub';
    desc.textContent = item.desc;
    info.append(title, desc);
    const owned = status?.owned.includes(item.id) === true;
    const balance = status?.coins ?? 0;
    const btn = document.createElement('button');
    if (owned) {
      btn.textContent = '已拥有';
      btn.disabled = true;
    } else {
      // 余额不足时仍可点击：由主进程校验并返回原因，界面如实显示，不在前端伪造判定
      btn.textContent = balance < item.price ? `购买（差 ${item.price - balance} 币）` : '购买';
    }
    btn.addEventListener('click', async () => {
      if (balance >= item.price) {
        const ok = await confirmDialog(
          '购买确认',
          `「${item.name}」${item.price} 菇币。购买后余额 ${balance - item.price} 币。`,
          '购买',
        );
        if (!ok) return;
      }
      const result = await window.damp!.native.buy(item.id);
      toast(result.ok ? `已购买 ${item.name}，立即生效` : (result.message ?? '购买失败'));
      await reload();
    });
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = `${item.price} 币`;
    row.append(img, info, price, btn);
    list.appendChild(row);
  }
  $('canvas-wrap').classList.toggle('mat-on', status?.owned.includes('care-mat') === true);
}

// ---------- 设置 ----------

/** 省市级联数据：npm `china-division`（MIT，github.com/modood/Administrative-divisions-of-China），不自行维护区划表。 */
import provinces from 'china-division/dist/provinces.json';
import cities from 'china-division/dist/cities.json';
import areas from 'china-division/dist/areas.json';
import { cityChoicesFor, provinceQuery, type CityChoice, type Division } from '../shared/city-options';

/** 搜索偶发网络抖动时自动补试一次（仅作"市名→坐标"桥接；选择本身走级联，无歧义）。 */
async function searchCityWithRetry(query: string, attempts = 2): Promise<CitySearchResult> {
  let last: CitySearchResult = { ok: false, error: '未发起搜索' };
  for (let i = 0; i < attempts; i += 1) {
    const result = await window.damp!.weather.searchCity(query);
    if (result.ok) return result;
    last = result;
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return last;
}

/** 省+市确定后解析坐标：默认城市直接用内置坐标（零网络）；其余经地理编码桥接（查询词见 shared/city-options）。 */
async function applyCity(provinceName: string, choice: CityChoice, statusEl: HTMLElement | null): Promise<boolean> {
  const report = (text: string): void => { if (statusEl) statusEl.textContent = text; };
  const cityName = choice.label;
  report('正在设置城市…');
  if (cityName === DEFAULT_LOCATION.label) {
    const saved = await window.damp!.native.setLocation({
      cityId: DEFAULT_LOCATION.cityId, label: cityName,
      latitude: DEFAULT_LOCATION.latitude, longitude: DEFAULT_LOCATION.longitude,
    });
    if (saved.ok) { report(`当前：${provinceName} ${cityName}`); await reload(); return true; }
    report(saved.message ?? '设置失败，可重试');
    return false;
  }
  const result = await searchCityWithRetry(choice.query);
  if (!result.ok) { report(`坐标解析失败：${result.error}。可重试。`); return false; }
  const short = provinceQuery(provinceName);
  const matched = result.options.find((o) => {
    if (!o.admin1) return false;
    return o.admin1.includes(short) || short.includes(o.admin1);
  }) ?? result.options[0];
  if (!matched) { report('没有找到该城市的坐标，可重试。'); return false; }
  const saved = await window.damp!.native.setLocation({
    cityId: matched.id, label: cityName,
    latitude: matched.latitude, longitude: matched.longitude,
  });
  if (!saved.ok) { report(saved.message ?? '设置失败，可重试'); return false; }
  report(`当前：${provinceName} ${cityName}`);
  await reload();
  return true;
}

/** 挂载省市级联选择器（设置页与引导复用）。返回卸载函数。 */
function mountCityPicker(root: HTMLElement, statusEl: HTMLElement | null, onPicked: () => void): () => void {
  const provinceSelect = document.createElement('select');
  const citySelect = document.createElement('select');
  const applyBtn = document.createElement('button');
  applyBtn.className = 'primary';
  applyBtn.textContent = '确定';
  provinceSelect.setAttribute('aria-label', '选择省份');
  citySelect.setAttribute('aria-label', '选择城市');
  for (const p of provinces as Division[]) {
    const opt = document.createElement('option');
    opt.value = p.code; opt.textContent = p.name;
    provinceSelect.appendChild(opt);
  }
  let choices: CityChoice[] = [];
  const fillCities = (): void => {
    citySelect.innerHTML = '';
    const province = (provinces as Division[]).find((p) => p.code === provinceSelect.value);
    choices = province ? cityChoicesFor(province, cities as Division[], areas as Division[]) : [];
    for (const c of choices) {
      const opt = document.createElement('option');
      opt.value = c.code; opt.textContent = c.label;
      citySelect.appendChild(opt);
    }
  };
  fillCities();
  provinceSelect.addEventListener('change', fillCities);
  let busy = false;
  const onApply = (): void => {
    if (busy) return;
    const province = (provinces as Division[]).find((p) => p.code === provinceSelect.value);
    const choice = choices.find((c) => c.code === citySelect.value);
    if (!province || !choice) return;
    busy = true;
    void applyCity(province.name, choice, statusEl).then((ok) => { busy = false; if (ok) onPicked(); });
  };
  applyBtn.addEventListener('click', onApply);
  root.append(provinceSelect, citySelect, applyBtn);
  return () => {
    provinceSelect.removeEventListener('change', fillCities);
    applyBtn.removeEventListener('click', onApply);
  };
}

let unmountSettingsPicker: (() => void) | null = null;

$('autostart').addEventListener('change', async (event) => {
  const on = (event.target as HTMLInputElement).checked;
  const result = await window.damp!.native.setAutostart(on);
  if (!result.ok) toast(result.message ?? '系统未接受自启设置');
  (event.target as HTMLInputElement).checked = result.on ?? on;
});

// 0.1.28：用户裁决取消"暂停自然变化"入口；存档残留的 paused 由主进程启动时清除。

$('btn-restore-pause').addEventListener('click', async () => {
  const ok = await confirmDialog('恢复桌面图标并暂停', '将还原全部原生图标并停止自然变化；点"继续游戏"才会恢复存档外观。', '还原并暂停');
  if (!ok) return;
  const result = await window.damp!.native.restoreAndPause();
  toast(result.message ?? '已还原并暂停');
  await reload();
});

$('btn-resume').addEventListener('click', async () => {
  await window.damp!.native.resume();
  toast('已继续游戏，稍后恢复桌面外观');
  await reload();
});

$('btn-quit').addEventListener('click', async () => {
  const ok = await confirmDialog('完全退出', '退出前会先恢复全部原生图标；游戏进度保留，下次启动回显。', '退出');
  if (ok) void window.damp!.app.quit();
});

function renderSettings(): void {
  if (!status) return;
  $('city-status').textContent = status.location ? `当前：${status.location.label}` : '当前：长沙市（内置默认，可在上方更换）';
  $('btn-resume').classList.toggle('hidden', !status.restored);
  void window.damp!.native.getAutostart().then((r) => { ($('autostart') as HTMLInputElement).checked = r.on; });
}

// ---------- 练习样片（R6：可操作练习，不写存档、不碰真实对象/额度/奖励） ----------

const pWrap = $('practice-wrap');
const pBase = $('practice-base') as HTMLImageElement;
const pDirt = $('practice-dirt') as HTMLCanvasElement;
const pMush = $('practice-mushroom') as HTMLImageElement;
const pCtx = pDirt.getContext('2d', { willReadFrequently: true })!;
let pInitial = 1;
let pWiping = false;
let pDone = false;

let pLayer: Uint8Array | null = null;

function updatePracticeUi(): void {
  let pct = 0;
  if (pInitial > 0 && !pDone) pct = Math.max(0, Math.min(99, Math.round((1 - remainingDamage(pCtx, pLayer) / pInitial) * 100)));
  if (pDone) pct = 100;
  $('practice-fill').style.width = `${pct}%`;
  $('practice-text').textContent = pDone ? '已擦净' : `${pct}%`;
}

function openPractice(): void {
  $('practice').classList.remove('hidden');
  pDone = false;
  updatePracticeUi();
  pBase.src = './brand/rain-mushroom.png';
  pMush.classList.remove('hidden');
  pMush.src = './assets/care/round-mature.png';
  ($('btn-practice-harvest') as HTMLButtonElement).disabled = false;
  const img = new Image();
  img.onload = () => {
    pCtx.globalCompositeOperation = 'source-over';
    pCtx.clearRect(0, 0, 256, 256);
    pCtx.drawImage(img, 0, 0, 256, 256);
    const pristine = new Uint8ClampedArray(pCtx.getImageData(0, 0, 256, 256).data);
    const imageData = pCtx.getImageData(0, 0, 256, 256);
    applyDamageMaterial({ data: imageData.data, width: 256, height: 256, stage: 2, type: damageVariant('practice-sample', 'mold') });
    pCtx.putImageData(imageData, 0, 0);
    pLayer = buildDamageLayer(pristine, imageData.data);
    pInitial = Math.max(pLayer.reduce((sum, v) => sum + v, 0), 1);
    updatePracticeUi();
  };
  img.src = './brand/rain-mushroom.png';
}

function practiceCanvasPoint(event: PointerEvent): { x: number; y: number } {
  const rect = pDirt.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * (256 / rect.width), y: (event.clientY - rect.top) * (256 / rect.height) };
}

function wipePracticeAt(x: number, y: number): void {
  pCtx.globalCompositeOperation = 'destination-out';
  pCtx.beginPath();
  pCtx.arc(x, y, 20, 0, Math.PI * 2);
  pCtx.fill();
  pCtx.globalCompositeOperation = 'source-over';
}

const endPracticeWipe = (): void => {
  if (!pWiping) return;
  pWiping = false;
  if (!pDone && pInitial > 0 && 1 - remainingDamage(pCtx, pLayer) / pInitial >= 0.9) {
    // 与真实护理一致：最后少量残渍自动收尾
    pDone = true;
    pCtx.clearRect(0, 0, 256, 256);
  }
  updatePracticeUi();
};

let pLast: { x: number; y: number } | null = null;

pWrap.addEventListener('pointerdown', (event) => {
  if (pDone) return;
  pWiping = true;
  try { pWrap.setPointerCapture(event.pointerId); } catch { /* 同上 */ }
  const p = practiceCanvasPoint(event);
  pLast = p;
  wipePracticeAt(p.x, p.y);
});
pWrap.addEventListener('pointermove', (event) => {
  if (!pWiping || pDone) return;
  const p = practiceCanvasPoint(event);
  // 与正式护理相同：沿路径补擦，快速拖动不留断点
  const from = pLast ?? p;
  const n = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / 6));
  for (let i = 1; i <= n; i += 1) {
    wipePracticeAt(from.x + ((p.x - from.x) * i) / n, from.y + ((p.y - from.y) * i) / n);
  }
  pLast = p;
  updatePracticeUi();
});
const endPracticeStroke = (): void => { pLast = null; endPracticeWipe(); };
pWrap.addEventListener('pointerup', endPracticeStroke);
pWrap.addEventListener('pointercancel', endPracticeStroke);
pWrap.addEventListener('pointerleave', () => { if (pWiping) endPracticeStroke(); });
window.addEventListener('blur', () => endPracticeStroke());

$('btn-practice-harvest').addEventListener('click', () => {
  if (pMush.classList.contains('hidden')) return;
  pMush.classList.add('hidden');
  ($('btn-practice-harvest') as HTMLButtonElement).disabled = true;
  toast('练习采摘完成（练习不产菇币）');
});
$('practice-close').addEventListener('click', () => { $('practice').classList.add('hidden'); });

// ---------- 引导（R6：城市 → 首批摘要 → 练习/奖励，只发一次） ----------

function renderOnboarding(): void {
  if (!status || status.onboarded) { $('onboarding').classList.add('hidden'); return; }
  $('onboarding').classList.remove('hidden');
  const body = $('ob-body');
  if (onboardStep === 0) {
    body.innerHTML = `<h2>欢迎来到回南天</h2>
      <p>真实天气会让桌面上的文件夹和快捷方式慢慢受潮、发霉、发焦。清理它们、采收蘑菇，换点装备。</p>
      <p>选择所在省份和城市；不选也可以，默认用长沙的天气，随时能在设置里换：</p>
      <div id="ob-picker" class="row city-picker"></div>`;
    mountCityPicker(document.getElementById('ob-picker')!, null, () => { obCityChosen = true; });
    $('ob-next').textContent = '下一步';
  } else if (onboardStep === 1) {
    body.innerHTML = `<h2>首批变化状态</h2><div class="summary">${initSummaryText()}</div>
      <p class="muted">天气就绪后，最久未动的几个对象会开始变化。断网也不会丢进度。</p>`;
    $('ob-next').textContent = '去练习';
  } else if (onboardStep === 2) {
    body.innerHTML = `<h2>试一试护理动作</h2>
      <p>在练习样片上按住拖动擦掉霉渍、采摘成熟菇。练习只是样片，随时可以直接完成。</p>
      <button id="ob-practice-open" class="primary">打开练习样片</button>`;
    document.getElementById('ob-practice-open')?.addEventListener('click', openPractice);
    $('ob-next').textContent = '完成练习';
  } else {
    body.innerHTML = `<h2>准备好了</h2><p>奖励已到账，去挑一件工具吧（可选）。</p>`;
    $('ob-next').textContent = '开始游玩';
  }
}

function initSummaryText(): string {
  if (!status) return '';
  if (!status.location) return '使用内置默认天气（长沙），可在设置中更换城市';
  if (status.initStatus === 'not-generated') return '首批待天气：联网取得有效天气后开始';
  if (status.initStatus === 'active') return `首批进行中（${status.initProgress || '等待中'}）`;
  if (status.initStatus === 'legacy-initialized') return '老玩家已初始化，直接进入日常节奏';
  if (status.todayStatus === 'init_occupied') return '首批已完成（今日由首批占用）';
  return `首批已完成（${status.initProgress}）`;
}

$('ob-next').addEventListener('click', async () => {
  if (onboardStep >= 3) {
    await window.damp!.native.onboardingDone();
    $('onboarding').classList.add('hidden');
    await reload();
    return;
  }
  if (onboardStep === 2) await window.damp!.native.onboardingDone();
  onboardStep += 1;
  renderOnboarding();
  if (onboardStep === 3) { const s = await fetchStatus(); status = s; ensureCoins(); }
});
$('ob-skip').addEventListener('click', async () => {
  await window.damp!.native.onboardingDone();
  $('onboarding').classList.add('hidden');
  await reload();
});

// ---------- 装配 ----------

function renderAll(): void {
  ensureCoins();
  renderList();
  renderCollection();
  renderShop();
  renderSettings();
  renderOnboarding();
  if (currentId) selectObject(currentId);
  else {
    // 未选中对象时不展示动作按钮（此前"快速处理"可见可点却静默无操作）
    $('btn-quick').classList.add('hidden');
    $('btn-harvest').classList.add('hidden');
  }
}

async function reload(): Promise<void> {
  status = await fetchStatus();
  renderAll();
}

// 关闭=隐藏到托盘，DOM 会滞留旧状态；从托盘唤回时立即同步（INIT/DAILY
// 在主进程发生，页面不重开也要跟上）。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !wiping) void reload();
});
// 打开期间轻量轮询兜底；正在擦拭时不刷新，避免重建画布打断手势
setInterval(() => {
  if (document.visibilityState === 'visible' && !wiping) void reload();
}, 60_000);

// 设置页级联选择器只挂载一次：60 秒轮询的 renderAll 不得重建下拉框
// （否则用户选到一半的省份/城市会被重置）。
mountCityPicker($('city-picker'), $('city-status'), () => { /* applyCity 内已 reload */ });

void reload().finally(() => { $('boot-splash')?.remove(); });

// ---------- care-v2 桥接（分层工具/墙面页/图鉴；见 care-v2.ts） ----------
// v2 通道可用时 care-v2.ts 接管分层护理与新增页面；不可用时一切照旧。
(window as unknown as Record<string, unknown>).__careBridge = {
  getSelectedId: () => currentId,
  getStatus: () => status,
  reload,
  toast,
  advanceToNextObject,
  setV2Claimed: (claimed: boolean) => { wrap.dataset.v2Claimed = claimed ? '1' : '0'; },
};
