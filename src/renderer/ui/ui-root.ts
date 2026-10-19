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
}

export function mountUi(
  parent: HTMLElement,
  runtime: WorldRuntime,
  hooks: {
    onSell(): void;
    onBuy(itemId: string): void;
    onBuyBox(qty: number): void;
    onMicrophoneToggle?(on: boolean): Promise<boolean>;
    sfx: { setEnabled(on: boolean): void; whoosh(): void };
    demo: DemoActions;
  },
): UiRoot {
  const mount = document.createElement('div');
  mount.id = 'ui-hud';
  parent.appendChild(mount);

  // 金币 pill（top-right 第一席，纯读数 none）
  const coinPill = document.createElement('div');
  coinPill.className = 'coin-pill';
  coinPill.innerHTML = `${icon('coins', 16)}<b class="coin-pill__value">0</b>`;
  mount.appendChild(coinPill);

  // 商店 / 设置入口（44x44）
  const shopBtn = document.createElement('button');
  shopBtn.type = 'button';
  shopBtn.className = 'hud-btn hud-btn--shop';
  shopBtn.setAttribute('aria-label', '杂货铺');
  shopBtn.innerHTML = icon('store', 24);
  mount.appendChild(shopBtn);

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'hud-btn hud-btn--settings';
  settingsBtn.setAttribute('aria-label', '设置（音效开关）');
  settingsBtn.innerHTML = icon('settings', 24);
  mount.appendChild(settingsBtn);

  const weather = createWeatherSign(mount, runtime, () => hooks.sfx.whoosh());
  const toolbox = createToolbox(mount, runtime);
  const toast = createToastHost(mount);
  const shop = createShopPanel(mount, runtime, {
    onSell: hooks.onSell,
    onBuy: hooks.onBuy,
    onBuyBox: hooks.onBuyBox,
  });
  const demo = createDemoConsole(mount, runtime, hooks.demo);
  const settings = createSettingsPanel(mount, { onSfxToggle: (on) => hooks.sfx.setEnabled(on), onMicrophoneToggle: hooks.onMicrophoneToggle });

  shopBtn.addEventListener('click', () => {
    emitAction('shop-open');
    trackEvent('shop_opened');
    shop.toggle();
  });
  settingsBtn.addEventListener('click', () => settings.toggle());

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
  };
}
