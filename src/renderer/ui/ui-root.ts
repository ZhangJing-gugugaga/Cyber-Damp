/**
 * UI 根装配（ui 层）：HUD 常驻元素挂载与显隐（DESIGN §7）
 * 金币 pill / 商店与设置入口 / 气象牌 / 工具箱 / Toast / Demo 控制台（Ctrl+Shift+D）
 * AC-36 指针纪律：读数与容器 none，按钮 auto（样式层落实）
 */
import type { WorldRuntime } from '../app/world-runtime';
import type { Tool } from '../input/pointer-controller';
import { createWeatherSign } from './weather-sign';
import type { WeatherSign } from './weather-sign';
import { createShopPanel } from './shop-panel';
import type { ShopPanel } from './shop-panel';
import { createToolbox } from './toolbox';
import type { Toolbox } from './toolbox';
import { createDemoConsole } from './demo-console';
import type { DemoConsole, DemoActions } from './demo-console';
import { createSettingsPanel } from './settings-panel';
import type { SettingsPanel } from './settings-panel';
import { createToastHost } from './toast';
import type { ToastHost } from './toast';
import { icon, renderIcons } from './icons';
import { emitAction } from '../app/events';
import { trackEvent } from '../app/telemetry';

export interface UiRoot {
  mount: HTMLElement;
  weather: WeatherSign;
  shop: ShopPanel;
  toolbox: Toolbox;
  console: DemoConsole;
  settings: SettingsPanel;
  toast: ToastHost;
  getTool(): Tool;
  refresh(): void;
  reposition(): void;
}

export function mountUi(
  parent: HTMLElement,
  runtime: WorldRuntime,
  hooks: {
    onSell(): void;
    onBuy(itemId: string): void;
    onBuyBox(qty: number): void;
    onMicrophoneToggle?(on: boolean): Promise<boolean>;
    microphoneState?(): { enabled: boolean; state: import('../../shared/types/management').ManagementPreferences['microphoneState'] };
    sfx: { setEnabled(on: boolean): void; whoosh(): void };
    demo: DemoActions;
  },
): UiRoot {
  const mount = document.createElement('div');
  mount.id = 'ui-hud';
  parent.appendChild(mount);

  const dock = document.createElement('div'); dock.className = 'rain-dock';
  const toggle = document.createElement('button'); toggle.className = 'rain-dock__toggle';
  toggle.type = 'button'; toggle.setAttribute('aria-label', '打开雨季工具柜');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<img src="./brand/rain-mushroom.svg" alt="">';
  const cabinet = document.createElement('div'); cabinet.className = 'rain-dock__cabinet'; cabinet.hidden = true;
  cabinet.dataset.uiInteractive = '1';
  cabinet.id = 'rain-cabinet'; toggle.setAttribute('aria-controls', cabinet.id);
  toggle.onclick = () => {
    cabinet.hidden = !cabinet.hidden;
    toggle.setAttribute('aria-expanded', String(!cabinet.hidden));
    toggle.setAttribute('aria-label', cabinet.hidden ? '打开雨季工具柜' : '收起雨季工具柜');
  };
  dock.append(cabinet, toggle); mount.append(dock);
  function reposition(): void {
    void window.damp?.window.getWorkArea().then(area => {
      dock.style.right = `${Math.max(0, window.innerWidth - area.x - area.width) + 16}px`;
      dock.style.bottom = `${Math.max(0, window.innerHeight - area.y - area.height) + 16}px`;
      cabinet.style.maxHeight = `${Math.max(100, area.height - 100)}px`; cabinet.style.overflowY = 'auto';
    }).catch(() => { /* Preserve the current entry until desktop recovery completes. */ });
  }
  reposition();

  // 复用金币栏作为剪落物售卖落点，位于可收起的桌面工具面板内。
  const coinPill = document.createElement('div');
  coinPill.className = 'coin-pill';
  coinPill.innerHTML = `${icon('coins', 16)}<b class="coin-pill__value">0</b><span class="coin-pill__hint">剪落的菇拖到这里售卖</span>`;
  cabinet.appendChild(coinPill);

  // 商店 / 设置入口（44x44）
  const shopBtn = document.createElement('button');
  shopBtn.type = 'button';
  shopBtn.className = 'hud-btn hud-btn--shop';
  shopBtn.setAttribute('aria-label', '杂货铺');
  shopBtn.innerHTML = `${icon('store', 20)}<span>雨天小铺</span>`;
  cabinet.appendChild(shopBtn);

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'hud-btn hud-btn--settings';
  settingsBtn.setAttribute('aria-label', '设置（音效开关）');
  settingsBtn.innerHTML = `${icon('settings', 20)}<span>设置</span>`;
  cabinet.appendChild(settingsBtn);

  const weather = createWeatherSign(cabinet, runtime, () => hooks.sfx.whoosh());
  const toolbox = createToolbox(cabinet, runtime);
  toolbox.el.style.display = '';
  const toast = createToastHost(mount);
  const shop = createShopPanel(mount, runtime, {
    onSell: hooks.onSell,
    onBuy: hooks.onBuy,
    onBuyBox: hooks.onBuyBox,
  });
  const demo = createDemoConsole(mount, runtime, hooks.demo);
  const settings = createSettingsPanel(mount, { onSfxToggle: (on) => hooks.sfx.setEnabled(on), onMicrophoneToggle: hooks.onMicrophoneToggle, microphoneState: hooks.microphoneState });

  shopBtn.addEventListener('click', () => {
    emitAction('shop-open');
    trackEvent('shop_opened');
    void window.damp?.management.command({ action: 'navigate', value: 'shop' });
  });
  settingsBtn.addEventListener('click', () => void window.damp?.management.command({ action: 'navigate', value: 'settings' }));

  // Demo 控制台快捷键（AC-31）
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      demo.toggle();
    }
  });

  function refresh(): void {
    const val = coinPill.querySelector('.coin-pill__value');
    if (val) {
      val.textContent = runtime.coins > 99999 ? '99.9k+' : String(runtime.coins);
    }
    weather.refresh();
    toolbox.refresh();
    if (shop.el.style.display !== 'none') shop.refresh();
    if (demo.el.style.display !== 'none') demo.refresh();
  }

  runtime.onChange = refresh;
  renderIcons();
  refresh();

  return {
    mount,
    weather,
    shop,
    toolbox,
    console: demo,
    settings,
    toast,
    getTool: () => toolbox.getTool(),
    refresh,
    reposition,
  };
}
