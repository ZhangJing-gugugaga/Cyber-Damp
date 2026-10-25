/**
 * 常驻触发接线（R4.2 触发时机 / R3 唤醒）：在线跨日与系统唤醒后触发
 * 同一事件协调器 runNativeEventCycle，不建立第二套调度。
 *
 * - 跨日：每分钟仅比较本地日期键（低频、无网络），变化当天触发一次；
 *   当日重复触发由协调器的日期记录状态机去重（success/empty/init_occupied
 *   为当日终态），与重复打开、刷新、改城共用同一入口语义。
 * - 唤醒：powerMonitor 'resume' 触发一次检查（睡眠跨日由日期键兜底）。
 * - 并发：同一时刻只跑一次检查；期间到达的触发合并为一次补跑。
 */
import { powerMonitor } from 'electron';
import { localDateKey } from '../../world/native-events';

export interface ResidentTriggers {
  /** 一次完整检查（扫描 + 协调器循环），由装配方提供 */
  runCheck(reason: string): Promise<void>;
}

export interface ResidentWatchOptions {
  now?(): number;
  /** 日期键检查间隔，默认 60 秒 */
  tickMs?: number;
}

export function installResidentWatch(triggers: ResidentTriggers, options: ResidentWatchOptions = {}): () => void {
  const now = options.now ?? Date.now;
  let lastDate = localDateKey(now());
  let running = false;
  let queued = false;

  const runCheck = async (reason: string): Promise<void> => {
    if (running) { queued = true; return; }
    running = true;
    try {
      await triggers.runCheck(reason);
    } catch (error) {
      console.warn(`[resident] ${reason} 检查失败（下次触发重试）:`, error);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void runCheck(`${reason}（合并补跑）`);
      }
    }
  };

  const onDateKey = (key: string): void => {
    if (key === lastDate) return;
    lastDate = key;
    void runCheck('跨日');
  };

  const timer = setInterval(() => onDateKey(localDateKey(now())), options.tickMs ?? 60_000);
  const onResume = () => {
    onDateKey(localDateKey(now()));
    void runCheck('系统唤醒');
  };
  powerMonitor.on('resume', onResume);

  return () => {
    clearInterval(timer);
    powerMonitor.off('resume', onResume);
  };
}
