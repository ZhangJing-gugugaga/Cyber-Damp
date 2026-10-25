/**
 * 护理工具定义（R6 v0.2；Task 6/7 权威配置表）
 *
 * 工具边界（冻结为可测表，见 scripts/test-care-tools.mjs）：
 * - 万能海绵对所有护理层生效，效率为对口工具的 0.5 倍（参数表）；
 * - 喷壶只写软化掩码，不能独立完成霉变护理；
 * - 清洁刷对已软化霉斑效率 1.0，未软化霉斑 0.25（慢但可行）；
 * - 补色滚轮只作用于已露出（同格烟灰已清）的焦痕，不处理烟灰；
 * - 其余不对口组合不是完全无效，效率 0.2（"效率明显较低"）；
 * - 剪刀只用于采摘，不参与分层护理。
 * 半径为 64×64 掩码格坐标（care-mask 同一网格）。
 */
import type { CareGesture, CareLayerId, CareToolId } from './types/gameplay';

/** 单个工具对单个护理层的作用规则 */
export interface ToolLayerRule {
  /** 清除效率（0 = 不能清除该层） */
  clear: number;
  /** 只写软化掩码（喷壶），不清除 */
  softenOnly?: boolean;
  /** 仅当格已软化时的效率；未软化格按此低效率（清洁刷） */
  unsoftened?: number;
  /** 仅当依赖层同格已清除才生效（补色滚轮依赖烟灰层） */
  requiresCleared?: CareLayerId;
}

export interface CareToolDef {
  id: CareToolId;
  nameZh: string;
  gesture: CareGesture;
  hint: string;
  /** 笔触半径（掩码格）；strip 工具另有长条半长 */
  radius: number;
  /** strip：长条拖动的半长（沿运动方向） */
  stripHalfLength?: number;
  layers: Partial<Record<CareLayerId, ToolLayerRule>>;
  /** 万能工具（海绵）：未列出的层按 0.5×对口生效 */
  universal?: boolean;
  /** 采摘工具（剪刀），不参与分层护理 */
  harvest?: boolean;
}

const UNIVERSAL_CLEAR: ToolLayerRule = { clear: 0.5 };

export const CARE_TOOLS: Record<CareToolId, CareToolDef> = {
  sponge: {
    id: 'sponge', nameZh: '海绵', gesture: 'drag',
    hint: '万能但较慢，所有层都能擦',
    radius: 7, universal: true,
    layers: {},
  },
  cloth: {
    id: 'cloth', nameZh: '擦水布', gesture: 'drag',
    hint: '拖动擦拭水膜',
    radius: 6,
    layers: {
      droplets: { clear: 0.6 },
      film: { clear: 1 },
    },
  },
  scissors: {
    id: 'scissors', nameZh: '剪刀', gesture: 'cut',
    hint: '沿菌柄剪下成熟菇',
    radius: 2, harvest: true, layers: {},
  },
  sprayer: {
    id: 'sprayer', nameZh: '喷壶', gesture: 'drag',
    hint: '喷洒软化霉斑，不能直接清除',
    radius: 5,
    layers: {
      mold: { clear: 0, softenOnly: true },
    },
  },
  scrubbrush: {
    id: 'scrubbrush', nameZh: '清洁刷', gesture: 'drag',
    hint: '清除已软化的霉斑；未软化的很慢',
    radius: 4,
    layers: {
      mold: { clear: 1, unsoftened: 0.25 },
    },
  },
  blotter: {
    id: 'blotter', nameZh: '吸水纸', gesture: 'tap',
    hint: '点按吸掉水珠',
    radius: 3,
    layers: {
      droplets: { clear: 1 },
      film: { clear: 0.2 },
    },
  },
  squeegee: {
    id: 'squeegee', nameZh: '刮水器', gesture: 'strip',
    hint: '长条刮除大片水膜',
    radius: 3, stripHalfLength: 10,
    layers: {
      droplets: { clear: 0.4 },
      film: { clear: 1 },
    },
  },
  blower: {
    id: 'blower', nameZh: '冷风干燥器', gesture: 'hold',
    hint: '按住持续吹干水分，松手即停',
    radius: 9,
    layers: {
      droplets: { clear: 0.5 },
      film: { clear: 1 },
    },
  },
  sootblock: {
    id: 'sootblock', nameZh: '烟灰海绵', gesture: 'tap',
    hint: '点按吸附烟灰',
    radius: 3,
    layers: {
      soot: { clear: 1 },
      scorch: { clear: 0 },
    },
  },
  dustbrush: {
    id: 'dustbrush', nameZh: '软毛刷', gesture: 'drag',
    hint: '扫除浮烟灰，对焦痕无效',
    radius: 5,
    layers: {
      soot: { clear: 1 },
      scorch: { clear: 0.2 },
    },
  },
  repairroller: {
    id: 'repairroller', nameZh: '补色滚轮', gesture: 'roll',
    hint: '只补已露出的焦痕（先清烟灰）',
    radius: 4,
    layers: {
      soot: { clear: 0 },
      scorch: { clear: 1, requiresCleared: 'soot' },
    },
  },
};

/**
 * 工具对某层的规则（含兜底）。
 * clear 是"清除能力"开关 + 渲染层侵蚀节奏参数：0 = 不能清除该层（喷壶对水层、
 * 滚轮对烟灰）；>0 = 可以清除，数值为对口相对效率（渲染层据此缩放擦拭强度，
 * 万能海绵 0.5、不对口 0.2 = "慢但可行"）。掩码清除本身是布尔（领域只强制
 * 硬依赖），进度差异由渲染层按效率节奏产生（R6 参数表）。
 */
export function toolLayerRule(toolId: CareToolId, layer: CareLayerId): ToolLayerRule {
  const tool = CARE_TOOLS[toolId];
  if (!tool) throw new Error(`未知工具: ${toolId}`);
  const rule = tool.layers[layer];
  if (rule) return rule;
  if (tool.universal) return UNIVERSAL_CLEAR;
  // 软化类工具不外溢到其他层（喷壶只对霉斑层起作用）
  if (Object.values(tool.layers).some((r) => r.softenOnly)) return { clear: 0 };
  // 不对口工具：效率明显较低但不完全无效（0.2）
  return { clear: 0.2 };
}

/** 当前损伤族的对口工具（海绵作为万能工具恒在对口列表，剪刀除外）。 */
export function matchingTools(family: 'damp' | 'mold' | 'char'): CareToolId[] {
  const familyLayers: Record<'damp' | 'mold' | 'char', CareLayerId[]> = {
    damp: ['droplets', 'film'],
    mold: ['mold'],
    char: ['soot', 'scorch'],
  };
  const result: CareToolId[] = [];
  for (const tool of Object.values(CARE_TOOLS)) {
    if (tool.harvest) continue;
    const isMatch = familyLayers[family].some((layer) => {
      const rule = tool.layers[layer];
      return rule ? rule.clear > 0 || rule.softenOnly === true : tool.universal === true;
    });
    if (isMatch) result.push(tool.id);
  }
  return result;
}
