/**
 * 护理台页面（Goal v9 修复轮）：雨天玻璃外壳 + 认可材质同源污染层。
 * 污染层与桌面 ICO 用同一 shared/material/effects 实现、同一款式派生（对象 ID 稳定）；
 * 擦拭只作用于污染层（原图/蘑菇不受影响）；64×64 掩码持久化，重开还原同一批擦除洞。
 */
import { applyDamageMaterial, damageVariant } from '../shared/material/effects';
import type { NativeObjectView, NativeStatusSnapshot } from '../shared/types/native-status';

let status: NativeStatusSnapshot | null = null;
let currentId: string | null = null;
let wiping = false;
let lastSaved = 0;
let dirtInitial = 1;
/** 64×64 擦拭掩码（本地工作副本，节流持久化） */
let mask: Uint8Array = new Uint8Array(new ArrayBuffer(64 * 64));
const MASK_GRID = 64;
const MASK_CELL = 256 / MASK_GRID;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let onboardStep = 0;

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

function renderList(): void {
  const list = $('object-list');
  list.innerHTML = '';
  const objects = status?.objects ?? [];
  const affected = objects.filter((o) => o.present && (o.damage === null || o.damage.stage > 0 || o.damage.mushroom === 'mature'));
  const dirty = affected.filter((o) => o.damage && o.damage.stage > 0);
  const clean = affected.filter((o) => !o.damage || o.damage.stage === 0);
  const ordered = [...dirty, ...clean];
  if (ordered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '都收拾好了，桌面很干净。';
    list.appendChild(empty);
  }
  for (const obj of ordered) {
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
    flag.className = 'flag' + (obj.damage?.mushroom === 'mature' ? ' harvest' : '');
    if (obj.damage?.mushroom === 'mature') flag.textContent = '🍄可采';
    else if (obj.damage && obj.damage.stage > 0) flag.textContent = familyLabel(obj.damage.family);
    item.append(img, name, flag);
    item.addEventListener('click', () => { selectObject(obj.id); });
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
  let binary = '';
  for (let i = 0; i < mask.length; i += 1) binary += mask[i] ? '1' : '0';
  // 8 位一组转 base64
  let out = '';
  for (let i = 0; i < 64; i += 1) out += String.fromCharCode(parseInt(binary.slice(i * 8, i * 8 + 8), 2));
  return btoa(out);
}

function base64ToMask(value: string): Uint8Array | null {
  try {
    const bytes = atob(value);
    if (bytes.length !== 64) return null;
    const out = new Uint8Array(new ArrayBuffer(4096));
    for (let i = 0; i < 64; i += 1) {
      const byte = bytes.charCodeAt(i);
      for (let b = 0; b < 8; b += 1) out[i * 8 + b] = (byte >> (7 - b)) & 1;
    }
    return out;
  } catch {
    return null;
  }
}

function clearMask(): void {
  mask = new Uint8Array(new ArrayBuffer(64 * 64));
}

/** 把掩码表现为污染层上的擦除洞（每格 4×4px，圆角近似） */
function applyMaskToCanvas(): void {
  dirtCtx.globalCompositeOperation = 'destination-out';
  for (let gy = 0; gy < MASK_GRID; gy += 1) {
    for (let gx = 0; gx < MASK_GRID; gx += 1) {
      if (!mask[gy * MASK_GRID + gx]) continue;
      dirtCtx.beginPath();
      dirtCtx.arc(gx * MASK_CELL + MASK_CELL / 2, gy * MASK_CELL + MASK_CELL / 2, MASK_CELL * 0.62, 0, Math.PI * 2);
      dirtCtx.fill();
    }
  }
  dirtCtx.globalCompositeOperation = 'source-over';
}

function buildDirt(obj: NativeObjectView): void {
  base.src = obj.iconDataUrl || '';
  mushroomEl.src = '';
  dirtCtx.clearRect(0, 0, 256, 256);
  clearMask();
  if (!obj.iconDataUrl) return;

  const img = new Image();
  img.onload = () => {
    dirtCtx.clearRect(0, 0, 256, 256);
    if (obj.damage && obj.damage.stage > 0) {
      dirtCtx.drawImage(img, 0, 0, 256, 256);
      const imageData = dirtCtx.getImageData(0, 0, 256, 256);
      const type = damageVariant(obj.id, obj.damage.family);
      applyDamageMaterial({ data: imageData.data, width: 256, height: 256, stage: obj.damage.stage as 1 | 2 | 3, type });
      dirtCtx.putImageData(imageData, 0, 0);
      // 恢复已保存的擦除洞（同一批，不随机）
      const saved = obj.careMask ? base64ToMask(obj.careMask) : null;
      if (saved) { mask = saved; applyMaskToCanvas(); }
    }
    // 蘑菇独立层（清洗不掉菇、擦不到）
    if (obj.damage && obj.damage.mushroom !== 'none') {
      const shape = MUSHROOM_ASSET[obj.mushroomSpecies ?? 'oyster'] ?? 'round';
      mushroomEl.src = `./assets/care/${shape}-${obj.damage.mushroom === 'mature' ? 'mature' : 'bud'}.png`;
    }
    dirtInitial = Math.max(measureDirt(), 1);
    updateProgressUi();
  };
  img.src = obj.iconDataUrl;
}

function measureDirt(): number {
  const sample = dirtCtx.getImageData(0, 0, 256, 256).data;
  let opaque = 0;
  for (let i = 3; i < sample.length; i += 4 * 16) { if (sample[i] > 24) opaque += 1; }
  return opaque;
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

function wipeAt(x: number, y: number): void {
  dirtCtx.globalCompositeOperation = 'destination-out';
  dirtCtx.beginPath();
  dirtCtx.arc(x, y, scrubRadius(), 0, Math.PI * 2);
  dirtCtx.fill();
  dirtCtx.globalCompositeOperation = 'source-over';
  // 记录掩码格
  const gx0 = Math.max(0, Math.floor((x - scrubRadius()) / MASK_CELL));
  const gx1 = Math.min(MASK_GRID - 1, Math.floor((x + scrubRadius()) / MASK_CELL));
  const gy0 = Math.max(0, Math.floor((y - scrubRadius()) / MASK_CELL));
  const gy1 = Math.min(MASK_GRID - 1, Math.floor((y + scrubRadius()) / MASK_CELL));
  for (let gy = gy0; gy <= gy1; gy += 1) {
    for (let gx = gx0; gx <= gx1; gx += 1) {
      const cx = gx * MASK_CELL + MASK_CELL / 2;
      const cy = gy * MASK_CELL + MASK_CELL / 2;
      if (Math.hypot(cx - x, cy - y) <= scrubRadius()) mask[gy * MASK_GRID + gx] = 1;
    }
  }
}

const wrap = $('canvas-wrap');
wrap.addEventListener('pointerdown', (event) => {
  if (!currentWipeable()) return;
  wiping = true;
  wrap.setPointerCapture(event.pointerId);
  const p = canvasPoint(event);
  wipeAt(p.x, p.y);
});
wrap.addEventListener('pointermove', (event) => {
  if (!wiping) return;
  const p = canvasPoint(event);
  wipeAt(p.x, p.y);
  const now = Date.now();
  if (now - lastSaved > 1200) {
    lastSaved = now;
    const progress = Math.max(0, Math.min(0.98, 1 - measureDirt() / dirtInitial));
    void window.damp!.native.careProgress(currentId!, progress, maskToBase64());
    updateProgressUi();
  }
});
const endWipe = () => {
  if (!wiping) return;
  wiping = false;
  const fraction = 1 - measureDirt() / dirtInitial;
  void window.damp!.native.careProgress(currentId!, Math.max(0, Math.min(0.98, fraction)), maskToBase64());
  if (fraction >= 0.9) void finishCare(false); // 最后少量残渍自动收尾
};
wrap.addEventListener('pointerup', endWipe);
wrap.addEventListener('pointercancel', endWipe);
wrap.addEventListener('pointerleave', () => { if (wiping) endWipe(); });

async function finishCare(quick: boolean): Promise<void> {
  if (!currentId) return;
  const result = quick
    ? await window.damp!.native.quickCare(currentId)
    : await window.damp!.native.careComplete(currentId);
  if (result.ok) toast(result.message ?? '清理完成');
  else if (result.message) toast(result.message);
  await reload();
}

$('btn-quick').addEventListener('click', () => void finishCare(true));
$('btn-harvest').addEventListener('click', async () => {
  if (!currentId) return;
  const result = await window.damp!.native.harvest(currentId);
  toast(result.ok ? (result.message ?? '已采摘') : (result.message ?? '暂无可采的菇'));
  await reload();
});

function selectObject(id: string): void {
  currentId = id;
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

function renderCollection(): void {
  const grid = $('collection-grid');
  grid.innerHTML = '';
  const entries = Object.values(status?.collection ?? {});
  $('collection-empty').classList.toggle('hidden', entries.length > 0);
  for (const entry of entries) {
    const card = document.createElement('div');
    card.className = 'card';
    const img = document.createElement('img');
    img.src = `./assets/care/${SPECIES_ASSET[entry.species] ?? 'round-mature'}.png`;
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = SPECIES_LABEL[entry.species] ?? entry.species;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = `首次获得 ${new Date(entry.firstSeenAt).toLocaleDateString()} · 来自 ${entry.sourceName}`;
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
    const owned = status?.owned.includes(item.id);
    const btn = document.createElement('button');
    btn.textContent = owned ? '已拥有' : `${item.price} 币购买`;
    if (owned) btn.disabled = true;
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog('购买确认', `花 ${item.price} 菇币购买「${item.name}」？`, '购买');
      if (!ok) return;
      const result = await window.damp!.native.buy(item.id);
      toast(result.ok ? `已购买 ${item.name}` : (result.message ?? '购买失败'));
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

async function searchCity(): Promise<void> {
  const query = ($('city-input') as HTMLInputElement).value.trim();
  const box = $('city-results');
  box.innerHTML = '';
  if (!query) return;
  const result = await window.damp!.weather.searchCity(query);
  if (!result.ok) {
    const err = document.createElement('div');
    err.className = 'muted';
    err.textContent = `搜索失败：${result.error}。可重试。`;
    box.appendChild(err);
    return;
  }
  if (result.options.length === 0) {
    const none = document.createElement('div');
    none.className = 'muted';
    none.textContent = '没有找到该城市，请换个名字。';
    box.appendChild(none);
    return;
  }
  for (const option of result.options) {
    const btn = document.createElement('button');
    btn.className = 'city-opt';
    btn.textContent = [option.name, option.admin1, option.country].filter(Boolean).join(' · ');
    btn.addEventListener('click', async () => {
      const saved = await window.damp!.native.setLocation({ cityId: option.id, label: option.name, latitude: option.latitude, longitude: option.longitude });
      toast(saved.ok ? `城市已设为 ${option.name}，等待有效天气后开始` : (saved.message ?? '设置失败'));
      await refreshStatusOnly();
    });
    box.appendChild(btn);
  }
}
$('city-search').addEventListener('click', () => void searchCity());
$('city-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') void searchCity(); });

$('autostart').addEventListener('change', async (event) => {
  const on = (event.target as HTMLInputElement).checked;
  const result = await window.damp!.native.setAutostart(on);
  if (!result.ok) toast(result.message ?? '系统未接受自启设置');
  (event.target as HTMLInputElement).checked = result.on ?? on;
});

$('pause-toggle').addEventListener('change', async (event) => {
  const paused = (event.target as HTMLInputElement).checked;
  const result = await window.damp!.native.setPaused(paused);
  if (result.ok) toast(paused ? '已暂停自然变化' : '已继续');
});

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
  ($('city-input') as HTMLInputElement).placeholder = status.location ? `当前：${status.location.label}` : '输入城市名，如：杭州';
  $('btn-resume').classList.toggle('hidden', !status.restored);
  ($('pause-toggle') as HTMLInputElement).checked = status.paused;
  void window.damp!.native.getAutostart().then((r) => { ($('autostart') as HTMLInputElement).checked = r.on; });
}

// ---------- 引导（R6：城市 → 首批摘要 → 练习/奖励，只发一次） ----------

function renderOnboarding(): void {
  if (!status || status.onboarded) { $('onboarding').classList.add('hidden'); return; }
  $('onboarding').classList.remove('hidden');
  const body = $('ob-body');
  if (onboardStep === 0) {
    body.innerHTML = `<h2>欢迎来到回南天</h2>
      <p>真实天气会让桌面上的文件夹和快捷方式慢慢受潮、发霉、发焦。清理它们、采收蘑菇，换点装备。</p>
      <p>先选一个城市，天气从这里来：</p>`;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'ob-city';
    input.placeholder = '输入城市名';
    const results = document.createElement('div');
    results.className = 'city-results';
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void obSearch(input, results); });
    const search = document.createElement('button');
    search.textContent = '搜索';
    search.addEventListener('click', () => void obSearch(input, results));
    const row = document.createElement('div');
    row.className = 'row';
    row.append(input, search);
    body.append(row, results);
    $('ob-next').textContent = '下一步';
  } else if (onboardStep === 1) {
    body.innerHTML = `<h2>首批变化状态</h2><div class="summary">${initSummaryText()}</div>
      <p class="muted">城市有效天气到达后，最久未动的几个对象会开始变化。断网也不会丢进度。</p>`;
    $('ob-next').textContent = '完成练习';
  } else {
    body.innerHTML = `<h2>准备好了</h2><p>奖励已到账，去挑一件工具吧（可选）。</p>`;
    $('ob-next').textContent = '开始游玩';
  }
}

function initSummaryText(): string {
  if (!status) return '';
  if (!status.location) return '未选地点 → 选择城市后开始';
  if (status.initStatus === 'not-generated') return '首批待天气：联网取得有效天气后开始';
  if (status.initStatus === 'active') return `首批进行中（${status.initProgress || '等待中'}）`;
  if (status.initStatus === 'legacy-initialized') return '老玩家已初始化，直接进入日常节奏';
  if (status.todayStatus === 'init_occupied') return '首批已完成（今日由首批占用）';
  return `首批已完成（${status.initProgress}）`;
}

async function obSearch(input: HTMLInputElement, results: HTMLElement): Promise<void> {
  const query = input.value.trim();
  if (!query) return;
  const result = await window.damp!.weather.searchCity(query);
  results.innerHTML = '';
  if (!result.ok || result.options.length === 0) {
    results.innerHTML = `<div class="muted">${result.ok ? '没有找到该城市' : '搜索失败，可重试'}</div>`;
    return;
  }
  for (const option of result.options) {
    const btn = document.createElement('button');
    btn.className = 'city-opt';
    btn.textContent = [option.name, option.admin1, option.country].filter(Boolean).join(' · ');
    btn.addEventListener('click', async () => {
      await window.damp!.native.setLocation({ cityId: option.id, label: option.name, latitude: option.latitude, longitude: option.longitude });
      input.value = option.name;
      results.innerHTML = `<div class="muted">已选 ${option.name}，等天气到达后开始首批。</div>`;
    });
    results.appendChild(btn);
  }
}

$('ob-next').addEventListener('click', async () => {
  if (onboardStep >= 2) {
    await window.damp!.native.onboardingDone();
    $('onboarding').classList.add('hidden');
    await reload();
    return;
  }
  if (onboardStep === 1) await window.damp!.native.onboardingDone();
  onboardStep += 1;
  renderOnboarding();
  if (onboardStep === 2) { const s = await fetchStatus(); status = s; ensureCoins(); }
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
}

async function refreshStatusOnly(): Promise<void> {
  status = await fetchStatus();
  renderAll();
}

async function reload(): Promise<void> {
  status = await fetchStatus();
  renderAll();
}

void reload().finally(() => { $('boot-splash')?.remove(); });
