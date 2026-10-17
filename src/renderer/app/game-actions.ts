/**
 * 游戏动作装配（app 层）：售卖 / 购买 / Demo 控制台动作 / 蘑菇采摘
 * 采摘：剪断 → 三次贝塞尔飞向右上角金币栏 → 金币粒子 + 入账。
 */
import type { Application, Ticker } from 'pixi.js';
import type { WorldRuntime } from './world-runtime';
import type { RopeManager, RopeEntry } from './rope-manager';
import type { MushroomView } from '../view/mushroom-view';
import type { ParticlePool } from '../view/particles';
import type { Sfx } from '../audio/sfx';
import type { TipOptions } from '../ui/toast';
import { itemName } from '../ui/shop-panel';
import { sporeBurst } from '../input/fx-burst';
import { ropeByteLimit } from '../../world/rope-load';
import { SPECIES } from '../../world/mushroom-species';
import { ENV_COLOR } from '../view/token-colors';
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

function formatBytes(n: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (n >= GB) return `${(n / GB).toFixed(1)}GB`;
  if (n >= MB) return `${(n / MB).toFixed(1)}MB`;
  if (n >= KB) return `${(n / KB).toFixed(0)}KB`;
  return `${n}B`;
}

/** 金币栏中心（DOM → Pixi 屏幕坐标一致：画布铺满窗口且原点 0,0） */
function coinTarget(app: Application): { x: number; y: number } {
  const el = document.querySelector('.coin-pill');
  const rect = el?.getBoundingClientRect();
  if (rect && rect.width > 0) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return { x: app.screen.width - 150, y: 32 };
}

export function createGameActions(ctx: GameActionContext): GameActions {
  const { runtime, ropes, sfx, toast, pool, shrooms, app } = ctx;

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

  /** 剪下成熟蘑菇：立即入账，视图沿贝塞尔飞向金币栏后销毁 */
  function pickMushroom(id: string): void {
    const item = runtime.pickMushroom(id);
    if (!item) return; // 未成熟无效且无提示
    const def = SPECIES[item.species];
    emitAction('pick');
    trackFirst('first_pick');

    const view = shrooms.get(id);
    shrooms.delete(id);
    if (!view) {
      toast.tip(`剪下一朵${def.name}（${def.rarity}），入账 ${def.price} 币。`);
      return;
    }

    const start = { x: view.container.position.x, y: view.container.position.y };
    sporeBurst(pool, start.x, start.y);
    const target = coinTarget(app);
    const c1 = { x: start.x + 70, y: start.y - 150 };
    const c2 = { x: target.x - 150, y: target.y + 110 };
    let t = 0;

    const fly = (ticker: Ticker): void => {
      t += Math.min(0.05, ticker.deltaMS / 1000);
      const k = Math.min(1, t / 0.72);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const u = 1 - e;
      view.container.position.set(
        u * u * u * start.x + 3 * u * u * e * c1.x + 3 * u * e * e * c2.x + e * e * e * target.x,
        u * u * u * start.y + 3 * u * u * e * c1.y + 3 * u * e * e * c2.y + e * e * e * target.y,
      );
      view.container.scale.set(Math.max(0.16, 1 - e * 0.76));
      view.container.rotation = e * 1.6;
      if (k < 1) return;
      app.ticker.remove(fly);
      view.container.destroy({ children: true });
      sfx.coin();
      pool.burst(target.x, target.y, 9, (i) => ({
        x: target.x,
        y: target.y,
        vx: (Math.random() - 0.5) * 160,
        vy: -40 - Math.random() * 100,
        gravity: 260,
        color: ENV_COLOR.coin,
        size: 1.4 + (i % 3) * 0.6,
        life: 0.7,
        shape: 'circle',
        alpha: 0.95,
      }));
    };
    app.ticker.add(fly);
    toast.tip(`剪下一朵${def.name}（${def.rarity}），+${def.price} 币。`);
  }

  /** Demo 一键挂满：容量预检贪心截断，沿弧长均匀挂载（随后物理自动聚拢） */
  function hangFull(): void {
    const tier = runtime.equipped.rope === 'rope-3' ? 'rope-2' : runtime.equipped.rope;
    const limit = ropeByteLimit(tier);
    const sorted = [...runtime.entities]
      .filter((e) => e.node.kind !== 'recycle')
      .sort((a, b) => b.node.sizeBytes - a.node.sizeBytes);
    const picked: typeof sorted = [];
    let total = 0;
    for (const ent of sorted) {
      if (total + ent.node.sizeBytes <= limit) {
        picked.push(ent);
        total += ent.node.sizeBytes;
      }
      if (picked.length >= 6) break;
    }
    if (picked.length === 0) {
      toast.tip('桌面没有可以挂的文件。');
      return;
    }
    const entry = ropes.spawn(10, 170, app.screen.width - 10, 190, tier);
    if (!entry) {
      toast.tip('绳位满了（同屏最多 2 条），先收一条再挂。');
      return;
    }
    ctx.registerRope(entry);
    const span = entry.rope.length;
    picked.forEach((ent, i) => {
      const s = span * ((i + 1) / (picked.length + 1));
      if (ropes.pinAt(entry, ent.node, s)) runtime.markState(ent.node.id, 'hung');
    });
    ctx.refresh();
    sfx.pop(0.7);
    toast.tip(`容量预检通过：${picked.length} 件共 ${formatBytes(total)}（上限 ${formatBytes(limit)}）。`);
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
