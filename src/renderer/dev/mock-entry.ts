/**
 * mock 安装与开发者控制面板（仅 dev.html 加载；生产入口不引用）
 */
import { installMockDamp, type MockDamp } from './mock-damp';
import { createCareSession, applyToolStroke, strokeCells, setLayerProgress, judgeFineCare, validateCareSession } from '../../shared/care-session';
import type { CareSessionState, CareToolId } from '../../shared/types/gameplay';

const mock: MockDamp = installMockDamp();

/** 探针/UAT 用的纯领域函数窗口（与 mock 同一来源，仅 dev 页面存在）。 */
(window as unknown as { __domain: unknown }).__domain = {
  createCareSession,
  applyToolStroke,
  strokeCells,
  setLayerProgress,
  judgeFineCare,
  validateCareSession,
};

/** 便捷会话构建（探针/演示脚本用）：按工具与格位构造一次分层护理会话。 */
(window as unknown as { __mockCare?: unknown }).__mockCare = {
  buildSession(family: CareSessionState['family'], stage: CareSessionState['stage'], strokes: Array<{ tool: CareToolId; cells: number[] }>) {
    let session = createCareSession(family, stage);
    for (const stroke of strokes) {
      session = applyToolStroke(session, stroke.tool, stroke.cells, {});
    }
    return session;
  },
};

function panel(): void {
  const bar = document.createElement('div');
  bar.id = 'mock-panel';
  bar.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(20,30,34,0.92);'
    + 'color:#dce8ec;font:12px/1.6 "Segoe UI",sans-serif;padding:8px 10px;border-radius:8px;'
    + 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;max-width:60vw;box-shadow:0 2px 12px rgba(0,0,0,.4)';
  const label = document.createElement('span');
  label.textContent = '🧪 模拟环境';
  label.style.opacity = '0.75';
  bar.append(label);
  for (const preset of mock.weatherPresets()) {
    const btn = document.createElement('button');
    btn.textContent = preset.label;
    btn.dataset.weatherKey = preset.key;
    btn.style.cssText = 'background:#2b444c;border:1px solid #3d5a63;color:#dce8ec;border-radius:6px;padding:2px 8px;cursor:pointer';
    btn.addEventListener('click', () => {
      mock.selectWeather(preset.key);
      window.location.reload();
    });
    bar.append(btn);
  }
  const day = document.createElement('button');
  day.textContent = '推进一天 →';
  day.title = '模拟日期 +1 天（真实日账本结算路径）';
  day.style.cssText = 'background:#3d5a63;border:1px solid #567;color:#fff;border-radius:6px;padding:2px 10px;cursor:pointer';
  day.addEventListener('click', () => {
    mock.advanceDay();
    window.location.reload();
  });
  bar.append(day);
  const reset = document.createElement('button');
  reset.textContent = '重置模拟存档';
  reset.style.cssText = 'background:#59323b;border:1px solid #7a4550;color:#ffd9df;border-radius:6px;padding:2px 8px;cursor:pointer';
  reset.addEventListener('click', () => mock.reset());
  bar.append(reset);
  document.body.append(bar);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', panel);
} else {
  panel();
}
