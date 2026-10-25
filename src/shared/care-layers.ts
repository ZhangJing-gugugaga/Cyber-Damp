/**
 * 分层护理层结构（R6 护理 2.0；Task 6 纯逻辑）
 *
 * 受潮 = 水珠层(droplets) + 水膜层(film)；霉变 = 霉斑层(mold)；
 * 焦化 = 烟灰层(soot) + 焦痕层(scorch)。轻度只有第一层（上层），
 * 中/重度全部层。每层独立保存掩码（care-mask 编码，1=已清除）。
 * v0.1 单层掩码迁移到对应族的上层（有损迁移，见 gameplay-v2 契约）。
 */
import type { DamageFamily, DamageStage } from './types/native';
import type { CareLayerId } from './types/gameplay';
import { CARE_LAYERS_BY_FAMILY } from './types/gameplay';

export interface CareLayerInfo {
  id: CareLayerId;
  nameZh: string;
  family: DamageFamily;
  /** v0.1 单层掩码/进度的迁移目标（对应族的上层） */
  migrationTarget?: boolean;
}

export const CARE_LAYER_INFO: Record<CareLayerId, CareLayerInfo> = {
  droplets: { id: 'droplets', nameZh: '水珠层', family: 'damp', migrationTarget: true },
  film: { id: 'film', nameZh: '水膜层', family: 'damp' },
  mold: { id: 'mold', nameZh: '霉斑层', family: 'mold', migrationTarget: true },
  soot: { id: 'soot', nameZh: '烟灰层', family: 'char', migrationTarget: true },
  scorch: { id: 'scorch', nameZh: '焦痕层', family: 'char' },
};

/** 当前损伤的护理层：轻度只有上层，中/重度全部层（R6 护理 2.0）。 */
export function layersForDamage(family: DamageFamily, stage: DamageStage): CareLayerId[] {
  const all = CARE_LAYERS_BY_FAMILY[family];
  if (stage <= 1) return [all[0]];
  return [...all];
}

/** v3 单层 careMask/careProgress 的迁移目标层。 */
export function migrationLayer(family: DamageFamily): CareLayerId {
  const target = CARE_LAYERS_BY_FAMILY[family].find((id) => CARE_LAYER_INFO[id].migrationTarget);
  if (!target) throw new Error(`损伤族 ${family} 没有迁移目标层`);
  return target;
}

/**
 * 最后少量残渍自动收尾阈值（UAT：90% 以上残留允许自动收尾）。
 * 层进度达到该值即视为本层完成，不再要求玩家找最后一个像素。
 */
export const AUTO_FINISH_THRESHOLD = 0.9;

/** 精细护理的光泽外观时长（参数表：24 小时）。 */
export const GLOSS_DURATION_MS = 24 * 60 * 60 * 1000;
