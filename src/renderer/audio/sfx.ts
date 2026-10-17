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
    if (!on && this.rainGain) this.rainGain.gain.value = 0;
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
