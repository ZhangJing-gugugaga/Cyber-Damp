import './ui/rain-cabinet.css';
import './ui/startup.css';
import type { SceneStatus, StartupStage } from '../shared/types/management';

const labels: Record<StartupStage, string> = {
  launch: '正在唤醒雨季…', graphics: '正在准备画面…', desktop: '正在读取桌面图标…',
  materials: '正在铺好霉斑与蘑菇…', takeover: '即将开始，正在确认桌面…',
};
const phase = document.getElementById('phase')!;
const update = (status: SceneStatus) => { phase.textContent = labels[status.startupStage ?? 'launch']; };
const api = window.damp?.management;
api?.onStatus(update);
void api?.get().then(value => update(value.status));
const cancel = document.getElementById('cancel') as HTMLButtonElement;
cancel.disabled = !api;
cancel.onclick = () => { cancel.disabled = true; void api?.command({ action: 'quit' }); };
