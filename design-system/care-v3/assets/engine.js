/*
 * care-v3 方向稿共用交互引擎（纯前端，零依赖）。
 * - CDWipe：在"损伤图"上擦出"干净图"（两张都来自产品 state-icon 真实材质）；
 *   进度按"真实损伤格"计（64×64 网格里 dirty≠clean 的格），≥90% 自动收尾。
 * - CDSound：WebAudio 合成的克制音效（可关闭）。
 * - CDFx：全窗粒子层（水花、光点、金币飞行）。
 * - CDSpring：弹簧插值（UI 跟手动画用）。
 */
(function () {
  'use strict';
  const GRID = 64;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片加载失败: ' + src));
      img.src = src;
    });
  }

  // ---------- 声音 ----------
  const CDSound = (() => {
    let ctx = null;
    let enabled = true;
    const ac = () => {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    };
    function tone(freq, dur, type = 'sine', gain = 0.08, slideTo) {
      if (!enabled) return;
      const c = ac();
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
    function noise(dur, gain = 0.03, hp = 1200) {
      if (!enabled) return;
      const c = ac();
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
    return {
      set enabled(v) { enabled = v; }, get enabled() { return enabled; },
      tap: () => tone(660, 0.08, 'triangle', 0.05),
      pick: () => tone(520, 0.12, 'sine', 0.06, 780),
      drop: () => tone(300, 0.16, 'sine', 0.07, 180),
      scrub: () => noise(0.06, 0.018, 2200),
      layer: () => { tone(988, 0.16, 'sine', 0.06); setTimeout(() => tone(1318, 0.22, 'sine', 0.05), 70); },
      done: () => { [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'sine', 0.05), i * 80)); },
      snip: () => { noise(0.05, 0.05, 3500); tone(1800, 0.05, 'square', 0.02); },
      coin: () => { tone(1320, 0.07, 'square', 0.025); setTimeout(() => tone(1760, 0.12, 'square', 0.025), 60); },
      drip: () => tone(1200, 0.12, 'sine', 0.035, 600),
    };
  })();

  // ---------- 粒子层 ----------
  const CDFx = (() => {
    let canvas = null, ctx = null;
    const parts = [];
    let raf = 0;
    function ensure() {
      if (canvas) return;
      canvas = document.createElement('canvas');
      canvas.className = 'cd-fx';
      Object.assign(canvas.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 9999 });
      document.body.appendChild(canvas);
      ctx = canvas.getContext('2d');
      const resize = () => { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; };
      resize(); addEventListener('resize', resize);
    }
    function loop() {
      const dpr = devicePixelRatio;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const p = parts[i];
        p.t += 1;
        if (p.target) {
          const k = Math.min(1, p.t / p.life);
          const e = k * k * (3 - 2 * k);
          p.x = p.sx + (p.target.x - p.sx) * e;
          p.y = p.sy + (p.target.y - p.sy) * e - Math.sin(k * Math.PI) * 80;
        } else {
          p.vy += p.g; p.vx *= 0.985; p.x += p.vx; p.y += p.vy;
        }
        const a = 1 - p.t / p.life;
        if (a <= 0) { parts.splice(i, 1); if (p.onArrive) p.onArrive(); continue; }
        ctx.globalAlpha = p.target ? 1 : a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        if (p.shape === 'drop') {
          ctx.ellipse(p.x * dpr, p.y * dpr, p.r * dpr * 0.7, p.r * dpr, 0, 0, Math.PI * 2);
        } else if (p.shape === 'star') {
          const r = p.r * dpr * (0.6 + 0.4 * Math.sin(p.t * 0.3));
          for (let k = 0; k < 8; k += 1) {
            const rr = k % 2 ? r * 0.35 : r;
            const ang = (k / 8) * Math.PI * 2 + p.t * 0.05;
            ctx.lineTo(p.x * dpr + Math.cos(ang) * rr, p.y * dpr + Math.sin(ang) * rr);
          }
        } else {
          ctx.arc(p.x * dpr, p.y * dpr, p.r * dpr, 0, Math.PI * 2);
        }
        ctx.fill();
        if (p.shape === 'coin') {
          ctx.fillStyle = '#fff6c9'; ctx.globalAlpha *= 0.8;
          ctx.beginPath(); ctx.arc((p.x - p.r * 0.3) * dpr, (p.y - p.r * 0.3) * dpr, p.r * 0.35 * dpr, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      raf = parts.length ? requestAnimationFrame(loop) : 0;
    }
    function add(p) { ensure(); parts.push(p); if (!raf) raf = requestAnimationFrame(loop); }
    return {
      splash(x, y, n = 10, colors = ['#9fd8ff', '#d7f0ff', '#ffffff']) {
        for (let i = 0; i < n; i += 1) add({ x, y, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 5 - 1, g: 0.3, r: 2 + Math.random() * 3, color: colors[i % colors.length], t: 0, life: 40 + Math.random() * 20, shape: 'drop' });
      },
      sparkle(x, y, n = 14, colors = ['#fff3b0', '#ffffff', '#ffd27a']) {
        for (let i = 0; i < n; i += 1) {
          const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
          add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: 0.04, r: 3 + Math.random() * 4, color: colors[i % colors.length], t: 0, life: 50 + Math.random() * 30, shape: 'star' });
        }
      },
      dust(x, y, n = 8, colors = ['#7b6a8a', '#a493b3', '#5b4c66']) {
        for (let i = 0; i < n; i += 1) add({ x, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, g: 0.08, r: 1.5 + Math.random() * 2.5, color: colors[i % colors.length], t: 0, life: 30 + Math.random() * 20 });
      },
      coins(from, to, n, onEach) {
        for (let i = 0; i < n; i += 1) {
          setTimeout(() => add({ sx: from.x + (Math.random() - 0.5) * 30, sy: from.y, x: from.x, y: from.y, target: to, r: 8, color: '#f2b84b', t: 0, life: 46, shape: 'coin', onArrive: onEach }), i * 90);
        }
      },
    };
  })();

  // ---------- 弹簧 ----------
  function CDSpring(value, { stiffness = 0.18, damping = 0.72 } = {}) {
    let v = 0, target = value, cur = value, raf = 0;
    const subs = [];
    function step() {
      const f = (target - cur) * stiffness;
      v = (v + f) * damping;
      cur += v;
      subs.forEach((fn) => fn(cur));
      if (Math.abs(v) > 0.001 || Math.abs(target - cur) > 0.001) raf = requestAnimationFrame(step);
      else { cur = target; subs.forEach((fn) => fn(cur)); raf = 0; }
    }
    return {
      set(t) { target = t; if (!raf) raf = requestAnimationFrame(step); },
      kick(dv) { v += dv; if (!raf) raf = requestAnimationFrame(step); },
      // 瞬时定位（初次布局用，不播动画）
      jump(t) { target = t; cur = t; v = 0; subs.forEach((fn) => fn(cur)); },
      get value() { return cur; },
      on(fn) { subs.push(fn); fn(cur); return this; },
    };
  }

  // ---------- 擦拭 ----------
  /**
   * opts: { host, dirtySrc, cleanSrc, size, radius, onProgress(p), onComplete(), onStroke(x,y) }
   * 返回 { setRadius, setStrength, highlight(), reset(), progress, destroy() }
   */
  async function CDWipe(opts) {
    const size = opts.size || 280;
    const [dirty, clean] = await Promise.all([loadImage(opts.dirtySrc), loadImage(opts.cleanSrc)]);
    const host = opts.host;
    host.innerHTML = '';
    host.style.position = host.style.position || 'relative';
    host.style.width = size + 'px';
    host.style.height = size + 'px';
    const cleanImg = document.createElement('img');
    cleanImg.src = opts.cleanSrc;
    Object.assign(cleanImg.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', userSelect: 'none' });
    cleanImg.draggable = false;
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = size * dpr; cv.height = size * dpr;
    Object.assign(cv.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'none' });
    const glow = document.createElement('canvas');
    glow.width = cv.width; glow.height = cv.height;
    Object.assign(glow.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', mixBlendMode: 'screen', opacity: 0 });
    host.append(cleanImg, cv, glow);
    const ctx = cv.getContext('2d');
    ctx.drawImage(dirty, 0, 0, cv.width, cv.height);

    // 损伤格：dirty 与 clean 像素差异显著的格子
    const probe = document.createElement('canvas');
    probe.width = GRID; probe.height = GRID;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    pctx.drawImage(dirty, 0, 0, GRID, GRID);
    const dd = pctx.getImageData(0, 0, GRID, GRID).data;
    pctx.clearRect(0, 0, GRID, GRID);
    pctx.drawImage(clean, 0, 0, GRID, GRID);
    const cd = pctx.getImageData(0, 0, GRID, GRID).data;
    const damage = new Uint8Array(GRID * GRID);
    let total = 0;
    for (let i = 0; i < GRID * GRID; i += 1) {
      const k = i * 4;
      const diff = Math.abs(dd[k] - cd[k]) + Math.abs(dd[k + 1] - cd[k + 1]) + Math.abs(dd[k + 2] - cd[k + 2]) + Math.abs(dd[k + 3] - cd[k + 3]);
      if (diff > 40) { damage[i] = 1; total += 1; }
    }
    const cleared = new Uint8Array(GRID * GRID);
    let clearedCount = 0;
    let radius = opts.radius || 26;
    let strength = 1;
    let completed = false;
    let last = null;
    let pressing = false;
    let lastScrubSound = 0;

    function cellsAround(x, y, r) {
      const g = GRID / size;
      const cx = x * g, cy = y * g, cr = r * g;
      for (let gy = Math.max(0, Math.floor(cy - cr)); gy <= Math.min(GRID - 1, Math.ceil(cy + cr)); gy += 1) {
        for (let gx = Math.max(0, Math.floor(cx - cr)); gx <= Math.min(GRID - 1, Math.ceil(cx + cr)); gx += 1) {
          if ((gx + 0.5 - cx) ** 2 + (gy + 0.5 - cy) ** 2 > cr * cr) continue;
          const i = gy * GRID + gx;
          if (damage[i] && !cleared[i]) { cleared[i] = 1; clearedCount += 1; }
        }
      }
    }
    function dab(x, y) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const r = radius * dpr;
      const grd = ctx.createRadialGradient(x * dpr, y * dpr, r * 0.2, x * dpr, y * dpr, r);
      grd.addColorStop(0, `rgba(0,0,0,${0.95 * strength})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(x * dpr, y * dpr, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      cellsAround(x, y, radius * 0.75);
    }
    function strokeTo(x, y) {
      if (last) {
        const dist = Math.hypot(x - last.x, y - last.y);
        const steps = Math.max(1, Math.ceil(dist / (radius / 3)));
        for (let s = 1; s <= steps; s += 1) dab(last.x + (x - last.x) * (s / steps), last.y + (y - last.y) * (s / steps));
      } else dab(x, y);
      last = { x, y };
      const now = performance.now();
      if (now - lastScrubSound > 90) { CDSound.scrub(); lastScrubSound = now; }
      if (opts.onStroke) opts.onStroke(x, y);
      report();
    }
    function report() {
      const p = total ? clearedCount / total : 1;
      if (opts.onProgress) opts.onProgress(p);
      if (!completed && p >= 0.9) finish();
    }
    function finish() {
      completed = true;
      pressing = false;
      // 自动收尾：剩余残渍淡出，不要求玩家找最后一个像素
      const start = performance.now();
      const snap = ctx.getImageData(0, 0, cv.width, cv.height);
      (function fade() {
        const k = Math.min(1, (performance.now() - start) / 420);
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.globalAlpha = 1 - k;
        ctx.putImageData(snap, 0, 0);
        cv.style.opacity = String(1 - k);
        if (k < 1) requestAnimationFrame(fade);
        else if (opts.onComplete) opts.onComplete();
      })();
      if (opts.onProgress) opts.onProgress(1);
    }
    const local = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (size / r.width), y: (e.clientY - r.top) * (size / r.height) };
    };
    const onDown = (e) => {
      if (completed || e.button !== 0) return;
      pressing = true; last = null;
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 合成指针 */ }
      const p = local(e); strokeTo(p.x, p.y);
    };
    const onMove = (e) => {
      if (opts.onHover) opts.onHover(local(e), e);
      if (!pressing || completed) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) { const p = local(ev); strokeTo(p.x, p.y); }
    };
    const onUp = () => { pressing = false; last = null; if (opts.onRelease) opts.onRelease(); };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', (e) => { if (opts.onLeave) opts.onLeave(e); });
    const onBlur = () => onUp();
    addEventListener('blur', onBlur);

    return {
      canvas: cv,
      get progress() { return total ? clearedCount / total : 1; },
      get completed() { return completed; },
      setRadius(r) { radius = r; },
      setStrength(s) { strength = s; },
      // 高亮剩余损伤（只描边，不清除）
      highlight() {
        const g = glow.getContext('2d');
        g.clearRect(0, 0, glow.width, glow.height);
        const cell = glow.width / GRID;
        g.fillStyle = 'rgba(160,255,230,0.9)';
        for (let i = 0; i < GRID * GRID; i += 1) {
          if (damage[i] && !cleared[i]) g.fillRect((i % GRID) * cell, Math.floor(i / GRID) * cell, cell, cell);
        }
        glow.animate([{ opacity: 0 }, { opacity: 0.85 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
      },
      destroy() {
        removeEventListener('blur', onBlur);
        host.innerHTML = '';
      },
    };
  }

  window.CDEngine = { CDWipe, CDSound, CDFx, CDSpring, loadImage };
})();
