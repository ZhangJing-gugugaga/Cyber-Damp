/**
 * 晾衣绳护理台的交互引擎（由 design-system/care-v3/assets/engine.js 移植为生产代码）。
 * - Wipe：在"损伤图"上擦出"干净图"。进度按真实损伤格计算（64×64 网格中损伤图与原图不同的格），
 *   掩码与产品 careMask 同一编码（1 = 已擦），可从存档恢复。
 * - Sound：WebAudio 合成的克制音效，可以关闭。
 * - Fx：全窗粒子（水花、光点、尘、金币飞行）。
 * - Spring：弹簧插值，用于跟手动画。
 * 不访问文件系统，也不调用 IPC；存档读写由 scene.ts 经 preload 完成。
 */
import { CARE_MASK_CELLS, decodeCareMask, encodeCareMask } from '../../shared/care-mask';

const GRID = 64;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

// ---------------- 声音 ----------------
class SoundBank {
  private ctx: AudioContext | null = null;
  enabled = localStorage.getItem('cd-sound') !== 'off';
  setEnabled(on: boolean): void { this.enabled = on; localStorage.setItem('cd-sound', on ? 'on' : 'off'); }
  private ac(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }
  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.06, slideTo?: number): void {
    if (!this.enabled) return;
    const c = this.ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, c.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }
  private noise(dur: number, gain = 0.03, hp = 1200): void {
    if (!this.enabled) return;
    const c = this.ac();
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(c.destination);
    src.start();
  }
  tap(): void { this.tone(660, 0.08, 'triangle', 0.04); }
  pick(): void { this.tone(520, 0.12, 'sine', 0.05, 780); }
  drop(): void { this.tone(300, 0.16, 'sine', 0.06, 180); }
  scrub(): void { this.noise(0.06, 0.016, 2200); }
  layer(): void { this.tone(988, 0.16, 'sine', 0.05); setTimeout(() => this.tone(1318, 0.22, 'sine', 0.045), 70); }
  done(): void { [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => this.tone(f, 0.28, 'sine', 0.045), i * 80)); }
  snip(): void { this.noise(0.05, 0.05, 3500); this.tone(1800, 0.05, 'square', 0.02); }
  coin(): void { this.tone(1320, 0.07, 'square', 0.022); setTimeout(() => this.tone(1760, 0.12, 'square', 0.022), 60); }
  drip(): void { this.tone(1200, 0.12, 'sine', 0.03, 600); }
}
export const Sound = new SoundBank();

// ---------------- 粒子 ----------------
interface Particle {
  x: number; y: number; vx: number; vy: number; g: number; r: number; color: string; t: number; life: number;
  shape: 'dot' | 'drop' | 'star' | 'coin';
  sx?: number; sy?: number; target?: { x: number; y: number }; onArrive?: () => void;
}
class FxLayer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private parts: Particle[] = [];
  private raf = 0;
  private ensure(): void {
    if (this.canvas) return;
    const c = document.createElement('canvas');
    Object.assign(c.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9999' });
    document.body.appendChild(c);
    const resize = () => { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; };
    resize(); addEventListener('resize', resize);
    this.canvas = c; this.ctx = c.getContext('2d');
  }
  private loop = (): void => {
    const ctx = this.ctx!; const c = this.canvas!; const dpr = devicePixelRatio;
    ctx.clearRect(0, 0, c.width, c.height);
    for (let i = this.parts.length - 1; i >= 0; i -= 1) {
      const p = this.parts[i];
      p.t += 1;
      if (p.target) {
        const k = Math.min(1, p.t / p.life), e = k * k * (3 - 2 * k);
        p.x = p.sx! + (p.target.x - p.sx!) * e;
        p.y = p.sy! + (p.target.y - p.sy!) * e - Math.sin(k * Math.PI) * 80;
      } else { p.vy += p.g; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; }
      const a = 1 - p.t / p.life;
      if (a <= 0) { this.parts.splice(i, 1); p.onArrive?.(); continue; }
      ctx.globalAlpha = p.target ? 1 : a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      if (p.shape === 'drop') ctx.ellipse(p.x * dpr, p.y * dpr, p.r * dpr * 0.7, p.r * dpr, 0, 0, Math.PI * 2);
      else if (p.shape === 'star') {
        const r = p.r * dpr * (0.6 + 0.4 * Math.sin(p.t * 0.3));
        for (let k = 0; k < 8; k += 1) {
          const rr = k % 2 ? r * 0.35 : r, ang = (k / 8) * Math.PI * 2 + p.t * 0.05;
          ctx.lineTo(p.x * dpr + Math.cos(ang) * rr, p.y * dpr + Math.sin(ang) * rr);
        }
      } else ctx.arc(p.x * dpr, p.y * dpr, p.r * dpr, 0, Math.PI * 2);
      ctx.fill();
      if (p.shape === 'coin') {
        ctx.fillStyle = '#fff6c9'; ctx.globalAlpha *= 0.8;
        ctx.beginPath(); ctx.arc((p.x - p.r * 0.3) * dpr, (p.y - p.r * 0.3) * dpr, p.r * 0.35 * dpr, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    this.raf = this.parts.length ? requestAnimationFrame(this.loop) : 0;
  };
  private add(p: Particle): void { this.ensure(); this.parts.push(p); if (!this.raf) this.raf = requestAnimationFrame(this.loop); }
  splash(x: number, y: number, n = 10, colors = ['#9fd8ff', '#d7f0ff', '#ffffff']): void {
    for (let i = 0; i < n; i += 1) this.add({ x, y, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 5 - 1, g: 0.3, r: 2 + Math.random() * 3, color: colors[i % colors.length], t: 0, life: 40 + Math.random() * 20, shape: 'drop' });
  }
  sparkle(x: number, y: number, n = 14, colors = ['#fff3b0', '#ffffff', '#ffd27a']): void {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: 0.04, r: 3 + Math.random() * 4, color: colors[i % colors.length], t: 0, life: 50 + Math.random() * 30, shape: 'star' });
    }
  }
  dust(x: number, y: number, n = 8, colors = ['#7b6a8a', '#a493b3', '#5b4c66']): void {
    for (let i = 0; i < n; i += 1) this.add({ x, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, g: 0.08, r: 1.5 + Math.random() * 2.5, color: colors[i % colors.length], t: 0, life: 30 + Math.random() * 20, shape: 'dot' });
  }
  coins(from: { x: number; y: number }, to: { x: number; y: number }, n: number, onEach?: () => void): void {
    for (let i = 0; i < n; i += 1) {
      setTimeout(() => this.add({ sx: from.x + (Math.random() - 0.5) * 30, sy: from.y, x: from.x, y: from.y, vx: 0, vy: 0, g: 0, target: to, r: 8, color: '#f2b84b', t: 0, life: 46, shape: 'coin', onArrive: onEach }), i * 90);
    }
  }
}
export const Fx = new FxLayer();

// ---------------- 弹簧 ----------------
export class Spring {
  private v = 0;
  private target: number;
  private cur: number;
  private raf = 0;
  private subs: Array<(v: number) => void> = [];
  constructor(value: number, private stiffness = 0.18, private damping = 0.72) { this.target = value; this.cur = value; }
  private step = (): void => {
    this.v = (this.v + (this.target - this.cur) * this.stiffness) * this.damping;
    this.cur += this.v;
    this.subs.forEach((fn) => fn(this.cur));
    if (Math.abs(this.v) > 0.001 || Math.abs(this.target - this.cur) > 0.001) this.raf = requestAnimationFrame(this.step);
    else { this.cur = this.target; this.subs.forEach((fn) => fn(this.cur)); this.raf = 0; }
  };
  set(t: number): void { this.target = t; if (!this.raf) this.raf = requestAnimationFrame(this.step); }
  kick(dv: number): void { this.v += dv; if (!this.raf) this.raf = requestAnimationFrame(this.step); }
  jump(t: number): void { this.target = t; this.cur = t; this.v = 0; this.subs.forEach((fn) => fn(t)); }
  get value(): number { return this.cur; }
  on(fn: (v: number) => void): this { this.subs.push(fn); fn(this.cur); return this; }
}

// ---------------- 擦拭 ----------------
export interface WipeOptions {
  host: HTMLElement;
  dirtySrc: string;
  cleanSrc: string;
  size: number;
  radius: number;
  /** 存档里的 careMask（1 = 已擦）；用于重开继续 */
  savedMask?: string;
  canWipe(): boolean;
  onStroke?(x: number, y: number): void;
  onProgress?(p: number): void;
  onRelease?(): void;
  onComplete?(): void;
}
export interface WipeHandle {
  canvas: HTMLCanvasElement;
  readonly progress: number;
  readonly completed: boolean;
  readonly maskBase64: string;
  setRadius(r: number): void;
  highlight(): void;
  destroy(): void;
}

export async function createWipe(opts: WipeOptions): Promise<WipeHandle> {
  const { size, host } = opts;
  const [dirty, clean] = await Promise.all([loadImage(opts.dirtySrc), loadImage(opts.cleanSrc)]);
  host.innerHTML = '';
  host.style.width = size + 'px';
  host.style.height = size + 'px';
  const cleanImg = document.createElement('img');
  cleanImg.src = opts.cleanSrc;
  cleanImg.draggable = false;
  Object.assign(cleanImg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = size * dpr; cv.height = size * dpr;
  Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none', cursor: 'none' });
  const glow = document.createElement('canvas');
  glow.width = cv.width; glow.height = cv.height;
  Object.assign(glow.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', mixBlendMode: 'screen', opacity: '0' });
  host.append(cleanImg, cv, glow);
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(dirty, 0, 0, cv.width, cv.height);

  // 损伤格
  const probe = document.createElement('canvas');
  probe.width = GRID; probe.height = GRID;
  const pctx = probe.getContext('2d', { willReadFrequently: true })!;
  pctx.drawImage(dirty, 0, 0, GRID, GRID);
  const dd = pctx.getImageData(0, 0, GRID, GRID).data;
  pctx.clearRect(0, 0, GRID, GRID);
  pctx.drawImage(clean, 0, 0, GRID, GRID);
  const cd = pctx.getImageData(0, 0, GRID, GRID).data;
  const damage = new Uint8Array(CARE_MASK_CELLS);
  let total = 0;
  for (let i = 0; i < CARE_MASK_CELLS; i += 1) {
    const k = i * 4;
    const diff = Math.abs(dd[k] - cd[k]) + Math.abs(dd[k + 1] - cd[k + 1]) + Math.abs(dd[k + 2] - cd[k + 2]) + Math.abs(dd[k + 3] - cd[k + 3]);
    if (diff > 40) { damage[i] = 1; total += 1; }
  }
  // 擦除记录：沿用存档掩码（整格清除，与旧护理台同一网格）
  const wiped = (opts.savedMask ? decodeCareMask(opts.savedMask) : null) ?? new Uint8Array(CARE_MASK_CELLS);
  let cleared = 0;
  const cellPx = cv.width / GRID;
  for (let i = 0; i < CARE_MASK_CELLS; i += 1) {
    if (!wiped[i]) continue;
    ctx.clearRect((i % GRID) * cellPx, Math.floor(i / GRID) * cellPx, cellPx + 0.5, cellPx + 0.5);
    if (damage[i]) cleared += 1;
  }
  let radius = opts.radius;
  let completed = false;
  let last: { x: number; y: number } | null = null;
  let pressing = false;
  let lastSound = 0;

  function markCells(x: number, y: number, r: number): void {
    const g = GRID / size, cx = x * g, cy = y * g, cr = r * g;
    for (let gy = Math.max(0, Math.floor(cy - cr)); gy <= Math.min(GRID - 1, Math.ceil(cy + cr)); gy += 1) {
      for (let gx = Math.max(0, Math.floor(cx - cr)); gx <= Math.min(GRID - 1, Math.ceil(cx + cr)); gx += 1) {
        if ((gx + 0.5 - cx) ** 2 + (gy + 0.5 - cy) ** 2 > cr * cr) continue;
        const i = gy * GRID + gx;
        if (!wiped[i]) { wiped[i] = 1; if (damage[i]) cleared += 1; }
      }
    }
  }
  function dab(x: number, y: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const r = radius * dpr;
    const grd = ctx.createRadialGradient(x * dpr, y * dpr, r * 0.2, x * dpr, y * dpr, r);
    grd.addColorStop(0, 'rgba(0,0,0,0.95)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x * dpr, y * dpr, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    markCells(x, y, radius * 0.75);
  }
  const progressNow = () => (total ? cleared / total : 1);
  function report(): void {
    const p = progressNow();
    opts.onProgress?.(p);
    if (!completed && p >= 0.9) finish();
  }
  function strokeTo(x: number, y: number): void {
    if (last) {
      const dist = Math.hypot(x - last.x, y - last.y);
      const steps = Math.max(1, Math.ceil(dist / (radius / 3)));
      for (let s = 1; s <= steps; s += 1) dab(last.x + (x - last.x) * (s / steps), last.y + (y - last.y) * (s / steps));
    } else dab(x, y);
    last = { x, y };
    const now = performance.now();
    if (now - lastSound > 90) { Sound.scrub(); lastSound = now; }
    opts.onStroke?.(x, y);
    report();
  }
  function finish(): void {
    completed = true;
    pressing = false;
    // 最后少量残渍自动收尾（不要求玩家找最后一个像素）
    wiped.fill(1);
    const start = performance.now();
    (function fade() {
      const k = Math.min(1, (performance.now() - start) / 420);
      cv.style.opacity = String(1 - k);
      if (k < 1) requestAnimationFrame(fade);
      else opts.onComplete?.();
    })();
    opts.onProgress?.(1);
  }
  const local = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (size / r.width), y: (e.clientY - r.top) * (size / r.height) };
  };
  const release = () => {
    if (!pressing) return;
    pressing = false; last = null;
    opts.onRelease?.();
  };
  cv.addEventListener('pointerdown', (e) => {
    if (completed || e.button !== 0 || !opts.canWipe()) return;
    pressing = true; last = null;
    try { cv.setPointerCapture(e.pointerId); } catch { /* 合成指针无捕获 */ }
    const p = local(e); strokeTo(p.x, p.y);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pressing || completed) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) { const p = local(ev); strokeTo(p.x, p.y); }
  });
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);
  cv.addEventListener('lostpointercapture', release);
  // 失焦即停（工具不能在后台继续）
  addEventListener('blur', release);

  return {
    canvas: cv,
    get progress() { return progressNow(); },
    get completed() { return completed; },
    get maskBase64() { return encodeCareMask(wiped); },
    setRadius(r: number) { radius = r; },
    highlight() {
      const g = glow.getContext('2d')!;
      g.clearRect(0, 0, glow.width, glow.height);
      const cell = glow.width / GRID;
      g.fillStyle = 'rgba(160,255,230,0.9)';
      for (let i = 0; i < CARE_MASK_CELLS; i += 1) if (damage[i] && !wiped[i]) g.fillRect((i % GRID) * cell, Math.floor(i / GRID) * cell, cell, cell);
      glow.animate([{ opacity: 0 }, { opacity: 0.85 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
    },
    destroy() { release(); removeEventListener('blur', release); host.innerHTML = ''; },
  };
}
