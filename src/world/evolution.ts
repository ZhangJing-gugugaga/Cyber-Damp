/**
 * 演化状态机（world 纯领域层，禁 import pixi/matter/electron）
 * SPEC v1.0 §6：湿度趋向 / 霉变蔓延 / 蘑菇生长 / 焦化锁定 / 绳上风干
 * 全部纯函数，可单测；所有数值钳制 0..1
 */
import type { FileRuntime, MushroomSpecies } from '../shared/types/file-runtime';
import type { ExtCategory } from '../shared/types/file-node';
import { pickSpecies } from './mushroom-species';

export interface Env {
  /** 全局湿度 0..1 */
  humidity: number;
  /** 热源强度 0..1（吹风机热风/CPU 出汗） */
  heat: number;
  /** 风力 0..1（电扇/晴天） */
  wind: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 推进单个文件一帧的演化。
 * @param rt 运行时状态（原地修改）
 * @param env 环境输入
 * @param dtSec 帧步长（秒）
 * @param category 文件大类（蘑菇萌生定菌种用）
 * @param rand 0..1 随机源（萌生判定与菌种抽取，由调用方注入保证可回放）
 */
export function stepEvolution(
  rt: FileRuntime,
  env: Env,
  dtSec: number,
  category: ExtCategory,
  rand: number,
): void {
  if (rt.state === 'burnt') return; // 焦化锁定，需保湿喷雾重置

  // 湿度趋向目标；绳上晾晒趋向干爽，大风加速
  const hung = rt.state === 'hung';
  const target = hung ? 0.15 : env.humidity * 0.9;
  let rate = dtSec * 0.2;
  if (hung && env.wind > 0.5) rate *= 1.8;
  const delta = target - rt.humidity;
  rt.humidity = clamp01(rt.humidity + delta * Math.min(rate, 1));

  // 霉变蔓延（高湿加速）
  if (env.humidity > 0.55) {
    rt.mold = clamp01(rt.mold + dtSec * 0.004 * env.humidity);
  }

  // 蘑菇：mold > 0.6 萌生；生长三阶段由 growth 0..1 表达
  if (!rt.mushroom && rt.mold > 0.6 && rand < 0.5) {
    const species: MushroomSpecies = pickSpecies(category, rand * 2 % 1);
    rt.mushroom = { species, growth: 0 };
  }
  if (rt.mushroom) {
    rt.mushroom.growth = clamp01(rt.mushroom.growth + dtSec * 0.01);
  }

  // 过热烘烤焦化
  if (env.heat > 0.8 && rt.humidity < 0.3) {
    rt.char = clamp01(rt.char + dtSec * 0.01);
  }
  if (rt.char > 0.6) {
    rt.state = 'burnt';
  }
}

/**
 * 由 mtime 差推导冷落度阶段（SPEC §6：<3d fresh / 3-14d damp / 14-30d wet / >30d moldy）
 */
export function deriveStage(mtime: number, now: number): FileRuntime['stage'] {
  const days = (now - mtime) / 86400000;
  if (days < 3) return 'fresh';
  if (days < 14) return 'damp';
  if (days < 30) return 'wet';
  return 'moldy';
}
