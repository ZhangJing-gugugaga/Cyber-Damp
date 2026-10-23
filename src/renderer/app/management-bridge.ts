import type { Application } from 'pixi.js';
import type { WorldRuntime } from './world-runtime';
import type { SaveController } from '../save/save-controller';
import type { FileSprite } from '../view/file-sprite';
import type { ManagementSnapshot } from '../../shared/types/management';
import { getItem } from '../../world/shop-catalog';
import type { SettingsPanel } from '../ui/settings-panel';

export function connectManagement(app: Application, runtime: WorldRuntime, saver: SaveController, sprites: Map<string, FileSprite>, actions: { onBuy(id: string): void; pickMushroom(id: string): void; onPauseChange?(paused: boolean): void; settings?: Pick<SettingsPanel, 'setSfx' | 'setVeil' | 'setMicrophone' | 'preferences'> }): void {
  const api = window.damp?.management;
  if (!api) return;
  let sequence = 0, microphoneRequest = 0, feedback: ManagementSnapshot['feedback'];
  const report = (ok: boolean, message: string) => { feedback = { sequence: ++sequence, ok, message }; };
  const publish = () => api.publish({ coins: runtime.coins, owned: [...runtime.owned], equipped: { ...runtime.equipped }, feedback, preferences: actions.settings?.preferences(),
    files: runtime.entities.map(e => ({ id: e.node.id, name: e.node.displayName ?? e.node.name,
      wet: e.runtime.humidity, mold: e.runtime.mold, mushroom: e.runtime.mushroom?.species ?? null })) });
  const previous = runtime.onChange;
  runtime.onChange = () => { previous?.(); publish(); };
  api.onStatus(status => {
    runtime.paused = status.paused || status.hidden;
    if (runtime.paused) window.dispatchEvent(new Event('damp:cancel-tool'));
    actions.onPauseChange?.(runtime.paused);
    if (runtime.paused) { app.stop(); void saver.flush(); } else app.start();
  });
  api.onCommand(async command => {
    if (command.action === 'cancel-tool') { window.dispatchEvent(new Event('damp:cancel-tool')); return; }
    if (['sfx', 'microphone', 'veil'].includes(command.action)) {
      const settings = actions.settings;
      if (!settings) { report(false, '设置尚未就绪。'); publish(); return; }
      if (command.action === 'veil' && ['', 'low', 'high'].includes(command.value ?? 'invalid')) {
        settings.setVeil(command.value as '' | 'low' | 'high'); report(true, '已调整桌面面板浓度。');
      } else if ((command.action === 'sfx' || command.action === 'microphone') && (command.value === 'on' || command.value === 'off')) {
        const on = command.value === 'on';
        if (command.action === 'sfx') { settings.setSfx(on); report(true, on ? '已开启雨声与家务音效。' : '已关闭雨声与家务音效。'); }
        else {
          const request = ++microphoneRequest, pending = settings.setMicrophone(on); publish();
          const enabled = await pending;
          if (request !== microphoneRequest) return;
          report(!on || enabled, !on ? '已关闭麦克风。' : enabled ? '麦克风已连接，仅在本机分析声音。' : '麦克风暂不可用，可继续使用桌面电扇。');
        }
      } else report(false, '设置值无效。');
      publish(); return;
    }
    const entity = command.id ? runtime.byId.get(command.id) : undefined;
    if (command.action === 'buy' && command.id) {
      const item = getItem(command.id), beforeCoins = runtime.coins, beforeOwned = runtime.owned.length, beforeSpray = runtime.sprayCharges;
      actions.onBuy(command.id);
      const ok = runtime.coins < beforeCoins || runtime.owned.length > beforeOwned || runtime.sprayCharges > beforeSpray;
      report(ok, ok ? `${item?.price ? '已购买' : '已领取'}${item?.name ?? '道具'}。`
        : !item ? '找不到此物品。' : runtime.owned.includes(command.id) ? '已经拥有此物品。'
        : runtime.coins < item.price ? '余额不足。' : '道具未能放置，请检查场景中的空位。');
    }
    if (entity) {
      const state = entity.runtime;
      if (command.action === 'dry') { state.dryCare = true; state.humidity = Math.min(state.humidity, .15); report(true, '已干燥，原有霉斑保留。'); }
      if (command.action === 'wash') {
        state.dryCare = false; state.humidity = 0; state.mold = 0; state.char = 0;
        state.dryness = 0; state.mushroom = null; state.state = 'idle'; state.refreshedAt = runtime.now;
        sprites.get(entity.node.id)?.clearPaintStains();
        report(true, '已清洗物件。');
      }
      if (command.action === 'harvest') {
        const mushroom = state.mushroom;
        actions.pickMushroom(entity.node.id);
        const ok = !!mushroom && !state.mushroom;
        report(ok, ok ? '已采摘。' : mushroom && (mushroom.species === 'shy' || mushroom.species === 'lava') && !runtime.owned.includes('pvz-shovel')
          ? '需要先在小铺领取PVZ铲子。' : runtime.locked ? '回放完成后即可采摘。' : mushroom ? '暂时无法采摘，请稍后再试。' : '这里暂时没有蘑菇。');
      }
      runtime.onChange?.(); void saver.flushNow();
    }
    else if (['dry', 'wash', 'harvest'].includes(command.action)) report(false, '物件已变化，请按当前列表重新选择。');
    publish();
  });
  publish();
  const timer = setInterval(publish, 5000);
  window.addEventListener('beforeunload', () => clearInterval(timer), { once: true });
}
