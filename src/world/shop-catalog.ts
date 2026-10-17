/**
 * 杂货铺商品表与购买逻辑（world 纯领域层）
 * SPEC v1.0 §2/§6：绳索三档字节承重 + 夹子两档 + 电扇 + 加湿器 + 保湿喷雾
 */
import { GB } from '../shared/constants';

export type ItemId =
  | 'rope-1' | 'rope-2' | 'rope-3'
  | 'clip-1' | 'clip-2'
  | 'fan-1' | 'humidifier-1' | 'spray-1'
  | 'box-1';

export interface ShopItem {
  id: ItemId;
  name: string;
  price: number;
  category: 'rope' | 'clip' | 'appliance' | 'consumable';
  /** 一行功能摘要（商店卡片展示） */
  desc: string;
  /** 绳型字节承重上限（仅 rope 类） */
  byteLimit?: number;
  /** 是否刚性（钢杆：约束 stiffness 1.0，不下垂） */
  rigid?: boolean;
}

export const ITEMS: ShopItem[] = [
  { id: 'rope-1', name: '老式麻绳', price: 0, category: 'rope', desc: '承重上限 5GB，挂大文件极易断裂', byteLimit: 5 * GB },
  { id: 'rope-2', name: '妈妈的红塑料绳', price: 100, category: 'rope', desc: '承重上限 25GB，色彩极具中式年代感', byteLimit: 25 * GB },
  { id: 'rope-3', name: '304不锈钢防风晒衣杆', price: 800, category: 'rope', desc: '毕业级装备。刚性笔直不坍塌，挂 100GB 都不滑堆', byteLimit: 100 * GB, rigid: true },
  { id: 'clip-1', name: '普通木衣夹', price: 0, category: 'clip', desc: '遇强风有概率夹不住' },
  { id: 'clip-2', name: '恒温发热夹', price: 300, category: 'clip', desc: '夹住文件自带微弱暖风烘干，绝不烤缩水' },
  { id: 'fan-1', name: '老式绿头摇头电扇', price: 250, category: 'appliance', desc: '自动左右摇头吹风，整排绳上图标随风向起伏' },
  { id: 'humidifier-1', name: '超声波赛博加湿器', price: 500, category: 'appliance', desc: '逆向致富神器。局部高湿温室催熟蘑菇' },
  { id: 'spray-1', name: '保湿喷雾', price: 20, category: 'consumable', desc: '焦化文件恢复原状（消耗品）' },
  { id: 'box-1', name: '氯化钙吸湿盒', price: 30, category: 'consumable', desc: '墙角静默吸湿。积水涨满要手动倒，碰倒了泼你半屏（可叠购 9 盒）' },
];

export function getItem(id: string): ShopItem | undefined {
  return ITEMS.find((i) => i.id === id);
}

export function canAfford(coins: number, itemId: string): boolean {
  const item = getItem(itemId);
  return !!item && coins >= item.price;
}

export interface PurchaseResult {
  ok: boolean;
  /** 扣费后余额（ok 时） */
  coins?: number;
  /** 失败原因（ok=false 时） */
  reason?: 'not-found' | 'insufficient' | 'owned';
}

/** 购买：扣币 + 入 owned。绳索类购买即装备（equipped.rope 更新由调用方处理）。 */
export function purchase(coins: number, itemId: string, owned: string[]): PurchaseResult {
  const item = getItem(itemId);
  if (!item) return { ok: false, reason: 'not-found' };
  if (owned.includes(itemId)) return { ok: false, reason: 'owned' };
  if (coins < item.price) return { ok: false, reason: 'insufficient' };
  return { ok: true, coins: coins - item.price };
}
