/** RMS envelope only: no samples, device IDs, speech or audio are retained here. */
export class BreathEnvelope {
  private age = 0;
  private floor = 0.003;
  private gust = 0;

  get ready(): boolean { return this.age >= 0.65; }
  get strength(): number { return this.gust; }

  reset(): void { this.age = 0; this.floor = 0.003; this.gust = 0; }

  step(rms: number, dtSec: number): number {
    if (!Number.isFinite(rms)) return this.gust = 0;
    if (!Number.isFinite(dtSec) || dtSec <= 0) return this.gust;
    const dt = Math.min(dtSec, 0.1);
    const level = Math.max(0, Math.min(1, rms));
    this.age += dt;
    if (!this.ready) {
      this.floor += (Math.max(0.0003, level) - this.floor) * (1 - Math.exp(-dt / 0.16));
      return this.gust = 0;
    }

    // Follow quiet room changes, but do not absorb a strong sustained breath.
    if (level < Math.max(0.006, this.floor * 2.5)) {
      const timeConstant = level < this.floor ? 0.4 : 3;
      this.floor += (Math.max(0.0003, level) - this.floor) * (1 - Math.exp(-dt / timeConstant));
    }
    const gate = Math.max(0.0035, this.floor * 2.2 + 0.001);
    const target = Math.max(0, Math.min(1, (level - gate) / Math.max(0.04, this.floor * 5)));
    const timeConstant = target > this.gust ? 0.055 : 0.32;
    this.gust += (target - this.gust) * (1 - Math.exp(-dt / timeConstant));
    if (this.gust < 0.001) this.gust = 0;
    return this.gust;
  }
}
