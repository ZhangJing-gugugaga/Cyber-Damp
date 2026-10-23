import './ui/management.css';
import './ui/game-workbench.css';
import { ITEMS } from '../world/shop-catalog';
import type { ManagementSnapshot, SceneStatus } from '../shared/types/management';
import propsUrl from './assets/household-atlas.png?url';
import ropeArt from './assets/game-icons/rope-coil.svg?raw';
import shovelUrl from './assets/pvz-shovel.png?url';
const shovelArt = `<img src="${shovelUrl}" alt="" style="width:100%;height:100%;object-fit:contain">`;
import sprayArt from './assets/game-icons/aerosol.svg?raw';
import rodArt from './assets/game-icons/straight-pipe.svg?raw';
import heatedClipArt from './assets/game-icons/clothespin.svg?raw';
import { icon, renderIcons } from './ui/icons';
const preview = new URLSearchParams(location.search).get('preview') === '1';
document.documentElement.classList.toggle('manager-shell', !preview || new URLSearchParams(location.search).get('shell') === '1');
const connection = preview ? (await import('./ui/management-preview')).managementPreview() : window.damp?.management;
if (!connection) throw new Error('管理窗口需要应用连接。');
const api = connection;
document.body.dataset.layout = 'workbench';
if (preview) {
  document.title = '回南天 · 独立界面预览';
  document.body.dataset.layout = new URLSearchParams(location.search).get('layout') ?? 'workbench';
}
const byId = (id: string) => document.getElementById(id)!;
const windowControls = document.createElement('div'); windowControls.className = 'manager-window-controls';
windowControls.setAttribute('aria-label', '窗口操作');
for (const [action, label, glyph] of [['window-minimize', '最小化管理窗', 'minus'], ['window-close', '收起管理窗，场景继续运行', 'x']]) {
  const button = document.createElement('button'); button.type = 'button';
  button.dataset.windowAction = action; button.setAttribute('aria-label', label); button.title = label;
  button.innerHTML = icon(glyph, 16); button.disabled = preview;
  button.onclick = () => void api.command({ action }); windowControls.append(button);
}
document.querySelector('header')!.append(windowControls);
let selectedItem = 'fan-1';
let category = 'all';
let latest: ManagementSnapshot;
let feedbackSequence = 0;
function artwork(id: string): HTMLElement {
  const art = document.createElement('div'); art.className = 'item-art'; art.dataset.art = id; art.setAttribute('aria-hidden', 'true');
  const cell = id === 'fan-1' ? 0 : id === 'box-1' ? 1 : id === 'clip-1' ? 2 : -1;
  if (cell >= 0) {
    // Crop the existing atlas with an aspect-preserving viewport, even when the
    // details panel becomes shorter than its width in a small window.
    art.innerHTML = `<svg class="prop-sprite" viewBox="0 0 1 1"><svg width="1" height="1" overflow="hidden"><image href="${propsUrl}" x="${-(cell % 2)}" y="${-Math.floor(cell / 2)}" width="2" height="2"/></svg></svg>`;
  } else {
    const reused = id === 'pvz-shovel' ? shovelArt : id === 'rope-3' ? rodArt : id.startsWith('rope-') ? ropeArt : id === 'clip-2' ? heatedClipArt : id === 'spray-1' ? sprayArt : null;
    if (reused) { art.classList.add('game-prop'); art.innerHTML = reused; }
    else art.innerHTML = icon('droplets', 24);
  }
  return art;
}
function renderShop(snapshot: ManagementSnapshot): void {
  const shop = byId('shop');
  if (!shop.children.length) for (const item of ITEMS) {
    const button = document.createElement('button'); button.className = 'item-slot'; button.dataset.item = item.id;
    button.dataset.category = item.category;
    const name = document.createElement('span'); name.textContent = item.name;
    const state = document.createElement('small');
    button.append(artwork(item.id), name, state);
    button.onclick = () => { selectedItem = item.id; renderShop(latest); };
    shop.append(button);
  }
  for (const element of shop.querySelectorAll<HTMLButtonElement>('[data-item]')) {
    const item = ITEMS.find(item => item.id === element.dataset.item)!;
    const owned = item.category !== 'consumable' && snapshot.owned.includes(item.id);
    const equipped = snapshot.equipped?.rope === item.id || snapshot.equipped?.clip === item.id;
    element.hidden = category !== 'all' && item.category !== category;
    element.setAttribute('aria-pressed', String(item.id === selectedItem));
    element.querySelector('small')!.textContent = equipped ? '使用中' : owned ? '已拥有' : item.price ? `${item.price} 币` : '免费领取';
  }
  const item = ITEMS.find(item => item.id === selectedItem)!;
  const detail = byId('item-detail');
  const owned = item.category !== 'consumable' && snapshot.owned.includes(item.id), insufficient = snapshot.coins < item.price;
  // Keep the action element while snapshots arrive so keyboard focus is stable.
  if (detail.dataset.item !== item.id) {
    detail.dataset.item = item.id;
    const title = document.createElement('h3'); title.textContent = item.name;
    const description = document.createElement('p'); description.textContent = item.desc;
    const buy = document.createElement('button'); buy.className = 'purchase';
    buy.onclick = () => void command('buy', item.id);
    detail.replaceChildren(artwork(item.id), title, description, buy);
  }
  const buy = detail.querySelector<HTMLButtonElement>('button')!;
  buy.disabled = owned || insufficient;
  const equipped = snapshot.equipped?.rope === item.id || snapshot.equipped?.clip === item.id;
  buy.textContent = equipped ? '✓ 使用中' : owned ? '✓ 已拥有' : insufficient ? `还差 ${item.price - snapshot.coins} 币` : item.price ? `购买 · ${item.price} 币` : '领取道具';
  renderIcons();
}
const filters = document.createElement('div'); filters.className = 'shop-categories'; filters.setAttribute('aria-label', '物品分类');
for (const [id, label] of [['all', '全部'], ['rope', '绳索'], ['clip', '衣夹'], ['appliance', '设备'], ['consumable', '耗材']]) {
  const button = document.createElement('button'); button.textContent = label; button.setAttribute('aria-pressed', String(id === category));
  button.onclick = () => {
    category = id;
    for (const candidate of filters.querySelectorAll('button')) candidate.setAttribute('aria-pressed', String(candidate === button));
    if (category !== 'all' && ITEMS.find(item => item.id === selectedItem)?.category !== category) selectedItem = ITEMS.find(item => item.category === category)!.id;
    if (latest) renderShop(latest);
  };
  filters.append(button);
}
byId('shop').parentElement!.before(filters);
const credits = document.createElement('details'); credits.className = 'asset-credits';
credits.innerHTML = '<summary>素材署名</summary><p>Game UI by Kenney · kenney.nl · CC0 1.0<br>Icons made by Lorc and Delapouite · game-icons.net<br>CC BY 3.0 · creativecommons.org/licenses/by/3.0/<br>图形已移除黑底，并适配道具配色；完整来源随包附带。</p>';
byId('settings-page').append(credits);
if (document.body.dataset.layout === 'workbench') {
  // Keep the original action nodes and listeners; scene controls belong in
  // settings, leaving the shop to its actual game inventory interaction.
  const controls = document.querySelector('main > nav');
  if (controls) byId('settings-page').prepend(controls);
  document.querySelector('header > div')?.append(byId('status'));
}
const command = async (action: string, id?: string, value?: string) => {
  byId('error').textContent = ''; byId('feedback').textContent = '';
  try { const result = await api.command({ action, id, value }); if (result.error) byId('error').textContent = result.error; }
  catch { byId('error').textContent = '操作暂未完成，请重试。'; }
};
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) button.onclick = () => void command(button.dataset.action!);
byId('save-shortcut').onclick = () => void command('shortcut', undefined, (byId('shortcut') as HTMLInputElement).value);
byId('sfx-toggle').onclick = () => void command('sfx', undefined, latest?.preferences?.sfx ? 'off' : 'on');
byId('microphone-toggle').onclick = () => void command('microphone', undefined, latest?.preferences?.microphoneEnabled ? 'off' : 'on');
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-veil]')) button.onclick = () => void command('veil', undefined, button.dataset.veil);
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-page]')];
function selectPage(tab: HTMLButtonElement, notify = false): void {
  for (const candidate of tabs) {
    const selected = candidate === tab;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    byId(`${candidate.dataset.page}-page`).hidden = !selected;
  }
  if (notify) void api.command({ action: 'navigate', value: tab.dataset.page });
}
for (const [index, tab] of tabs.entries()) {
  tab.onclick = () => selectPage(tab, true);
  tab.onkeydown = event => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); selectPage(tabs[next], true); tabs[next].focus();
  };
}
function status(value: SceneStatus): void {
  byId('scene-error').textContent = value.displayError ?? '';
  document.querySelector<HTMLButtonElement>('[data-action="show"]')!.disabled = !!value.displayError;
  const requested = tabs.find(tab => tab.dataset.page === value.page);
  if (requested) selectPage(requested);
  byId('status').textContent = !value.ready ? '正在准备桌面，将自动播放' : value.hidden ? '场景已隐藏 · 演进已暂停' : value.paused ? '已暂停' : '桌面正在慢慢变化';
  byId('pause').textContent = value.paused ? '继续' : '暂停';
  byId('shortcut-status').textContent = value.shortcutError ?? '快捷键可用，也可从托盘打开管理窗。';
  if (document.activeElement !== byId('shortcut')) (byId('shortcut') as HTMLInputElement).value = value.shortcut;
}
function render(snapshot: ManagementSnapshot): void {
  latest = snapshot;
  const prefs = snapshot.preferences;
  const sfx = byId('sfx-toggle') as HTMLButtonElement, mic = byId('microphone-toggle') as HTMLButtonElement;
  sfx.disabled = mic.disabled = !prefs;
  sfx.setAttribute('aria-checked', String(prefs?.sfx ?? false)); sfx.textContent = prefs?.sfx ? '开' : '关';
  mic.setAttribute('aria-checked', String(prefs?.microphoneEnabled ?? false)); mic.textContent = prefs?.microphoneEnabled ? '关闭' : '开启';
  const micText = { disabled: '默认关闭，仅本机分析，不录音、不上传。', requesting: '正在连接，可随时关闭。', calibrating: '正在适应环境声音，请稍候。', ready: '已连接，轻轻吹气即可产生微风。', denied: '未获麦克风权限，仍可使用桌面电扇。', unavailable: '没有可用麦克风，仍可使用桌面电扇。', error: '麦克风连接已中断，可关闭后重试。' };
  byId('microphone-status').textContent = prefs ? micText[prefs.microphoneState] : '场景设置尚未就绪。';
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-veil]')) {
    button.disabled = !prefs; button.setAttribute('aria-pressed', String(button.dataset.veil === prefs?.veil));
  }
  if (snapshot.feedback && snapshot.feedback.sequence > feedbackSequence) {
    feedbackSequence = snapshot.feedback.sequence;
    byId(snapshot.feedback.ok ? 'feedback' : 'error').textContent = snapshot.feedback.message;
    if (snapshot.feedback.ok) byId('error').textContent = '';
  }
  byId('wallet').textContent = `${snapshot.coins} 币`;
  byId('coins').textContent = `现有 ${snapshot.coins} 币`;
  const files = byId('files');
  const existing = new Map([...files.children].map(row => [(row as HTMLElement).dataset.id, row as HTMLElement]));
  for (const file of snapshot.files) {
    const current = existing.get(file.id);
    if (current) {
      current.querySelector('span')!.textContent = file.name;
      current.querySelector('small')!.textContent = `湿润 ${Math.round(file.wet * 100)}% · 霉斑 ${Math.round(file.mold * 100)}%`;
      current.querySelector<HTMLButtonElement>('[data-harvest]')!.disabled = !file.mushroom;
      existing.delete(file.id);
      continue;
    }
    const row = document.createElement('div'); row.className = 'file';
    row.dataset.id = file.id;
    const name = document.createElement('span'); name.textContent = file.name;
    const state = document.createElement('small'); state.textContent = `湿润 ${Math.round(file.wet * 100)}% · 霉斑 ${Math.round(file.mold * 100)}%`;
    row.append(name, state);
    for (const [action, label] of [['dry', '干燥'], ['wash', '清洗'], ['harvest', '采摘']]) {
      const b = document.createElement('button'); b.textContent = label; b.disabled = action === 'harvest' && !file.mushroom;
      if (action === 'harvest') b.dataset.harvest = '';
      b.setAttribute('aria-label', `${label} ${file.name}`);
      b.onclick = () => void command(action, file.id); row.append(b);
    }
    files.append(row);
  }
  for (const row of existing.values()) row.remove();
  renderShop(snapshot);
}
api.onStatus(status); api.onSnapshot(render);
void api.get().then(value => { status(value.status); render(value.snapshot); });
if (preview) {
  const page = new URLSearchParams(location.search).get('page') ?? 'shop';
  const tab = tabs.find(tab => tab.dataset.page === page);
  if (tab) selectPage(tab);
}
