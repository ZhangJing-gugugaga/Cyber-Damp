/**
 * 桌面对象类别判定（R5 v0.2 品种规则的输入；纯函数，主进程扫描与浏览器模拟共用）。
 * 输入只有对象种类与 .lnk 目标路径（快捷方式元数据），不读取文件或目标正文、不执行目标。
 * 名单是可维护的启发式表，不代表对软件真实用途的判断；未知目标一律 'other'。
 */
import type { ObjectCategory } from './types/gameplay';

export interface ClassifyInput {
  kind: 'dir' | 'lnk';
  /** .lnk 的目标路径；文件夹或读取失败时为空 */
  targetPath?: string;
}

const ARCHIVE_EXT = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'iso', 'cab']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'heic', 'tif', 'tiff', 'psd', 'svg', 'ico']);

const EXE_CATEGORY: Record<string, ObjectCategory> = {};
function register(category: ObjectCategory, names: string[]): void {
  for (const name of names) EXE_CATEGORY[name] = category;
}
register('chat', [
  'wechat.exe', 'weixin.exe', 'wxwork.exe', 'qq.exe', 'qqnt.exe', 'tim.exe', 'dingtalk.exe', 'feishu.exe',
  'lark.exe', 'telegram.exe', 'discord.exe', 'slack.exe', 'teams.exe', 'ms-teams.exe', 'whatsapp.exe',
  'line.exe', 'skype.exe', 'zoom.exe', 'wemeetapp.exe',
]);
register('code', [
  'code.exe', 'code - insiders.exe', 'cursor.exe', 'kiro.exe', 'trae.exe', 'zed.exe', 'windsurf.exe',
  'devenv.exe', 'idea64.exe', 'pycharm64.exe', 'webstorm64.exe', 'clion64.exe', 'goland64.exe',
  'rider64.exe', 'phpstorm64.exe', 'studio64.exe', 'sublime_text.exe', 'notepad++.exe', 'wt.exe',
  'windowsterminal.exe', 'git-bash.exe', 'githubdesktop.exe', 'hbuilderx.exe', 'wechatdevtools.exe',
]);
register('game', [
  'steam.exe', 'epicgameslauncher.exe', 'wegame.exe', 'battle.net.exe', 'battle.net launcher.exe',
  'riotclientservices.exe', 'leagueclient.exe', 'yuanshen.exe', 'genshinimpact.exe', 'starrail.exe',
  'minecraftlauncher.exe', 'ubisoftconnect.exe', 'eadesktop.exe', 'gog galaxy.exe', 'galaxyclient.exe',
]);
register('browser', [
  'chrome.exe', 'msedge.exe', 'firefox.exe', 'opera.exe', 'brave.exe', 'vivaldi.exe', '360se.exe',
  '360chrome.exe', 'qqbrowser.exe', 'sogouexplorer.exe', '2345explorer.exe', 'iexplore.exe', 'arc.exe',
]);
register('image', [
  'snipaste.exe', 'pixpin.exe', 'sharex.exe', 'photoshop.exe', 'mspaint.exe', 'honeyview.exe',
  'i_view64.exe', 'xnview.exe', 'xnviewmp.exe', 'krita.exe', 'gimp.exe', 'figma.exe', 'snippingtool.exe',
]);
register('archive', ['7zfm.exe', 'winrar.exe', 'bandizip.exe', 'bz.exe', '360zip.exe', 'haozip.exe', 'peazip.exe']);

function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return (parts[parts.length - 1] ?? '').trim().toLowerCase();
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1) : '';
}

export function classifyObject(input: ClassifyInput): ObjectCategory {
  if (input.kind === 'dir') return 'folder';
  const target = (input.targetPath ?? '').trim();
  if (!target) return 'other';
  const name = baseName(target);
  const ext = extOf(name);
  // 目标没有扩展名：快捷方式通常指向文件夹（不 stat 目标，避免失效网络路径挂起）
  if (!ext) return 'folder';
  if (ARCHIVE_EXT.has(ext)) return 'archive';
  if (IMAGE_EXT.has(ext)) return 'image';
  const byExe = EXE_CATEGORY[name];
  if (byExe) return byExe;
  if (/^gimp-[\d.]+\.exe$/.test(name)) return 'image';
  if (/[\\/]steamapps[\\/]common[\\/]/i.test(target)) return 'game';
  return 'other';
}
