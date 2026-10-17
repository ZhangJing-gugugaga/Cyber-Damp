/**
 * Matter 世界装配（app 层）
 * 架构 §5.2：constraintIterations 4 / positionIterations 8；任务栏静态刚体承接摔落
 */
import Matter from 'matter-js';
import { CAT, CONSTRAINT_ITERATIONS, POSITION_ITERATIONS } from '../../shared/constants';

const { Engine, Bodies } = Matter;

export interface MatterWorld {
  engine: Matter.Engine;
  /** 任务栏静态刚体（文件崩断摔落弹跳的承接面） */
  taskbar: Matter.Body;
}

export function createMatterWorld(width: number, height: number): MatterWorld {
  const engine = Engine.create({
    constraintIterations: CONSTRAINT_ITERATIONS,
    positionIterations: POSITION_ITERATIONS,
  });

  // 任务栏：屏幕底部静态刚体（厚度 40，超出屏底一截防穿模）
  const taskbar = Bodies.rectangle(width / 2, height + 20, width * 2, 40, {
    isStatic: true,
    label: 'taskbar',
    collisionFilter: { category: CAT.TASKBAR, mask: CAT.FILE },
  });
  Matter.Composite.add(engine.world, taskbar);

  return { engine, taskbar };
}
