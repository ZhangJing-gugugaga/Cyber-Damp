/**
 * 原生自然事件编排器（Goal v9 阶段2 切片2；R4 权威执行层）
 *
 * 核心循环零 Electron 依赖：状态、候选、天气、图标写入、时钟全部注入，
 * node.exe 可直测；真实依赖（桌面扫描 / getWeather / applyIconMutation）
 * 在阶段 3 于主进程装配。状态持久化由调用方负责（生产为 userData/native-state.json，
 * 与 save.json 分离——renderer 的 save:write 全量覆盖存档，不能承载 main 侧事件账本）。
 *
 * 跨午夜与缺席（R4.2）：旧 pending/retryable 记录在本轮开头核对——
 * 有写入证据（对象已带损伤状态）按 success 关闭；确定未写入则关闭删除，不补债；
 * 无论如何当天最多一条新记录，缺席多天总计只推进一次。
 */
import {
  advanceDamage, decideNativeBranch, localDateKey, pickDailyFamily, planDailyOrder, planInit,
  type BranchAction,
} from '../../world/native-events';
import type {
  DamageFamily, DailyEventRecord, InitPlan, InitTargetPlan,
  NativeObjectState, NativeWeatherSnapshot,
} from '../../shared/types/native';

export interface SchedulerState {
  init: (InitPlan & { status: 'active' | 'completed' }) | { status: 'legacy-initialized' } | null;
  dailyEvents: Record<string, DailyEventRecord>;
  objects: Record<string, NativeObjectState>;
  lastSnapshot: NativeWeatherSnapshot | null;
  paused: boolean;
}

export interface SchedulerCandidate {
  id: string;
  realPath: string;
  kind: 'dir' | 'lnk';
  displayName: string;
  originalMtime: number;
}

export interface CycleDeps {
  state: SchedulerState;
  /** 当天有效天气快照（usableForEvents=false 或无 → hasValidWeather=false） */
  weather: NativeWeatherSnapshot | null;
  weatherUsable: boolean;
  candidates: SchedulerCandidate[];
  now(): number;
  /** 随机源（生产用 Date.now() 派生种子；测试固定） */
  nextSeed(): number;
  /** 图标写入：返回是否成功；抛错视为失败 */
  applyIcon(candidate: SchedulerCandidate, plan: { family: DamageFamily; stage: number; mushroom: string }): boolean;
  /** 对象当前是否仍存在（删除/移动→跳过，不复活） */
  exists(realPath: string): boolean;
  log?(message: string): void;
}

export interface CycleResult {
  action: BranchAction | 'idle';
  date: string;
  /** 人类可读摘要（含受限输入分支的真实数字，R4.1 报告口径） */
  summary: string;
  initDone: number;
  initSkipped: number;
}

/** 单轮自然事件处理（R4.4 唯一入口）。幂等：同日重复调用不重复推进。 */
export function runNativeCycle(deps: CycleDeps): CycleResult {
  const { state } = deps;
  const now = deps.now();
  const date = localDateKey(now);
  const log = deps.log ?? (() => {});

  // 候选合并常开：legacy-initialized / 日常候选都需要对象注册表（首次出现记录 mtime）
  ensureObjects(state, deps.candidates);

  // 跨午夜核对：旧 pending/retryable 记录关闭（有写入证据 → success；否则删除，不补债）
  closeStaleRecords(state, date, log);

  const todayRecord = state.dailyEvents[date] ?? null;
  const initStatus = state.init === null ? 'not-generated'
    : state.init.status === 'legacy-initialized' ? 'completed'
      : state.init.status;
  const action = decideNativeBranch({
    paused: state.paused,
    hasValidWeather: deps.weatherUsable && deps.weather !== null,
    initStatus: initStatus as 'not-generated' | 'active' | 'completed',
    todayRecord,
  });

  const result: CycleResult = { action, date, summary: '', initDone: 0, initSkipped: 0 };

  switch (action) {
    case 'none-paused':
      result.summary = '已暂停，不生成或续写自然事件（不积欠）';
      break;
    case 'wait-weather':
      result.summary = state.init && state.init.status === 'active'
        ? '首批进行中，等待有效天气后继续'
        : '天气暂不可用，联网后开始/继续自然变化';
      break;
    case 'generate-init': {
      const plan = planInit(deps.candidates, deps.weather!, deps.nextSeed(), now);
      state.init = { ...plan, status: 'active' };
      state.lastSnapshot = plan.snapshot;
      ensureObjects(state, deps.candidates);
      occupyDate(state, date, now, deps.nextSeed());
      executeInit(deps, result, log);
      break;
    }
    case 'continue-init':
      occupyDate(state, date, now, deps.nextSeed());
      executeInit(deps, result, log);
      break;
    case 'daily-create': {
      const record: DailyEventRecord = {
        date, id: `${date}-${deps.nextSeed().toString(36)}`, status: 'pending',
        seed: deps.nextSeed(), candidateOrder: [], attempts: [], snapshot: deps.weather ?? undefined,
      };
      state.dailyEvents[date] = record;
      executeDaily(deps, record, result, log);
      break;
    }
    case 'daily-resume': {
      const record = todayRecord!;
      executeDaily(deps, record, result, log);
      break;
    }
    case 'daily-terminal':
      result.summary = `今日额度已是终态（${todayRecord?.status}），不重复推进`;
      break;
    default:
      result.summary = '';
  }
  return result;
}

// ---------- INIT 执行（R4.1：每项累计 3 次尝试；失败自动跳过；全结算才完成） ----------

function executeInit(deps: CycleDeps, result: CycleResult, log: (m: string) => void): void {
  const { state } = deps;
  const plan = state.init as InitPlan & { status: 'active' | 'completed' };
  const byId = new Map(deps.candidates.map((c) => [c.id, c]));
  for (const target of plan.targets) {
    if (target.status !== 'pending') continue;
    const candidate = byId.get(target.id);
    if (!candidate || !deps.exists(candidate.realPath)) {
      target.status = 'skipped';
      target.skipReason = '对象已不存在或移动后身份不明，不复活';
      result.initSkipped += 1;
      log(`INIT 跳过 ${target.id}: ${target.skipReason}`);
      continue;
    }
    // R4.1：全事务累计最多 3 次写入尝试（同轮内重试），第 3 次失败自动跳过，无需用户点击
    for (let attempt = (target.attempts ?? 0) + 1; attempt <= 3; attempt += 1) {
      target.attempts = attempt;
      // applyIcon 抛错视为进程崩溃，向上传播（调用方持久化状态后退出/重启续作）
      if (deps.applyIcon(candidate, { family: target.family, stage: target.stage, mushroom: target.mushroom })) {
        target.status = 'done';
        result.initDone += 1;
        const obj = state.objects[target.id];
        if (obj) {
          obj.damage = { family: target.family, stage: target.stage, mushroom: target.mushroom };
          obj.lastAdvanceAt = deps.now();
        }
        log(`INIT 写入成功（第 ${attempt} 次）: ${target.id}`);
        break;
      }
      if (attempt >= 3) {
        target.status = 'skipped';
        target.skipReason = '写入连续 3 次失败';
        result.initSkipped += 1;
        log(`INIT 跳过 ${target.id}: 连续3次失败`);
      } else {
        log(`INIT 第 ${attempt} 次写入失败，重试: ${target.id}`);
      }
    }
  }
  const pending = plan.targets.filter((t) => t.status === 'pending').length;
  if (pending === 0) {
    plan.status = 'completed';
    plan.completedAt = deps.now();
    const done = plan.targets.filter((t) => t.status === 'done').length;
    const skipped = plan.targets.filter((t) => t.status === 'skipped').length;
    result.summary = `首批完成：实际变化 ${done} 个，跳过 ${skipped} 个（K=${plan.k}，候选 ${deps.candidates.length}，N=${plan.n}）`;
    log(`INIT completed: K=${plan.k} N=${plan.n} done=${done} skipped=${skipped}`);
  } else {
    result.summary = `首批进行中（已结算 ${plan.targets.length - pending}/${plan.targets.length}）`;
  }
}

// ---------- DAILY 执行（R4.2：同轮按序最多 3 个不同对象，最多一次成功） ----------

function executeDaily(deps: CycleDeps, record: DailyEventRecord, result: CycleResult, log: (m: string) => void): void {
  const { state } = deps;
  const now = deps.now();
  const plan = state.init as (InitPlan & { status: 'active' | 'completed' }) | { status: 'legacy-initialized' } | null;

  if (plan && plan.status === 'active') {
    // INIT 未结束不发 DAILY（R4.1）——理论上分支表已挡住，防御性记账
    record.status = 'init_occupied';
    result.summary = '首批未完成，本日额度由 INIT 占用';
    return;
  }

  if (record.candidateOrder.length === 0) {
    record.candidateOrder = planDailyOrder(
      Object.values(state.objects), deps.weather!, now, record.seed,
    );
  }
  const remaining = record.candidateOrder.filter((id) => !record.attempts.includes(id));
  if (record.candidateOrder.length === 0) {
    record.status = 'empty';
    result.summary = '今日无可推进对象（过滤后没有可变对象或全部满级）';
    log('DAILY empty');
    return;
  }
  for (const id of remaining) {
    record.attempts.push(id);
    const obj = state.objects[id];
    if (!obj || !deps.exists(obj.realPath)) {
      log(`DAILY 候选不可用，尝试下一个: ${id}`);
      continue;
    }
    const family = pickDailyFamily(obj, deps.weather!, now, record.seed);
    const advanced = advanceDamage(obj.damage, family);
    if (!advanced.advanced) {
      log(`DAILY 候选满级，尝试下一个: ${id}`);
      continue;
    }
    const candidate = deps.candidates.find((c) => c.id === id);
    let applied = false;
    if (candidate) {
      try {
        applied = deps.applyIcon(candidate, { family, stage: advanced.damage.stage, mushroom: advanced.damage.mushroom });
      } catch (error) {
        log(`DAILY 写入异常: ${id}`);
      }
    }
    if (!applied) {
      log(`DAILY 写入失败: ${id}`);
      continue;
    }
    obj.damage = advanced.damage;
    obj.lastAdvanceAt = now;
    record.status = 'success';
    result.summary = `今日自然推进：${obj.displayName}（${familyLabel(family)}）`;
    log(`DAILY success: ${id} -> ${family} stage=${advanced.damage.stage}`);
    return;
  }
  record.status = 'retryable';
  result.summary = `今日 ${record.attempts.length} 个候选写入全部失败，保留同一事件身份待重试`;
}

// ---------- 记账与核对 ----------

function closeStaleRecords(state: SchedulerState, today: string, log: (m: string) => void): void {
  for (const [date, record] of Object.entries(state.dailyEvents)) {
    if (date >= today) continue;
    if (record.status === 'pending' || record.status === 'retryable') {
      const evidenced = record.attempts.some((id) => {
        const obj = state.objects[id];
        return obj && obj.damage !== null && obj.lastAdvanceAt !== undefined && obj.lastAdvanceAt >= parseLocalDate(date);
      });
      if (evidenced) {
        record.status = 'success';
        log(`旧记录 ${date} 核对为已写入，关闭为 success`);
      } else {
        delete state.dailyEvents[date];
        log(`旧记录 ${date} 确定未写入，关闭不补债`);
      }
    }
  }
}

function parseLocalDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function occupyDate(state: SchedulerState, date: string, now: number, seed: number): void {
  if (!state.dailyEvents[date]) {
    state.dailyEvents[date] = {
      date, id: `${date}-init-${seed.toString(36)}`, status: 'init_occupied',
      seed, candidateOrder: [], attempts: [],
    };
  }
}

function ensureObjects(state: SchedulerState, candidates: SchedulerCandidate[]): void {
  for (const c of candidates) {
    if (!state.objects[c.id]) {
      state.objects[c.id] = { ...c, damage: null };
    }
  }
}

function familyLabel(family: DamageFamily): string {
  return family === 'damp' ? '受潮' : family === 'mold' ? '霉变' : '焦化';
}
