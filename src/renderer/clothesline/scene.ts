/**
 * 护理台 · 晾衣绳（0.1.29；用户 2026-10-26 选定的方向，方向稿 design-system/care-v3/dir-1-v2.html）。
 *
 * 真实数据：native.status 里需要处理的对象（有损伤或有菇）夹在主绳上，最多 9 个，其余收在
 * "待晾"衣篓里按优先级补位；10 天防霉期内护理过的对象挂在晒太阳的短绳上。
 * 写操作只走现有类型化通道：careProgress（松手保存进度与掩码）、careComplete（≥90% 自动收尾后完成）、
 * harvestV2（剪刀采摘，按剪切准度结算孢子）。领域规则都在主进程，界面不另造规则。
 * 收藏、小铺、墙面、设置收进"菇菇手账"，沿用 care.ts 的现有页面。
 */
import './clothesline.css';
import { applyDamageMaterial, damageVariant } from '../../shared/material/effects';
import { isNewSpeciesId } from '../../shared/types/gameplay';
import type { NativeObjectView, NativeStatusSnapshot } from '../../shared/types/native-status';
import { Fx, Sound, Spring, createWipe, loadImage, type WipeHandle } from './engine';
import {
  BASIN, JOURNAL_ART, MAIN, NOTE_ART, PIN_SVG, STAMP_ART, SUN, WIN,
  backdropSvg, basinBackSvg, basinFrontSvg, jarArt, type Rope,
} from './art';

type ObjView = NativeObjectView & { mushroomSpecies?: string; moldImmuneUntil: number };
interface StatusV4 extends NativeStatusSnapshot {
  alert?: { active: boolean };
  forecast?: { headline: string; lines: string[]; defaulted: boolean } | null;
  spores?: Record<string, number>;
}

const STAGE_W = 960, STAGE_H = 640;
const MAIN_CAP = 9;
const SUN_CAP = 4;
const DETACH = 112;
const FAMILY: Record<string, string> = { damp: '受潮', mold: '霉变', char: '焦化' };
const LEVEL = ['', '轻', '中', '重'];
const LAYERS: Record<string, string[]> = { damp: ['水珠', '水膜'], mold: ['霉斑'], char: ['烟灰', '焦痕'] };
const LEGACY_SHAPE: Record<string, string> = { oyster: 'round', enoki: 'cluster', shy: 'fan', bolete: 'round', lava: 'fan' };
const WMO: Record<number, string> = {
  0: '晴', 1: '晴间多云', 2: '局部多云', 3: '阴', 45: '雾', 48: '雾凇', 51: '毛毛雨', 53: '毛毛雨', 55: '毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 80: '阵雨', 81: '阵雨', 82: '强阵雨', 95: '雷暴',
};
const TOOLS = [
  { id: 'sponge', name: '海绵', img: './assets/care/sponge-idle.png', act: './assets/care/sponge-active.png', radius: 24, fam: ['damp', 'mold', 'char'], tip: '万能，但慢一点' },
  { id: 'squeegee', name: '刮水器', img: './assets/care/tools/squeegee-idle.png', act: './assets/care/tools/squeegee-active.png', radius: 36, fam: ['damp'], tip: '刮水膜最快' },
  { id: 'scrubbrush', name: '清洁刷', img: './assets/care/tools/scrubbrush-idle.png', act: './assets/care/tools/scrubbrush-active.png', radius: 17, fam: ['mold', 'char'], tip: '对付霉斑和烟灰' },
  { id: 'scissors', name: '剪刀', img: './assets/care/scissors-idle.png', act: './assets/care/scissors-active.png', radius: 0, fam: [] as string[], tip: '只剪成熟菇' },
] as const;
type Tool = (typeof TOOLS)[number];

function mushroomSrc(species: string | undefined, stage: 'young' | 'mature'): { src: string; full: boolean } {
  if (species && isNewSpeciesId(species)) return { src: `./assets/care/species/${species}/${stage === 'mature' ? 'mature' : 'bud'}-256.png`, full: true };
  return { src: `./assets/care/${LEGACY_SHAPE[species ?? 'oyster'] ?? 'round'}-${stage === 'mature' ? 'mature' : 'bud'}.png`, full: false };
}

/** 原图 → 损伤图（与桌面 ICO 同一材质实现，同一对象稳定款式） */
const dirtyCache = new Map<string, string>();
async function dirtyDataUrl(o: ObjView): Promise<string> {
  if (!o.damage || o.damage.stage === 0 || !o.iconDataUrl) return o.iconDataUrl;
  const key = `${o.id}|${o.damage.family}|${o.damage.stage}|${o.iconDataUrl.length}`;
  const cached = dirtyCache.get(key);
  if (cached) return cached;
  const img = await loadImage(o.iconDataUrl);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 256, 256);
  const data = ctx.getImageData(0, 0, 256, 256);
  applyDamageMaterial({ data: data.data, width: 256, height: 256, stage: o.damage.stage as 1 | 2 | 3, type: damageVariant(o.id, o.damage.family) });
  ctx.putImageData(data, 0, 0);
  const url = c.toDataURL();
  dirtyCache.set(key, url);
  return url;
}

const needsCare = (o: ObjView) => !!o.damage && (o.damage.stage > 0 || o.damage.mushroom !== 'none');
const priority = (o: ObjView) => (o.damage?.mushroom === 'mature' ? 0 : 1) * 10 - (o.damage?.stage ?? 0);

interface Hang {
  o: ObjView; el: HTMLElement; body: HTMLElement; tag: HTMLElement; rope: Rope;
  axSpring: Spring; ax: number; lastAx: number; slotX: number;
  load: number; loadV: number; weight: number; swing: number; swingV: number; tagSwing: number; tagV: number; phase: number;
  drag: null | { x0: number; y0: number; moved: number }; dragX: number; dragLoad: number | null;
  gone: boolean; autoPulling: boolean; dry: boolean;
}

function mount(): void {
  const damp = window.damp;
  if (!damp) return;
  const app = document.getElementById('app');
  if (!app) return;
  document.body.classList.add('cl-mode');

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.id = 'clothesline';
  root.innerHTML = `
  <div id="cl-stage">
    <svg class="cl-layer" id="cl-backdrop" width="960" height="640" viewBox="0 0 960 640"></svg>
    <svg class="cl-layer" id="cl-ropes" width="960" height="640" viewBox="0 0 960 640"></svg>
    <div id="cl-hangs"></div>
    <div id="cl-pending"></div>
    <div id="cl-rack"></div>
    <svg class="cl-layer" id="cl-basin-back" width="960" height="640" viewBox="0 0 960 640"></svg>
    <div id="cl-ripples"></div>
    <div id="cl-float"><div class="cl-bob"><div id="cl-wipe"></div><img id="cl-mushroom" alt=""><div id="cl-cutline"></div></div></div>
    <svg class="cl-layer" id="cl-basin-front" width="960" height="640" viewBox="0 0 960 640"></svg>
    <div id="cl-layers"></div>
    <div id="cl-hint"></div>
    <div id="cl-note">
      <svg class="cl-layer" width="246" height="172" viewBox="0 0 246 172">${NOTE_ART}</svg>
      <div class="city"></div><div class="cond"></div>
      <div class="hum"></div><div class="hum-l"></div>
      <div class="line"></div>
      <svg class="stamp" width="104" height="40" viewBox="0 0 104 40">${STAMP_ART}</svg>
    </div>
    <div id="cl-journal" title="菇菇手账：收藏 · 小铺 · 墙面 · 设置"><svg width="96" height="66" viewBox="0 0 96 66">${JOURNAL_ART}</svg></div>
    <div id="cl-basket" title="采菇篮"><img src="./assets/care/basket.png" alt=""><div class="count">0</div></div>
    <div id="cl-jar" title="菇币"><svg width="110" height="130" viewBox="0 0 110 130"></svg><div class="num">0</div><div class="lbl">菇币</div></div>
    <div id="cl-sound"></div>
    <div id="cl-empty" class="hidden">桌面都晾干了。<br><small>天气变了，绳子上会再挂上新的东西。</small></div>
    <div id="cl-toast"></div>
  </div>
  <div id="cl-cursor"><img alt=""></div>`;
  app.appendChild(root);
  const back = document.createElement('button');
  back.id = 'cl-back';
  back.textContent = '← 回到晾衣绳';
  document.getElementById('tabs')?.prepend(back);

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const stage = $('cl-stage');
  $('cl-backdrop').innerHTML = backdropSvg();
  $('cl-basin-back').innerHTML = basinBackSvg();
  $('cl-basin-front').innerHTML = basinFrontSvg();

  // 场景按窗口等比缩放（标题栏下方）
  const fit = () => {
    const w = root.clientWidth, h = root.clientHeight;
    const s = Math.min(w / STAGE_W, h / STAGE_H);
    stage.style.transform = `translate(${(w - STAGE_W * s) / 2}px, ${(h - STAGE_H * s) / 2}px) scale(${s})`;
  };
  fit();
  addEventListener('resize', fit);
  const scale = () => stage.getBoundingClientRect().width / STAGE_W;

  // 手账：打开 care.ts 的现有页面
  const openJournal = (tab = 'collection') => {
    document.body.classList.add('cl-journal');
    (document.querySelector(`#tabs .tab[data-tab="${tab}"]`) as HTMLButtonElement | null)?.click();
    Sound.pick();
  };
  $('cl-journal').addEventListener('click', () => openJournal());
  back.addEventListener('click', () => { document.body.classList.remove('cl-journal'); Sound.drop(); void refresh(); });
  $('cl-basket').addEventListener('click', () => openJournal('collection'));
  const paintSound = () => { $('cl-sound').textContent = `音效 ${Sound.enabled ? '开' : '关'}`; };
  $('cl-sound').addEventListener('click', () => { Sound.setEnabled(!Sound.enabled); paintSound(); });
  paintSound();

  // 窗上滑落的水珠、光柱浮尘
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const svg = $('cl-backdrop');
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(WIN.x + 18 + Math.random() * (WIN.w - 36)));
    c.setAttribute('cy', String(WIN.y + 20)); c.setAttribute('r', '2.4');
    c.setAttribute('fill', 'oklch(1 0 0 / .75)'); c.setAttribute('clip-path', 'url(#cl-glass)');
    svg.appendChild(c);
    c.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${WIN.h - 40}px)` }], { duration: 2600 + Math.random() * 1600, easing: 'cubic-bezier(.6,0,.9,.6)' }).onfinish = () => c.remove();
  }, 1600);
  for (let i = 0; i < 18; i += 1) {
    const m = document.createElement('div'); m.className = 'cl-mote';
    m.style.left = 700 + Math.random() * 220 + 'px'; m.style.top = 120 + Math.random() * 420 + 'px';
    stage.appendChild(m);
    m.animate([{ transform: 'translate(0,0)', opacity: 0 }, { opacity: 0.85, offset: 0.4 }, { transform: `translate(${-30 - Math.random() * 40}px, ${20 + Math.random() * 40}px)`, opacity: 0 }],
      { duration: 6000 + Math.random() * 6000, iterations: Infinity, delay: -Math.random() * 8000 });
  }

  // ---------- 提示 ----------
  let toastTimer = 0;
  const toast = (text: string) => { const t = $('cl-toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t.classList.remove('show'), 2400); };
  const setHint = (html: string) => { $('cl-hint').innerHTML = html; };
  const HINT_IDLE = '把绳上的东西<b>往下拽</b>，或者点一下';

  // ---------- 状态 ----------
  let status: StatusV4 | null = null;
  let coins = 0;
  const paintCoins = (n: number) => {
    coins = n;
    $('cl-jar').querySelector('.num')!.textContent = String(n);
    $('cl-jar').querySelector('svg')!.innerHTML = jarArt(n);
  };
  const paintNote = (s: StatusV4) => {
    const note = $('cl-note');
    const snap = s.snapshot;
    note.querySelector('.city')!.textContent = s.location?.label ?? '长沙市（默认）';
    note.querySelector('.cond')!.textContent = snap ? `${WMO[snap.weatherCode] ?? '天气'} · ${Math.round(snap.temperatureC)}°C` : '天气暂不可用';
    note.querySelector('.hum')!.innerHTML = snap ? `${Math.round(snap.humidityPct)}<small>%</small>` : '--';
    const t = snap?.observedAt.match(/T(\d{2}:\d{2})/)?.[1] ?? '';
    note.querySelector('.hum-l')!.textContent = s.forecast?.defaulted ? '湿度 · 内置默认天气' : `湿度 · ${t} 更新`;
    const lines = s.forecast?.lines?.slice(0, 2) ?? [];
    note.querySelector('.line')!.innerHTML = (lines.length ? lines : [s.forecast?.headline ?? '今天的潮气还在路上。']).map((l) => escapeHtml(l)).join('<br>');
    (note.querySelector('.stamp') as SVGElement).style.display = s.alert?.active ? 'block' : 'none';
  };
  const paintBasket = (s: StatusV4) => { $('cl-basket').querySelector('.count')!.textContent = String(Object.keys(s.collection ?? {}).length); };

  // ---------- 绳 ----------
  const hangs: Hang[] = [];
  const ropeBase = (r: Rope, x: number) => { const t = (x - r.x1) / (r.x2 - r.x1); return r.y1 + (r.y2 - r.y1) * t + Math.sin(Math.PI * t) * r.sag; };
  const ropeY = (r: Rope, x: number, list: Hang[]) => {
    let y = ropeBase(r, x);
    for (const h of list) {
      if (!h.load) continue;
      y += x <= h.ax ? h.load * (x - r.x1) / Math.max(1, h.ax - r.x1) : h.load * (r.x2 - x) / Math.max(1, r.x2 - h.ax);
    }
    return y;
  };
  const ropePath = (r: Rope, list: Hang[], dx = 0, dy = 0) => {
    let d = '';
    for (let i = 0; i <= 64; i += 1) { const x = r.x1 + (r.x2 - r.x1) * (i / 64); d += `${i ? 'L' : 'M'}${(x + dx).toFixed(1)},${(ropeY(r, x, list) + dy).toFixed(1)}`; }
    return d;
  };
  const ropeKicks: Array<{ r: Rope; x: number; amp: number; t: number }> = [];
  function drawRopes(): void {
    let s = '<defs><filter id="cl-rshadow"><feGaussianBlur stdDeviation="2.5"/></filter></defs>';
    for (const r of [MAIN, SUN]) {
      const list = hangs.filter((h) => h.rope === r && !h.gone);
      s += `<path d="${ropePath(r, list, 5, 9)}" fill="none" stroke="oklch(0.35 0.03 90 / .18)" stroke-width="4" filter="url(#cl-rshadow)"/>`;
      s += `<path d="${ropePath(r, list)}" fill="none" stroke="oklch(0.55 0.05 70)" stroke-width="4.6" stroke-linecap="round"/>`;
      s += `<path d="${ropePath(r, list)}" fill="none" stroke="oklch(0.70 0.05 75)" stroke-width="3" stroke-linecap="round"/>`;
      s += `<path d="${ropePath(r, list, 0, -0.6)}" fill="none" stroke="oklch(0.84 0.05 80)" stroke-width="1.2" stroke-dasharray="2.2 3.4" stroke-linecap="round"/>`;
    }
    $('cl-ropes').innerHTML = s;
  }

  function hangHtml(o: ObjView, dry: boolean, dirty: string): string {
    const ripe = o.damage?.mushroom === 'mature';
    const [cls, txt] = dry ? ['ok', '晒干中'] : ripe ? ['ripe', '有菇可采'] : [o.damage!.family, `${FAMILY[o.damage!.family]} · ${LEVEL[o.damage!.stage]}`];
    let mush = '';
    if (!dry && o.damage && o.damage.mushroom !== 'none') {
      const m = mushroomSrc(o.mushroomSpecies, o.damage.mushroom);
      mush = `<img class="cl-hmush${m.full ? ' full' : ''}" src="${m.src}" alt="">`;
    }
    return `<div class="cl-body">${PIN_SVG}<div class="cl-icon"><img src="${dry ? o.iconDataUrl : dirty}" alt="">${mush}</div></div>
      <div class="cl-tag"><div class="str"></div><div class="paper"><span class="st"><i class="${cls}"></i><b>${txt}</b></span><span class="nm">${escapeHtml(o.displayName)}</span></div></div>`;
  }
  async function makeHang(o: ObjView, rope: Rope): Promise<Hang> {
    const dry = rope === SUN;
    const el = document.createElement('div');
    el.className = 'cl-hang' + (dry ? ' dry' : '');
    el.innerHTML = hangHtml(o, dry, dry ? o.iconDataUrl : await dirtyDataUrl(o));
    el.title = o.displayName;
    $('cl-hangs').appendChild(el);
    const h: Hang = {
      o, el, body: el.querySelector('.cl-body') as HTMLElement, tag: el.querySelector('.cl-tag') as HTMLElement, rope,
      axSpring: new Spring(0, 0.08, 0.82), ax: 0, lastAx: 0, slotX: 0,
      load: 7, loadV: 0, weight: 7, swing: 0, swingV: 0, tagSwing: 0, tagV: 0, phase: Math.random() * 6,
      drag: null, dragX: 0, dragLoad: null, gone: false, autoPulling: false, dry,
    };
    h.body.addEventListener('pointerenter', () => { if (!h.drag) { h.swingV += 1.6; Sound.tap(); } });
    h.body.addEventListener('pointerdown', (e) => startDrag(h, e));
    hangs.push(h);
    return h;
  }
  function layout(instant = false): void {
    for (const r of [MAIN, SUN]) {
      const list = hangs.filter((h) => h.rope === r && !h.gone && !h.drag);
      const pad = r === MAIN ? 0.07 : 0.16;
      list.forEach((h, i) => {
        h.slotX = r.x1 + (r.x2 - r.x1) * (pad + (i + 0.5) * ((1 - pad * 2) / Math.max(list.length, 1)));
        if (instant) { h.axSpring.jump(h.slotX); h.ax = h.slotX; h.lastAx = h.slotX; } else h.axSpring.set(h.slotX);
      });
    }
  }
  function removeHang(h: Hang): void { h.el.remove(); const i = hangs.indexOf(h); if (i >= 0) hangs.splice(i, 1); }

  // 拽下来
  function startDrag(h: Hang, e: PointerEvent): void {
    if (h.dry || e.button !== 0 || current?.h === h || busy) return;
    e.preventDefault();
    try { h.body.setPointerCapture(e.pointerId); } catch { /* 合成指针 */ }
    h.drag = { x0: e.clientX, y0: e.clientY, moved: 0 };
    h.dragX = h.axSpring.value; h.dragLoad = h.weight;
    h.el.classList.add('dragging');
    Sound.pick();
    const move = (ev: PointerEvent) => {
      if (!h.drag) return;
      const s = scale();
      const dx = (ev.clientX - h.drag.x0) / s, dy = (ev.clientY - h.drag.y0) / s;
      h.drag.moved = Math.max(h.drag.moved, Math.hypot(dx, dy));
      h.dragX = Math.max(h.rope.x1 + 30, Math.min(h.rope.x2 - 30, h.axSpring.value + dx * 0.55));
      h.dragLoad = Math.max(0, h.weight + dy);
      if (h.dragLoad > DETACH) finish(true);
    };
    const finish = (detach: boolean) => {
      h.body.removeEventListener('pointermove', move);
      h.body.removeEventListener('pointerup', up);
      h.body.removeEventListener('pointercancel', up);
      const wasClick = !!h.drag && h.drag.moved < 6;
      h.drag = null;
      h.el.classList.remove('dragging');
      if (detach) { void pop(h); return; }
      if (wasClick) { autoPull(h); return; }
      h.load = h.dragLoad ?? h.weight; h.loadV = -6; h.dragLoad = null;
      h.swingV += (Math.random() - 0.5) * 6;
      Sound.drop();
    };
    const up = () => finish(false);
    h.body.addEventListener('pointermove', move);
    h.body.addEventListener('pointerup', up);
    h.body.addEventListener('pointercancel', up);
  }
  function autoPull(h: Hang): void {
    if (current?.h === h || busy) return;
    const t0 = performance.now();
    h.autoPulling = true;
    (function step() {
      const k = Math.min(1, (performance.now() - t0) / 260);
      h.dragLoad = h.weight + (DETACH + 4 - h.weight) * (k * k);
      if (k < 1) requestAnimationFrame(step); else { h.autoPulling = false; void pop(h); }
    })();
  }

  // ---------- 主循环 ----------
  let tick = 0;
  function frame(): void {
    tick += 1;
    for (const h of hangs) {
      if (h.gone) continue;
      h.ax = h.drag ? h.dragX : h.axSpring.value;
      if ((h.drag || h.autoPulling) && h.dragLoad !== null) h.load = h.dragLoad;
      else { h.loadV = (h.loadV + (h.weight - h.load) * 0.16) * 0.8; h.load += h.loadV; }
      const vx = h.ax - h.lastAx; h.lastAx = h.ax;
      h.swingV = (h.swingV - h.swing * 0.06 - vx * 0.35) * 0.9;
      h.swing += h.swingV;
      h.tagV = (h.tagV + (h.swing - h.tagSwing) * 0.05) * 0.86; h.tagSwing += h.tagV;
    }
    for (let i = ropeKicks.length - 1; i >= 0; i -= 1) { ropeKicks[i].t += 1; if (ropeKicks[i].t > 60) ropeKicks.splice(i, 1); }
    drawRopes();
    for (const h of hangs) {
      if (h.gone) continue;
      const list = hangs.filter((o) => o.rope === h.rope && !o.gone);
      let y = ropeY(h.rope, h.ax, list);
      for (const k of ropeKicks) if (k.r === h.rope) y += k.amp * Math.exp(-k.t / 14) * Math.sin(k.t / 3) * Math.exp(-Math.abs(h.ax - k.x) / 260);
      const idle = Math.sin(tick / 47 + h.phase) * (h.dry ? 1.2 : 2.4);
      const ang = Math.max(-35, Math.min(35, h.swing * 4 + idle));
      h.el.style.transform = `translate(${h.ax.toFixed(1)}px, ${y.toFixed(1)}px)`;
      h.body.style.transform = `rotate(${ang.toFixed(2)}deg)`;
      h.tag.style.transform = `rotate(${(ang * 0.6 + (h.tagSwing - h.swing) * 6).toFixed(2)}deg)`;
      if (!h.dry && h.o.damage?.family === 'damp' && h.o.damage.stage > 0 && !h.drag && Math.random() < 0.005) drip(h.ax + (Math.random() - 0.5) * 34, y + 70);
      if (h.dry && Math.random() < 0.01) steam(h.ax + (Math.random() - 0.5) * 30, y + 10);
    }
    requestAnimationFrame(frame);
  }
  function drip(x: number, y: number): void {
    const d = document.createElement('div'); d.className = 'cl-drip'; d.style.left = x + 'px'; d.style.top = y + 'px'; stage.appendChild(d);
    const fall = 470 - y + Math.random() * 40;
    d.animate([{ transform: 'translateY(0) scale(.5)', opacity: 1 }, { transform: 'translateY(2px) scale(1)', offset: 0.2 }, { transform: `translateY(${fall}px) scale(1, 1.2)`, opacity: 0.85 }],
      { duration: 900 + fall * 1.6, easing: 'cubic-bezier(.55,0,1,.45)' }).onfinish = () => d.remove();
  }
  function steam(x: number, y: number): void {
    const s = document.createElement('div'); s.className = 'cl-steam'; s.style.left = x + 'px'; s.style.top = y + 'px'; stage.appendChild(s);
    s.animate([{ transform: 'translateY(0) scaleX(1)', opacity: 0 }, { opacity: 0.7, offset: 0.3 }, { transform: 'translateY(-40px) scaleX(-1)', opacity: 0 }], { duration: 1800, easing: 'ease-out' }).onfinish = () => s.remove();
  }
  const ripples = $('cl-ripples');
  ripples.style.clipPath = `ellipse(${BASIN.wrx}px ${BASIN.wry}px at ${BASIN.cx}px ${BASIN.wcy}px)`;
  function ripple(x: number, y: number, size = 1, delay = 0): void {
    setTimeout(() => {
      const r = document.createElement('div'); r.className = 'cl-ripple';
      Object.assign(r.style, { left: x - 10 + 'px', top: y - 3 + 'px' });
      ripples.appendChild(r);
      r.animate([{ transform: 'scale(1)', opacity: 0.9 }, { transform: `scale(${9 * size}, ${7 * size})`, opacity: 0 }], { duration: 1300, easing: 'cubic-bezier(.2,.6,.3,1)' }).onfinish = () => r.remove();
    }, delay);
  }

  // ---------- 工具 ----------
  let tool: Tool | null = null;
  const toolEls = new Map<Tool, { el: HTMLElement; sw: Spring }>();
  TOOLS.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'cl-tool';
    el.style.left = 20 + i * 56 - 26 + 'px';
    el.innerHTML = `<div class="loop"></div><img src="${t.img}" alt=""><div class="name">${t.name}<span class="key">${i + 1}</span></div>`;
    el.title = t.tip;
    const sw = new Spring(0, 0.07, 0.88).on((v) => { el.style.transform = `rotate(${v}deg)`; });
    el.addEventListener('pointerenter', () => sw.kick(5));
    el.addEventListener('click', () => selectTool(t));
    toolEls.set(t, { el, sw });
    $('cl-rack').appendChild(el);
  });
  const usable = (t: Tool) => !!current && (t.id === 'scissors'
    ? current.o.damage?.mushroom === 'mature' && !current.harvested
    : !!current.o.damage && current.o.damage.stage > 0 && !current.wipe?.completed && (t.fam as readonly string[]).includes(current.o.damage.family));
  function refreshTools(): void {
    for (const [t, { el }] of toolEls) { el.classList.toggle('off', !!current && !usable(t)); el.classList.toggle('taken', tool === t); }
  }
  function putBackTool(): void {
    if (!tool) return;
    toolEls.get(tool)!.sw.kick(-8);
    tool = null;
    $('cl-cursor').style.display = 'none';
    $('cl-cutline').style.opacity = '0';
    refreshTools();
  }
  function selectTool(t: Tool): void {
    const { sw } = toolEls.get(t)!;
    if (tool === t) { putBackTool(); Sound.drop(); return; }
    if (!current) { sw.kick(8); toast('先从绳子上拽一个下来'); return; }
    if (!usable(t)) {
      sw.kick(10);
      toast(t.id === 'scissors' ? '只有成熟菇能剪' : current.o.damage?.stage ? `${t.name}对付不了${FAMILY[current.o.damage.family]}，换一件试试` : '已经干净了，只差把菇剪下来');
      return;
    }
    if (tool) putBackTool();
    tool = t;
    Sound.pick();
    $('cl-cursor').style.display = 'block';
    ($('cl-cursor').querySelector('img') as HTMLImageElement).src = t.act;
    current.wipe?.setRadius(t.radius || 24);
    $('cl-cutline').style.opacity = t.id === 'scissors' ? '1' : '0';
    setHint(t.id === 'scissors' ? '沿白色虚线，<b>一刀划过</b>菌柄' : '按住来回擦 · <kbd>空格</kbd> 看剩哪里');
    refreshTools();
  }
  // 跟手：位置即时，角度按水平速度倾斜，按下时轻微下压
  const tilt = new Spring(0, 0.12, 0.78);
  const press = new Spring(1, 0.25, 0.6);
  const cursorImg = $('cl-cursor').querySelector('img') as HTMLImageElement;
  const paintCursor = () => { cursorImg.style.transform = `rotate(${tilt.value.toFixed(2)}deg) scale(${press.value.toFixed(3)})`; };
  tilt.on(paintCursor); press.on(paintCursor);
  let lastX = 0;
  addEventListener('pointermove', (e) => {
    if (!tool) return;
    $('cl-cursor').style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 20}px)`;
    tilt.set(Math.max(-26, Math.min(26, (e.clientX - lastX) * 1.7)));
    lastX = e.clientX;
  });
  addEventListener('pointerdown', () => { if (tool) press.set(0.9); });
  addEventListener('pointerup', () => press.set(1));
  addEventListener('blur', () => { tilt.set(0); press.set(1); });
  addEventListener('keydown', (e) => {
    if (document.body.classList.contains('cl-journal') || (e.target as HTMLElement)?.closest?.('input,select,textarea')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= TOOLS.length) selectTool(TOOLS[n - 1]);
    if (e.code === 'Space' && current?.wipe && !current.wipe.completed) { e.preventDefault(); current.wipe.highlight(); Sound.drip(); }
    if (e.key === 'Escape') { if (tool) putBackTool(); else if (current) returnToRope(); }
  });

  // ---------- 盆 ----------
  let current: null | { h: Hang; o: ObjView; wipe: WipeHandle | null; harvested: boolean } = null;
  let busy = false;
  let wiping = false;
  async function pop(h: Hang): Promise<void> {
    if (busy) return;
    busy = true;
    if (current) returnToRope(true);
    const icon = h.el.querySelector('.cl-icon') as HTMLElement;
    const from = icon.getBoundingClientRect();
    h.gone = true; h.el.classList.add('hidden');
    h.load = 0; h.dragLoad = null;
    ropeKicks.push({ r: h.rope, x: h.ax, amp: -18, t: 0 });
    hangs.forEach((o) => { if (o.rope === h.rope && !o.gone) o.swingV += (o.ax < h.ax ? -1 : 1) * 1.8; });
    Sound.snip();
    const fly = icon.cloneNode(true) as HTMLElement;
    fly.classList.add('cl-fly');
    Object.assign(fly.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
    document.body.appendChild(fly);
    const to = $('cl-float').getBoundingClientRect();
    const tx = to.left - from.left, ty = to.top - from.top, sc = to.width / from.width;
    await fly.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)' },
      { transform: `translate(${tx * 0.45}px, ${ty * 0.25 - 70 * scale()}px) scale(${1 + (sc - 1) * 0.5}) rotate(-14deg)`, offset: 0.45 },
      { transform: `translate(${tx * 0.96}px, ${ty * 1.04}px) scale(${sc * 1.03}) rotate(3deg)`, offset: 0.86 },
      { transform: `translate(${tx}px, ${ty}px) scale(${sc}) rotate(0deg)` },
    ], { duration: 680, easing: 'cubic-bezier(.45,0,.25,1)' }).finished;
    fly.remove();
    Sound.drop();
    const b = $('cl-float').getBoundingClientRect();
    Fx.splash(b.left + b.width / 2, b.bottom - 6, 18);
    ripple(BASIN.cx, BASIN.wcy - 4, 1.4); ripple(BASIN.cx, BASIN.wcy - 4, 0.8, 140);
    try { await openInBasin(h); } finally { busy = false; }
  }
  async function openInBasin(h: Hang): Promise<void> {
    const o = h.o;
    current = { h, o, wipe: null, harvested: false };
    const m = $('cl-mushroom') as HTMLImageElement;
    if (o.damage && o.damage.mushroom !== 'none') {
      const ms = mushroomSrc(o.mushroomSpecies, o.damage.mushroom);
      m.src = ms.src; m.className = ms.full ? 'full' : ''; m.style.display = 'block';
    } else m.style.display = 'none';
    const dirty = await dirtyDataUrl(o);
    const stageN = o.damage?.stage ?? 0;
    if (stageN > 0) {
      const names = LAYERS[o.damage!.family].slice(0, stageN >= 2 ? 2 : 1);
      $('cl-layers').innerHTML = names.map((n) => `<div class="cl-chip" style="--p:0"><span class="ring"></span>${n}</div>`).join('');
    } else $('cl-layers').innerHTML = '<div class="cl-chip done" style="--p:1"><span class="ring"></span>已干净</div>';
    let lastRipple = 0;
    current.wipe = await createWipe({
      host: $('cl-wipe'), dirtySrc: dirty, cleanSrc: o.iconDataUrl, size: 200, radius: tool?.radius || 24,
      savedMask: stageN > 0 ? o.careMask : undefined,
      canWipe: () => {
        if (!tool) { toast('先从左边的挂钩上拿一件工具（或按 1–4）'); return false; }
        if (tool.id === 'scissors') return false;
        wiping = true;
        return stageN > 0;
      },
      onStroke: (x, y) => {
        const r = $('cl-wipe').getBoundingClientRect();
        const s = scale();
        if (Math.random() < 0.22) (o.damage?.family === 'damp' ? Fx.splash.bind(Fx) : Fx.dust.bind(Fx))(r.left + x * s, r.top + y * s, 2);
        const now = performance.now();
        if (now - lastRipple > 220) { lastRipple = now; ripple(BASIN.cx + (x - 100) * 0.9, BASIN.wcy - 2, 0.7); }
      },
      onProgress: (p) => {
        $('cl-layers').querySelectorAll<HTMLElement>('.cl-chip').forEach((el, i, all) => {
          if (el.classList.contains('done') && stageN === 0) return;
          const lp = Math.max(0, Math.min(1, p * all.length - i));
          el.style.setProperty('--p', lp.toFixed(3));
          if (lp >= 0.999 && !el.classList.contains('done')) {
            el.classList.add('done'); Sound.layer();
            const rr = el.getBoundingClientRect(); Fx.sparkle(rr.left + rr.width / 2, rr.top + 14, 10);
          }
        });
      },
      onRelease: () => { wiping = false; void saveProgress(); },
      onComplete: () => { wiping = false; void completeCare(); },
    });
    if (stageN === 0) current.wipe.canvas.style.opacity = '0';
    if (tool && !usable(tool)) putBackTool();
    if (stageN === 0) setHint('已经干净了 · 换剪刀 <kbd>4</kbd> 把菇剪下来');
    else setHint(tool ? '按住来回擦 · <kbd>空格</kbd> 看剩哪里' : '从挂钩拿一件工具 · <kbd>1</kbd>–<kbd>4</kbd>');
    refreshTools();
  }
  /** 松手 / 换对象 / 关窗时保存进度与掩码（主进程拒绝旧回执时如实提示） */
  async function saveProgress(): Promise<void> {
    if (!current?.wipe || current.wipe.completed || !current.o.damage?.stage) return;
    const result = await damp!.native.careProgress(current.o.id, Math.min(0.999, current.wipe.progress), current.wipe.maskBase64);
    if (!result.ok && result.message) toast(`进度没保存上：${result.message}`);
  }
  function returnToRope(silent = false): void {
    if (!current) return;
    const { h } = current;
    void saveProgress();
    current.wipe?.destroy();
    current = null;
    $('cl-layers').innerHTML = ''; ($('cl-mushroom') as HTMLImageElement).style.display = 'none';
    h.gone = false; h.el.classList.remove('hidden');
    h.load = h.weight + 40; h.loadV = 0;
    layout();
    putBackTool();
    if (!silent) { Sound.pick(); toast('先挂回去晾着'); }
    setHint(HINT_IDLE);
  }

  // ---------- 剪刀 ----------
  let cut: null | { y0: number; line: number; minX: number; maxX: number; crossed: boolean; at: number } = null;
  $('cl-float').addEventListener('pointerdown', (e) => {
    if (tool?.id !== 'scissors' || !current || current.harvested || current.o.damage?.mushroom !== 'mature') return;
    e.preventDefault(); e.stopPropagation();
    const r = $('cl-cutline').getBoundingClientRect();
    cut = { y0: e.clientY, line: r.top, minX: r.left, maxX: r.right, crossed: false, at: 0.5 };
  }, true);
  addEventListener('pointermove', (e) => {
    if (!cut) return;
    if ((cut.y0 - cut.line) * (e.clientY - cut.line) <= 0 && e.clientX > cut.minX && e.clientX < cut.maxX && !cut.crossed) {
      cut.crossed = true;
      cut.at = (e.clientX - cut.minX) / (cut.maxX - cut.minX);
    }
  });
  addEventListener('pointerup', () => {
    if (!cut) return;
    const c = cut; cut = null;
    if (!c.crossed) { toast('一刀要划过白色虚线'); return; }
    // 剪切准度：越靠近菌柄中线越准（主进程夹取到 0..1 并按存档种子结算孢子）
    void harvest(Math.max(0, 1 - Math.abs(c.at - 0.5) * 2));
  });
  async function harvest(cutQuality: number): Promise<void> {
    if (!current || busy) return;
    busy = true;
    const cur = current;
    const result = damp!.native.harvestV2
      ? await damp!.native.harvestV2({ objectId: cur.o.id, cutQuality })
      : await damp!.native.harvest(cur.o.id);
    if (!result.ok) { busy = false; toast(result.message ?? '采摘失败'); return; }
    cur.harvested = true;
    Sound.snip();
    const m = $('cl-mushroom') as HTMLImageElement;
    const mr = m.getBoundingClientRect();
    const fly = m.cloneNode() as HTMLImageElement;
    m.style.display = 'none';
    fly.classList.add('cl-fly');
    Object.assign(fly.style, { left: mr.left + 'px', top: mr.top + 'px', width: mr.width + 'px', height: mr.height + 'px', display: 'block' });
    document.body.appendChild(fly);
    const bk = $('cl-basket').getBoundingClientRect();
    const tx = bk.left + bk.width / 2 - (mr.left + mr.width / 2), ty = bk.top - (mr.top + mr.height * 0.6);
    await fly.animate([
      { transform: 'translate(0,0) rotate(0) scale(1)' },
      { transform: `translate(${tx * 0.35}px, ${-70 * scale()}px) rotate(-26deg) scale(.82)`, offset: 0.38 },
      { transform: `translate(${tx}px, ${ty}px) rotate(18deg) scale(.36)` },
    ], { duration: 820, easing: 'cubic-bezier(.3,0,.35,1)' }).finished;
    fly.remove();
    $('cl-basket').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12, .88)' }, { transform: 'scale(.97, 1.04)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    const jr = $('cl-jar').getBoundingClientRect();
    const gained = 'coins' in result && typeof result.coins === 'number' ? result.coins : 4;
    let shown = coins;
    Fx.coins({ x: bk.left + bk.width / 2, y: bk.top + 10 }, { x: jr.left + jr.width / 2, y: jr.top + jr.height * 0.3 }, Math.min(6, gained), () => { shown += 1; paintCoins(shown); Sound.coin(); });
    const spore = 'spore' in result ? result.spore : undefined;
    toast(spore ? `剪得很准！+${gained} 菇币，还掉了 1 枚孢子` : `采下来了！+${gained} 菇币 · 菇采了，霉还在`);
    cur.o.damage = cur.o.damage ? { ...cur.o.damage, mushroom: 'none' } : cur.o.damage;
    $('cl-cutline').style.opacity = '0';
    putBackTool();
    busy = false;
    if (!cur.o.damage || cur.o.damage.stage === 0) { await finishToSun(cur.h); return; }
    setHint('菇采了，霉还在 · 拿工具接着擦');
    refreshTools();
  }

  // ---------- 完成：跳出盆，挂去晒太阳 ----------
  async function completeCare(): Promise<void> {
    if (!current) return;
    const cur = current;
    const result = await damp!.native.careComplete(cur.o.id);
    if (!result.ok) { toast(result.message ?? '护理完成没有保存上，可以再擦一下重试'); return; }
    Sound.done();
    const f = $('cl-float').getBoundingClientRect();
    Fx.sparkle(f.left + f.width / 2, f.top + f.height / 2, 28);
    ripple(BASIN.cx, BASIN.wcy, 1.2);
    cur.o.damage = cur.o.damage ? { ...cur.o.damage, stage: 0 } : null;
    $('cl-layers').innerHTML = '<div class="cl-chip done" style="--p:1"><span class="ring"></span>干净了</div>';
    if (cur.o.damage?.mushroom === 'mature') {
      toast('干净了！菇还在——换剪刀剪下来');
      setHint('换剪刀 <kbd>4</kbd>，沿虚线一刀划过');
      putBackTool(); refreshTools();
      return;
    }
    toast('干净了！拿去晒太阳 · 10 天内不再发霉');
    await new Promise((r) => setTimeout(r, 650));
    await finishToSun(cur.h);
  }
  async function finishToSun(h: Hang): Promise<void> {
    busy = true;
    const from = $('cl-wipe').getBoundingClientRect();
    current?.wipe?.destroy();
    current = null;
    $('cl-layers').innerHTML = ''; ($('cl-mushroom') as HTMLImageElement).style.display = 'none';
    putBackTool();
    setHint(HINT_IDLE);
    removeHang(h);
    // 晒绳满了：最早晾上的那件收走
    const sunList = hangs.filter((x) => x.rope === SUN);
    if (sunList.length >= SUN_CAP) removeHang(sunList[0]);
    const nh = await makeHang(h.o, SUN);
    nh.gone = true; nh.el.classList.add('hidden');
    layout();
    nh.axSpring.jump(nh.slotX); nh.ax = nh.slotX; nh.lastAx = nh.slotX;
    const fly = document.createElement('img');
    fly.src = h.o.iconDataUrl; fly.className = 'cl-fly';
    Object.assign(fly.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
    document.body.appendChild(fly);
    const s = scale();
    const sr = stage.getBoundingClientRect();
    const tx = sr.left + (nh.slotX - 32) * s - from.left, ty = sr.top + (ropeBase(SUN, nh.slotX) + 10) * s - from.top;
    await fly.animate([
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${tx * 0.5}px, ${ty * 0.5 - 120 * s}px) scale(.6) rotate(-20deg)`, offset: 0.5 },
      { transform: `translate(${tx}px, ${ty}px) scale(${(64 * s) / from.width}) rotate(0)` },
    ], { duration: 760, easing: 'cubic-bezier(.4,0,.2,1)' }).finished;
    fly.remove();
    nh.gone = false; nh.el.classList.remove('hidden');
    nh.load = nh.weight + 26; nh.loadV = 0; nh.swingV = 3;
    Sound.pick();
    Fx.sparkle(sr.left + nh.slotX * s, sr.top + (ropeBase(SUN, nh.slotX) + 40) * s, 14);
    busy = false;
    await refresh();
  }

  // ---------- 与真实状态同步 ----------
  async function refresh(): Promise<void> {
    if (wiping || busy) return;
    let s: StatusV4;
    try { s = (await damp!.native.status()) as StatusV4; } catch { return; }
    status = s;
    paintCoins(s.coins);
    paintNote(s);
    paintBasket(s);
    const objs = s.objects as ObjView[];
    const now = Date.now();
    const pending = objs.filter(needsCare).sort((a, b) => priority(a) - priority(b) || b.lastAdvanceAt - a.lastAdvanceAt);
    const dryList = objs.filter((o) => !needsCare(o) && o.moldImmuneUntil > now).sort((a, b) => a.moldImmuneUntil - b.moldImmuneUntil).slice(-SUN_CAP);
    const byId = new Map(objs.map((o) => [o.id, o]));
    // 保留当前在盆里的对象
    const keepId = current?.o.id;
    const mainIds = new Set<string>();
    for (const h of hangs.filter((x) => x.rope === MAIN)) {
      const fresh = byId.get(h.o.id);
      if (h.o.id === keepId) { mainIds.add(h.o.id); continue; }
      if (!fresh || !needsCare(fresh)) { removeHang(h); continue; }
      // 状态变了（自然推进/外部护理）：重绘挂件内容
      if (JSON.stringify(fresh.damage) !== JSON.stringify(h.o.damage) || fresh.mushroomSpecies !== h.o.mushroomSpecies) {
        h.o = fresh;
        h.el.innerHTML = hangHtml(fresh, false, await dirtyDataUrl(fresh));
        h.body = h.el.querySelector('.cl-body') as HTMLElement; h.tag = h.el.querySelector('.cl-tag') as HTMLElement;
        h.body.addEventListener('pointerenter', () => { if (!h.drag) { h.swingV += 1.6; Sound.tap(); } });
        h.body.addEventListener('pointerdown', (e) => startDrag(h, e));
      } else h.o = fresh;
      mainIds.add(h.o.id);
    }
    for (const o of pending) {
      if (mainIds.size >= MAIN_CAP) break;
      if (mainIds.has(o.id)) continue;
      await makeHang(o, MAIN);
      mainIds.add(o.id);
    }
    const sunIds = new Set(hangs.filter((x) => x.rope === SUN).map((x) => x.o.id));
    for (const h of hangs.filter((x) => x.rope === SUN)) if (!dryList.some((d) => d.id === h.o.id)) removeHang(h);
    for (const o of dryList) if (!sunIds.has(o.id)) await makeHang(o, SUN);
    const firstLayout = !laidOut;
    layout(firstLayout);
    laidOut = true;
    const waiting = pending.filter((o) => !mainIds.has(o.id)).length;
    const pen = $('cl-pending');
    pen.textContent = waiting > 0 ? `衣篓里还有 ${waiting} 件` : '';
    pen.classList.toggle('hidden', waiting === 0);
    $('cl-empty').classList.toggle('hidden', pending.length > 0 || !!current);
    if (!current) setHint(pending.length ? HINT_IDLE : '');
    refreshTools();
  }
  let laidOut = false;

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh(); else void saveProgress(); });
  addEventListener('beforeunload', () => { void saveProgress(); });
  setInterval(() => { if (document.visibilityState === 'visible' && !document.body.classList.contains('cl-journal')) void refresh(); }, 30_000);

  setHint(HINT_IDLE);
  void refresh();
  requestAnimationFrame(frame);
  (window as unknown as { __clothesline?: unknown }).__clothesline = {
    pull: (i: number) => { const h = hangs.filter((x) => x.rope === MAIN && !x.gone)[i]; if (h) autoPull(h); },
    selectTool: (i: number) => selectTool(TOOLS[i]),
    // 只读探针（UAT 用）：不改状态
    info: () => ({
      main: hangs.filter((x) => x.rope === MAIN).map((x) => x.o.id),
      sun: hangs.filter((x) => x.rope === SUN).map((x) => x.o.id),
      current: current?.o.id ?? null,
      progress: current?.wipe?.progress ?? null,
      busy,
      pending: $('cl-pending').textContent,
    }),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
