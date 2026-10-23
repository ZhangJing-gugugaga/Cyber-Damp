/**
 * WebAudio 程序合成音效（audio 层，零音频资产——SPEC §4）
 * 雨声底噪（白噪 + 低通）/ 蘑菇啵 / 剪刀咔嚓 / 金币 / 拧干水声 / 绳崩断裂响
 * 全部惰性创建 AudioContext（首次用户手势后可用）
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private rainGain: GainNode | null = null;
  private master = true;

  private ensure(): AudioContext | null {
    if (!this.master) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on: boolean): void {
    this.master = on;
    if (!on && this.rainGain && this.ctx) {
      this.rainGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.rainGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  /** 环境雨声 0..1（0 关闭）；持续底噪，电平渐变 */
  setRain(level: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this.rainGain) {
      // 2s 白噪循环 + 低通 = 远处淅沥雨声
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      src.connect(lp).connect(this.rainGain).connect(ctx.destination);
      src.start();
    }
    this.rainGain.gain.linearRampToValueAtTime(level * 0.06, ctx.currentTime + 0.8);
  }

  /** 蘑菇破土「啵」（音高随稀有度：N 低 R 高） */
  pop(pitch = 1): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(520 * pitch, t + 0.09);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** 剪刀脆响（AC-15）：短高频噪声脉冲 */
  snip(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    src.connect(hp).connect(g).connect(ctx.destination);
    src.start(t);
  }

  /** 金币入账：双音上行 */
  coin(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const t0 = t + i * 0.08;
      g.gain.setValueAtTime(0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    });
  }

  /** 拧干飙水：带通噪声扫频 */
  splash(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.3);
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
  }

  /** Tilting the full box: a sustained stream, with low bubbling underneath. */
  pour(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const duration = 1.2;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const seconds = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * (0.7 + 0.3 * Math.sin(seconds * 43) ** 2);
    }
    const source = ctx.createBufferSource(); source.buffer = buf;
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 240;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass';
    low.frequency.setValueAtTime(3200, t); low.frequency.linearRampToValueAtTime(1600, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.23, t + 0.045);
    gain.gain.setValueAtTime(0.2, t + 0.94);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(high).connect(low).connect(gain).connect(ctx.destination);
    source.start(t);
    for (let i = 0; i < 6; i++) {
      const bubble = ctx.createOscillator(), level = ctx.createGain();
      const at = t + 0.08 + i * 0.16;
      bubble.frequency.setValueAtTime(150 + i % 3 * 35, at);
      bubble.frequency.exponentialRampToValueAtTime(420, at + 0.075);
      level.gain.setValueAtTime(0.035, at);
      level.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      bubble.connect(level).connect(ctx.destination); bubble.start(at); bubble.stop(at + 0.1);
    }
  }

  /** A short, strained fibre squeak; repeated only while the rope is near its limit. */
  creak(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(), band = ctx.createBiquadFilter(), gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, t);
    osc.frequency.linearRampToValueAtTime(158, t + 0.21);
    osc.frequency.linearRampToValueAtTime(103, t + 0.48);
    band.type = 'bandpass'; band.frequency.value = 560; band.Q.value = 3.2;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.065, t + 0.05);
    gain.gain.linearRampToValueAtTime(0.018, t + 0.13);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(band).connect(gain).connect(ctx.destination); osc.start(t); osc.stop(t + 0.52);
  }

  /** Soft wooden hanger / paper bundle contact. */
  knock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(230, t);
    osc.frequency.exponentialRampToValueAtTime(85, t + 0.09);
    gain.gain.setValueAtTime(0.11, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(gain).connect(ctx.destination); osc.start(t); osc.stop(t + 0.14);
  }

  /** 绳崩断裂响（AC-12b 表现） */
  crack(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  /** Crushed dry leaves: several irregular, high-passed paper transients. */
  explosion(): void {
    const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.85), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / d.length * 6);
    const noise = ctx.createBufferSource(); noise.buffer = buf;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 240;
    const gain = ctx.createGain(); gain.gain.value = 0.48;
    noise.connect(low).connect(gain).connect(ctx.destination); noise.start(t);
    const osc = ctx.createOscillator(), thump = ctx.createGain();
    osc.frequency.setValueAtTime(95, t); osc.frequency.exponentialRampToValueAtTime(26, t + 0.5);
    thump.gain.setValueAtTime(0.28, t); thump.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    osc.connect(thump).connect(ctx.destination); osc.start(t); osc.stop(t + 0.7);
  }

  /** Crushed dry leaves: several irregular, high-passed paper transients. */
  dryLeaf(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const length = Math.floor(ctx.sampleRate * 0.24);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const seconds = i / ctx.sampleRate;
      const pulses = Math.exp(-seconds * 38) + (seconds > 0.045 ? 0.7 * Math.exp(-(seconds - 0.045) * 65) : 0)
        + (seconds > 0.11 ? 0.45 * Math.exp(-(seconds - 0.11) * 80) : 0);
      data[i] = (Math.random() * 2 - 1) * pulses;
    }
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 1700;
    const gain = ctx.createGain(); gain.gain.value = 0.18;
    source.connect(high).connect(gain).connect(ctx.destination);
    source.start(t);
  }

  /** 迁徙风声（AC-03 切城音效）：带通噪声上扫 */
  whoosh(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(1800, t + 0.45);
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
  }

  /** 小扫把清扫：短促噪声刷 */
  swish(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.14);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1500, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
  }

  /** 音频类八音盒走调旋律（P1）：四音小句，轻微走音 */
  musicBox(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const t0 = t + i * 0.18;
      osc.frequency.setValueAtTime(f * 1.0104, t0); // +18 cents 走调
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.42);
    });
  }

  /** 远处闷雷（开场 ASMR）：低频噪声长衰减 */
  thunder(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 1.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    src.connect(lp).connect(g).connect(ctx.destination);
    src.start(t);
  }
}
