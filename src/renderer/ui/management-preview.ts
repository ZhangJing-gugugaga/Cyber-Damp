/** Independent design fixture: never reads or changes the real desktop/save. */
import { purchase } from '../../world/shop-catalog';
import type { ManagementSnapshot, SceneStatus } from '../../shared/types/management';
export function managementPreview(): NonNullable<Window['damp']>['management'] {
  const snapshot: ManagementSnapshot = { coins: 180, owned: ['rope-1', 'clip-1'], equipped: { rope: 'rope-1', clip: 'clip-1' }, files: [
    { id: 'folder', name: '项目资料', wet: .62, mold: .44, mushroom: 'oyster' },
    { id: 'app', name: '绘图工具', wet: .37, mold: .18, mushroom: null },
    { id: 'document', name: '旅行清单.txt', wet: .81, mold: .73, mushroom: 'enoki' },
  ] };
  const status: SceneStatus = { paused: false, hidden: false, ready: true, shortcut: 'Control+Alt+M' };
  let onSnapshot = (_: ManagementSnapshot) => {}, onStatus = (_: SceneStatus) => {};
  return {
    get: async () => ({ snapshot, status }), open: async () => {}, publish() {}, onCommand: () => () => {},
    onSnapshot: cb => { onSnapshot = cb; return () => {}; }, onStatus: cb => { onStatus = cb; return () => {}; },
    command: async command => {
      if (command.action === 'buy' && command.id) {
        const result = purchase(snapshot.coins, command.id, snapshot.owned);
        if (!result.ok) return { ok: false, error: '无法购买此物品。' };
        snapshot.coins = result.coins!; snapshot.owned.push(command.id); onSnapshot(snapshot);
      } else if (command.action === 'navigate' && (command.value === 'care' || command.value === 'shop' || command.value === 'settings')) { status.page = command.value; onStatus(status); }
      else if (command.action === 'pause') { status.paused = !status.paused; onStatus(status); }
      else if (command.action === 'hide' || command.action === 'show') { status.hidden = command.action === 'hide'; onStatus(status); }
      else return { ok: false, error: '独立预览不操作桌面、设置或真实文件。' };
      return { ok: true };
    },
  };
}
