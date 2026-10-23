/** Main-thread compatibility adapter; native extraction is shared with the worker. */
import { nativeImage, type NativeImage } from 'electron';
import { extractShellIconPixels } from './win32-icon-pixels';

export function extractShellIconImage(shellName: string, jumbo = true, resourceIndex?: number): NativeImage | null {
  const raw = extractShellIconPixels(shellName, jumbo, resourceIndex);
  if (!raw) return null;
  const image = nativeImage.createFromBitmap(raw.pixels, { width: raw.width, height: raw.height });
  return image.isEmpty() ? null : image;
}

/** Compatibility helper for callers that need a fixed-size PNG data URL. */
export function extractShellIconPng(shellName: string, target = 64): string | null {
  return extractShellIconImage(shellName)?.resize({ width: target, height: target, quality: 'best' }).toDataURL() ?? null;
}
