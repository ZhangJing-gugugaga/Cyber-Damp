/**
 * 对象留言与图鉴文案（R6 v0.2；Task 10 纯文本部分）
 *
 * 留言由对象类别、品种、损伤类型、天气、是否精细护理组合生成；
 * 只使用元数据，不读取文件正文。同一对象与品种得到稳定留言：
 * 随机仅来自 objectId+species+family 的稳定哈希（FNV-1a），不取当前时间。
 */
import type { DamageFamily } from '../types/native';
import type { SpeciesId } from '../types/gameplay';
import type { ObjectCategory } from '../types/gameplay';
import { SPECIES_CATALOG } from './species-catalog';
import { hashString } from '../rand';

export interface ObjectMessageInput {
  objectId: string;
  category: ObjectCategory;
  /** 当前菇品种；无菇传 null */
  species: SpeciesId | null;
  /** 当前主要损伤；干净传 null */
  family: DamageFamily | null;
  /** 是否本次为精细护理完成后的留言 */
  fineCare?: boolean;
}

const CATEGORY_LINES: Record<ObjectCategory, [string, string]> = {
  folder: ['文件夹也需要晾一晾。', '里面的东西没湿，湿的是它自己。'],
  archive: ['压缩包先受潮了，解压的事明天再说。', '它鼓得像个没排气的快递袋。'],
  image: ['这张图泡出了一点旧照片的味道。', '水汽让它的边缘有点晕开。'],
  chat: ['聊天记录不怕潮，但图标会。', '有些对话晾一晾，就不会那么沉。'],
  code: ['代码不会发霉，但快捷方式会。', '潮气让它的缩进看起来更深了。'],
  game: ['游戏图标湿了，胜率可没有。', '它看起来像刚打完一局加时赛。'],
  browser: ['浏览器图标在等一个晴天。', '潮气对它来说只是一次弱网。'],
  other: ['它有点潮，但不影响它做自己。', '潮气路过时，在它这里歇了歇脚。'],
};

const FAMILY_LINES: Record<DamageFamily, [string, string]> = {
  damp: ['水珠还挂在边框上，擦一擦就好。', '它最近喝了不少雨水。'],
  mold: ['霉斑是潮气留下的签名。', '绿一点，再绿一点，就该擦了。'],
  char: ['焦痕要慢慢修，急不来。', '它被太阳晾过头了。'],
};

const FINE_CARE_LINES: [string, string] = [
  '这次擦得很认真，它记得。',
  '一丝不苟的护理，光泽会保持一天。',
];

const CLEAN_LINE = '它现在是干净的，趁晴天多晒晒。';

function pickStable(seed: string, options: [string, string]): string {
  return options[hashString(seed) % options.length];
}

/** 稳定对象留言：同 objectId+species+family+fineCare 恒同句。 */
export function objectMessage(input: ObjectMessageInput): string {
  const parts: string[] = [];
  if (input.species) {
    const entry = SPECIES_CATALOG[input.species];
    if (entry) parts.push(entry.quote);
  }
  if (parts.length === 0) {
    if (input.family) {
      parts.push(pickStable(`${input.objectId}:${input.family}`, FAMILY_LINES[input.family]));
    } else {
      parts.push(pickStable(`${input.objectId}:${input.category}`, CATEGORY_LINES[input.category]));
    }
  } else if (input.family) {
    parts.push(pickStable(`${input.objectId}:${input.family}`, FAMILY_LINES[input.family]));
  }
  if (input.fineCare) {
    parts.push(pickStable(`${input.objectId}:fine`, FINE_CARE_LINES));
  }
  if (parts.length === 0) parts.push(CLEAN_LINE);
  return parts.join(' ');
}

/** 图鉴未发现状态的发现提示（不精确到时间）。 */
export function discoveryHint(species: SpeciesId): string {
  return SPECIES_CATALOG[species]?.discoveryHint ?? '尚未发现，继续留意潮气。';
}
