/**
 * 读档恢复绳索（app 层）：从存档重建绳链并挂回文件
 * 从 game.ts 拆出（单文件 ≤300 行纪律）；注册回调负责建 Graphics。
 */
import type { SaveData } from '../../shared/types/save';
import type { WorldRuntime } from './world-runtime';
import type { RopeManager, RopeEntry } from './rope-manager';

export function restoreRopes(
  save: SaveData,
  runtime: WorldRuntime,
  ropes: RopeManager,
  register: (entry: RopeEntry) => void,
): void {
  for (const r of save.ropes) {
    const entry = ropes.spawn(r.ax, r.ay, r.bx, r.by, r.tier);
    if (!entry) continue;
    register(entry);
    for (const id of r.fileIds) {
      const ent = runtime.byId.get(id);
      if (!ent) continue;
      const links = entry.rope.links;
      const link = links[Math.floor((links.length - 1) * (0.5 + Math.random() * 0.3))];
      if (ropes.hang(entry, ent.node, { x: link.position.x, y: link.position.y })) {
        runtime.markState(id, 'hung');
      }
    }
  }
}
