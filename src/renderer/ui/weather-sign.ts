/**
 * 气象牌（ui 层，top-center 264x64 木牌隐喻）：城市/天气图标/湿度 mono 读数/迁徙按钮
 * AC-03：迁徙 1 次/日，用尽置灰；AC-36：面板 none / 迁徙按钮 auto / 读数 none
 */
import { CITIES } from '../../world/weather-simulator';
import type { WorldRuntime } from '../app/world-runtime';
import { icon, renderIcons } from './icons';

const CONDITION_META: Record<string, { icon: string; label: string }> = {
  rain: { icon: 'cloud-rain', label: '降雨' },
  storm: { icon: 'cloud-lightning', label: '暴雨' },
  sun: { icon: 'sun', label: '晴' },
  cloud: { icon: 'cloud', label: '多云' },
  dry: { icon: 'cloud-fog', label: '干燥' },
};

export interface WeatherSign {
  el: HTMLElement;
  refresh(): void;
}

export function createWeatherSign(mount: HTMLElement, runtime: WorldRuntime): WeatherSign {
  const el = document.createElement('section');
  el.className = 'weather-sign';
  el.setAttribute('aria-label', '气象牌');
  mount.appendChild(el);

  const readout = document.createElement('div');
  readout.className = 'weather-sign__readout';
  el.appendChild(readout);

  const migrate = document.createElement('button');
  migrate.type = 'button';
  migrate.className = 'weather-sign__migrate';
  migrate.setAttribute('aria-label', '赛博游牧迁徙（每日一次）');
  el.appendChild(migrate);

  migrate.addEventListener('click', () => {
    if (!runtime.canMigrate()) return;
    runtime.migrate(runtime.nextCity());
    refresh();
  });

  function refresh(): void {
    const day = runtime.dayWeather();
    const city = CITIES.find((c) => c.id === runtime.city) ?? CITIES[0];
    const meta = CONDITION_META[day.condition] ?? CONDITION_META.cloud;
    const canMigrate = runtime.canMigrate();

    readout.innerHTML = `
      <span class="weather-sign__city">${icon('map-pin', 16)}${city.name}</span>
      <span class="weather-sign__cond">${icon(meta.icon, 24)}${meta.label} ${Math.round(day.tempC)}°C</span>
      <span class="weather-sign__humidity">${icon('droplets', 16)}<b>${Math.round(day.humidity * 100)}%</b></span>
    `;
    migrate.innerHTML = `${icon('plane', 20)}<span class="weather-sign__migrate-count">${canMigrate ? '1/1' : '0/1'}</span>`;
    migrate.disabled = !canMigrate;
    if (!canMigrate) migrate.title = '今天已经迁够了，明天再来';
    else migrate.title = '迁往下一座城市';
    renderIcons();
  }

  refresh();
  return { el, refresh };
}
