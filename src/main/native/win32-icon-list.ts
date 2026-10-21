/** Shell icon artwork only: never request thumbnails or open document contents. */
import koffi from 'koffi';

// IID_IImageList, commoncontrols.h. Keep the interface alive until GetIcon ends.
const IID_IMAGE_LIST = Buffer.from('2659eb462e5817409fdfe8998daa0950', 'hex');
let api: {
  getList(size: number, iid: Buffer, output: unknown[]): number;
  getIcon: ReturnType<typeof koffi.proto>;
  release: ReturnType<typeof koffi.proto>;
} | null | undefined;

/** Returns an owned HICON; the caller must DestroyIcon. Null retains old fallback. */
export function largeShellIcon(index: number, jumbo = true): unknown {
  if (process.platform !== 'win32' || !Number.isInteger(index) || index < 0) return null;
  if (api === undefined) {
    try {
      api = {
        getList: koffi.load('shell32.dll').func('long SHGetImageList(int size, void *iid, _Out_ void **list)'),
        getIcon: koffi.proto('long __stdcall CDImageListGetIcon(void *self, int index, uint32 flags, _Out_ void **icon)'),
        release: koffi.proto('uint32 __stdcall CDImageListRelease(void *self)'),
      };
    } catch { api = null; }
  }
  if (!api) return null;
  // SHIL_JUMBO is 256px. EXTRALARGE supports older Shell providers.
  for (const size of jumbo ? [4, 2] : [2]) {
    const output: unknown[] = [null];
    let list: unknown = null;
    try {
      const result = api.getList(size, IID_IMAGE_LIST, output);
      list = output[0];
      if (result < 0 || !list) continue;
      const vtable = koffi.decode(list, 'void *');
      // IUnknown(3), Add, ReplaceIcon, SetOverlayImage, Replace, AddMasked,
      // Draw, Remove, GetIcon. Use the interface itself, not a mutable list.
      const getIcon = koffi.decode(vtable, 10 * koffi.sizeof('void *'), 'void *');
      const icon: unknown[] = [null];
      if (koffi.call(getIcon, api.getIcon, list, index, 1, icon) >= 0 && icon[0]) return icon[0];
    } catch {
      // A Shell provider lacking large artwork must not remove desktop icons.
    } finally {
      if (list) {
        const vtable = koffi.decode(list, 'void *');
        const release = koffi.decode(vtable, 2 * koffi.sizeof('void *'), 'void *');
        koffi.call(release, api.release, list);
      }
    }
  }
  return null;
}
