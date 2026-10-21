/**
 * 文件实体（world 纯领域层）：FileNode + FileRuntime 组合视图
 * stage 由 mtime 差推导（演化状态机的展示态），runtime.stage 同步时以推导为准
 */
import type { FileNode } from '../shared/types/file-node';
import type { FileRuntime } from '../shared/types/file-runtime';
import { deriveStage } from './evolution';

export class FileEntity {
  readonly node: FileNode;
  readonly runtime: FileRuntime;

  constructor(node: FileNode) {
    this.node = node;
    this.runtime = {
      id: node.id,
      humidity: 0,
      mold: 0,
      char: 0,
      stage: 'fresh',
      state: 'idle',
      mushroom: null,
    };
  }

  /** 冷落天数（now - mtime） */
  neglectDays(now: number): number {
    return (now - Math.max(this.node.mtime, this.runtime.refreshedAt || 0)) / 86400000;
  }

  /** 由 mtime 差推导的阶段（四阶段映射的唯一真相） */
  stageAt(now: number): FileRuntime['stage'] {
    return deriveStage(Math.max(this.node.mtime, this.runtime.refreshedAt || 0), now);
  }

  /** 每帧同步派生阶段到 runtime（渲染层读 runtime.stage） */
  syncStage(now: number): void {
    this.runtime.stage = this.stageAt(now);
  }
}
