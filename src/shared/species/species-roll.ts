/**
 * 品种判定（R5.1 v0.2；Task 4 纯逻辑）
 *
 * 相同输入必须得到相同品种：随机只来自注入的 seed（mulberry32）。
 * 未知天气码不伪造品种结果（返回 null）；旧品种不参与新判定；
 * 玩家播种的品种优先且不被天气重抽（R5.1/UAT）。
 * 权重表为试玩配置，冻结于此并通过 scripts/test-species-roll.mjs 固定行为。
 */
import { NEW_SPECIES_IDS } from '../types/gameplay';
import type { NewSpeciesId, ObjectCategory } from '../types/gameplay';
import { KNOWN_WMO_CODES, PRECIPITATION_CODES } from '../types/native';
import { createRand, type Rand } from '../rand';

export interface SpeciesRollInput {
  category: ObjectCategory;
  weatherCode: number;
  humidity: number;
  temperatureC: number;
  localHour: number;
  seed: number;
  alertActive: boolean;
  plantedSpecies?: NewSpeciesId;
}

/** 稀有度基础权重（试玩配置：common 8 / uncommon 4 / rare 1） */
const RARITY_BASE: Record<NewSpeciesId, number> = {
  bubble: 8, moss: 8, bell: 8,
  lantern: 4, archive: 4, waterfall: 4, ghosted: 4, sleepless: 4,
  timid: 4, broken: 4, pixel: 4,
  undo: 1, 'rain-crown': 0, // 雨神之冠基础权重 0，仅警报期赋权重
};

function isFog(code: number): boolean {
  return code === 45 || code === 48;
}

function isRain(code: number): boolean {
  return PRECIPITATION_CODES.has(code);
}

function isDeepNight(localHour: number): boolean {
  return localHour >= 23 || localHour < 5;
}

/**
 * 当日权重表（只含正权重）。未知天气码返回 null，调用方不得借此伪造结果。
 */
export function speciesWeights(input: Omit<SpeciesRollInput, 'seed' | 'plantedSpecies'>): Partial<Record<NewSpeciesId, number>> | null {
  if (!KNOWN_WMO_CODES.has(input.weatherCode)) return null;
  const weights: Partial<Record<NewSpeciesId, number>> = {};
  for (const id of NEW_SPECIES_IDS) weights[id] = RARITY_BASE[id];
  const mult = (id: NewSpeciesId, factor: number): void => {
    weights[id] = (weights[id] ?? 0) * factor;
  };
  // 天气倾向
  if (isRain(input.weatherCode)) {
    mult('bell', 6);
    mult('waterfall', 2);
  } else if (isFog(input.weatherCode)) {
    mult('lantern', 6);
  }
  if (input.humidity >= 85) {
    mult('bubble', 5);
    mult('moss', 3);
  } else if (input.humidity >= 70) {
    mult('bubble', 2);
  }
  // 时段倾向
  if (isDeepNight(input.localHour)) mult('sleepless', 6);
  // 对象类别倾向
  switch (input.category) {
    case 'archive': mult('archive', 8); break;
    case 'image': mult('waterfall', 8); break;
    case 'chat': mult('ghosted', 5); mult('timid', 4); break;
    case 'code': mult('broken', 4); mult('pixel', 4); mult('undo', 4); break;
    default: break;
  }
  // 回南天警报：开放雨神之冠，返潮系加成
  if (input.alertActive) {
    weights['rain-crown'] = 2;
    mult('bubble', 2);
    mult('bell', 2);
  }
  return weights;
}

function pickWeighted(weights: Partial<Record<NewSpeciesId, number>>, rand: Rand): NewSpeciesId {
  const entries = (Object.entries(weights) as Array<[NewSpeciesId, number]>).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) throw new Error('品种权重全为零，无法抽取');
  let roll = rand() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
}

/**
 * 判定一次品种。播种品种优先（直接返回，不做天气重抽）；
 * 无播种且天气未知时返回 null；其余由 seed 决定，同输入同结果。
 */
export function rollSpecies(input: SpeciesRollInput): NewSpeciesId | null {
  if (input.plantedSpecies) return input.plantedSpecies;
  const weights = speciesWeights(input);
  if (!weights) return null;
  return pickWeighted(weights, createRand(input.seed));
}
