/**
 * care-v2：分层护理工具、剪刀采摘、孢子播种、今日菌讯、图鉴与墙面页（Task 7/8/9/10/11/15 UI 层）
 *
 * 挂载条件（特性探测）：window.damp.native.careProgressV2 与 window.damp.wallpaper 存在。
 * 生产 preload 尚未接线时本模块完全不起作用，护理台行为与 v1.14 一致。
 * 领域规则一律调用 shared/world 纯函数；本模块只做手势几何、视觉反馈与接口调用。
 */
import {
  CARE_TOOLS, toolLayerRule, type CareToolDef,
} from '../shared/care-tools';
import { AUTO_FINISH_THRESHOLD, CARE_LAYER_INFO } from '../shared/care-layers';
import {
  applyToolStroke, autoFinishLayer, createCareSession, sessionTotalProgress,
  strokeCells, validateCareSession, type StrokeGeometry,
} from '../shared/care-session';
import { SPECIES_CATALOG, catalogOrder, isLegacySpecies } from '../shared/species/species-catalog';
import { discoveryHint, objectMessage } from '../shared/species/species-text';
import { applyWipe, wipeProgress } from '../shared/wallpaper/mask';
import type {
  CareLayerId, CareSessionState, CareToolId, NewSpeciesId, SpeciesId, WallpaperView,
} from '../shared/types/gameplay';
import { isSpeciesId } from '../shared/types/gameplay';
import type { NativeStatusSnapshot, NativeObjectView } from '../shared/types/native-status';
import type { NativeStatusV4Fields, NativeObjectViewV4Fields } from '../shared/types/gameplay';

type StatusSnap = NativeStatusSnapshot & NativeStatusV4Fields;
type ObjectSnap = NativeObjectView & NativeObjectViewV4Fields;

interface CareBridge {
  getSelectedId(): string | null;
  getStatus(): StatusSnap | null;
  reload(): Promise<void>;
  toast(message: string): void;
  advanceToNextObject(fromId: string | null): void;
  setV2Claimed(claimed: boolean): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺元素 #${id}`);
  return el as T;
};

function bridge(): CareBridge | null {
  return (window as unknown as { __careBridge?: CareBridge }).__careBridge ?? null;
}

function dampV2(): NonNullable<typeof window.damp> | null {
  const damp = window.damp;
  if (!damp || !damp.native.careProgressV2 || !damp.wallpaper) return null;
  return damp;
}

if (!window.damp || !window.damp.native.careProgressV2 || !window.damp.wallpaper) {
  // 生产构建（preload 未接线）：不注册任何行为
  console.info('[care-v2] v2 通道不可用，保持 v1.14 界面');
} else {
  void start();
}

async function start(): Promise<void> {
  const damp = dampV2()!;
  // 等待 care.ts 装配桥接
  for (let i = 0; i < 100 && !bridge(); i += 1) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const b = bridge();
  if (!b) return;

  // ---------- 状态 ----------
  let status: StatusSnap | null = null;
  let selectedId: string | null = null;
  let activeTool: CareToolId | null = null;
  let session: CareSessionState | null = null;
  let claimed = false;
  /** 64×64 损伤足迹（选中时从脏层画布量得）；进度分母 */
  let footprint = new Set<number>();
  let held = false;
  let holdTimer: number | null = null;
  let drawing = false;
  let drawPoints: Array<{ x: number; y: number }> = [];
  let highlightOn = false;
  let cutting = false;
  let cutPoints: Array<{ x: number; y: number }> = [];
  let wallEnabled = false;
  let wallMask: string | undefined;
  let wallDrawing = false;
  let wallDirty = false;

  const wrap = $('canvas-wrap');
  const dirt = $<HTMLCanvasElement>('dirt-layer');
  const dirtCtx = dirt.getContext('2d')!;
  const softenCanvas = $<HTMLCanvasElement>('soften-layer');
  const softenCtx = softenCanvas.getContext('2d')!;
  const highlightCanvas = $<HTMLCanvasElement>('highlight-layer');
  const highlightCtx = highlightCanvas.getContext('2d')!;
  const v2Row = $('v2-tool-row');

  // ---------- 工具行 ----------

  function toolsFor(obj: ObjectSnap | null): CareToolDef[] {
    if (!obj?.damage || obj.damage.stage === 0) return [];
    const family = obj.damage.family;
    const layers: CareLayerId[] = family === 'damp' ? ['droplets', 'film'] : family === 'mold' ? ['mold'] : ['soot', 'scorch'];
    const active = layers.slice(0, obj.damage.stage >= 2 ? layers.length : 1);
    return Object.values(CARE_TOOLS).filter((tool) => {
      if (tool.harvest) return obj.damage!.mushroom === 'mature';
      return active.some((layer) => {
        const rule = tool.layers[layer];
        return rule ? rule.clear > 0 || rule.softenOnly === true : tool.universal === true;
      });
    });
  }

  function renderToolRow(): void {
    const obj = currentObject();
    const tools = toolsFor(obj);
    v2Row.classList.toggle('hidden', tools.length === 0);
    v2Row.innerHTML = '';
    for (const tool of tools) {
      const btn = document.createElement('button');
      btn.className = `tool v2-tool${tool.id === activeTool ? ' active' : ''}`;
      btn.dataset.tool = tool.id;
      btn.title = `${tool.nameZh}（${gestureLabel(tool)}）：${tool.hint}`;
      btn.textContent = tool.nameZh;
      btn.addEventListener('click', () => { void selectTool(tool.id); });
      v2Row.append(btn);
    }
  }

  function gestureLabel(tool: CareToolDef): string {
    return { drag: '按住拖动', tap: '点按', strip: '长条拖动', hold: '按住持续', roll: '沿焦痕滚动', cut: '沿菌柄剪' }[tool.gesture];
  }

  function currentObject(): ObjectSnap | null {
    if (!status || selectedId === null) return null;
    return status.objects.find((o) => o.id === selectedId) ?? null;
  }

  async function selectTool(toolId: CareToolId): Promise<void> {
    if (claimed) await releaseClaim(true);
    activeTool = toolId;
    const obj = currentObject();
    if (!obj?.damage) { renderToolRow(); return; }
    if (toolId === 'scissors') {
      // 剪刀：独占画布手势，不建护理会话
      claim();
      wrap.style.cursor = 'crosshair';
      renderToolRow();
      b!.toast('剪刀：沿菌柄按住拖动剪下成熟菇');
      return;
    }
    session = await ensureSession(obj);
    claim();
    wrap.style.cursor = toolId === 'blower' ? 'cell' : 'crosshair';
    renderToolRow();
    redrawSoften();
    updateProgressUi();
  }

  function claim(): void {
    if (!claimed) {
      claimed = true;
      b!.setV2Claimed(true);
    }
  }

  async function releaseClaim(submit: boolean): Promise<void> {
    if (holdTimer !== null) { clearInterval(holdTimer); holdTimer = null; }
    held = false;
    drawing = false;
    cutting = false;
    wrap.style.cursor = '';
    if (claimed) {
      claimed = false;
      b!.setV2Claimed(false);
    }
    if (submit) await submitSession();
    activeTool = null;
    renderToolRow();
  }

  async function ensureSession(obj: ObjectSnap): Promise<CareSessionState> {
    if (obj.careSession) {
      const validated = validateCareSession(obj.careSession);
      if (validated && validated.family === obj.damage!.family && validated.stage === obj.damage!.stage) {
        return validated;
      }
    }
    return createCareSession(obj.damage!.family, obj.damage!.stage);
  }

  // ---------- 损伤足迹与进度 ----------

  function measureFootprint(): void {
    footprint = new Set<number>();
    const image = dirtCtx.getImageData(0, 0, 256, 256).data;
    for (let gy = 0; gy < 64; gy += 1) {
      for (let gx = 0; gx < 64; gx += 1) {
        let hit = false;
        for (let py = gy * 4; py < gy * 4 + 4 && !hit; py += 1) {
          for (let px = gx * 4; px < gx * 4 + 4; px += 1) {
            if (image[(py * 256 + px) * 4 + 3] > 24) { hit = true; break; }
          }
        }
        if (hit) footprint.add(gy * 64 + gx);
      }
    }
  }

  function damageCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const layer of session?.layers ?? []) counts[layer.layer] = Math.max(1, footprint.size);
    return counts;
  }

  function updateProgressUi(): void {
    if (!session) return;
    const pct = Math.round(sessionTotalProgress(session, damageCounts()) * 100);
    $('progress-fill').style.width = `${pct}%`;
    $('progress-text').textContent = `${pct}%`;
  }

  // ---------- 手势 ----------

  function canvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = dirt.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (256 / rect.width), y: (event.clientY - rect.top) * (256 / rect.height) };
  }

  function applyCells(cells: readonly number[]): void {
    if (!session || !activeTool) return;
    const counts = damageCounts();
    const before = sessionTotalProgress(session, counts);
    session = applyToolStroke(session, activeTool, cells, counts);
    for (const cell of cells) {
      const gx = cell % 64;
      const gy = Math.floor(cell / 64);
      erodeCell(gx, gy);
    }
    if (sessionTotalProgress(session, counts) > before) updateProgressUi();
    redrawSoften();
    if (highlightOn) drawHighlight();
  }

  function erodeCell(gx: number, gy: number): void {
    dirtCtx.globalCompositeOperation = 'destination-out';
    dirtCtx.fillRect(gx * 4, gy * 4, 4, 4);
    dirtCtx.globalCompositeOperation = 'source-over';
  }

  function redrawSoften(): void {
    softenCtx.clearRect(0, 0, 256, 256);
    const moldLayer = session?.layers.find((l) => l.layer === 'mold');
    if (!moldLayer?.softened) return;
    softenCtx.fillStyle = 'rgba(140, 220, 180, 0.35)';
    for (const cell of decodeCells(moldLayer.softened)) {
      if (!clearedOf('mold', cell)) softenCtx.fillRect((cell % 64) * 4, Math.floor(cell / 64) * 4, 4, 4);
    }
  }

  function decodeCells(maskBase64: string): number[] {
    const cells: number[] = [];
    try {
      const binary = atob(maskBase64);
      for (let i = 0; i < binary.length * 8; i += 1) {
        if (binary.charCodeAt(i >> 3) & (0x80 >> (i & 7))) cells.push(i);
      }
    } catch { /* 非法掩码忽略 */ }
    return cells;
  }

  function clearedOf(layer: CareLayerId, cell: number): boolean {
    const state = session?.layers.find((l) => l.layer === layer);
    if (!state) return false;
    try {
      const binary = atob(state.mask);
      return (binary.charCodeAt(cell >> 3) & (0x80 >> (cell & 7))) !== 0;
    } catch { return false; }
  }

  function drawHighlight(): void {
    highlightCtx.clearRect(0, 0, 256, 256);
    if (!highlightOn) return;
    highlightCtx.fillStyle = 'rgba(255, 96, 64, 0.45)';
    for (const cell of footprint) {
      if (!clearedOf(session?.layers[0]?.layer ?? 'droplets', cell)) {
        highlightCtx.fillRect((cell % 64) * 4, Math.floor(cell / 64) * 4, 4, 4);
      }
    }
  }

  wrap.addEventListener('pointerdown', (event) => {
    if (!claimed || !activeTool || selectedId === null) return;
    event.preventDefault();
    const tool = CARE_TOOLS[activeTool];
    const p = canvasPoint(event);
    if (tool.gesture === 'cut') {
      cutting = true;
      cutPoints = [p];
      return;
    }
    try { wrap.setPointerCapture(event.pointerId); } catch { /* 合成指针（探针）无活动指针可捕获 */ }
    drawing = true;
    drawPoints = [p];
    if (tool.gesture === 'tap') {
      applyCells(strokeCells(activeTool, { points: [p] }));
    } else if (tool.gesture === 'hold') {
      held = true;
      applyCells(strokeCells(activeTool, { points: [p] }));
      holdTimer = window.setInterval(() => {
        if (!held) return;
        applyCells(strokeCells(activeTool!, { points: [p] }));
      }, 120);
    }
  });

  wrap.addEventListener('pointermove', (event) => {
    if (cutting) {
      cutPoints.push(canvasPoint(event));
      return;
    }
    if (!drawing || !claimed || !activeTool || held) return;
    const p = canvasPoint(event);
    drawPoints.push(p);
    const cells = strokeCells(activeTool, { points: drawPoints } satisfies StrokeGeometry);
    if (cells.length > 0) applyCells(cells);
    // 已应用的路径不再重复盖章：保留尾点作为下一次起点
    drawPoints = [p];
  });

  const endPointer = () => {
    if (cutting) {
      cutting = false;
      void finishCut();
      return;
    }
    if (!drawing && holdTimer === null) return;
    if (holdTimer !== null) { clearInterval(holdTimer); holdTimer = null; }
    held = false;
    drawing = false;
    void finishStroke();
  };
  wrap.addEventListener('pointerup', endPointer);
  wrap.addEventListener('pointercancel', endPointer);
  window.addEventListener('blur', () => { void releaseClaim(true); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void releaseClaim(true);
  });

  async function finishStroke(): Promise<void> {
    if (!session || selectedId === null) return;
    await submitSession();
    // 全部层达阈值 → 自动收尾完成（不要求找最后一个像素）
    const complete = session.layers.every((l) => l.progress >= 1);
    const near = session.layers.every((l) => l.progress >= AUTO_FINISH_THRESHOLD);
    if (complete || near) {
      for (const layer of session.layers) session = autoFinishLayer(session!, layer.layer);
      await submitSession();
      await completeCare();
    }
    updateProgressUi();
  }

  async function submitSession(): Promise<void> {
    if (!session || selectedId === null) return;
    const obj = currentObject();
    if (!obj?.damage) return;
    const result = await damp.native.careProgressV2!({
      objectId: selectedId,
      family: obj.damage.family,
      stage: obj.damage.stage,
      session,
    });
    if (!result.ok && result.message) b!.toast(result.message);
  }

  async function completeCare(): Promise<void> {
    if (selectedId === null) return;
    const finishedId = selectedId;
    const result = await damp.native.careCompleteV2!(finishedId);
    if (!result.ok) {
      b!.toast(result.message ?? '完成失败');
      return;
    }
    celebrate(result.fine === true);
    b!.toast(result.fine
      ? `精细护理完成！+${result.bonusCoins ?? 2} 菇币，光泽保持 24 小时`
      : '清理完成');
    await b!.reload();
    b!.advanceToNextObject(finishedId);
    session = null;
  }

  function celebrate(fine: boolean): void {
    const sheen = document.createElement('div');
    sheen.className = 'care-sheen';
    if (fine) sheen.classList.add('fine');
    wrap.append(sheen);
    setTimeout(() => sheen.remove(), 1400);
  }

  // ---------- 剪刀采摘 ----------

  async function finishCut(): Promise<void> {
    const obj = currentObject();
    if (!obj?.damage || obj.damage.mushroom !== 'mature' || cutPoints.length === 0) {
      await releaseClaim(false);
      return;
    }
    // 菌柄锚点：菇层底部中心（菇图绘制于 256 画布中央偏下）
    const anchor = { x: 128, y: 205 };
    let minDist = Infinity;
    for (const p of cutPoints) minDist = Math.min(minDist, Math.hypot(p.x - anchor.x, p.y - anchor.y));
    const cutQuality = Math.max(0, Math.min(1, 1 - minDist / 120));
    const result = await damp.native.harvestV2!({ objectId: obj.id, cutQuality });
    await releaseClaim(false);
    if (!result.ok) {
      b!.toast(result.message ?? '采摘失败');
      return;
    }
    b!.toast(result.spore
      ? `剪得很准！获得菇币 +${result.coins ?? 4}，掉落了 1 枚 ${SPECIES_CATALOG[result.spore]?.nameZh ?? result.spore}孢子`
      : `采摘成功，+${result.coins ?? 4} 菇币`);
    await b!.reload();
  }

  // ---------- 播种 ----------

  const plantBtn = $<HTMLButtonElement>('btn-plant');
  plantBtn.addEventListener('click', () => {
    void doPlant();
  });

  async function doPlant(): Promise<void> {
    const obj = currentObject();
    if (!obj) { b!.toast('先选择一个对象'); return; }
    const inventory = Object.entries(status?.spores ?? {}).filter(([, n]) => n > 0) as Array<[NewSpeciesId, number]>;
    if (inventory.length === 0) { b!.toast('没有可播种的孢子'); return; }
    const [species] = inventory[0];
    const result = await damp.native.plantSpore!({ objectId: obj.id, species });
    b!.toast(result.message ?? (result.ok ? '播种成功' : '播种失败'));
    await b!.reload();
  }

  function renderPlantButton(): void {
    const obj = currentObject();
    const hasSpores = Object.values(status?.spores ?? {}).some((n) => n > 0);
    const pending = obj ? status?.planted.some((p) => p.objectId === obj.id && p.status === 'pending') : false;
    plantBtn.classList.toggle('hidden', !(hasSpores && obj?.damage && obj.damage.mushroom === 'none' && !pending));
  }

  // ---------- 今日菌讯 ----------

  function renderForecast(): void {
    const card = $('forecast-card');
    const forecast = status?.forecast;
    if (!forecast) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    $('forecast-headline').textContent = `今日菌讯：${forecast.headline}${forecast.defaulted ? '（内置默认天气）' : ''}`;
    const lines = $('forecast-lines');
    lines.innerHTML = '';
    for (const line of forecast.lines.slice(0, 3)) {
      const div = document.createElement('div');
      div.textContent = line;
      lines.append(div);
    }
    $('forecast-alert').classList.toggle('hidden', !forecast.alertActive);
  }

  // ---------- 高亮按钮 ----------

  const highlightBtn = $<HTMLButtonElement>('btn-highlight');
  highlightBtn.addEventListener('click', () => {
    highlightOn = !highlightOn;
    highlightBtn.classList.toggle('active', highlightOn);
    drawHighlight();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      highlightOn = true;
      highlightBtn.classList.add('active');
      drawHighlight();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      highlightOn = false;
      highlightBtn.classList.remove('active');
      drawHighlight();
    }
  });

  // ---------- 选中对象变化 ----------

  function onSelectionChanged(): void {
    softenCtx.clearRect(0, 0, 256, 256);
    highlightCtx.clearRect(0, 0, 256, 256);
    session = null;
    activeTool = null;
    footprint = new Set();
    const obj = currentObject();
    renderToolRow();
    renderPlantButton();
    renderMessage(obj);
    if (obj?.damage && obj.damage.stage > 0) {
      // 足迹在 care.ts 绘制完脏层后量取（下一帧）
      requestAnimationFrame(() => measureFootprint());
      const gloss = obj.glossUntil && obj.glossUntil > Date.now();
      const badge = $('stage-badge');
      badge.classList.remove('hidden');
      badge.textContent = gloss ? '✨ 护理光泽中' : `${CARE_LAYER_INFO[damageTopLayer(obj)].nameZh}护理`;
      badge.dataset.damage = obj.damage ? obj.damage.family : '';
    }
  }

  function damageTopLayer(obj: ObjectSnap): CareLayerId {
    const family = obj.damage!.family;
    return family === 'damp' ? 'droplets' : family === 'mold' ? 'mold' : 'soot';
  }

  function renderMessage(obj: ObjectSnap | null): void {
    if (!obj) return;
    const tip = $('stage-tip');
    const rawSpecies = obj.mushroomSpecies;
    const species = rawSpecies && rawSpecies in SPECIES_CATALOG ? rawSpecies as SpeciesId : null;
    tip.textContent = objectMessage({
      objectId: obj.id,
      category: obj.objectCategory ?? 'other',
      species,
      family: obj.damage?.family ?? null,
      fineCare: (obj.glossUntil ?? 0) > Date.now(),
    });
  }

  // ---------- 收藏页（图鉴） ----------

  function renderCollectionV2(): void {
    const page = $('page-collection');
    if (!page.classList.contains('active') || !status) return;
    const grid = $('collection-grid');
    const empty = $('collection-empty');
    page.querySelectorAll('.v2-collection').forEach((el) => el.remove());
    const container = document.createElement('div');
    container.className = 'v2-collection';

    // 孢子库存
    const spores = Object.entries(status.spores ?? {}).filter(([, n]) => n > 0) as Array<[NewSpeciesId, number]>;
    if (spores.length > 0) {
      const sporeBox = document.createElement('div');
      sporeBox.className = 'spore-inventory';
      sporeBox.append(Object.assign(document.createElement('h3'), { textContent: '孢子库存' }));
      for (const [species, count] of spores) {
        const chip = document.createElement('span');
        chip.className = 'spore-chip';
        chip.textContent = `${SPECIES_CATALOG[species]?.nameZh ?? species} ×${count}`;
        chip.title = '选中一个无菇对象后点护理台的「播种孢子」';
        sporeBox.append(chip);
      }
      container.append(sporeBox);
    }

    // 新品种图鉴
    const dex = document.createElement('div');
    dex.append(Object.assign(document.createElement('h3'), { textContent: '新品种图鉴' }));
    const dexGrid = document.createElement('div');
    dexGrid.className = 'grid dex-grid';
    for (const id of catalogOrder()) {
      if (isLegacySpecies(id)) continue;
      const entry = SPECIES_CATALOG[id];
      const discovered = status.collection[id];
      const card = document.createElement('div');
      card.className = `card dex-card${discovered ? '' : ' undiscovered'}`;
      const img = document.createElement('img');
      img.src = discovered ? `./assets/care/species/${id}/mature-256.png` : `./assets/care/species/${id}/silhouette.png`;
      img.alt = discovered ? entry.nameZh : '未发现';
      const name = document.createElement('div');
      name.className = 'dex-name';
      name.textContent = discovered ? `${entry.nameZh} · ${entry.nameEn}` : '？？？';
      const meta = document.createElement('div');
      meta.className = 'dex-meta';
      meta.textContent = discovered
        ? `${rarityLabel(entry.rarity)} · 来源：${discovered.sourceName}`
        : `未发现 · ${discoveryHint(id)}`;
      const quote = document.createElement('div');
      quote.className = 'dex-quote';
      quote.textContent = discovered ? entry.quote : '';
      card.append(img, name, meta, quote);
      dexGrid.append(card);
    }
    dex.append(dexGrid);
    container.append(dex);

    // 早期品种
    const legacy = Object.keys(status.collection).filter((s) => isLegacySpecies(s as never));
    if (legacy.length > 0) {
      const box = document.createElement('div');
      box.append(Object.assign(document.createElement('h3'), { textContent: '早期品种' }));
      const legacyGrid = document.createElement('div');
      legacyGrid.className = 'grid dex-grid';
      for (const species of legacy) {
        if (!isSpeciesId(species) || !isLegacySpecies(species)) continue;
        const entry = SPECIES_CATALOG[species];
        const card = document.createElement('div');
        card.className = 'card dex-card legacy';
        const img = document.createElement('img');
        img.src = './assets/care/round-mature.png';
        const name = document.createElement('div');
        name.className = 'dex-name';
        name.textContent = entry.nameZh;
        const meta = document.createElement('div');
        meta.className = 'dex-meta';
        meta.textContent = entry.description;
        card.append(img, name, meta);
        legacyGrid.append(card);
      }
      box.append(legacyGrid);
      container.append(box);
    }

    // 护理记录
    const stats = document.createElement('div');
    stats.className = 'care-stats muted';
    stats.textContent = `精细护理 ${status.fineCareCount ?? 0} 次 · 收藏 ${Object.keys(status.collection).length} 种 · 今日额度 ${status.dailyUsed}/${status.dailyLimit}`;
    container.append(stats);

    grid.before(container);
    empty.classList.toggle('hidden', Object.keys(status.collection).length > 0);
  }

  function rarityLabel(rarity: string): string {
    return rarity === 'common' ? '常见' : rarity === 'uncommon' ? '少见' : '稀有';
  }

  // ---------- 墙面页 ----------

  const wallBase = $<HTMLCanvasElement>('wall-base');
  const wallFog = $<HTMLCanvasElement>('wall-fog');
  const wallFogCtx = wallFog.getContext('2d')!;
  const wallEnable = $<HTMLButtonElement>('wall-enable');
  const wallConfirm = $<HTMLButtonElement>('wall-confirm');
  const wallReset = $<HTMLButtonElement>('wall-reset');
  let wallImg = new Image();

  wallEnable.addEventListener('click', () => {
    void (async () => {
      const result = await damp.wallpaper!.setEnabled(true);
      if (result.ok) {
        wallEnabled = true;
        b!.toast('壁纸效果已开启（原壁纸文件不改动）');
        await renderWall(result.view);
      } else {
        b!.toast(result.message ?? '开启失败');
      }
    })();
  });

  wallConfirm.addEventListener('click', () => {
    void (async () => {
      if (!wallDirty || !wallMask) return;
      const result = await damp.wallpaper!.wipe({ fogMask: wallMask, progress: wipeProgress(wallMask) });
      if (result.ok) {
        wallDirty = false;
        b!.toast('已提交擦拭，壁纸将重新合成');
        await renderWall(result.view);
      } else {
        b!.toast(result.message ?? '提交失败');
      }
    })();
  });

  wallReset.addEventListener('click', () => {
    void (async () => {
      wallMask = undefined;
      wallDirty = false;
      await renderWall();
    })();
  });

  async function renderWall(view?: WallpaperView): Promise<void> {
    const v = view ?? await damp.wallpaper!.status();
    wallEnabled = v.enabled;
    wallMask = v.fogMask;
    $('wall-status').textContent = v.enabled
      ? '壁纸效果已开启：雾气/水痕/墙角霉斑只合成为副本，原壁纸文件不改动。'
      : '壁纸效果由玩家主动开启；开启后会把天气雾气合成到原壁纸的副本上，原壁纸文件不改动。';
    wallEnable.classList.toggle('hidden', v.enabled);
    wallEnable.textContent = v.status === 'skipped' ? `无法开启（${v.skipReason ?? '原因未知'}）` : '开启壁纸效果';
    wallConfirm.classList.toggle('hidden', !wallDirty);
    wallReset.classList.toggle('hidden', !wallDirty);
    if (v.thumbnailDataUrl) {
      wallImg = new Image();
      wallImg.src = v.thumbnailDataUrl;
      await wallImg.decode().catch(() => {});
    }
    wallBase.getContext('2d')!.drawImage(wallImg, 0, 0, 480, 270);
    wallFogCtx.clearRect(0, 0, 480, 270);
    if (v.enabled && v.fogLevel > 0) {
      wallFogCtx.fillStyle = `rgba(232, 240, 246, ${0.75 * v.fogLevel + 0.1})`;
      wallFogCtx.fillRect(0, 0, 480, 270);
      // 按擦净掩码打洞
      if (v.fogMask) {
        wallFogCtx.globalCompositeOperation = 'destination-out';
        wallFogCtx.fillStyle = 'rgba(0,0,0,1)';
        for (const cell of decodeCells(v.fogMask)) {
          wallFogCtx.fillRect((cell % 64) * 7.5, Math.floor(cell / 64) * 4.21875, 7.5, 4.21875);
        }
        wallFogCtx.globalCompositeOperation = 'source-over';
      }
    }
    $('wall-info').textContent = `雾层强度 ${(v.fogLevel * 100).toFixed(0)}% · 墙角霉斑 ${v.cornerMoldStage}/3${v.message ? ` · ${v.message}` : ''}`;
    $('wall-fill').style.width = `${Math.round((wallDirty ? wipeProgress(wallMask) : v.wipeProgress) * 100)}%`;
    $('wall-text').textContent = `${Math.round((wallDirty ? wipeProgress(wallMask) : v.wipeProgress) * 100)}%`;
  }

  function wallPoint(event: PointerEvent): { x: number; y: number } {
    const rect = wallFog.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (480 / rect.width), y: (event.clientY - rect.top) * (270 / rect.height) };
  }

  wallFog.addEventListener('pointerdown', (event) => {
    if (!wallEnabled) return;
    event.preventDefault();
    try { wallFog.setPointerCapture(event.pointerId); } catch { /* 合成指针 */ }
    wallDrawing = true;
    eraseFogAt(wallPoint(event));
  });
  wallFog.addEventListener('pointermove', (event) => {
    if (!wallDrawing) return;
    eraseFogAt(wallPoint(event));
  });
  const endWall = () => {
    if (!wallDrawing) return;
    wallDrawing = false;
    wallDirty = true;
    $('wall-confirm').classList.remove('hidden');
    $('wall-reset').classList.remove('hidden');
    $('wall-fill').style.width = `${Math.round(wipeProgress(wallMask) * 100)}%`;
    $('wall-text').textContent = `${Math.round(wipeProgress(wallMask) * 100)}%`;
  };
  wallFog.addEventListener('pointerup', endWall);
  wallFog.addEventListener('pointercancel', endWall);

  /** 长条刮擦（刮水器手感）：擦除视觉雾层并把格子记入待提交掩码。 */
  function eraseFogAt(p: { x: number; y: number }): void {
    const halfLen = 34; // 长条半长（px，480 宽画布）
    const halfW = 10;
    wallFogCtx.globalCompositeOperation = 'destination-out';
    wallFogCtx.fillRect(p.x - halfLen, p.y - halfW, halfLen * 2, halfW * 2);
    wallFogCtx.globalCompositeOperation = 'source-over';
    const cells: number[] = [];
    const gx0 = Math.max(0, Math.floor((p.x - halfLen) / 7.5));
    const gx1 = Math.min(63, Math.floor((p.x + halfLen) / 7.5));
    const gy0 = Math.max(0, Math.floor((p.y - halfW) / 4.21875));
    const gy1 = Math.min(63, Math.floor((p.y + halfW) / 4.21875));
    for (let gy = gy0; gy <= gy1; gy += 1) {
      for (let gx = gx0; gx <= gx1; gx += 1) cells.push(gy * 64 + gx);
    }
    wallMask = applyWipe(wallMask, cells);
  }

  // 墙面页进入时刷新
  $('tab-wall').addEventListener('click', () => { void renderWall(); });
  for (const tab of document.querySelectorAll<HTMLButtonElement>('#tabs .tab')) {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'collection') setTimeout(renderCollectionV2, 60);
    });
  }

  // ---------- 轮询（与 care.ts 的 60s 轮询互补；正在手势时不打扰） ----------

  setInterval(() => {
    void (async () => {
      if (!bridge()) return;
      const fetched = (await damp.native.status()) as StatusSnap;
      status = fetched;
      renderForecast();
      const selected = bridge()!.getSelectedId();
      if (selected !== selectedId) {
        selectedId = selected;
        onSelectionChanged();
      } else {
        renderPlantButton();
      }
      // 收藏页若正打开则刷新图鉴
      if ($('page-collection').classList.contains('active')) renderCollectionV2();
    })();
  }, 2500);
  void (async () => {
    status = (await damp.native.status()) as StatusSnap;
    renderForecast();
  })();
}
