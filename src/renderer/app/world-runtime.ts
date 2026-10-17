/**
 * 游戏运行时（app 装配层，无 pixi/matter import——只依赖 world/ 与 shared/，可测）
 * 聚合：文件实体 / 演化推进 / 天气环境 / 经济 / 购买 / Demo 动作 / 存档快照
 * 绳索物理不在此层（RopeManager 负责），存档时由外部传入 ropes 快照
 */
import { FileEntity } from '../../world/file-entity';
import { stepEvolution } from '../../world/evolution';
import type { Env } from '../../world/evolution';
import { sellMushroom } from '../../world/economy';
import type { InventoryItem } from '../../world/economy';
import { purchase, getItem } from '../../world/shop-catalog';
import type { PurchaseResult } from '../../world/shop-catalog';
import { CITIES, simulateDay, humidityMultiplier, isSunny, dateToDayIndex } from '../../world/weather-simulator';
import { pickSpecies } from '../../world/mushroom-species';
import { generateDesktop } from '../../world/virtual-desktop';
import type { SaveData, RopeSave } from '../../shared/types/save';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class WorldRuntime {
  readonly entities: FileEntity[] = [];
  readonly byId = new Map<string, FileEntity>();
  coins = 0;
  inventory: InventoryItem[] = [];
  owned: string[] = ['rope-1', 'clip-1'];
  equipped = { rope: 'rope-1', clip: 'clip-1' };
  city = CITIES[0].id;
  migratedOn = '';
  sprayCharges = 0;
  fanPlaced = false;
  humidifierOn = false;
  stats = { harvested: 0, earned: 0, playedMs: 0 };

  /** 演出期间输入锁定（开场时光坍缩 / AC-01） */
  locked = true;
  /** 状态变化信号（UI 刷新 + 存档防抖） */
  onChange: (() => void) | null = null;

  cpu = 0;
  private cpuHighSec = 0;
  private timeSec = 0;
  private startNow = Date.now();
  private rnd = mulberry32(20261017);
  /** Demo 一键回南天：3s 扫描进度（<1 进行中） */
  private sweepT = 1;

  get now(): number {
    return this.startNow + this.timeSec * 1000;
  }

  get sweating(): boolean {
    return this.cpuHighSec >= 5; // AC-05：连续 5s >80%
  }

  /** 新开局：生成 16 锚文件桌面 */
  initNew(now: number): void {
    this.startNow = now;
    for (const node of generateDesktop(now)) {
      const ent = new FileEntity(node);
      ent.syncStage(now);
      this.entities.push(ent);
      this.byId.set(node.id, ent);
    }
  }

  /** 从存档恢复（mtime/x/y/name/ext/size 由生成器确定性重建，不入存档） */
  initFromSave(save: SaveData, now: number): void {
    this.initNew(now);
    this.coins = save.player.coins;
    this.owned = save.player.owned.slice();
    this.equipped = { ...save.player.equipped };
    this.city = save.weather.city;
    this.migratedOn = save.weather.migratedOn;
    this.stats = { ...save.stats };
    this.fanPlaced = this.owned.includes('fan-1');
    this.humidifierOn = this.owned.includes('humidifier-1');
    const saved = new Map(save.files.map((f) => [f.id, f]));
    for (const ent of this.entities) {
      const s = saved.get(ent.node.id);
      if (!s) continue;
      ent.runtime.humidity = clamp01(s.humidity);
      ent.runtime.mold = clamp01(s.mold);
      ent.runtime.char = clamp01(s.char);
      ent.runtime.state = s.state;
      ent.runtime.mushroom = s.mushroom ? { ...s.mushroom } : null;
    }
  }

  /** 当日天气（确定性） */
  dayWeather() {
    return simulateDay(this.city, dateToDayIndex(new Date(this.now)));
  }

  /** 环境输入（架构 §5.5：雨/暴 ×2；CPU 出汗 +0.3；加湿器 +0.15；电扇/晴天风干） */
  env(): Env {
    const day = this.dayWeather();
    let humidity = day.humidity * humidityMultiplier(day.condition);
    if (this.sweating) humidity += 0.3;
    if (this.humidifierOn) humidity += 0.15;
    let wind = isSunny(day.condition) ? 0.45 : 0.15;
    if (this.fanPlaced) wind = Math.max(wind, 0.7);
    return { humidity: clamp01(humidity), heat: 0, wind };
  }

  /** 固定步推进（game-loop 每步调用） */
  tick(dtSec: number): void {
    this.timeSec += dtSec;
    if (this.cpu > 0.8) this.cpuHighSec += dtSec;
    else this.cpuHighSec = 0;
    this.stats.playedMs += dtSec * 1000;

    // Demo 一键回南天：3s 扫描（AC-31：3s 内走完出水→变软→长蘑菇）
    if (this.sweepT < 1) {
      this.sweepT = Math.min(1, this.sweepT + dtSec / 3);
    }
    const env = this.env();
    const now = this.now;
    for (const ent of this.entities) {
      ent.syncStage(now);
      if (this.sweepT < 1) this.applySweep(ent);
      stepEvolution(ent.runtime, env, dtSec, ent.node.category, this.rnd());
    }
  }

  private applySweep(ent: FileEntity): void {
    const r = ent.runtime;
    r.humidity = r.humidity + (0.95 - r.humidity) * this.sweepT;
    r.mold = Math.max(r.mold, 0.65 * this.sweepT);
  }

  /** 拧干（AC-14）：湿度 >0.3 时 ×0.5 */
  wring(id: string): boolean {
    const ent = this.byId.get(id);
    if (!ent || ent.runtime.humidity <= 0.3) return false;
    ent.runtime.humidity = clamp01(ent.runtime.humidity * 0.5);
    this.emitChange();
    return true;
  }

  /** 采摘成熟蘑菇入库存（AC-15/AC-19） */
  pickMushroom(id: string): InventoryItem | null {
    const ent = this.byId.get(id);
    const m = ent?.runtime.mushroom;
    if (!ent || !m || m.growth < 1) return null;
    ent.runtime.mushroom = null;
    const item = { species: m.species, growth: m.growth };
    this.inventory.push(item);
    this.stats.harvested += 1;
    this.emitChange();
    return item;
  }

  /** 售卖库存中全部成熟蘑菇（AC-20），返回入账币数 */
  sellInventory(): number {
    const before = this.coins;
    const res = sellMushroom(this.inventory, this.coins);
    this.coins = res.coins;
    this.inventory = res.remaining;
    this.stats.earned += this.coins - before;
    this.emitChange();
    return this.coins - before;
  }

  /** 迁徙限制：1 次/日（AC-03） */
  migrate(cityId: string): boolean {
    const today = new Date(this.now).toISOString().slice(0, 10);
    if (this.migratedOn === today || !CITIES.some((c) => c.id === cityId)) return false;
    this.city = cityId;
    this.migratedOn = today;
    this.emitChange();
    return true;
  }

  canMigrate(): boolean {
    return this.migratedOn !== new Date(this.now).toISOString().slice(0, 10);
  }

  nextCity(): string {
    const i = CITIES.findIndex((c) => c.id === this.city);
    return CITIES[(i + 1) % CITIES.length].id;
  }

  /** 购买（AC-21/22/23）：绳索购买即装备并即时生效 */
  tryPurchase(itemId: string): PurchaseResult {
    const item = getItem(itemId);
    if (!item) return { ok: false, reason: 'not-found' };
    const consumable = item.category === 'consumable';
    if (!consumable && this.owned.includes(itemId)) return { ok: false, reason: 'owned' };
    const res = purchase(this.coins, itemId, consumable ? [] : this.owned);
    if (!res.ok || res.coins === undefined) return res;
    this.coins = res.coins;
    if (!consumable) this.owned.push(itemId);
    if (item.category === 'rope') this.equipped.rope = itemId;
    if (itemId === 'clip-2') this.equipped.clip = itemId;
    if (itemId === 'fan-1') this.fanPlaced = true; // AC-23：放置即摇头
    if (itemId === 'humidifier-1') this.humidifierOn = true;
    if (itemId === 'spray-1') this.sprayCharges += 1;
    this.emitChange();
    return res;
  }

  /** 保湿喷雾：焦化恢复 + 湿度 +0.3（架构 §4.3） */
  useSpray(id: string): boolean {
    if (this.sprayCharges <= 0) return false;
    const ent = this.byId.get(id);
    if (!ent) return false;
    this.sprayCharges -= 1;
    ent.runtime.char = 0;
    if (ent.runtime.state === 'burnt') ent.runtime.state = 'idle';
    ent.runtime.humidity = clamp01(ent.runtime.humidity + 0.3);
    this.emitChange();
    return true;
  }

  markState(id: string, state: 'idle' | 'hung' | 'drying'): void {
    const ent = this.byId.get(id);
    if (ent && ent.runtime.state !== 'burnt') ent.runtime.state = state;
  }

  /** Demo 一键回南天 */
  startRainSweep(): void {
    this.sweepT = 0;
  }

  /** Demo 一键培育：随机一个文件立即出成熟蘑菇 */
  cultivateOne(): boolean {
    const candidates = this.entities.filter((e) => e.runtime.state !== 'burnt');
    if (candidates.length === 0) return false;
    const ent = candidates[Math.floor(this.rnd() * candidates.length)];
    ent.runtime.mold = Math.max(ent.runtime.mold, 0.65);
    ent.runtime.mushroom = { species: pickSpecies(ent.node.category, this.rnd()), growth: 1 };
    this.emitChange();
    return true;
  }

  /** 演出用：受潮斜坡目标（opening 模块每帧插值调用） */
  introTargets(): Array<{ id: string; humidity: number; mold: number; moldy: boolean }> {
    return this.entities
      .filter((e) => e.runtime.stage !== 'fresh')
      .map((e) => ({
        id: e.node.id,
        humidity: e.runtime.stage === 'damp' ? 0.55 : 0.85,
        mold: e.runtime.stage === 'damp' ? 0.05 : e.runtime.stage === 'wet' ? 0.45 : 0.68,
        moldy: e.runtime.stage === 'moldy',
      }));
  }

  toSave(ropes: RopeSave[]): SaveData {
    return {
      schemaVersion: 1,
      savedAt: Date.now(),
      player: { coins: this.coins, owned: this.owned.slice(), equipped: { ...this.equipped } },
      weather: { city: this.city, migratedOn: this.migratedOn },
      files: this.entities.map((e) => ({
        id: e.node.id,
        humidity: e.runtime.humidity,
        mold: e.runtime.mold,
        char: e.runtime.char,
        state: e.runtime.state,
        mushroom: e.runtime.mushroom ? { ...e.runtime.mushroom } : null,
      })),
      ropes,
      stats: { ...this.stats },
    };
  }

  private emitChange(): void {
    this.onChange?.();
  }
}
