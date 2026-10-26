/**
 * 晾衣绳场景的静态插画（分层 SVG 字符串）。由方向稿 dir-1-v2 移植；全部是程序化占位插画，
 * 美术资产到位后替换。坐标系为 960×640 的场景画布。
 */
export const MAIN = { x1: 26, y1: 66, x2: 696, y2: 60, sag: 52 };
export const SUN = { x1: 722, y1: 306, x2: 944, y2: 298, sag: 18 };
export const WIN = { x: 728, y: 24, w: 186, h: 178 };
export const BASIN = { cx: 480, cy: 470, rx: 196, ry: 50, wrx: 170, wry: 37, wcy: 485 };
export type Rope = typeof MAIN;

// 稳定伪随机：每次打开场景都一样（mulberry32）
function makeRnd(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function backdropSvg(): string {
  const rnd = makeRnd(20261026);
  const chips: string[] = [];
  for (let i = 0; i < 260; i += 1) {
    const x = rnd() * 960, y = 470 + rnd() * 170, r = 1 + rnd() * 3.2;
    const c = ['oklch(0.62 0.03 60)', 'oklch(0.72 0.04 30)', 'oklch(0.5 0.02 250)', 'oklch(0.9 0.01 90)', 'oklch(0.66 0.05 140)'][Math.floor(rnd() * 5)];
    chips.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * (0.5 + rnd() * 0.4)).toFixed(1)}" transform="rotate(${Math.round(rnd() * 180)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${c}" opacity=".7"/>`);
  }
  const drops: string[] = [];
  for (let i = 0; i < 70; i += 1) {
    const x = WIN.x + 14 + rnd() * (WIN.w - 28), y = WIN.y + 14 + rnd() * (WIN.h - 28), r = 0.8 + rnd() * 2.6;
    drops.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="oklch(1 0 0 / .35)"/><circle cx="${(x - r * 0.3).toFixed(1)}" cy="${(y - r * 0.35).toFixed(1)}" r="${(r * 0.35).toFixed(1)}" fill="oklch(1 0 0 / .8)"/>`);
  }
  const rain: string[] = [];
  for (let i = 0; i < 26; i += 1) {
    const x = WIN.x + rnd() * WIN.w, y = WIN.y - 40 + rnd() * (WIN.h + 40);
    rain.push(`<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - 2).toFixed(1)}" y2="${(y + 12).toFixed(1)}" stroke="oklch(0.97 0.02 230 / .7)" stroke-width="1.2" stroke-linecap="round"/>`);
  }
  let city = '';
  let bx = WIN.x - 4;
  while (bx < WIN.x + WIN.w) {
    const w = 14 + rnd() * 22, h = 40 + rnd() * 70;
    city += `<rect x="${bx.toFixed(1)}" y="${(WIN.y + WIN.h - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="oklch(0.62 0.03 230 / ${(0.35 + rnd() * 0.3).toFixed(2)})"/>`;
    bx += w + 3;
  }
  const nails = [[MAIN.x1, MAIN.y1], [MAIN.x2, MAIN.y2], [SUN.x1, SUN.y1], [SUN.x2, SUN.y2]]
    .map(([x, y]) => `<circle cx="${x + 2}" cy="${y + 3}" r="6" fill="oklch(0.4 0.03 90 / .25)" filter="url(#cl-blur2)"/><circle cx="${x}" cy="${y}" r="5.5" fill="oklch(0.55 0.02 250)"/><circle cx="${x - 1.5}" cy="${y - 1.5}" r="2" fill="oklch(0.85 0.01 250)"/>`).join('');
  return `
  <defs>
    <filter id="cl-plaster" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .55  0 0 0 0 .52  0 0 0 0 .45  0 0 0 .08 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="cl-stain" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="3" seed="9" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="46" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feGaussianBlur in="d" stdDeviation="5"/>
    </filter>
    <filter id="cl-stainEdge" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="3" seed="9" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="46" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feGaussianBlur in="d" stdDeviation="1.2"/>
    </filter>
    <filter id="cl-soft"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="cl-blur2"><feGaussianBlur stdDeviation="2"/></filter>
    <pattern id="cl-tiles" width="38" height="38" patternUnits="userSpaceOnUse" x="0" y="392">
      <rect width="38" height="38" fill="oklch(0.80 0.03 165)"/>
      <rect x="1.2" y="1.2" width="35.6" height="35.6" rx="3" fill="oklch(0.90 0.035 165)"/>
      <rect x="3" y="3" width="20" height="6" rx="3" fill="oklch(1 0 0 / .45)"/>
    </pattern>
    <linearGradient id="cl-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="oklch(0.965 0.011 95)"/><stop offset="1" stop-color="oklch(0.925 0.017 100)"/></linearGradient>
    <linearGradient id="cl-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="oklch(0.84 0.025 80)"/><stop offset="1" stop-color="oklch(0.78 0.03 75)"/></linearGradient>
    <linearGradient id="cl-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="oklch(0.86 0.03 235)"/><stop offset="1" stop-color="oklch(0.93 0.02 210)"/></linearGradient>
    <linearGradient id="cl-beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="oklch(0.95 0.1 92 / .55)"/><stop offset=".6" stop-color="oklch(0.95 0.1 92 / .18)"/><stop offset="1" stop-color="oklch(0.95 0.1 92 / 0)"/></linearGradient>
    <linearGradient id="cl-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="oklch(0.76 0.08 70)"/><stop offset="1" stop-color="oklch(0.62 0.08 62)"/></linearGradient>
    <clipPath id="cl-glass"><rect x="${WIN.x + 10}" y="${WIN.y + 10}" width="${WIN.w - 20}" height="${WIN.h - 20}" rx="6"/></clipPath>
  </defs>
  <rect width="960" height="470" fill="url(#cl-wall)"/>
  <rect width="960" height="470" fill="white" filter="url(#cl-plaster)"/>
  <g opacity=".55">
    <ellipse cx="150" cy="190" rx="120" ry="92" fill="oklch(0.86 0.03 130)" filter="url(#cl-stain)"/>
    <ellipse cx="150" cy="190" rx="120" ry="92" fill="none" stroke="oklch(0.7 0.04 120)" stroke-width="3" filter="url(#cl-stainEdge)" opacity=".55"/>
    <ellipse cx="620" cy="330" rx="150" ry="70" fill="oklch(0.87 0.03 130)" filter="url(#cl-stain)"/>
    <ellipse cx="620" cy="330" rx="150" ry="70" fill="none" stroke="oklch(0.72 0.04 120)" stroke-width="2.5" filter="url(#cl-stainEdge)" opacity=".5"/>
    <ellipse cx="900" cy="250" rx="70" ry="110" fill="oklch(0.87 0.03 130)" filter="url(#cl-stain)"/>
  </g>
  <g stroke="oklch(0.80 0.03 140 / .5)" stroke-width="2" stroke-linecap="round" fill="none">
    <path d="M760 214 q2 60 -1 120"/><path d="M792 214 q-2 44 1 86"/><path d="M842 214 q3 70 0 150"/><path d="M880 214 q-1 34 1 60"/>
  </g>
  <rect x="0" y="392" width="960" height="78" fill="url(#cl-tiles)"/>
  <rect x="0" y="386" width="960" height="8" fill="oklch(0.86 0.04 165)"/>
  <rect x="0" y="386" width="960" height="2" fill="oklch(1 0 0 / .6)"/>
  <rect x="0" y="470" width="960" height="170" fill="url(#cl-floor)"/>
  ${chips.join('')}
  <rect x="0" y="466" width="960" height="7" fill="oklch(0.62 0.04 70)"/>
  <rect x="${WIN.x - 4}" y="${WIN.y - 4}" width="${WIN.w + 8}" height="${WIN.h + 8}" rx="14" fill="oklch(0.6 0.04 70 / .25)" filter="url(#cl-soft)"/>
  <rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" rx="12" fill="url(#cl-wood)"/>
  <g clip-path="url(#cl-glass)">
    <rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" fill="url(#cl-sky)"/>
    <g filter="url(#cl-blur2)">${city}<ellipse cx="${WIN.x + 40}" cy="${WIN.y + WIN.h}" rx="60" ry="40" fill="oklch(0.6 0.07 150 / .55)"/><ellipse cx="${WIN.x + 150}" cy="${WIN.y + WIN.h + 6}" rx="50" ry="36" fill="oklch(0.56 0.07 150 / .5)"/></g>
    <g class="cl-rain">${rain.join('')}<animateTransform attributeName="transform" type="translate" from="0 -60" to="0 60" dur=".9s" repeatCount="indefinite"/></g>
    <rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" fill="oklch(1 0 0 / .18)"/>
    ${drops.join('')}
    <path d="M${WIN.x + 20} ${WIN.y + 18} L${WIN.x + 62} ${WIN.y + 18} L${WIN.x + 26} ${WIN.y + 70} Z" fill="oklch(1 0 0 / .22)"/>
  </g>
  <rect x="${WIN.x + WIN.w / 2 - 4}" y="${WIN.y + 8}" width="8" height="${WIN.h - 16}" fill="url(#cl-wood)"/>
  <rect x="${WIN.x + 8}" y="${WIN.y + WIN.h / 2 - 4}" width="${WIN.w - 16}" height="8" fill="url(#cl-wood)"/>
  <rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" rx="12" fill="none" stroke="oklch(0.55 0.08 60)" stroke-width="2"/>
  <rect x="${WIN.x + 10}" y="${WIN.y + 10}" width="${WIN.w - 20}" height="${WIN.h - 20}" rx="6" fill="none" stroke="oklch(0.5 0.07 58)" stroke-width="2"/>
  <rect x="${WIN.x - 14}" y="${WIN.y + WIN.h - 2}" width="${WIN.w + 28}" height="14" rx="4" fill="oklch(0.92 0.01 95)"/>
  <rect x="${WIN.x - 14}" y="${WIN.y + WIN.h + 10}" width="${WIN.w + 28}" height="6" rx="3" fill="oklch(0.78 0.02 95)"/>
  <g transform="translate(${WIN.x + 18} ${WIN.y + WIN.h - 34})">
    <path d="M4 34 L30 34 L26 6 L8 6 Z" fill="oklch(0.62 0.17 32)"/><rect x="5" y="3" width="24" height="6" rx="2" fill="oklch(0.55 0.15 30)"/>
    <path d="M17 4 C 4 -14 -8 -6 -6 6 C 2 2 10 -2 17 4" fill="oklch(0.62 0.12 145)"/>
    <path d="M17 4 C 26 -18 40 -10 38 0 C 30 -2 22 0 17 4" fill="oklch(0.55 0.12 150)"/>
    <path d="M17 4 C 14 -20 24 -26 28 -16 C 22 -12 19 -6 17 4" fill="oklch(0.68 0.12 140)"/>
    <path d="M8 8 C -6 18 -10 34 -14 52" fill="none" stroke="oklch(0.55 0.1 145)" stroke-width="2"/>
    <ellipse cx="-6" cy="26" rx="6" ry="4" fill="oklch(0.6 0.12 145)" transform="rotate(-30 -6 26)"/>
    <ellipse cx="-12" cy="44" rx="6" ry="4" fill="oklch(0.56 0.12 148)" transform="rotate(-50 -12 44)"/>
  </g>
  <polygon points="${WIN.x + 10},${WIN.y + 20} ${WIN.x + WIN.w - 10},${WIN.y + 20} 980,560 640,640 560,640" fill="url(#cl-beam)" opacity=".9"/>
  ${nails}
  <g transform="translate(832 248)">
    <path d="M-30 26 L0 2 L30 26" fill="none" stroke="oklch(0.55 0.05 70)" stroke-width="1.3"/>
    <circle cx="0" cy="2" r="3" fill="oklch(0.55 0.02 250)"/>
    <rect x="-38" y="22" width="76" height="26" rx="6" fill="url(#cl-wood)" stroke="oklch(0.52 0.07 60)" stroke-width="1.5"/>
    <text x="0" y="40" text-anchor="middle" font-family="华文行楷, STXingkai, KaiTi" font-size="17" fill="oklch(0.32 0.04 60)">晒太阳</text>
  </g>
  <g transform="translate(34 284)">
    <rect x="4" y="6" width="224" height="26" rx="6" fill="oklch(0.4 0.04 80 / .22)" filter="url(#cl-blur2)"/>
    <rect x="0" y="0" width="224" height="24" rx="6" fill="url(#cl-wood)"/>
    <path d="M8 8 C 60 5 120 11 216 7 M8 15 C 80 18 140 12 216 16" stroke="oklch(0.6 0.07 62 / .5)" stroke-width="1.2" fill="none"/>
    ${[0, 1, 2, 3].map((i) => `<circle cx="${20 + i * 56}" cy="12" r="3" fill="oklch(0.5 0.03 80)"/>`).join('')}
  </g>
  <g transform="translate(274 336)">
    <ellipse cx="38" cy="58" rx="40" ry="8" fill="oklch(0.35 0.03 70 / .22)" filter="url(#cl-blur2)"/>
    <path d="M4 14 L72 14 L64 58 L12 58 Z" fill="oklch(0.66 0.11 230)"/>
    <path d="M4 14 L72 14" stroke="oklch(0.55 0.11 235)" stroke-width="6" stroke-linecap="round"/>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${16 + i * 10}" y="22" width="4" height="30" rx="2" fill="oklch(0.56 0.1 232)"/>`).join('')}
  </g>`;
}

function carp(x: number, y: number, s: number, rot: number, flip: boolean): string {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${flip ? -s : s} ${s})" opacity=".55">
    <path d="M-22 0 C -12 -11 10 -11 18 0 C 10 11 -12 11 -22 0 Z" fill="oklch(0.62 0.17 32)"/>
    <path d="M18 0 L30 -9 L27 0 L30 9 Z" fill="oklch(0.62 0.17 32)"/>
    <path d="M-4 -8 C 0 -14 6 -14 8 -8" fill="oklch(0.55 0.16 30)"/>
    <circle cx="-14" cy="-2" r="1.6" fill="oklch(0.25 0.02 30)"/>
    <path d="M-6 -4 C -2 -1 -2 3 -6 5 M2 -5 C 6 -2 6 2 2 5" stroke="oklch(0.85 0.08 40)" stroke-width="1" fill="none"/></g>`;
}

export function basinBackSvg(): string {
  const { cx, cy, rx, ry, wrx, wry, wcy } = BASIN;
  return `
  <defs>
    <radialGradient id="cl-water" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="oklch(0.95 0.03 215)"/><stop offset=".7" stop-color="oklch(0.86 0.05 222)"/><stop offset="1" stop-color="oklch(0.78 0.06 228)"/></radialGradient>
    <linearGradient id="cl-inner" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="oklch(0.9 0.01 95)"/><stop offset="1" stop-color="oklch(0.975 0.008 95)"/></linearGradient>
    <filter id="cl-caustic" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="turbulence" baseFrequency=".035 .09" numOctaves="2" seed="3" result="t">
        <animate attributeName="baseFrequency" dur="9s" values=".035 .09;.04 .08;.035 .09" repeatCount="indefinite"/>
      </feTurbulence>
      <feColorMatrix in="t" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.6 1.25"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <clipPath id="cl-waterClip"><ellipse cx="${cx}" cy="${wcy}" rx="${wrx}" ry="${wry}"/></clipPath>
  </defs>
  <ellipse cx="${cx + 8}" cy="${cy + 92}" rx="${rx + 20}" ry="28" fill="oklch(0.35 0.03 70 / .28)" filter="url(#cl-soft)"/>
  <rect x="${cx - 128}" y="${cy + 70}" width="16" height="110" rx="5" fill="oklch(0.56 0.08 60)"/>
  <rect x="${cx + 112}" y="${cy + 70}" width="16" height="110" rx="5" fill="oklch(0.56 0.08 60)"/>
  <rect x="${cx - 150}" y="${cy + 58}" width="300" height="22" rx="8" fill="url(#cl-wood)"/>
  <rect x="${cx - 150}" y="${cy + 58}" width="300" height="5" rx="3" fill="oklch(0.82 0.06 75)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="oklch(0.45 0.13 260)"/>
  <ellipse cx="${cx}" cy="${cy + 1}" rx="${rx - 9}" ry="${ry - 7}" fill="url(#cl-inner)"/>
  <ellipse cx="${cx}" cy="${wcy}" rx="${wrx}" ry="${wry}" fill="url(#cl-water)"/>
  <g clip-path="url(#cl-waterClip)">
    ${carp(cx - 64, wcy + 6, 1.1, -8, false)}${carp(cx + 70, wcy + 2, 1.0, 10, true)}
    <rect x="${cx - wrx}" y="${wcy - wry}" width="${wrx * 2}" height="${wry * 2}" fill="white" filter="url(#cl-caustic)" opacity=".5"/>
    <ellipse cx="${cx - 40}" cy="${wcy - 16}" rx="70" ry="10" fill="oklch(1 0 0 / .35)"/>
  </g>
  <ellipse cx="${cx}" cy="${wcy}" rx="${wrx}" ry="${wry}" fill="none" stroke="oklch(1 0 0 / .55)" stroke-width="1.5"/>`;
}

export function basinFrontSvg(): string {
  const { cx, cy, rx, ry } = BASIN;
  const chips = [[-150, 12], [128, 22], [-60, 46], [176, 6]].map(([dx, dy], i) => {
    const x = cx + dx, y = cy + dy;
    return `<path d="M${x} ${y} l${4 + i} -2 l3 ${3 + i} l-${5 + i} 2 z" fill="oklch(0.25 0.03 260)"/>`;
  }).join('');
  return `
  <defs>
    <linearGradient id="cl-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="oklch(0.88 0.01 95)"/><stop offset=".35" stop-color="oklch(0.975 0.008 95)"/><stop offset=".7" stop-color="oklch(0.96 0.008 95)"/><stop offset="1" stop-color="oklch(0.84 0.012 95)"/></linearGradient>
  </defs>
  <path d="M${cx - rx} ${cy} C ${cx - rx + 10} ${cy + 46} ${cx - rx + 34} ${cy + 64} ${cx - 120} ${cy + 66} L ${cx + 120} ${cy + 66} C ${cx + rx - 34} ${cy + 64} ${cx + rx - 10} ${cy + 46} ${cx + rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy} Z" fill="url(#cl-body)"/>
  <path d="M${cx - 120} ${cy + 66} L ${cx + 120} ${cy + 66}" stroke="oklch(0.45 0.13 260)" stroke-width="5" stroke-linecap="round"/>
  <path d="M${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy}" fill="none" stroke="oklch(0.45 0.13 260)" stroke-width="10"/>
  <path d="M${cx - rx + 12} ${cy + 6} A ${rx - 12} ${ry - 6} 0 0 0 ${cx - 40} ${cy + ry - 1}" fill="none" stroke="oklch(0.62 0.12 258)" stroke-width="2.5"/>
  ${chips}
  <g transform="translate(${cx + 104} ${cy + 36}) scale(.9)" opacity=".85">
    <circle r="11" fill="oklch(0.62 0.17 32)"/><path d="M-6 -4 H6 M-6 0 H6 M-4 4 H4 M0 -7 V7" stroke="oklch(0.975 0.008 95)" stroke-width="1.6"/>
  </g>`;
}

export const NOTE_ART = `
  <defs><filter id="cl-rough"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="1" seed="2"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>
  <filter id="cl-nshadow"><feDropShadow dx="2" dy="5" stdDeviation="4" flood-color="oklch(0.35 0.03 90)" flood-opacity=".22"/></filter></defs>
  <path d="M4 6 H242 V158 L232 164 L220 158 L206 166 L192 159 L176 165 L160 158 L146 166 L130 159 L114 165 L98 158 L84 166 L68 159 L52 165 L38 158 L22 166 L4 158 Z" fill="oklch(0.985 0.015 92)" filter="url(#cl-nshadow)"/>
  <line x1="16" y1="80" x2="232" y2="80" stroke="oklch(0.9 0.02 90)"/>
  <circle cx="123" cy="10" r="7" fill="oklch(0.62 0.17 32)"/><circle cx="121" cy="8" r="2.4" fill="oklch(1 0 0 / .7)"/>`;

export const STAMP_ART = `<g filter="url(#cl-rough)" opacity=".85">
  <rect x="2" y="2" width="100" height="36" rx="6" fill="none" stroke="oklch(0.62 0.17 32)" stroke-width="2.6"/>
  <rect x="6" y="6" width="92" height="28" rx="4" fill="none" stroke="oklch(0.62 0.17 32)" stroke-width="1.2"/>
  <text x="52" y="25" text-anchor="middle" font-family="Noto Sans SC, Microsoft YaHei UI" font-weight="900" font-size="15" fill="oklch(0.62 0.17 32)" letter-spacing="1">回南天警报</text></g>`;

export const JOURNAL_ART = `
  <rect x="6" y="10" width="86" height="54" rx="6" fill="oklch(0.35 0.03 80 / .2)" filter="url(#cl-blur2)"/>
  <rect x="2" y="4" width="86" height="56" rx="6" fill="oklch(0.56 0.09 150)"/>
  <rect x="2" y="4" width="12" height="56" rx="4" fill="oklch(0.47 0.08 150)"/>
  <rect x="84" y="8" width="6" height="50" rx="2" fill="oklch(0.95 0.01 95)"/>
  <rect x="24" y="18" width="52" height="24" rx="4" fill="oklch(0.96 0.02 95)"/>
  <text x="50" y="35" text-anchor="middle" font-family="华文行楷, STXingkai, KaiTi" font-size="15" fill="oklch(0.35 0.05 150)">菇菇手账</text>
  <path d="M62 60 L62 70 L66 66 L70 70 L70 60" fill="oklch(0.62 0.17 32)"/>`;

export function jarArt(coins: number): string {
  const n = Math.min(16, Math.round(coins / 3));
  let stack = '';
  for (let i = 0; i < n; i += 1) {
    const x = 32 + (i % 4) * 12 + (Math.floor(i / 4) % 2) * 6, y = 112 - Math.floor(i / 4) * 7;
    stack += `<ellipse cx="${x}" cy="${y}" rx="9" ry="3.6" fill="oklch(0.78 0.14 82)" stroke="oklch(0.6 0.13 70)" stroke-width="1"/>`;
  }
  return `
  <ellipse cx="56" cy="124" rx="44" ry="6" fill="oklch(0.35 0.03 70 / .3)" filter="url(#cl-blur2)"/>
  <path d="M18 30 C 10 40 10 112 22 120 C 40 128 72 128 90 120 C 102 112 102 40 94 30 Z" fill="oklch(0.94 0.02 200 / .45)" stroke="oklch(0.85 0.02 200)" stroke-width="2"/>
  ${stack}
  <path d="M26 40 C 22 60 22 90 26 108" stroke="oklch(1 0 0 / .8)" stroke-width="4" stroke-linecap="round" fill="none"/>
  <rect x="20" y="16" width="72" height="18" rx="6" fill="url(#cl-wood)"/><rect x="20" y="16" width="72" height="5" rx="3" fill="oklch(0.82 0.06 75)"/>
  <rect x="30" y="64" width="52" height="44" rx="6" fill="oklch(0.985 0.015 92)" stroke="oklch(0.85 0.02 90)"/>`;
}

export const PIN_SVG = `<svg class="cl-pin" viewBox="0 0 16 40" width="16" height="40">
  <rect x="1" y="1" width="6.6" height="38" rx="2.5" fill="oklch(0.80 0.07 75)" stroke="oklch(0.55 0.08 60)" stroke-width="1"/>
  <rect x="8.4" y="1" width="6.6" height="38" rx="2.5" fill="oklch(0.70 0.08 68)" stroke="oklch(0.55 0.08 60)" stroke-width="1"/>
  <rect x="0" y="15" width="16" height="6" rx="3" fill="oklch(0.72 0.02 250)" stroke="oklch(0.5 0.02 250)" stroke-width="1"/>
  <circle cx="8" cy="18" r="2" fill="oklch(0.88 0.01 250)"/></svg>`;
