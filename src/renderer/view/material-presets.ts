import type { FileRuntime } from '../../shared/types/file-runtime';
export const MATERIAL_PRESETS = [
  { id: 'mold-spread', family: '发霉', name: '沿边漫生' },
  { id: 'mold-islands', family: '发霉', name: '零散菌落' },
  { id: 'dry-paper', family: '缩水', name: '失水收紧' },
  { id: 'dry-fiber', family: '缩水', name: '纤维干瘪' },
  { id: 'char-edge', family: '焦化卷边', name: '边缘炙烤' },
  { id: 'char-curl', family: '焦化卷边', name: '焦褐翻卷' },
  { id: 'crease-fine', family: '皱褶', name: '细密纸纹' },
  { id: 'crease-twist', family: '皱褶', name: '揉皱折痕' },
  { id: 'wet-swell', family: '吸湿软塌（实验）', name: '吸湿鼓胀' },
  { id: 'wet-sag', family: '吸湿软塌（实验）', name: '受潮下坠' },
  { id: 'care-dry', family: '护理恢复（实验）', name: '晾干留斑' },
  { id: 'care-wash', family: '护理恢复（实验）', name: '清洗复原' },
] as const;

/** Preview curves drive the existing material inputs; no second evolution/save system. */
export function materialSample(id: string, progress: number): { state: FileRuntime; wring: number } {
  const p = Math.max(0, Math.min(1, progress)), k = p * p * (3 - 2 * p);
  const state: FileRuntime = { id, humidity: .08, mold: 0, char: 0, dryness: 0, stage: 'fresh', state: 'idle', mushroom: null };
  let wring = 0;
  if (id.startsWith('mold-')) {
    state.humidity = .1 + .85 * k; state.mold = k * (id.endsWith('islands') ? .78 : 1);
    state.mushroom = { species: 'oyster', growth: Math.max(0, (k - .3) / .7) };
  } else if (id.startsWith('dry-')) {
    state.dryness = k; state.mold = id.endsWith('fiber') ? .35 : 0;
  } else if (id.startsWith('char-')) {
    state.char = k; state.dryness = k * (id.endsWith('curl') ? .95 : .5);
  } else if (id.startsWith('crease-')) {
    state.dryness = k * .85; wring = id.endsWith('twist') ? k * .7 : 0;
  } else if (id.startsWith('wet-')) {
    state.humidity = .08 + .92 * k;
    wring = id.endsWith('sag') ? k * .16 : 0;
  } else if (id === 'care-dry') {
    state.humidity = .9 * (1 - k); state.mold = .8; state.dryCare = true;
  } else if (id === 'care-wash') {
    state.humidity = .7 * (1 - k); state.mold = .8 * (1 - k); state.char = .25 * (1 - k);
  }
  return { state, wring };
}
