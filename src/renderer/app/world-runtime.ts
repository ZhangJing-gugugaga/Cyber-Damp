/**
 * 游戏运行时（app 装配层，无 pixi/matter import——只依赖 world/ 与 shared/，可测）
 * 核心：真实桌面实体表 / 演化 tick / 环境输入 / 存档快照；
 * 玩家动作（拧干/采摘/购买/施热等）委托 world-actions.ts（单文件 ≤300 行纪律）
 */
import { FileEntity } from '../../world/file-entity';
import { stepEvolution } from '../../world/evolution';
import type { Env } from '../../world/evolution';
import { CITIES, simulateDay, humidityMultiplier, isSunny, dateToDayIndex } from '../../world/weather-simulator';
import { SPECIES } from '../../world/mushroom-species';
import { getItem } from '../../world/shop-catalog';
import { seedMoldyMushroom, stageSeed } from '../../world/file-seed';
import type { SaveData, RopeSave } from '../../shared/types/save';
import type { FileNode } from '../../shared/types/file-node';
import { clamp01 } from './clamp';
import * as act from './world-actions';
import type { InventoryItem, PurchaseResult } from './world-actions';

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

  /** 演出期间输入锁定（6 秒开场延时腐化） */
  locked = true;
  /** 状态变化信号（UI 刷新 + 存档防抖） */
  onChange: (() => void) | null = null;

  cpu = 0;
  /** 电扇锚点（AC-23：仅对 300px 内绳上文件加成；未放置为 null） */
  private fanAnchor: { x: number; y: number } | null = null;
  private cpuHighSec = 0;
  private timeSec = 0;
  private startNow = Date.now();
  private rnd = mulberry32(20261017);
  /** Demo 一键回南天：3s 扫描进度（<1 进行中） */
  private sweepT = 1;
  /** 吸湿盒当前吸湿强度（BoxController 每帧回写） */
  private boxAbsorb = 0;
  /** 泼洒暴涨：amount 强度 / surgeT 剩余秒 */
  private surgeAmount = 0;
  private surgeT = 0;

  get now(): number {
    return this.startNow + this.timeSec * 1000;
  }

  get sweating(): boolean {
    return this.cpuHighSec >= 5; // AC-05：连续 5s >80%
  }

  /** 新开局：真实桌面节点（名称/大小/mtime 全部来自文件系统） */
  initNew(nodes: FileNode[], now: number): void {
    this.startNow = now;
    this.entities.length = 0;
    this.byId.clear();
    for (const node of nodes) {
      const ent = new FileEntity(node);
      ent.syncStage(now);
      const seed = stageSeed(ent.runtime.stage);
      ent.runtime.humidity = seed.humidity;
      ent.runtime.mold = seed.mold;
      seedMoldyMushroom(ent.runtime, node.category, node.id);
      this.entities.push(ent);
      this.byId.set(node.id, ent);
    }
  }

  /** 从存档恢复（节点由真实桌面扫描重建，存档只覆盖逻辑态） */
  initFromSave(save: SaveData, nodes: FileNode[], now: number): void {
    this.initNew(nodes, now);
    this.coins = save.player.coins;
    // 白名单清洗：未知道具 id / 非法装备回落默认
    this.owned = save.player.owned.filter((id) => !!getItem(id));
    this.equipped = { ...save.player.equipped };
    if (!getItem(this.equipped.rope)?.byteLimit) this.equipped.rope = 'rope-1';
    if (getItem(this.equipped.clip)?.category !== 'clip') this.equipped.clip = 'clip-1';
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
      ent.runtime.mushroom =
        s.mushroom && SPECIES[s.mushroom.species] ? { ...s.mushroom } : null;
    }
    // 开场演出需要所有 ΔT≥30d 文件有一朵可生长的菇（存档里已采摘的也重新破土）
    for (const ent of this.entities) {
      seedMoldyMushroom(ent.runtime, ent.node.category, ent.node.id);
    }
  }

  /** 当日天气（确定性） */
  dayWeather() {
    return simulateDay(this.city, dateToDayIndex(new Date(this.now)));
  }

  /** 环境输入（架构 §5.5：雨/暴 ×2；CPU 出汗 +0.3；加湿器 +0.15；吸湿盒 -0.05/只；电扇/晴天风干） */
  env(): Env {
    const day = this.dayWeather();
    let humidity = day.humidity * humidityMultiplier(day.condition);
    if (this.sweating) humidity += 0.3;
    if (this.humidifierOn) humidity += 0.15;
    humidity -= this.boxAbsorb;
    if (this.surgeT > 0) humidity += this.surgeAmount; // 泼洒暴涨
    const wind = isSunny(day.condition) ? 0.6 : 0.15;
    return { humidity: clamp01(humidity), heat: 0, wind };
  }

  /** 电扇放置后锚点（AC-23：300px 内局部风干加成） */
  setFanAnchor(x: number, y: number): void {
    this.fanAnchor = { x, y };
  }

  /** 固定步推进（game-loop 每步调用） */
  tick(dtSec: number): void {
    this.timeSec += dtSec;
    if (this.cpu > 0.8) this.cpuHighSec += dtSec;
    else this.cpuHighSec = 0;
    if (this.surgeT > 0) this.surgeT -= dtSec;
    this.stats.playedMs += dtSec * 1000;

    // Demo 一键回南天：3s 扫描（AC-31：3s 内走完出水→变软→长蘑菇）
    if (this.sweepT < 1) this.sweepT = Math.min(1, this.sweepT + dtSec / 3);
    const env = this.env();
    const now = this.now;
    for (const ent of this.entities) {
      ent.syncStage(now);
      if (this.sweepT < 1) this.applySweep(ent);
      let entEnv = env;
      if (this.fanPlaced && this.fanAnchor) {
        const d = Math.hypot(ent.node.x - this.fanAnchor.x, ent.node.y - this.fanAnchor.y);
        if (d <= 300) entEnv = { ...env, wind: Math.max(env.wind, 0.7) };
      }
      stepEvolution(ent.runtime, entEnv, dtSec, ent.node.category, this.rnd());
    }
  }

  private applySweep(ent: FileEntity): void {
    const r = ent.runtime;
    r.humidity = r.humidity + (0.95 - r.humidity) * this.sweepT;
    r.mold = Math.max(r.mold, 0.65 * this.sweepT);
  }

  // ---- 玩家动作（实现见 world-actions.ts，此处薄委托保持调用面稳定）----

  wring(id: string): boolean {
    return act.wring(this, id);
  }
  pickMushroom(id: string): InventoryItem | null {
    return act.pickMushroom(this, id);
  }
  sellInventory(): number {
    return act.sellInventory(this);
  }
  migrate(cityId: string): boolean {
    return act.migrate(this, cityId);
  }
  canMigrate(): boolean {
    return act.canMigrate(this);
  }
  nextCity(): string {
    return act.nextCity(this);
  }
  tryPurchase(itemId: string): PurchaseResult {
    return act.tryPurchase(this, itemId);
  }
  useSpray(id: string): boolean {
    return act.useSpray(this, id);
  }
  applyHeat(id: string, dtSec: number): void {
    act.applyHeat(this, id, dtSec);
  }
  reduceMold(id: string, amt: number): void {
    act.reduceMold(this, id, amt);
  }
  markState(id: string, state: 'idle' | 'hung' | 'drying'): void {
    act.markState(this, id, state);
  }
  cultivateOne(): boolean {
    return act.cultivateOne(this, this.rnd());
  }
  /** QA 专用：定向生成成熟胆小菇（AC-30 现场验收） */
  cultivateShy(): boolean {
    return act.cultivateShy(this);
  }
  chargeCoins(n: number): boolean {
    return act.chargeCoins(this, n);
  }
  /** 双击打开真实文件后：受潮状态清零（打开即视为被使用/晾干） */
  dryFile(id: string): boolean {
    const ent = this.byId.get(id);
    if (!ent) return false;
    ent.runtime.humidity = 0;
    ent.runtime.mold = 0;
    ent.runtime.char = 0;
    ent.runtime.state = 'idle';
    ent.runtime.mushroom = null;
    this.onChange?.();
    return true;
  }

  // ---- 环境调节与 Demo ----

  /** BoxController 回写吸湿强度 */
  setBoxAbsorb(rate: number): void {
    this.boxAbsorb = rate;
  }

  /** 泼洒暴涨（吸湿盒被砸）：amount 强度持续 dur 秒 */
  triggerSurge(amount: number, dur: number): void {
    this.surgeAmount = amount;
    this.surgeT = dur;
  }

  /** Demo 一键回南天 */
  startRainSweep(): void {
    this.sweepT = 0;
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
}
