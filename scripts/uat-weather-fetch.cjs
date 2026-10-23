/**
 * 阶段1C 实网验证：Open-Meteo 取数 / 城市搜索 / 缓存 / 无效输入分支（R3）
 * 运行：node_modules/.bin/electron scripts/uat-weather-fetch.cjs
 * 退出码 0 = 通过。网络不可达时明确报告，不伪造。
 */
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

app.whenReady().then(async () => {
  app.setPath('userData', path.join(os.tmpdir(), `cd-weather-probe-${Date.now()}`));
  try {
    const { getWeather, searchCities } = require('../dist/main/weather/weather-service.js');

    // 城市搜索（中文）
    const cities = await searchCities('杭州');
    check('城市搜索返回结果', cities.length > 0, JSON.stringify(cities[0]));
    const hangzhou = cities[0];

    // 首次取数（无缓存，带重试策略）
    const t0 = Date.now();
    const first = await getWeather({ cityId: hangzhou.id, label: hangzhou.name, latitude: hangzhou.latitude, longitude: hangzhou.longitude });
    const elapsed = Date.now() - t0;
    check('首次取数成功', first.status === 'ok' && !!first.snapshot, JSON.stringify(first.snapshot ?? first.error));
    check('快照四要素齐全且有效', !!first.snapshot
      && Number.isFinite(first.snapshot.temperatureC)
      && first.snapshot.humidityPct >= 0 && first.snapshot.humidityPct <= 100
      && Number.isInteger(first.snapshot.weatherCode)
      && typeof first.snapshot.observedAt === 'string' && first.snapshot.observedAt.length > 0);
    check('事件资格标记存在', typeof first.usableForEvents === 'boolean', `usableForEvents=${first.usableForEvents}`);
    console.log(`INFO  首次取数耗时 ${elapsed}ms（上限 28000ms）`);
    check('首次取数耗时有界', elapsed < 28000);

    // 缓存命中（30 分钟内）
    const t1 = Date.now();
    const second = await getWeather({ cityId: hangzhou.id, label: hangzhou.name, latitude: hangzhou.latitude, longitude: hangzhou.longitude });
    check('30 分钟内走缓存', second.status === 'ok' && second.snapshot.fetchedAt === first.snapshot.fetchedAt, `age=${second.ageMs}ms, 耗时 ${Date.now() - t1}ms`);

    // 无效坐标 → unavailable（不伪造实况）
    const bad = await getWeather({ cityId: 'x', label: '不存在', latitude: 999, longitude: 999 });
    check('无效输入被拒（invalid-request 路径外的主进程校验）', bad.status === 'unavailable', bad.error);

    // 缓存文件落盘且按坐标分开
    const cacheFile = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'weather-cache.json'), 'utf8'));
    check('缓存已落盘', cacheFile.version === 1 && Object.keys(cacheFile.entries).length >= 1);

    // 空查询
    const empty = await searchCities('   ');
    check('空查询返回空数组', Array.isArray(empty) && empty.length === 0);
  } catch (error) {
    check('实网验证异常', false, error.message);
  }
  app.exit(results.some((r) => !r.ok) ? 1 : 0);
});
