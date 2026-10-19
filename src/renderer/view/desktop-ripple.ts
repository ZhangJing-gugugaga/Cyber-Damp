import { wallpaperLayout } from '../../shared/wallpaper-layout';

/** Extend the stage's existing ripple across the real wallpaper and live DOM HUD. */
export class DesktopRipple {
  private readonly backdrop = document.createElement('div');
  private readonly svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly image: SVGFEImageElement;
  private readonly displacement: SVGFEDisplacementMapElement;
  private readonly map = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D | null;
  private readonly hud = document.getElementById('ui-root');
  private oldHudFilter = '';
  private active = false;
  private prepared = false;
  private lastMapTime = -1;
  private readonly refresh = (): void => { void this.refreshWallpaper(); };

  constructor() {
    this.backdrop.className = 'hallucination-wallpaper';
    Object.assign(this.backdrop.style, { position: 'fixed', inset: '0', pointerEvents: 'none', display: 'none' });
    document.body.prepend(this.backdrop);
    this.svg.setAttribute('width', '0'); this.svg.setAttribute('height', '0');
    this.svg.setAttribute('aria-hidden', 'true');
    Object.assign(this.svg.style, { position: 'absolute', pointerEvents: 'none' });
    this.svg.innerHTML = '<defs><filter id="cd-desktop-ripple" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage result="waves" preserveAspectRatio="none"/><feDisplacementMap in="SourceGraphic" in2="waves" xChannelSelector="R" yChannelSelector="G" scale="0"/></filter></defs>';
    this.image = this.svg.querySelector('feImage')!;
    this.displacement = this.svg.querySelector('feDisplacementMap')!;
    document.body.appendChild(this.svg);
    this.map.width = 192; this.map.height = 108;
    this.context = this.map.getContext('2d');
    window.addEventListener('resize', this.refresh);
    this.refresh();
  }

  private async refreshWallpaper(): Promise<void> {
    try {
      const w = await window.damp?.desktop.wallpaper();
      if (!w) return;
      if (w.imageDataUrl) { const image = new Image(); image.src = w.imageDataUrl; await image.decode(); }
      const p = wallpaperLayout(w), scale = w.scaleFactor;
      Object.assign(this.backdrop.style, {
        backgroundColor: w.backgroundColor,
        backgroundImage: w.imageDataUrl ? `url("${w.imageDataUrl}")` : 'none',
        backgroundSize: `${p.width / scale}px ${p.height / scale}px`,
        backgroundPosition: `${(p.left - w.workArea.left) / scale}px ${(p.top - w.workArea.top) / scale}px`,
        backgroundRepeat: p.tile ? 'repeat' : 'no-repeat',
      });
      this.prepared = true;
      if (this.active) this.backdrop.style.display = 'block';
    } catch (error) { console.warn('[hallucination] Wallpaper refresh failed:', error); }
  }

  start(): void {
    if (!this.active) this.oldHudFilter = this.hud?.style.filter ?? '';
    this.active = true; this.lastMapTime = -1;
    const filter = 'url(#cd-desktop-ripple)';
    this.backdrop.style.filter = filter;
    if (this.hud) this.hud.style.filter = [this.oldHudFilter, filter].filter(Boolean).join(' ');
    if (this.prepared) this.backdrop.style.display = 'block';
    this.refresh();
  }

  update(time: number, strength: number, width: number, height: number): void {
    if (!this.active || !this.context) return;
    this.displacement.setAttribute('scale', String(24 * strength));
    // Same radial + cross-wave field as the Pixi shader; the small raster field
    // is interpolated over the viewport. No screen capture or frozen HUD bitmap.
    if (this.lastMapTime >= 0 && time - this.lastMapTime < 1 / 30) return;
    this.lastMapTime = time;
    const pixels = this.context.createImageData(this.map.width, this.map.height);
    for (let y = 0; y < this.map.height; y++) for (let x = 0; x < this.map.width; x++) {
      const px = (x + 0.5) / this.map.width * width, py = (y + 0.5) / this.map.height * height;
      const rx = px - width * 0.5, ry = py - height * 0.5, distance = Math.hypot(rx, ry);
      const wave = Math.sin(distance * 0.048 - time * 7) * 5.5 / Math.max(distance, 1);
      const dx = rx * wave + Math.sin(py * 0.037 + time * 5.3) * 6;
      const dy = ry * wave + Math.cos(px * 0.029 - time * 4) * 4;
      const i = (y * this.map.width + x) * 4;
      pixels.data[i] = Math.round((0.5 + dx / 24) * 255);
      pixels.data[i + 1] = Math.round((0.5 + dy / 24) * 255);
      pixels.data[i + 2] = 128; pixels.data[i + 3] = 255;
    }
    this.context.putImageData(pixels, 0, 0);
    this.image.setAttribute('href', this.map.toDataURL());
  }

  stop(): void {
    if (!this.active) return;
    this.active = false; this.backdrop.style.display = 'none'; this.backdrop.style.filter = '';
    if (this.hud) this.hud.style.filter = this.oldHudFilter;
  }

  destroy(): void {
    this.stop(); window.removeEventListener('resize', this.refresh); this.backdrop.remove(); this.svg.remove();
  }
}
