/**
 * 天气胶囊页面（R2/R3/R10）：地点+天气+温度+湿度+更新时间；
 * 透明留白穿透；点击开护理台；30 分钟缓存节奏，不频繁刷新。
 */
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
  placeEl.textContent = status.location?.label ?? '点击选择城市';
  if (!status.location) {
    condEl.textContent = '待选择城市';
    condEl.className = 'cond err';
    metricsEl.textContent = '--°C · 湿度 --%';
    updatedEl.textContent = '';
    capsule.title = '点击打开护理台，选择城市后开始';
    return;
  }
  const lookup = await window.damp!.weather.current(status.location);
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
  const age = lookup.ageMs ?? 0;
  metricsEl.textContent = `${Math.round(snap.temperatureC)}°C · 湿度 ${Math.round(snap.humidityPct)}%`;
  updatedEl.textContent = `${fmtTime(snap.observedAt)} 更新${lookup.status === 'stale' ? ' · 离线' : ''}`;
  updatedEl.className = lookup.status === 'stale' ? 'stale' : '';
  capsule.title = `${status.location.label} · ${ATTRIBUTION}`;
}

// 透明留白穿透：仅胶囊本体可交互（R2 可见区域外不截获桌面点击）
document.documentElement.addEventListener('mousemove', (event) => {
  const hit = event.target === capsule || capsule.contains(event.target as Node);
  void window.damp?.window.setIgnoreMouseEvents(!hit, true);
});
// 点击胶囊打开护理台；拖动由 -webkit-app-region 提供（松手不会误打开：拖动由系统阈值区分）
capsule.addEventListener('click', () => { void window.damp?.management.open(); });

void refresh();
setInterval(() => { void refresh(); }, 30 * 60 * 1000);
