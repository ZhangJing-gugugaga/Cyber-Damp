/**
 * 游戏动作装配（app 层）：售卖 / 购买 / Demo 控制台动作 / 蘑菇采摘
 * 从 game.ts 拆出（单文件 ≤300 行纪律）；只编排，领域逻辑在 world/
 */
import type { Application } from 'pixi.js';
import type { WorldRuntime } from './world-runtime';
import type { RopeManager, RopeEntry } from './rope-manager';
import type { MushroomView } from '../view/mushroom-view';
import type { ParticlePool } from '../view/particles';
import type { Sfx } from '../audio/sfx';
import type { TipOptions } from '../ui/toast';
import { itemName } from '../ui/shop-panel';
import { sporeBurst } from '../input/fx-burst';
import { ropeByteLimit } from '../physics/hang-controller';
import { SPECIES } from '../../world/mushroom-species';
import type { Tool } from '../input/pointer-controller';
import { emitAction } from './events';
import { trackEvent, trackFirst } from './telemetry';

export interface GameActionContext {
  app: Application;
  runtime: WorldRuntime;
  ropes: RopeManager;
  pool: ParticlePool;
  sfx: Sfx;
  shrooms: Map<string, MushroomView>;
  /** 最小 toast 面（避免与 ui-root 装配顺序耦合） */
  toast: { tip(text: string, opts?: TipOptions): void };
  refresh(): void;
  placeFan(): void;
  retierRopes(): void;
  /** 注册绳 Graphics（Demo 直接 spawn 的绳必须走此回调，否则不可见） */
  registerRope(entry: RopeEntry): void;
  getTool(): Tool;
}

export interface GameActions {
  onSell(): void;
  onBuy(itemId: string): void;
  pickMushroom(id: string): void;
  demo: {
    rainSweep(): void;
    hangFull(): void;
    cultivate(): void;
    /** QA 专用（CD_QA=1）：定向生成成熟胆小菇 */
    cultivateShy(): void;
    readout(): { rope: string; load: string; files: string; moldy: string };
  };
}

export function createGameActions(ctx: GameActionContext): GameActions {
  const { runtime, ropes, sfx, toast, pool, shrooms } = ctx;

  function onSell(): void {
    const earned = runtime.sellInventory();
    if (earned > 0) {
      sfx.coin();
      emitAction('sell');
      trackFirst('first_sale');
      trackEvent('mushroom_sold', { earned });
      if (runtime.coins >= 800) trackFirst('graduation_reached');
      toast.tip(`蘑菇出手，入账 ${earned} 币。回南天的第一桶金。`);
    }
  }

  function onBuy(itemId: string): void {
    const res = runtime.tryPurchase(itemId);
    if (res.ok) {
      sfx.coin();
      emitAction('buy');
      trackEvent('upgrade_purchased', { itemId });
      if (runtime.coins >= 800) trackFirst('graduation_reached');
      if (itemId === 'fan-1') ctx.placeFan();
      if (itemId.startsWith('rope-')) ctx.retierRopes();
      toast.tip(`买下了「${itemName(itemId)}」，回南天装备库 +1。`);
    } else if (res.reason === 'insufficient') {
      toast.tip('币不够。蘑菇还在长，急不来。');
    }
  }

  function pickMushroom(id: string): void {
    const item = runtime.pickMushroom(id);
    if (!item) return; // AC-19：未成熟无效且无提示
    emitAction('pick');
    trackFirst('first_pick');
    const view = shrooms.get(id);
    if (view) {
      sporeBurst(pool, view.container.position.x, view.container.position.y);
      view.container.destroy();
      shrooms.delete(id);
    }
    sfx.snip();
    const def = SPECIES[item.species];
    toast.tip(`剪下一朵${def.name}（${def.rarity}），入库待售。杂货铺收购价 ${def.price} 币。`);
  }

  /** Demo 一键挂满：容量预检贪心截断（AC-32），演示绳用会下垂的绳型（禁钢杆） */
  function hangFull(): void {
    const tier = runtime.equipped.rope === 'rope-3' ? 'rope-2' : runtime.equipped.rope;
    const limit = ropeByteLimit(tier);
    const sorted = [...runtime.entities].sort((a, b) => b.node.sizeBytes - a.node.sizeBytes);
    const picked: typeof sorted = [];
    let total = 0;
    for (const ent of sorted) {
      if (total + ent.node.sizeBytes <= limit) {
        picked.push(ent);
        total += ent.node.sizeBytes;
      }
      if (picked.length >= 6) break;
    }
    const entry = ropes.spawn(10, 170, ctx.app.screen.width - 10, 190, tier);
    if (!entry) {
      toast.tip('绳位满了（同屏最多 2 条），先收一条再挂。');
      return;
    }
    ctx.registerRope(entry);
    picked.forEach((ent, i) => {
      const link = entry.rope.links[Math.floor(3 + (i * 8) / Math.max(1, picked.length - 1))];
      if (ropes.hang(entry, ent.node, { x: link.position.x, y: link.position.y })) {
        runtime.markState(ent.node.id, 'hung');
      }
    });
    ctx.refresh();
    sfx.pop(0.7);
    toast.tip(`容量预检通过：${picked.length} 件共 ${(total / 1024 ** 3).toFixed(1)}GB（上限 ${(limit / 1024 ** 3).toFixed(0)}GB）。`);
  }

  return {
    onSell,
    onBuy,
    pickMushroom,
    demo: {
      rainSweep: () => runtime.startRainSweep(),
      cultivate: () => {
        if (runtime.cultivateOne()) sfx.pop(1.2);
      },
      cultivateShy: () => {
        if (runtime.cultivateShy()) sfx.pop(1.6);
      },
      hangFull,
      readout: () => ({
        rope: itemName(runtime.equipped.rope),
        load:
          ropes.entries
            .filter((e) => !e.broken)
            .map((e) => `${(ropes.totalBytes(e) / 1024 ** 3).toFixed(1)}GB/${(ropes.limitOf(e.tier) / 1024 ** 3).toFixed(0)}GB`)
            .join(' | ') || '无绳',
        files: String(runtime.entities.length),
        moldy: String(runtime.entities.filter((e) => e.runtime.mold > 0.6).length),
      }),
    },
  };
}
