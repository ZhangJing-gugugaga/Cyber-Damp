/**
 * 玩家动作函数集（app 装配层）：拧干/采摘/售卖/迁徙/购买/喷雾/施热/培育/扣币
 * 从 world-runtime.ts 拆出（单文件 ≤300 行纪律）；领域数值规则仍以 world/ 为准，
 * 本层只做状态编排（改字段 + 发变更信号）。
 */
import type { WorldRuntime } from './world-runtime';
import { CITIES } from '../../world/weather-simulator';
import { sellMushroom } from '../../world/economy';
import { purchase, getItem } from '../../world/shop-catalog';
import { pickSpecies } from '../../world/mushroom-species';
import { clamp01 } from './clamp';

import type { InventoryItem } from '../../world/economy';
import type { PurchaseResult } from '../../world/shop-catalog';
export type { InventoryItem, PurchaseResult };

function emit(rt: WorldRuntime): void {
  rt.onChange?.();
}

export function localDate(rt: WorldRuntime): string {
  const d = new Date(rt.now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 拧干（AC-14）：湿度 >0.3 时 ×0.5 */
export function wring(rt: WorldRuntime, id: string): boolean {
  const ent = rt.byId.get(id);
  if (!ent || ent.runtime.humidity <= 0.3) return false;
  ent.runtime.humidity = clamp01(ent.runtime.humidity * 0.5);
  emit(rt);
  return true;
}

/** 采摘成熟蘑菇入库存（AC-15/AC-19） */
export function pickMushroom(rt: WorldRuntime, id: string): InventoryItem | null {
  const ent = rt.byId.get(id);
  const m = ent?.runtime.mushroom;
  if (!ent || !m || m.growth < 1) return null;
  ent.runtime.mushroom = null;
  const item = { species: m.species, growth: m.growth };
  rt.inventory.push(item);
  rt.stats.harvested += 1;
  emit(rt);
  return item;
}

/** 售卖库存中全部成熟蘑菇（AC-20），返回入账币数 */
export function sellInventory(rt: WorldRuntime): number {
  const before = rt.coins;
  const res = sellMushroom(rt.inventory, rt.coins);
  rt.coins = res.coins;
  rt.inventory = res.remaining;
  rt.stats.earned += rt.coins - before;
  emit(rt);
  return rt.coins - before;
}

/** 迁徙限制：1 次/日（AC-03） */
export function migrate(rt: WorldRuntime, cityId: string): boolean {
  if (rt.migratedOn === localDate(rt) || !CITIES.some((c) => c.id === cityId)) return false;
  rt.city = cityId;
  rt.migratedOn = localDate(rt);
  emit(rt);
  return true;
}

export function canMigrate(rt: WorldRuntime): boolean {
  return rt.migratedOn !== localDate(rt);
}

export function nextCity(rt: WorldRuntime): string {
  const i = CITIES.findIndex((c) => c.id === rt.city);
  return CITIES[(i + 1) % CITIES.length].id;
}

/** 购买（AC-21/22/23）：绳索购买即装备并即时生效 */
export function tryPurchase(rt: WorldRuntime, itemId: string): PurchaseResult {
  const item = getItem(itemId);
  if (!item) return { ok: false, reason: 'not-found' };
  const consumable = item.category === 'consumable';
  if (!consumable && rt.owned.includes(itemId)) return { ok: false, reason: 'owned' };
  const res = purchase(rt.coins, itemId, consumable ? [] : rt.owned);
  if (!res.ok || res.coins === undefined) return res;
  rt.coins = res.coins;
  if (!consumable) rt.owned.push(itemId);
  if (item.category === 'rope') rt.equipped.rope = itemId;
  if (itemId === 'clip-2') rt.equipped.clip = itemId;
  if (itemId === 'fan-1') rt.fanPlaced = true; // AC-23：放置即摇头
  if (itemId === 'humidifier-1') rt.humidifierOn = true;
  if (itemId === 'spray-1') rt.sprayCharges += 1;
  emit(rt);
  return res;
}

/** 保湿喷雾：焦化恢复 + 湿度 +0.3（架构 §4.3） */
export function useSpray(rt: WorldRuntime, id: string): boolean {
  if (rt.sprayCharges <= 0) return false;
  const ent = rt.byId.get(id);
  if (!ent) return false;
  rt.sprayCharges -= 1;
  ent.runtime.char = 0;
  if (ent.runtime.state === 'burnt') ent.runtime.state = 'idle';
  ent.runtime.humidity = clamp01(ent.runtime.humidity + 0.3);
  emit(rt);
  return true;
}

/**
 * 吹风机按住施热（P1 局部热源）：湿度快速下降；humidity<0.3 后
 * char += dt×0.01（与演化同速率），>0.6 锁定 burnt。局部实现不走全局 env.heat。
 */
export function applyHeat(rt: WorldRuntime, id: string, dtSec: number): void {
  const ent = rt.byId.get(id);
  if (!ent || ent.runtime.state === 'burnt') return;
  const rtState = ent.runtime;
  rtState.humidity = clamp01(rtState.humidity - dtSec * 0.25);
  if (rtState.humidity < 0.3) {
    rtState.char = clamp01(rtState.char + dtSec * 0.01);
    if (rtState.char > 0.6) rtState.state = 'burnt';
  }
}

/** 蜗牛食苔免费清洁（AC-29）：连续过程不触发存档防抖（周期兜底落盘） */
export function reduceMold(rt: WorldRuntime, id: string, amt: number): void {
  const ent = rt.byId.get(id);
  if (!ent) return;
  ent.runtime.mold = Math.max(0, ent.runtime.mold - amt);
}

export function markState(rt: WorldRuntime, id: string, state: 'idle' | 'hung' | 'drying'): void {
  const ent = rt.byId.get(id);
  if (ent && ent.runtime.state !== 'burnt') ent.runtime.state = state;
}

/** Demo 一键培育：随机一个文件立即出成熟蘑菇 */
export function cultivateOne(rt: WorldRuntime, rand: number): boolean {
  const candidates = rt.entities.filter((e) => e.runtime.state !== 'burnt');
  if (candidates.length === 0) return false;
  const ent = candidates[Math.floor(rand * candidates.length)];
  ent.runtime.mold = Math.max(ent.runtime.mold, 0.65);
  ent.runtime.mushroom = { species: pickSpecies(ent.node.category, rand), growth: 1 };
  emit(rt);
  return true;
}

/** QA 专用（CD_QA=1）：在压缩包文件上定向生成成熟胆小菇，用于 AC-30 现场验收 */
export function cultivateShy(rt: WorldRuntime): boolean {
  const ent = rt.entities.find((e) => e.node.category === 'archive' && e.runtime.state !== 'burnt');
  if (!ent) return false;
  ent.runtime.mold = Math.max(ent.runtime.mold, 0.65);
  ent.runtime.mushroom = { species: 'shy', growth: 1 };
  emit(rt);
  return true;
}

/** 扣币（吸湿盒批量购买等），余额不足返回 false */
export function chargeCoins(rt: WorldRuntime, n: number): boolean {
  if (rt.coins < n) return false;
  rt.coins -= n;
  emit(rt);
  return true;
}
