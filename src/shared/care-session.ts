/**
 * 分层护理会话（R6 护理 2.0；Task 6/7/8 纯逻辑）
 *
 * 会话 = 单对象单损伤的分层擦拭状态：每层独立掩码（care-mask 编码）+ 进度。
 * 纯函数、无 DOM/Electron 依赖；渲染层负责把掩码画成擦除洞并按损伤像素量进度，
 * 模拟环境与测试直接用格子级输入得到同一结果。
 *
 * 效率模型：掩码清除是布尔（领域强制硬规则：喷壶不清除、滚轮依赖同格烟灰已清）；
 * 效率数值（海绵 0.5 / 不对口 0.2 / 未软化 0.25）由渲染层作为侵蚀节奏参数消费，
 * 进度差异在擦拭画面上产生（R6 参数表），领域结果对同输入保持确定。
 */
import {
  AUTO_FINISH_THRESHOLD, layersForDamage, migrationLayer,
} from './care-layers';
import { CARE_TOOLS, matchingTools } from './care-tools';
import type { ToolLayerRule } from './care-tools';
import { CARE_MASK_CELLS, decodeCareMask, encodeCareMask } from './care-mask';
import type { CareLayerState, CareLayerId, CareToolId, CareSessionState } from './types/gameplay';
import type { DamageFamily, DamageStage } from './types/native';

export const CARE_SESSION_VERSION = 2;

// ---------- 构建 / 迁移 ----------

function emptyLayer(layer: CareLayerId): CareLayerState {
  return { layer, mask: encodeCareMask(new Uint8Array(CARE_MASK_CELLS)), progress: 0 };
}

/**
 * 建立或续接会话。previous 为同族旧会话时保留已有层掩码（重开继续）；
 * stage 升级补齐新层；family/stage 变化的旧会话由调用方判 stale 后丢弃。
 */
export function createCareSession(
  family: DamageFamily,
  stage: DamageStage,
  previous?: CareSessionState,
): CareSessionState {
  const wanted = layersForDamage(family, stage);
  const layers: CareLayerState[] = wanted.map((layer) => {
    const kept = previous?.family === family
      ? previous.layers.find((l) => l.layer === layer)
      : undefined;
    return kept ? { ...kept } : emptyLayer(layer);
  });
  return {
    version: CARE_SESSION_VERSION,
    family,
    stage,
    layers,
    toolsUsed: previous?.family === family ? [...previous.toolsUsed] : [],
    progress: previous?.family === family ? previous.progress : 0,
  };
}

/** v3 单层掩码迁移：mask/progress 迁到对应族上层（受潮→droplets，霉变→mold，焦化→soot）。 */
export function migrateLegacyCare(
  family: DamageFamily,
  stage: DamageStage,
  legacy: { careProgress?: number; careMask?: string },
): CareSessionState {
  const session = createCareSession(family, stage);
  const target = session.layers.find((l) => l.layer === migrationLayer(family));
  if (target) {
    if (legacy.careMask) {
      const decoded = decodeCareMask(legacy.careMask);
      if (decoded) target.mask = encodeCareMask(decoded);
    }
    if (typeof legacy.careProgress === 'number' && Number.isFinite(legacy.careProgress)) {
      target.progress = clamp01(legacy.careProgress);
    }
  }
  session.progress = sessionTotalProgress(session);
  return session;
}

// ---------- 笔触几何（渲染层/模拟环境共用；快速拖动不缺格） ----------

export interface StrokePoint {
  x: number;
  y: number;
}

export interface StrokeGeometry {
  points: StrokePoint[];
  /** 掩码网格边长（默认 64，与 care-mask 同网格） */
  grid?: number;
  /** 画布像素尺寸（默认 256，即每格 4px） */
  canvas?: number;
}

/**
 * 按工具几何把指针路径展开成覆盖格集合（行主序索引，去重）。
 * 相邻点之间按半径/2 插值补路径，保证快速拖动不出现轨迹缺口。
 */
export function strokeCells(toolId: CareToolId, geometry: StrokeGeometry): number[] {
  const tool = CARE_TOOLS[toolId];
  if (!tool || tool.harvest) return [];
  const grid = geometry.grid ?? 64;
  const canvas = geometry.canvas ?? 256;
  const scale = grid / canvas;
  const cells = new Set<number>();
  const pts = geometry.points;
  if (pts.length === 0) return [];
  const stamp = (cx: number, cy: number, prev?: StrokePoint): void => {
    const r = tool.radius;
    if (tool.gesture === 'strip' && tool.stripHalfLength && prev) {
      // 长条：沿运动方向的长矩形（半长 stripHalfLength，宽 2r）
      const dx = cx - prev.x;
      const dy = cy - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const rr = Math.ceil(r);
      const half = tool.stripHalfLength;
      for (let oy = -rr; oy <= rr; oy += 1) {
        for (let s = -half; s <= half; s += 1) {
          const px = cx + ux * s - uy * oy;
          const py = cy + ux * oy + uy * s;
          mark(cells, Math.round(px), Math.round(py), grid);
        }
      }
      return;
    }
    const rr = Math.ceil(r);
    for (let oy = -rr; oy <= rr; oy += 1) {
      for (let ox = -rr; ox <= rr; ox += 1) {
        if (ox * ox + oy * oy <= r * r + 1e-9) {
          mark(cells, Math.round(cx) + ox, Math.round(cy) + oy, grid);
        }
      }
    }
  };
  const toGrid = (p: StrokePoint): StrokePoint => ({ x: p.x * scale, y: p.y * scale });
  let current = toGrid(pts[0]);
  stamp(current.x, current.y);
  for (let i = 1; i < pts.length; i += 1) {
    const next = toGrid(pts[i]);
    const dist = Math.hypot(next.x - current.x, next.y - current.y);
    const step = Math.max(tool.radius / 2, 0.5);
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let s = 1; s <= steps; s += 1) {
      const ix = current.x + ((next.x - current.x) * s) / steps;
      const iy = current.y + ((next.y - current.y) * s) / steps;
      stamp(ix, iy, current);
    }
    current = next;
  }
  return [...cells].sort((a, b) => a - b);
}

function mark(cells: Set<number>, gx: number, gy: number, grid: number): void {
  if (gx < 0 || gy < 0 || gx >= grid || gy >= grid) return;
  cells.add(gy * grid + gx);
}

// ---------- 笔触应用 ----------

export interface StrokeDamageCounts {
  /** 各层实际损伤格数（64×64 网格口径）；未提供的层不重算进度 */
  [layer: string]: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function decodeLayerMask(layer: CareLayerState): Uint8Array {
  return decodeCareMask(layer.mask) ?? new Uint8Array(CARE_MASK_CELLS);
}

/**
 * 应用一次工具笔触（纯函数，返回新会话；无格变化时原样返回）。
 * - softenOnly 工具（喷壶）只写 mold 层软化掩码，不清除；
 * - clear > 0 的覆盖格记为已清（硬依赖仍由领域强制：滚轮要求同格烟灰已清）；
 *   效率数值是渲染层的侵蚀节奏参数，不改变掩码布尔结果（见 care-tools.ts）；
 * - damageCounts 提供的层重算 progress（实际损伤格口径）。
 */
export function applyToolStroke(
  session: CareSessionState,
  toolId: CareToolId,
  cells: readonly number[],
  damageCounts?: StrokeDamageCounts,
): CareSessionState {
  const tool = CARE_TOOLS[toolId];
  if (!tool || tool.harvest || cells.length === 0) return session;
  const next: CareSessionState = {
    ...session,
    layers: session.layers.map((l) => ({ ...l })),
    toolsUsed: session.toolsUsed.includes(toolId) ? session.toolsUsed : [...session.toolsUsed, toolId],
  };
  // 依赖层（补色滚轮 → 烟灰已清）掩码
  let dependencyMask: Uint8Array | null = null;
  for (const rule of Object.values(tool.layers)) {
    if (rule.requiresCleared) {
      const dep = next.layers.find((l) => l.layer === rule.requiresCleared);
      if (dep) dependencyMask = decodeLayerMask(dep);
      break;
    }
  }
  const covered = new Set<number>();
  for (const cell of cells) {
    if (cell >= 0 && cell < CARE_MASK_CELLS && !(dependencyMask && !dependencyMask[cell])) {
      covered.add(cell);
    }
  }
  if (covered.size === 0) return next;
  const fallback: ToolLayerRule = tool.universal
    ? { clear: 0.5 }
    : Object.values(tool.layers).some((r) => r.softenOnly)
      ? { clear: 0 }
      : { clear: 0.2 };
  for (const layerState of next.layers) {
    const rule = tool.layers[layerState.layer] ?? fallback;
    if (rule.clear <= 0 && !rule.softenOnly) continue;
    const mask = decodeLayerMask(layerState);
    let soft = layerState.softened ? decodeCareMask(layerState.softened) : null;
    let clearedNow = 0;
    let softenedNow = 0;
    for (const cell of covered) {
      if (mask[cell]) continue;
      if (rule.softenOnly) {
        // 喷壶：只软化霉斑，不清除
        if (layerState.layer !== 'mold') continue;
        soft ??= new Uint8Array(CARE_MASK_CELLS);
        if (!soft[cell]) { soft[cell] = 1; softenedNow += 1; }
        continue;
      }
      mask[cell] = 1;
      clearedNow += 1;
    }
    if (softenedNow > 0 && soft) {
      layerState.softened = encodeCareMask(soft);
    }
    if (clearedNow > 0) {
      layerState.mask = encodeCareMask(mask);
      if (damageCounts && Number.isFinite(damageCounts[layerState.layer]) && damageCounts[layerState.layer] > 0) {
        layerState.progress = clamp01(layerProgressFromMask(mask, damageCounts[layerState.layer]));
      }
    }
  }
  next.progress = sessionTotalProgress(next, damageCounts);
  return next;
}

/** 掩码进度：已清除格数 / 实际损伤格数（不按整图标透明度估算）。 */
export function layerProgressFromMask(mask: Uint8Array, damageCells: number): number {
  if (damageCells <= 0) return 0;
  let cleared = 0;
  for (let i = 0; i < mask.length; i += 1) cleared += mask[i];
  return clamp01(cleared / damageCells);
}

// ---------- 进度与收尾 ----------

/**
 * 会话总进度：各层按实际损伤格面积加权；未提供计数时等权。
 */
export function sessionTotalProgress(session: CareSessionState, damageCounts?: StrokeDamageCounts): number {
  if (session.layers.length === 0) return 0;
  let total = 0;
  let weightSum = 0;
  for (const layer of session.layers) {
    const w = damageCounts && Number.isFinite(damageCounts[layer.layer]) && damageCounts[layer.layer] > 0
      ? damageCounts[layer.layer]
      : 1;
    total += clamp01(layer.progress) * w;
    weightSum += w;
  }
  return weightSum > 0 ? clamp01(total / weightSum) : 0;
}

/** 渲染层按损伤像素量得的精确进度回写（松手时校准用）。 */
export function setLayerProgress(
  session: CareSessionState,
  layer: CareLayerId,
  progress: number,
): CareSessionState {
  const next: CareSessionState = { ...session, layers: session.layers.map((l) => ({ ...l })) };
  const target = next.layers.find((l) => l.layer === layer);
  if (target) target.progress = clamp01(progress);
  next.progress = sessionTotalProgress(next);
  return next;
}

/**
 * 自动收尾：层进度达到 0.9 后把该层剩余损伤全部记为已清，
 * 不要求玩家找最后一个像素（UAT）。
 */
export function autoFinishLayer(session: CareSessionState, layer: CareLayerId): CareSessionState {
  const next: CareSessionState = { ...session, layers: session.layers.map((l) => ({ ...l })) };
  const target = next.layers.find((l) => l.layer === layer);
  if (!target || target.progress < AUTO_FINISH_THRESHOLD) return session;
  target.mask = encodeCareMask(new Uint8Array(CARE_MASK_CELLS).fill(1));
  target.progress = 1;
  next.progress = sessionTotalProgress(next);
  return next;
}

export function allLayersComplete(session: CareSessionState): boolean {
  return session.layers.length > 0 && session.layers.every((l) => l.progress >= 1);
}

// ---------- 精细护理判定（R6 参数表；Task 8） ----------

/**
 * 精细护理 = 未用快速处理 && 用过当前损伤的对口工具 && 实际完成全部护理层。
 * 奖励只发一次由 careComplete 的结算侧保证，这里只给判定。
 */
export function judgeFineCare(
  session: CareSessionState,
  options: { quickCare: boolean },
): boolean {
  if (options.quickCare) return false;
  if (!allLayersComplete(session)) return false;
  const match = matchingTools(session.family);
  return session.toolsUsed.some((tool) => match.includes(tool));
}

// ---------- 校验（IPC 载荷与存档共用；非法输入明确拒绝） ----------

const VALID_TOOL_IDS = new Set<string>(Object.keys(CARE_TOOLS));

/**
 * 校验并规整会话（来自 IPC/存档的不可信数据）：结构、掩码长度（≤4096 字符）、
 * 进度必须是 0..1 的有限数、工具必须是已知 ID。非法返回 null，不静默修补。
 */
export function validateCareSession(value: unknown): CareSessionState | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<CareSessionState>;
  if (v.version !== CARE_SESSION_VERSION) return null;
  if (v.family !== 'damp' && v.family !== 'mold' && v.family !== 'char') return null;
  if (v.stage !== 1 && v.stage !== 2 && v.stage !== 3) return null;
  if (!Array.isArray(v.layers) || v.layers.length === 0) return null;
  const allowed = layersForDamage(v.family, v.stage);
  const layers: CareLayerState[] = [];
  for (const item of v.layers) {
    if (typeof item !== 'object' || item === null) return null;
    const l = item as Partial<CareLayerState>;
    if (!allowed.includes(l.layer as CareLayerId)) return null;
    if (typeof l.mask !== 'string' || l.mask.length === 0 || l.mask.length > 4096) return null;
    if (decodeCareMask(l.mask) === null) return null;
    if (typeof l.progress !== 'number' || !Number.isFinite(l.progress) || l.progress < 0 || l.progress > 1) return null;
    if (l.softened !== undefined) {
      if (l.layer !== 'mold') return null;
      if (typeof l.softened !== 'string' || l.softened.length === 0 || l.softened.length > 4096) return null;
      if (decodeCareMask(l.softened) === null) return null;
    }
    layers.push({
      layer: l.layer as CareLayerId,
      mask: l.mask,
      progress: l.progress,
      ...(l.softened !== undefined ? { softened: l.softened } : {}),
    });
  }
  if (!Array.isArray(v.toolsUsed) || v.toolsUsed.some((t) => !VALID_TOOL_IDS.has(t as string))) return null;
  if (typeof v.progress !== 'number' || !Number.isFinite(v.progress) || v.progress < 0 || v.progress > 1) return null;
  return {
    version: CARE_SESSION_VERSION,
    family: v.family,
    stage: v.stage,
    layers,
    toolsUsed: v.toolsUsed as CareToolId[],
    progress: v.progress,
  };
}

/** 会话是否与对象当前损伤不匹配（旧回执/自然推进后）：不匹配的会话作废。 */
export function isCareSessionStale(session: CareSessionState, family: DamageFamily, stage: DamageStage): boolean {
  return session.family !== family || session.stage !== stage;
}
