/**
 * 读档恢复绳索（app 层）：从存档重建 Verlet 绳并沿弧长挂回文件。
 * 注册回调负责建 Graphics；孤儿 hung（存档时正在断绳落体）重置为 idle。
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
    const ids = r.fileIds.filter((id) => runtime.byId.has(id));
    const total = entry.rope.length;
    ids.forEach((id, i) => {
      const node = runtime.byId.get(id)!.node;
      const s = total * ((i + 1) / (ids.length + 1));
      if (ropes.pinAt(entry, node, s)) runtime.markState(id, 'hung');
    });
  }

  for (const ent of runtime.entities) {
    if (ent.runtime.state === 'hung' && !ropes.isPinned(ent.node.id)) {
      runtime.markState(ent.node.id, 'idle');
    }
  }
}
