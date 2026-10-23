/**
 * 设置面板（ui 层，轻量模态）：veil 档位（壁纸适配）+ 音效开关（DESIGN §7 MVP 范围）
 * AC-36：根容器 auto（模态表面）/ 档位与开关 auto
 */
import { icon, renderIcons } from './icons';
import type { ManagementPreferences } from '../../shared/types/management';

export interface SettingsPanel {
  el: HTMLElement;
  toggle(): void;
  close(): void;
  setSfx(on: boolean): void;
  setVeil(value: ManagementPreferences['veil']): void;
  setMicrophone(on: boolean): Promise<boolean>;
  preferences(): ManagementPreferences;
}

export function createSettingsPanel(mount: HTMLElement, hooks: { onSfxToggle(on: boolean): void; onMicrophoneToggle?(on: boolean): Promise<boolean>; microphoneState?(): { enabled: boolean; state: ManagementPreferences['microphoneState'] } }): SettingsPanel {
  const el = document.createElement('aside');
  el.className = 'settings-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '设置');
  el.style.display = 'none';

  const title = document.createElement('h2');
  title.className = 'settings-panel__title';
  title.textContent = '设置';
  el.appendChild(title);

  // veil 档位（DESIGN §2.1：极端壁纸适配）
  const veilLabel = document.createElement('p');
  veilLabel.className = 'settings-panel__label';
  veilLabel.textContent = '面板浓度（按桌面壁纸深浅选）';
  el.appendChild(veilLabel);

  const veilGroup = document.createElement('div');
  veilGroup.className = 'veil-seg';
  veilGroup.setAttribute('role', 'radiogroup');
  veilGroup.setAttribute('aria-label', 'veil 档位');
  const VEILS: Array<{ value: string; label: string }> = [
    { value: '', label: '标准' },
    { value: 'low', label: '低浓' },
    { value: 'high', label: '高浓' },
  ];
  for (const v of VEILS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'veil-seg-option';
    btn.textContent = v.label;
    btn.dataset.veil = v.value;
    btn.setAttribute('role', 'radio');
    btn.addEventListener('click', () => {
      setVeil(v.value as ManagementPreferences['veil']);
    });
    veilGroup.appendChild(btn);
  }
  el.appendChild(veilGroup);

  // 音效开关
  const sfxRow = document.createElement('div');
  sfxRow.className = 'settings-panel__row';
  const sfxLabel = document.createElement('span');
  sfxLabel.textContent = '雨声与家务音效';
  const sfxBtn = document.createElement('button');
  sfxBtn.type = 'button';
  sfxBtn.className = 'sfx-toggle';
  sfxBtn.setAttribute('role', 'switch');
  sfxBtn.setAttribute('aria-checked', 'true');
  sfxBtn.innerHTML = `${icon('settings', 16)}<span>开</span>`;
  let sfxOn = true;
  function setSfx(on: boolean): void {
    sfxOn = on;
    sfxBtn.setAttribute('aria-checked', String(sfxOn));
    sfxBtn.querySelector('span')!.textContent = sfxOn ? '开' : '关';
    hooks.onSfxToggle(sfxOn);
  }
  sfxBtn.addEventListener('click', () => setSfx(!sfxOn));
  sfxRow.append(sfxLabel, sfxBtn);
  el.appendChild(sfxRow);
  const micRow = document.createElement('div');
  micRow.className = 'settings-panel__row';
  const micLabel = document.createElement('span'); micLabel.textContent = '对麦克风吹气';
  const micBtn = document.createElement('button'); micBtn.type = 'button'; micBtn.className = 'sfx-toggle';
  micBtn.setAttribute('role', 'switch'); micBtn.setAttribute('aria-checked', 'false');
  micBtn.setAttribute('aria-label', '麦克风吹气'); micBtn.textContent = '关';
  const micNote = document.createElement('p'); micNote.className = 'settings-panel__label';
  micNote.textContent = '声音仅在本机分析，不录音。';
  let micOn = false, micRequest = 0;
  let micState: ManagementPreferences['microphoneState'] = 'disabled';
  async function setMicrophone(on: boolean): Promise<boolean> {
    micOn = on; micState = on ? 'requesting' : 'disabled';
    const request = ++micRequest, requested = micOn;
    micBtn.setAttribute('aria-checked', String(micOn)); micBtn.textContent = micOn ? '开' : '关';
    micNote.textContent = micOn ? '正在连接麦克风，可随时关闭。' : '声音仅在本机分析，不录音。';
    let ok = false;
    try { ok = await hooks.onMicrophoneToggle?.(on) ?? false; } catch { /* report unavailability through the same controls */ }
    if (request !== micRequest) return false;
    micOn = requested && ok; micState = micOn ? 'ready' : requested ? 'unavailable' : 'disabled';
    micBtn.setAttribute('aria-checked', String(micOn)); micBtn.textContent = micOn ? '开' : '关';
    micNote.textContent = micOn ? '轻轻吹气，晾着的文件就会随风摇摆。' : requested ? '麦克风暂不可用，仍可使用桌面电扇。' : '声音仅在本机分析，不录音。';
    return micOn;
  }
  micBtn.addEventListener('click', () => { void setMicrophone(!micOn); });
  micRow.append(micLabel, micBtn); el.append(micRow, micNote);
  const quit = document.createElement('button');
  quit.type = 'button';
  quit.className = 'sfx-toggle';
  quit.textContent = '退出回南天';
  quit.setAttribute('aria-label', '退出回南天并恢复原生桌面');
  quit.addEventListener('click', () => { void window.damp?.app.quit(); });
  el.appendChild(quit);

  function syncVeil(): void {
    const cur = document.documentElement.dataset.veil ?? '';
    for (const btn of veilGroup.querySelectorAll('.veil-seg-option')) {
      btn.classList.toggle('veil-seg-option--active', (btn as HTMLElement).dataset.veil === cur);
      btn.setAttribute('aria-checked', String((btn as HTMLElement).dataset.veil === cur));
    }
  }
  function setVeil(value: ManagementPreferences['veil']): void { document.documentElement.dataset.veil = value; syncVeil(); }
  function preferences(): ManagementPreferences {
    const veil = document.documentElement.dataset.veil;
    const mic = hooks.microphoneState?.();
    return { sfx: sfxOn, veil: veil === 'low' || veil === 'high' ? veil : '', microphoneEnabled: mic?.enabled ?? micOn, microphoneState: mic?.state ?? micState };
  }

  function toggle(): void {
    if (el.style.display === 'none') {
      syncVeil();
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }
  function close(): void {
    el.style.display = 'none';
  }

  mount.appendChild(el);
  renderIcons();
  return { el, toggle, close, setSfx, setVeil, setMicrophone, preferences };
}
