/**
 * in-world 画布色板（Pixi 层 Token 映射）
 * 与 design-system/design-tokens.css C-extension 段逐字对应（十六进制形式）。
 * 组件禁止硬编码色值——一律从此处引用并注明来源 token 名。
 * 域隔离：accent 陈铜金仅 DOM chrome 用，画布内金色仅三处 sanctioned crossing（见 SPEC §8）
 */

export const INK = {
  panel: 0x10130F,    // --ink-900
  card: 0x1F241F,     // --ink-700
  paper: 0xF2EDE0,    // --paper-100
  paper2: 0xDAD4C3,   // --paper-200
  muted: 0xA9A292,    // --paper-400
};

/** 文件四阶段受潮色（--damp-*） */
export const DAMP = {
  label: 0xE9E2CF,      // --damp-0-label 干宣纸
  labelInk: 0x5C5546,   // --damp-0-label-ink
  water: 0xC7D9DC,      // --damp-1-water 冷凝 tint
  waterHi: 0xF4FAFB,    // --damp-1-water-hi 水珠高光
  inkBleed: 0x6B6252,   // --damp-1-ink-bleed 墨水晕染
  moss: 0x6E7F4E,       // --damp-2-moss 青苔
  stain: 0x8A7B5C,      // --damp-2-stain 水渍
  mossDeep: 0x45542F,   // --damp-3-moss-deep 深苔
  char: 0x4A3826,       // --damp-3-char 焦化卷边
  mummy: 0xC9B98F,      // --damp-3-mummy 脱水木乃伊化
};

/** 绳材质（--rope-*）：麻绳 / 红塑料绳 / 不锈钢 */
export const ROPE_COLOR = {
  'rope-1': 0xA88B5F,
  'rope-2': 0xC0453A,
  'rope-3': 0xC9CDD3,
} as const;

/** 绳描边宽度（三材质视觉） */
export const ROPE_WIDTH = {
  'rope-1': 3,
  'rope-2': 4,
  'rope-3': 5,
} as const;

/** 蘑菇物种色（--shroom-*） */
export const SHROOM = {
  oysterCap: 0x8D7B68,
  oysterGill: 0xE5DCC9,
  oysterStem: 0xD8CDB6,
  enokiBody: 0xEDE3C6,
  enokiGlow: 0xA8D06B,
  spore: 0xD6E8B4,
  shyStem: 0x8B7BA0,   // --shroom-shy-stem（物种设定色，非 UI 渐变）
  shyEye: 0xF2EDE0,    // --shroom-shy-eye
  shyPupil: 0x2A2622,  // --shroom-shy-pupil
  /** 根部接地阴影：让菌柄与图标上边缘视觉咬合 */
  rootShadow: 0x2E2A22,
};

/** 环境与工具（--mist/--sweat/--coin/--slime-trail） */
export const ENV_COLOR = {
  fog: 0xDFE9EA,     // --fog-cool
  mist: 0xC8E2E8,    // --mist
  sweat: 0xD6E8EC,   // --sweat
  coin: 0xC69A3A,    // --coin（sanctioned crossing：金币粒子/+N 飘字/选中描边/丁达尔光）
  slime: 0xD6DED2,   // --slime-trail
  warn: 0xD9A441,    // --warn 预警
};

/** 文件分类主体色（程序化图标底板，非 UI 色） */
export const CATEGORY_COLOR = {
  'doc-code': 0xE8E4D8,
  'image-video': 0x9FB8A8,
  audio: 0xC9B8C4,
  archive: 0xD6C9A8,
} as const;

/** 桌面网格与图标尺寸（网格 100x110；图标 64x64 居中；标签在图标下方） */
export const FILE_CELL_W = 100;
export const FILE_CELL_H = 110;
export const FILE_ICON_SIZE = 64;
export const FILE_ICON_W = FILE_ICON_SIZE;
export const FILE_ICON_H = FILE_ICON_SIZE;
/** 图标在网格单元内的左上偏移（水平居中） */
export const FILE_ICON_LEFT = (FILE_CELL_W - FILE_ICON_SIZE) / 2;
/** 图标顶边距单元顶边的像素距离 */
export const FILE_ICON_TOP = 4;
export const FILE_RADIUS = 10;
/** 绳上相邻挂载点的最小弧长（一维刚体排斥） */
export const FILE_PIN_SPACING = 72;