import type { Application, Container, Texture } from 'pixi.js';
import { loadDesktopEntries } from './desktop-bridge';
import type { WorldRuntime } from './world-runtime';
import type { RopeManager } from './rope-manager';
import type { Opening } from './opening';
import { buildFileNodes } from '../../world/desktop-layout';
import { FileSprite } from '../view/file-sprite';
import type { DisplayChangedNotice } from '../../shared/types/desktop';

/** Rebuild only views after a display change. Reuse world state and decoded native artwork. */
export function installDisplayRefresh(deps: { app: Application; runtime: WorldRuntime; ropes: RopeManager;
  sprites: Map<string, FileSprite>; textures: Map<string, Texture | null>; layer: Container;
  before(): void; busy(value: boolean): void; opening(): Opening | null; ready(value: boolean): void }): void {
  let running = false, pending = false;
  const acknowledgements = new Set<number>();
  const changed = (notice: DisplayChangedNotice) => {
    if (notice.requestId !== undefined) acknowledgements.add(notice.requestId);
    pending = true; if (running) return;
    running = true; deps.before(); deps.busy(true);
    const locked = deps.runtime.locked; deps.runtime.locked = true;
    void (async () => {
      try {
        do {
          pending = false;
          // Let Chromium apply its new per-window CSS scale before projecting Shell pixels.
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const entries = await loadDesktopEntries();
          if (entries.length !== deps.runtime.entities.length || entries.some(entry => !deps.runtime.byId.has(entry.id))) {
            throw new Error('桌面条目在显示切换时发生变化，请重启以重新合并。');
          }
          deps.app.renderer.resolution = Math.min(window.devicePixelRatio, 2);
          deps.app.renderer.resize(window.innerWidth, window.innerHeight);
          deps.ropes.setViewport(window.innerWidth, window.innerHeight);
          for (const node of buildFileNodes(entries, window.innerWidth, window.innerHeight)) {
            const entity = deps.runtime.byId.get(node.id)!;
            entity.node.geometry = node.geometry;
            if (entity.runtime.state !== 'hung') { entity.node.x = node.x; entity.node.y = node.y; }
            const replacement = new FileSprite(entity.node, deps.textures.get(node.id) ?? null);
            replacement.setPinned(entity.runtime.state === 'hung');
            if (!deps.opening()) replacement.finishIntro();
            deps.sprites.get(node.id)?.container.destroy({ children: true });
            deps.layer.addChild(replacement.container); deps.sprites.set(node.id, replacement);
          }
        } while (pending);
        if (acknowledgements.size) {
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          for (const requestId of acknowledgements) {
            const result = await window.damp!.app.viewportReady({ requestId, ok: true });
            if (!result.ok) throw new Error('显示刷新确认已失效，请重试。');
          }
          acknowledgements.clear();
        } else {
          const result = await window.damp!.app.desktopReady(); deps.ready(result.ok);
          if (!result.ok) throw new Error('桌面重新接入失败，已保留原生桌面。');
        }
      } catch (error) {
        for (const requestId of acknowledgements) await window.damp?.app.viewportReady({ requestId, ok: false });
        acknowledgements.clear();
        deps.ready(false);
        console.error('[display-refresh]', error);
        await window.damp?.management.command({ action: 'display-error', value: error instanceof Error ? error.message : '显示刷新失败，请重启回南天。' });
      } finally {
        deps.runtime.locked = locked; running = false; deps.busy(false);
        if (pending) changed({ width: window.innerWidth, height: window.innerHeight });
      }
    })();
  };
  window.damp?.system.onDisplayChanged(changed);
}
