/**
 * 品种目录（R5.1 v0.2；Task 4/10 权威数据表）
 *
 * 13 款新品种与美术资产 01–13 一一对应（src/renderer/public/assets/care/species/<id>/）；
 * 旧品种只保留展示条目（legacy: true），新事件不再产生。
 * 权重倾向是试玩配置，冻结为可测表（见 species-roll.ts），不临时改表凑展示。
 * 英文名为预留字段，正式翻译后原地更新，不改 ID。
 */
import type { LegacySpeciesId, NewSpeciesId, SpeciesId, SpeciesRarity } from '../types/gameplay';
import type { ObjectCategory } from '../types/gameplay';

export type WeatherPreference = 'rain' | 'fog' | 'humid' | 'clear' | 'alert' | 'any';
export type TimePreference = 'deep-night' | 'any';

export interface SpeciesManifestEntry {
  id: SpeciesId;
  /** 旧品种展示条目；图鉴归入"早期品种"区 */
  legacy?: boolean;
  nameZh: string;
  /** 英文名称预留字段 */
  nameEn: string;
  rarity: SpeciesRarity;
  /** 美术资产序号 01–13；legacy 无 */
  artIndex?: number;
  /** 资产目录名 = id；legacy 无独立目录 */
  description: string;
  /** 图鉴"发现提示"：未发现时展示，不精确到掉落时间 */
  discoveryHint: string;
  /** 图鉴/留言主引语 */
  quote: string;
  weatherPreference: WeatherPreference;
  timePreference: TimePreference;
  categoryPreference: ObjectCategory | 'any';
}

export const SPECIES_CATALOG: Record<SpeciesId, SpeciesManifestEntry> = {
  bubble: {
    id: 'bubble', nameZh: '返潮泡泡菇', nameEn: 'Damp Bubble', rarity: 'common', artIndex: 1,
    description: '墙皮返潮时冒出的一串小泡，按破时会轻轻响一声。',
    discoveryHint: '湿度很高的日子里，到受潮的图标附近找找。',
    quote: '泡泡鼓起来的时候，它比谁都有底气。',
    weatherPreference: 'humid', timePreference: 'any', categoryPreference: 'any',
  },
  moss: {
    id: 'moss', nameZh: '青苔披肩菇', nameEn: 'Moss Shawl', rarity: 'common', artIndex: 2,
    description: '像给图标围了一条绿披肩，据说摸起来比看起来柔软。',
    discoveryHint: '连续阴湿几天后，图标边缘容易长出绒绿的一圈。',
    quote: '它不赶时间，湿气到哪它披到哪。',
    weatherPreference: 'humid', timePreference: 'any', categoryPreference: 'any',
  },
  bell: {
    id: 'bell', nameZh: '水滴风铃菇', nameEn: 'Raindrop Bell', rarity: 'common', artIndex: 3,
    description: '伞沿挂着水珠，风一过就发出很小的铃音（并不）。',
    discoveryHint: '下雨天去淋湿的图标上听听看。',
    quote: '水珠挂在伞沿，它就当自己是风铃。',
    weatherPreference: 'rain', timePreference: 'any', categoryPreference: 'any',
  },
  lantern: {
    id: 'lantern', nameZh: '雾灯菇', nameEn: 'Fog Lantern', rarity: 'uncommon', artIndex: 4,
    description: '雾天里自己会亮一点点，替看不清路的人留着。',
    discoveryHint: '起雾的清晨和傍晚，它更容易出现。',
    quote: '雾再大，它也把自己的灯挑亮一格。',
    weatherPreference: 'fog', timePreference: 'any', categoryPreference: 'any',
  },
  archive: {
    id: 'archive', nameZh: '压缩包菇', nameEn: 'Archive Puffball', rarity: 'uncommon', artIndex: 5,
    description: '长得四四方方，据说里面压缩着上个雨季。',
    discoveryHint: '压缩包对象受潮时，它常从拉链缝里探出来。',
    quote: '里面装了什么不重要，重要的是它先长出来了。',
    weatherPreference: 'any', timePreference: 'any', categoryPreference: 'archive',
  },
  waterfall: {
    id: 'waterfall', nameZh: '截图瀑布菇', nameEn: 'Screenshot Cascade', rarity: 'uncommon', artIndex: 6,
    description: '伞面像一帧没保存完的截图，往下淌着细小的光。',
    discoveryHint: '图片类对象泡在水汽里时更容易看见它。',
    quote: '每一帧瀑布都是它没截完的图。',
    weatherPreference: 'rain', timePreference: 'any', categoryPreference: 'image',
  },
  ghosted: {
    id: 'ghosted', nameZh: '已读不回菇', nameEn: 'Ghosted', rarity: 'uncommon', artIndex: 7,
    description: '明明显示已读，却总是安静地待在原地。',
    discoveryHint: '聊天类对象受潮时，留意不说话的那一个。',
    quote: '消息没有消失，只是被潮气盖住了。',
    weatherPreference: 'any', timePreference: 'any', categoryPreference: 'chat',
  },
  sleepless: {
    id: 'sleepless', nameZh: '晚安失眠菇', nameEn: 'Goodnight Sleepless', rarity: 'uncommon', artIndex: 8,
    description: '越到深夜越精神，据说会说"晚安"然后继续发光。',
    discoveryHint: '深夜（23 点之后）盯着还醒着的图标。',
    quote: '它说过晚安，但没人规定说晚安就要睡。',
    weatherPreference: 'any', timePreference: 'deep-night', categoryPreference: 'any',
  },
  timid: {
    id: 'timid', nameZh: '社恐缩头菇', nameEn: 'Timid Turtle-cap', rarity: 'uncommon', artIndex: 9,
    description: '一有动静就把头缩回伞里，过一会儿再偷偷伸出来。',
    discoveryHint: '聊天类对象附近，动作轻一点更容易发现。',
    quote: '不是不想说话，是伞里信号不好。',
    weatherPreference: 'any', timePreference: 'any', categoryPreference: 'chat',
  },
  broken: {
    id: 'broken', nameZh: '断线菇', nameEn: 'Broken Link', rarity: 'uncommon', artIndex: 10,
    description: '菌柄断了一截，但它坚持那叫"离线模式"。',
    discoveryHint: '代码类对象受潮发霉时，往断口处看。',
    quote: '断开连接，有时候是它主动的。',
    weatherPreference: 'any', timePreference: 'any', categoryPreference: 'code',
  },
  pixel: {
    id: 'pixel', nameZh: '像素噪点菇', nameEn: 'Pixel Static', rarity: 'uncommon', artIndex: 11,
    description: '伞面上全是雪花噪点，凑近看每颗都在换台。',
    discoveryHint: '编程类对象在潮湿天气容易长出这一款。',
    quote: '它不是坏点，它是还没被渲染完的心情。',
    weatherPreference: 'any', timePreference: 'any', categoryPreference: 'code',
  },
  undo: {
    id: 'undo', nameZh: '撤销菇', nameEn: 'Undo', rarity: 'rare', artIndex: 12,
    description: '菌盖上有逆时针的年轮，像在慢慢地往回长。',
    discoveryHint: '代码类对象深度霉变时偶见，据说雨夜更多。',
    quote: '这一步可以撤销，但霉不会自己撤销。',
    weatherPreference: 'any', timePreference: 'any', categoryPreference: 'code',
  },
  'rain-crown': {
    id: 'rain-crown', nameZh: '雨神之冠', nameEn: "Rain God's Crown", rarity: 'rare', artIndex: 13,
    description: '只在回南天最盛时现身的王冠形菌冠，见过的人不多。',
    discoveryHint: '回南天警报期间才可能出现，别错过警报推送。',
    quote: '雨停之前，它先替雨天加冕。',
    weatherPreference: 'alert', timePreference: 'any', categoryPreference: 'any',
  },
  // ---------- 早期品种（旧存档兼容展示，ID 不改名；新事件不再产生） ----------
  oyster: {
    id: 'oyster', legacy: true, nameZh: '平菇', nameEn: 'Oyster', rarity: 'common',
    description: '最早一批住进桌面的老邻居。',
    discoveryHint: '早期品种已不再自然出现，收藏记录保留。',
    quote: '老住户不太说话，但一直都在。',
    weatherPreference: 'any', timePreference: 'any', categoryPreference: 'any',
  },
  enoki: {
    id: 'enoki', legacy: true, nameZh: '金针菇', nameEn: 'Enoki', rarity: 'common',
    description: '细白瘦长，明天见（明日见）。',
    discoveryHint: '早期品种已不再自然出现，收藏记录保留。',
    quote: '它细得像一行没折行的注释。',
    weatherPreference: 'any', timePreference: 'any', categoryPreference: 'any',
  },
  shy: {
    id: 'shy', legacy: true, nameZh: '胆小菇', nameEn: 'Bashful', rarity: 'common',
    description: '和社恐缩头菇不是一位，只是性格像。',
    discoveryHint: '早期品种已不再自然出现，收藏记录保留。',
    quote: '别盯着看，它会脸红（并不会，它没脸）。',
    weatherPreference: 'any', timePreference: 'any', categoryPreference: 'any',
  },
  bolete: {
    id: 'bolete', legacy: true, nameZh: '牛肝菌', nameEn: 'Bolete', rarity: 'common',
    description: '敦实厚重的老派菌子。',
    discoveryHint: '早期品种已不再自然出现，收藏记录保留。',
    quote: '它扎实，像一份从不迟到的备份。',
    weatherPreference: 'any', timePreference: 'any', categoryPreference: 'any',
  },
  lava: {
    id: 'lava', legacy: true, nameZh: '熔岩菇', nameEn: 'Lava', rarity: 'common',
    description: '发焦图标上出现过的老品种，如今已退休。',
    discoveryHint: '早期品种已不再自然出现，收藏记录保留。',
    quote: '它凉下来之后，其实挺暖和的。',
    weatherPreference: 'any', timePreference: 'any', categoryPreference: 'any',
  },
};

export const NEW_SPECIES_LIST: readonly NewSpeciesId[] = Object.values(SPECIES_CATALOG)
  .filter((e): e is SpeciesManifestEntry & { id: NewSpeciesId } => !e.legacy)
  .map((e) => e.id);

export function isLegacySpecies(id: SpeciesId): boolean {
  return SPECIES_CATALOG[id]?.legacy === true;
}

/** 图鉴排序：新品种按美术序号，早期品种固定在后。 */
export function catalogOrder(): SpeciesId[] {
  return (Object.values(SPECIES_CATALOG) as SpeciesManifestEntry[])
    .sort((a, b) => (a.legacy === b.legacy ? (a.artIndex ?? 99) - (b.artIndex ?? 99) : a.legacy ? 1 : -1))
    .map((e) => e.id);
}
