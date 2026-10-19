/**
 * 新手引导（ui 层，PRD §7.1 前 5 分钟体验流，SPEC P0）
 * 五步：拧干 → 晾晒 → 采摘 → 售卖 → 首购目标；仅首次安装触发，localStorage 记忆。
 * 步骤推进由世界动作事件驱动（app/events），不轮询。
 */
import type { GameAction } from '../app/events';
import { onAction } from '../app/events';
import { trackEvent } from '../app/telemetry';
import type { ToastHost } from './toast';

const DONE_KEY = 'cd.onboarded';
const TIP_MS = 9000;

const STEP_TIPS: Record<number, string> = {
  1: '拧干了第一件。湿气重到拧不干？试试晾衣绳：从屏幕左缘或右缘拖出一条，再把湿文件拖上去。',
  2: '挂上绳就开始风干了（每分钟约掉 5%-15% 湿度）。等文件上长出蘑菇，用工具箱的剪刀剪下成熟的菇。',
  3: '蘑菇直接折成了除湿币（剪刀悬停成熟蘑菇即可剪下）。攒够 100 币去右上角杂货铺换妈妈的红塑料绳。',
  4: '首购目标：妈妈的红塑料绳（100 币）——承重从 5GB 升到 25GB，能挂更大的文件。',
};

export interface Guide {
  /** 开场演出结束后调用（仅首次安装生效） */
  start(): void;
  dispose(): void;
}

export function createGuide(toast: ToastHost): Guide {
  let active = false;
  let step = 0;
  let off: (() => void) | null = null;

  function tip(text: string): void {
    toast.tip(text, { ms: TIP_MS });
  }

  function finish(): void {
    active = false;
    off?.();
    off = null;
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* 存储不可用：下次启动会再引导一次，可接受 */
    }
    trackEvent('onboarding_complete', { step });
  }

  function advance(action: GameAction): void {
    if (!active) return;
    if (action === 'wring' && step === 0) {
      step = 1;
      trackEvent('guide_step', { step });
      tip(STEP_TIPS[1]);
    } else if (action === 'hang' && step === 1) {
      step = 2;
      trackEvent('guide_step', { step });
      tip(STEP_TIPS[2]);
    } else if (action === 'pick' && step === 2) {
      step = 4;
      trackEvent('guide_step', { step });
      tip(STEP_TIPS[3]);
      finish();
    } else if (action === 'sell' && step === 3) {
      step = 4;
      trackEvent('guide_step', { step });
      tip(STEP_TIPS[4]);
      finish();
    }
  }

  return {
    start: () => {
      if (active) return;
      try {
        if (localStorage.getItem(DONE_KEY)) return;
      } catch {
        /* 无法判断则照常引导 */
      }
      active = true;
      step = 0;
      trackEvent('onboarding_start');
      tip('湿气已经钻进文件里了。把鼠标悬停在最湿的文件上看看状态，然后按住它顺时针画三圈——像拧毛巾一样。');
      off = onAction(advance);
    },
    dispose: () => {
      off?.();
      off = null;
      active = false;
    },
  };
}
