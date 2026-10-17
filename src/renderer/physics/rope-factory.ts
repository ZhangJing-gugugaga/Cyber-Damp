/**
 * 悬链线晾衣绳（physics 适配层）
 * 架构 §5.2：Composites.chain + Constraint 世界锚点；绳链质量 0.5/链（总 7.0）
 * SPEC §6 下垂单一来源：绳形 100% 由本物理解算涌现，渲染层只读绳链坐标
 */
import Matter from 'matter-js';
import { CAT } from '../../shared/constants';

const { Bodies, Body, Composite, Composites, Constraint } = Matter;

/** 绳链段数（架构锁定 14 段） */
export const LINK_COUNT = 14;
/** 单链质量（架构师包络：总 7.0；10KB mass_eff 1.44 ≤ 0.3×绳重，24GB 39.9 ≥ 4×绳重） */
export const LINK_MASS = 0.5;

export interface Rope {
  composite: Matter.Composite;
  links: Matter.Body[];
  /** 两端世界锚点 */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** 锚点约束（崩断时移除这两个即整绳滑脱） */
  anchors: Matter.Constraint[];
  /** 刚性杆（rope-3：链约束 stiffness 1.0，笔直不垂——AC-33 前置） */
  rigid: boolean;
}

export function createRope(
  world: Matter.World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: { rigid?: boolean } = {},
): Rope {
  const rigid = opts.rigid ?? false;
  const seg = Math.hypot(bx - ax, by - ay) / (LINK_COUNT - 1);
  const links = Array.from({ length: LINK_COUNT }, (_, i) => {
    const t = i / (LINK_COUNT - 1);
    return Bodies.circle(ax + (bx - ax) * t, ay + (by - ay) * t, 3, {
      mass: LINK_MASS,
      frictionAir: rigid ? 0.08 : 0.03, // 刚性杆加大空气阻尼抑制摆动
      collisionFilter: { category: CAT.ROPE, mask: 0 }, // 绳链互不碰撞也不撞文件
    });
  });

  const rope = Composite.create({ label: 'rope' });
  Composite.add(rope, links);
  // 柔绳：stiffness 0.55 悬链涌现；钢杆：stiffness 1.0 刚性距离约束（挂 24GB 不下垂）
  Composites.chain(rope, 0, 0, 0, 0, {
    stiffness: rigid ? 1.0 : 0.55,
    damping: rigid ? 0.6 : 0.15,
    length: seg,
  });

  // 两端点锚定到世界坐标（bodyB 缺省 = 世界锚点）
  const anchors = [
    Constraint.create({ bodyA: links[0], pointB: { x: ax, y: ay }, stiffness: 1, damping: 0.1, length: 0 }),
    Constraint.create({ bodyA: links[LINK_COUNT - 1], pointB: { x: bx, y: by }, stiffness: 1, damping: 0.1, length: 0 }),
  ];
  Composite.add(rope, anchors);

  Composite.add(world, rope);
  return { composite: rope, links, ax, ay, bx, by, anchors, rigid };
}

/** 崩断：移除两端锚点约束，整绳滑脱、文件自由落体 */
export function breakRope(world: Matter.World, rope: Rope): void {
  for (const a of rope.anchors) Composite.remove(world, a, true);
}

/** 文件刚体工厂（携带 sizeBytes 于 plugin，供挂载/崩断读取） */
export function createFileBody(
  x: number,
  y: number,
  w: number,
  h: number,
  sizeBytes: number,
  id: string,
): Matter.Body {
  const body = Bodies.rectangle(x, y, w, h, {
    collisionFilter: { category: CAT.FILE, mask: CAT.FILE | CAT.TASKBAR },
    plugin: { fileId: id, sizeBytes },
  });
  return body;
}

/** 读取刚体携带的 sizeBytes（plugin 挂载） */
export function bodySizeBytes(body: Matter.Body): number {
  const v = (body.plugin as { sizeBytes?: number } | undefined)?.sizeBytes;
  return typeof v === 'number' ? v : 0;
}

/**
 * 应用指数化质量到文件刚体（AC-37 唯一入口）。
 * mass 必须来自 weight.ts 的 massEff（sizeToMass^p），禁直接传 sizeToMass 原值。
 */
export function applyMass(body: Matter.Body, mass: number): void {
  Body.setMass(body, mass);
}
