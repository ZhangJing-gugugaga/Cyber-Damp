/**
 * 模拟存档（Task 2；仅开发环境使用，生产入口不 import）
 *
 * ≥6 个虚拟对象：覆盖受潮/霉变/焦化三族、幼菇/成熟菇、13 款品种 ID、
 * 各对象类别、防霉期对象。存档结构与 save.ts v4 一致，持久化到 localStorage，
 * 重载页面后护理进度/收藏/孢子仍在（验收项）。
 */
import type { NativeSaveSection, NativeObjectSave } from '../../shared/types/save';
import type { SpeciesId } from '../../shared/types/gameplay';
import { migrateLegacyCare } from '../../shared/care-session';

export const MOCK_SAVE_KEY = 'cyber-damp-mock-save-v4';

export interface MockObjectSpec {
  id: string;
  displayName: string;
  kind: 'dir' | 'lnk';
  category: NativeObjectSave['objectCategory'];
  /** 图标主色（hue），由 dev-entry 画成 data URL */
  hue: number;
  damage: { family: 'damp' | 'mold' | 'char'; stage: 0 | 1 | 2 | 3; mushroom: 'none' | 'young' | 'mature' };
  species?: SpeciesId;
  /** 防霉剩余（小时） */
  immuneHours?: number;
  /** 既有护理进度（v4 会话，迁移路径同真实存档） */
  careProgress?: number;
}

export const MOCK_OBJECTS: MockObjectSpec[] = [
  { id: 'm-1', displayName: '项目归档.zip', kind: 'lnk', category: 'archive', hue: 210, damage: { family: 'char', stage: 2, mushroom: 'none' }, careProgress: 0.15 },
  { id: 'm-2', displayName: '聊天记录', kind: 'dir', category: 'chat', hue: 330, damage: { family: 'mold', stage: 3, mushroom: 'mature' }, species: 'ghosted' },
  { id: 'm-3', displayName: '截图 2026-03', kind: 'lnk', category: 'image', hue: 180, damage: { family: 'damp', stage: 2, mushroom: 'none' } },
  { id: 'm-4', displayName: '练手代码', kind: 'dir', category: 'code', hue: 260, damage: { family: 'mold', stage: 3, mushroom: 'young' }, species: 'pixel' },
  { id: 'm-5', displayName: '旅行照片', kind: 'dir', category: 'image', hue: 30, damage: { family: 'mold', stage: 3, mushroom: 'mature' }, species: 'bell', immuneHours: 48 },
  { id: 'm-6', displayName: '下载目录', kind: 'dir', category: 'other', hue: 100, damage: { family: 'damp', stage: 1, mushroom: 'none' } },
  { id: 'm-7', displayName: '工作会议.lnk', kind: 'lnk', category: 'other', hue: 0, damage: { family: 'char', stage: 1, mushroom: 'none' } },
  { id: 'm-8', displayName: '干净文档', kind: 'dir', category: 'other', hue: 55, damage: { family: 'mold', stage: 0, mushroom: 'none' } },
];

export function buildMockSave(now: number): NativeSaveSection {
  const objects: Record<string, NativeObjectSave> = {};
  for (const spec of MOCK_OBJECTS) {
    const obj: NativeObjectSave = {
      id: spec.id,
      realPath: `C:\\Users\\demo\\Desktop\\${spec.displayName}`,
      kind: spec.kind,
      displayName: spec.displayName,
      originalMtime: now - 30 * 24 * 3600 * 1000,
      damage: spec.damage.stage === 0 ? null : { ...spec.damage },
      objectCategory: spec.category,
      moldImmuneUntil: spec.immuneHours ? now + spec.immuneHours * 3600 * 1000 : undefined,
      mushroomSpecies: spec.species,
    };
    if (spec.careProgress && obj.damage) {
      obj.careSession = migrateLegacyCare(obj.damage.family, obj.damage.stage, { careProgress: spec.careProgress });
      obj.careProgress = spec.careProgress;
    }
    objects[spec.id] = obj;
  }
  const save: NativeSaveSection = {
    init: { status: 'legacy-initialized' },
    dailyEvents: {},
    objects,
    lastSnapshot: null,
    location: { cityId: 'changsha', label: '湖南 长沙', latitude: 28.228, longitude: 112.939 },
    paused: false,
    collection: {
      bell: { species: 'bell', firstSeenAt: now - 7 * 24 * 3600 * 1000, sourceName: '旅行照片' },
      oyster: { species: 'oyster', firstSeenAt: now - 60 * 24 * 3600 * 1000, sourceName: '旧存档迁移' },
    },
    onboarded: false,
    spores: { bell: 1, moss: 0 },
    planted: {},
    alert: { active: false, precipitationStreak: 0 },
    fineCareCount: 0,
    overlayVariant: 'A',
  };
  return save;
}
