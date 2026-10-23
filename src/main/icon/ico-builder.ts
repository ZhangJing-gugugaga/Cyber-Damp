/**
 * 多尺寸 ICO 生成（R0：复用 png-to-ico 2.1.8，不手写编码器）
 *
 * 输入一张合成源 PNG，输出含 16–256 全尺寸的 ICO 缓冲，
 * 供 desktop.ini / .lnk 图标引用使用；结果按内容哈希缓存到 userData/icon-cache。
 */
import { nativeImage } from 'electron';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import pngToIco from 'png-to-ico';
import { iconCacheDir } from '../desktop/icon-mutate';

export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256] as const;

/** 由单张源 PNG 生成多尺寸 ICO 缓冲。 */
export async function buildMultiSizeIco(sourcePng: Buffer): Promise<Buffer> {
  const source = nativeImage.createFromBuffer(sourcePng);
  if (source.isEmpty()) throw new Error('源 PNG 无法解码，无法生成图标');
  const pngs: Buffer[] = [];
  for (const size of ICO_SIZES) {
    // 源小于目标时保留原尺寸放大交给 Shell 处理；ICO 内条目仍按尺寸声明
    const resized = source.resize({ width: size, height: size, quality: 'best' });
    pngs.push(resized.toPNG());
  }
  const ico = await pngToIco(pngs);
  return Buffer.from(ico);
}

/**
 * 生成并落盘缓存 ICO，返回绝对路径。同一源内容复用同一文件（内容寻址）。
 */
export async function writeIcoCache(sourcePng: Buffer, keyParts: string[]): Promise<string> {
  const hash = crypto.createHash('sha1')
    .update(Buffer.concat([Buffer.from(keyParts.join('|')), Buffer.from([0]), sourcePng]))
    .digest('hex');
  const dir = iconCacheDir();
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${hash}.ico`);
  if (fs.existsSync(target) && fs.statSync(target).size > 0) return target;
  const ico = await buildMultiSizeIco(sourcePng);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, ico);
  fs.renameSync(tmp, target);
  return target;
}
