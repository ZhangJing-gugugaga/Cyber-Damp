/**
 * 蜗牛控制器（app 装配层，AC-29）
 * When 桌面同时 ≥3 个 mold 文件 → 屏幕边缘生成蜗牛（同屏 ≤2，冷却 25s）；
 * 沿绳爬行（无绳走地面）经过 mold 文件 mold -= dt×0.05（免费清洁）；银道粒子；
 * 戳一下 → 缩壳 → 受重力掉落任务栏 → 停留数秒后离场。
 */
import type { WorldLayers } from '../view/layers';
import type { ParticlePool } from '../view/particles';
import { SnailView } from '../view/snail-view';
import { ENV_COLOR } from '../view/token-colors';
import type { WorldRuntime } from './world-runtime';
import type { RopeManager } from './rope-manager';
import type { RopeEntry } from './rope-manager';

const MAX_SNAILS = 2;
const SPAWN_COOLDOWN = 25;
const CRAWL_SPEED = 18;        // px/s
const EAT_RADIUS = 46;         // 食苔判定半径
const SLIME_INTERVAL = 0.35;
const HIT_RADIUS = 26;         // 戳击判定

type SnailState = 'crawl' | 'shell' | 'fall' | 'rest';

interface Snail {
  view: SnailView;
  state: SnailState;
  x: number;
  y: number;
  dir: 1 | -1;
  /** 绳路径（沿绳爬行）；null = 地面爬行 */
  rope: RopeEntry | null;
  pathIdx: number;
  vy: number;
  shellT: number;
  restT: number;
  slimeAcc: number;
}

export class SnailController {
  private snails: Snail[] = [];
  private cooldown = 8; // 首只较快登场

  constructor(
    private layers: WorldLayers,
    private pool: ParticlePool,
    private screen: () => { w: number; h: number },
  ) {}

  /** 戳一下：缩壳并掉落；命中返回 true（pointer 消费本次点击） */
  poke(x: number, y: number): boolean {
    for (const s of this.snails) {
      if (s.state !== 'crawl' && s.state !== 'shell') continue;
      if (Math.hypot(s.x - x, s.y - y) <= HIT_RADIUS) {
        s.state = 'shell';
        s.shellT = 0.6;
        return true;
      }
    }
    return false;
  }

  /** 悬停命中（AC-26：世界里可交互物必须拦截穿透） */
  hit(x: number, y: number): boolean {
    for (const s of this.snails) {
      if (s.state !== 'crawl' && s.state !== 'shell') continue;
      if (Math.hypot(s.x - x, s.y - y) <= HIT_RADIUS) return true;
    }
    return false;
  }

  update(runtime: WorldRuntime, ropes: RopeManager, dtSec: number, tSec: number): void {
    const { w, h } = this.screen();
    const groundY = h - 64;
    this.cooldown -= dtSec;

    // 生成判定：≥3 个 moldy 文件
    const moldyCount = runtime.entities.filter((e) => e.runtime.mold > 0.4 || e.runtime.stage === 'moldy').length;
    if (this.cooldown <= 0 && this.snails.length < MAX_SNAILS && moldyCount >= 3) {
      this.cooldown = SPAWN_COOLDOWN;
      this.spawn(groundY, ropes);
    }

    for (let i = this.snails.length - 1; i >= 0; i--) {
      const s = this.snails[i];
      switch (s.state) {
        case 'crawl':
          this.crawl(s, runtime, ropes, dtSec, tSec);
          break;
        case 'shell':
          s.shellT -= dtSec;
          if (s.shellT <= 0) {
            s.state = 'fall';
            s.vy = 0;
            s.rope = null; // 与绳脱钩
          }
          break;
        case 'fall':
          s.vy += 900 * dtSec;
          s.y += s.vy * dtSec;
          if (s.y >= groundY) {
            s.y = groundY;
            s.state = 'rest';
            s.restT = 2.5;
          }
          break;
        case 'rest':
          s.restT -= dtSec;
          if (s.restT <= 0) this.despawn(i);
          break;
      }
      if (s.view.container.destroyed) continue; // 本帧已离场：禁止再访问已销毁视图（position=null）
      s.view.container.position.set(s.x, s.y);
      s.view.update(tSec, s.state === 'crawl', s.state === 'shell' ? 1 : 0);
    }
  }

  private spawn(groundY: number, ropes: RopeManager): void {
    const { w } = this.screen();
    const fromLeft = Math.random() < 0.5;
    const live = ropes.entries.filter((e) => !e.broken && e.bodies.length > 0);
    const rope = live.length > 0 ? live[0] : null;
    const s: Snail = {
      view: new SnailView(),
      state: 'crawl',
      x: fromLeft ? 12 : w - 12,
      y: rope ? rope.rope.ay : groundY,
      dir: fromLeft ? 1 : -1,
      rope,
      pathIdx: fromLeft ? 0 : 13,
      vy: 0,
      shellT: 0,
      restT: 0,
      slimeAcc: 0,
    };
    s.view.setFacing(s.dir);
    this.layers.shroomLayer.addChild(s.view.container);
    this.snails.push(s);
  }

  private crawl(s: Snail, runtime: WorldRuntime, ropes: RopeManager, dtSec: number, tSec: number): void {
    const { w, h } = this.screen();
    if (s.rope && !s.rope.broken) {
      // 沿绳链折线爬行
      const links = s.rope.rope.links;
      const next = links[Math.min(links.length - 1, Math.max(0, s.pathIdx + s.dir))];
      const dx = next.position.x - s.x;
      const dy = next.position.y - s.y;
      const dist = Math.hypot(dx, dy);
      const step = CRAWL_SPEED * dtSec;
      if (dist <= step) {
        s.x = next.position.x;
        s.y = next.position.y;
        s.pathIdx += s.dir;
        if (s.pathIdx <= 0 || s.pathIdx >= links.length - 1) s.rope = null; // 爬到头，落地
      } else {
        s.x += (dx / dist) * step;
        s.y += (dy / dist) * step;
      }
    } else {
      s.y = Math.min(s.y + 40 * dtSec, h - 64); // 无绳/到头：落地面爬行
      s.x += s.dir * CRAWL_SPEED * dtSec;
      if (s.x <= 8 || s.x >= w - 8) {
        this.despawn(this.snails.indexOf(s));
        return;
      }
    }

    // 食苔：附近 mold 文件免费清洁（AC-29）
    for (const ent of runtime.entities) {
      if (ent.runtime.mold <= 0.05) continue;
      const near =
        Math.hypot(ent.node.x - s.x, ent.node.y - s.y) <= EAT_RADIUS ||
        (ent.runtime.state === 'hung' && Math.hypot(ent.node.x - s.x, ent.node.y - s.y) <= EAT_RADIUS + 20);
      if (near) runtime.reduceMold(ent.node.id, dtSec * 0.05);
    }

    // 银色黏液印
    s.slimeAcc += dtSec;
    if (s.slimeAcc >= SLIME_INTERVAL) {
      s.slimeAcc = 0;
      this.pool.spawn({
        x: s.x,
        y: s.y + 4,
        vx: 0,
        vy: 0,
        gravity: 0,
        color: ENV_COLOR.slime,
        size: 2,
        life: 4.5,
        shape: 'circle',
        alpha: 0.45,
      });
    }
  }

  private despawn(index: number): void {
    const s = this.snails[index];
    if (!s) return;
    s.view.container.destroy();
    this.snails.splice(index, 1);
  }
}
