/**
 * 天气胶囊页面（R2/R3/R10）：地点+天气+温度+湿度+更新时间；
 * 透明留白穿透；点击开护理台；状态 30s 轮询，天气走主进程缓存/内置默认。
 */
import { DEFAULT_LOCATION } from '../shared/native-defaults';

const capsule = document.getElementById('capsule') as HTMLElement;
const placeEl = document.getElementById('place') as HTMLElement;
const condEl = document.getElementById('cond') as HTMLElement;
const metricsEl = document.getElementById('metrics') as HTMLElement;
const updatedEl = document.getElementById('updated') as HTMLElement;

const WMO_TEXT: Record<number, string> = {
  0: '晴', 1: '大致晴朗', 2: '局部多云', 3: '阴', 45: '雾', 48: '雾凇',
  51: '毛毛雨', 53: '毛毛雨', 55: '浓毛毛雨', 56: '冻毛毛雨', 57: '浓冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '阵雨', 82: '强阵雨', 85: '阵雪', 86: '阵雪',
  95: '雷暴', 96: '雷暴伴冰雹', 97: '强雷暴伴冰雹', 99: '强雷暴伴冰雹',
};

const ATTRIBUTION = '数据来源 Open-Meteo（非商业使用）';

function fmtTime(observedAt: string): string {
  const match = observedAt.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : observedAt.slice(11, 16) || '';
}

async function refresh(): Promise<void> {
  const status = await window.damp?.native.status();
  if (!status) return;
  const location = status.location ?? {
    cityId: DEFAULT_LOCATION.cityId, label: DEFAULT_LOCATION.label,
    latitude: DEFAULT_LOCATION.latitude, longitude: DEFAULT_LOCATION.longitude,
  };
  const lookup = await window.damp!.weather.current(location);
  placeEl.textContent = status.location?.label ?? `${DEFAULT_LOCATION.label}（默认）`;
  if (!lookup.snapshot) {
    condEl.textContent = '天气暂不可用';
    condEl.className = 'cond err';
    metricsEl.textContent = '--°C · 湿度 --%';
    updatedEl.textContent = '';
    capsule.title = `${ATTRIBUTION}；联网后自动重试`;
    return;
  }
  const snap = lookup.snapshot;
  condEl.textContent = WMO_TEXT[snap.weatherCode] ?? '暂不可用';
  condEl.className = 'cond';
  metricsEl.textContent = `${Math.round(snap.temperatureC)}°C · 湿度 ${Math.round(snap.humidityPct)}%`;
  if (lookup.defaulted === true) {
    updatedEl.textContent = '内置默认';
    updatedEl.className = 'stale';
  } else {
    updatedEl.textContent = `${fmtTime(snap.observedAt)} 更新${lookup.status === 'stale' ? ' · 离线' : ''}`;
    updatedEl.className = lookup.status === 'stale' ? 'stale' : '';
  }
  capsule.title = `${placeEl.textContent} · ${ATTRIBUTION}`;
}

// 透明留白穿透与点击/拖动区分由主进程 WM_NCHITTEST 子类化接管
// （win32-capsule-hittest）：留白 HTTRANSPARENT 穿透，本体 HTCAPTION →
// 系统拖动阈值区分纯点击（开护理台）与拖动（移窗），渲染层不再参与
// 命中翻转（setIgnoreMouseEvents(forward) 在 focusable:false 透明窗上
// 实测不投递事件，旧 mousemove 翻转方案永不可达）。

void refresh();
// 状态 30s 轮询：城市设置/INIT 发生在主进程，此前 30 分钟才刷新一次，
// 选完城市胶囊长期显示"待选择城市"（实测缺陷）。天气取数仍走主进程
// 30 分钟缓存，轮询成本只是本地存档读取。
setInterval(() => { void refresh(); }, 30 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh();
});
