/**
 * Lucide 1.58.0 唯一图标源（架构 ADR-005）：显式子集注册 + 全局渲染
 * DOM 层写 <i data-lucide="scissors"></i> 占位，insertHTML 后调 renderIcons()
 * P0-1 纪律：全项目禁止 emoji 充当功能图标
 */
import { createIcons, icons } from 'lucide';

const NAMES = [
  'map-pin', 'cloud-rain', 'cloud-sun', 'sun', 'cloud-fog', 'cloud', 'cloud-lightning',
  'droplets', 'plane', 'scissors', 'wind', 'fan', 'coins', 'store', 'wrench',
  'x', 'terminal', 'history', 'triangle-alert', 'thermometer', 'package-open',
  'settings', 'hand', 'spray-can', 'eraser', 'brush',
] as const;

function pascal(name: string): string {
  return name.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}

const subset: Record<string, unknown> = {};
for (const n of NAMES) {
  const p = pascal(n);
  const icon = (icons as Record<string, unknown>)[p];
  if (icon) subset[p] = icon; // createIcons 按 PascalCase 查找（data-lucide="map-pin" → MapPin）
}

/** 扫描 document 内全部 [data-lucide] 占位并替换为 SVG（幂等） */
export function renderIcons(): void {
  createIcons({ icons: subset as never });
}

/** 图标占位 HTML 片段（size: 16/20/24 三档，DESIGN §4.2） */
export function icon(name: string, size: 16 | 20 | 24 = 16): string {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
}
