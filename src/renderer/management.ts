import './ui/management.css';
import { ITEMS } from '../world/shop-catalog';
import type { ManagementSnapshot, SceneStatus } from '../shared/types/management';
import propsUrl from './assets/household-atlas.png?url';
import { icon, renderIcons } from './ui/icons';
const preview = new URLSearchParams(location.search).get('preview') === '1';
const connection = window.damp?.management ?? (preview ? (await import('./ui/management-preview')).managementPreview() : null);
if (!connection) throw new Error('管理窗口需要应用连接。');
const api = connection;
if (preview) {
  document.title = '回南天 · 独立界面预览';
  document.body.dataset.layout = new URLSearchParams(location.search).get('layout') ?? 'cabinet';
}
const byId = (id: string) => document.getElementById(id)!;
let selectedItem = 'pvz-shovel';
let category = 'all';
let latest: ManagementSnapshot;
let feedbackSequence = 0;
function artwork(id: string): HTMLElement {
  const art = document.createElement('div'); art.className = 'item-art'; art.setAttribute('aria-hidden', 'true');
  const cell = id === 'fan-1' ? 0 : id === 'box-1' ? 1 : id.startsWith('clip-') ? 2 : -1;
  if (cell >= 0) {
    art.style.backgroundImage = `url("${propsUrl}")`;
    art.style.backgroundPosition = `${cell % 2 * 100}% ${Math.floor(cell / 2) * 100}%`;
  } else art.innerHTML = icon(id === 'pvz-shovel' ? 'shovel' : id.startsWith('rope-') ? 'cable' : id === 'spray-1' ? 'spray-can' : 'droplets', 24);
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
    const owned = snapshot.owned.includes(item.id);
    const equipped = snapshot.equipped?.rope === item.id || snapshot.equipped?.clip === item.id;
    element.hidden = category !== 'all' && item.category !== category;
    element.setAttribute('aria-pressed', String(item.id === selectedItem));
    element.querySelector('small')!.textContent = equipped ? '使用中' : owned ? '已拥有' : item.price ? `${item.price} 币` : '免费领取';
  }
  const item = ITEMS.find(item => item.id === selectedItem)!;
  const detail = byId('item-detail');
  const owned = snapshot.owned.includes(item.id), insufficient = snapshot.coins < item.price;
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
const command = async (action: string, id?: string, value?: string) => {
  byId('error').textContent = ''; byId('feedback').textContent = '';
  try { const result = await api.command({ action, id, value }); if (result.error) byId('error').textContent = result.error; }
  catch { byId('error').textContent = '操作暂未完成，请重试。'; }
};
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) button.onclick = () => void command(button.dataset.action!);
byId('start').onclick = () => void command('show');
byId('save-shortcut').onclick = () => void command('shortcut', undefined, (byId('shortcut') as HTMLInputElement).value);
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
  byId('intro').hidden = value.ready;
  byId('status').textContent = !value.ready ? '等待开始回放' : value.hidden ? '场景已隐藏 · 演进已暂停' : value.paused ? '已暂停' : '桌面正在慢慢变化';
  byId('pause').textContent = value.paused ? '继续' : '暂停';
  byId('shortcut-status').textContent = value.shortcutError ?? '快捷键可用，也可从托盘打开管理窗。';
  if (document.activeElement !== byId('shortcut')) (byId('shortcut') as HTMLInputElement).value = value.shortcut;
}
function render(snapshot: ManagementSnapshot): void {
  latest = snapshot;
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
