import { app } from 'electron';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

let usage: Promise<Record<string, number>> | null = null;
let writeChain = Promise.resolve();
const location = () => path.join(app.getPath('userData'), 'desktop-usage.json');

export function desktopUsageId(fullPath: string): string {
  return createHash('sha1').update(fullPath.toLowerCase()).digest('hex').slice(0, 16);
}

/** Only local opening timestamps keyed by hashed path; never document contents. */
export function loadDesktopUsage(): Promise<Record<string, number>> {
  usage ??= fs.readFile(location(), 'utf8').then((raw) => {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([id, at]) => /^[a-f0-9]{16}$/.test(id) && typeof at === 'number' && Number.isFinite(at) && at > 0));
  }).catch(() => ({}));
  return usage;
}

export async function recordDesktopUse(fullPath: string): Promise<void> {
  const data = await loadDesktopUsage();
  data[desktopUsageId(fullPath)] = Date.now();
  writeChain = writeChain.catch(() => undefined).then(async () => {
    await fs.mkdir(path.dirname(location()), { recursive: true });
    const temporary = `${location()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(data), 'utf8');
    await fs.rename(temporary, location());
  });
  await writeChain;
}
