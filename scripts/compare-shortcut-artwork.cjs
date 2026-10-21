const { app, shell: electronShell } = require('electron');
const fs = require('node:fs');
const { queryShellLayout } = require('../dist/main/desktop/shell-layout');
const { extractShellIconImage } = require('../dist/main/native/win32-icons');
app.whenReady().then(async () => {
  const { view } = await queryShellLayout();
  const dir = 'logs/mildew-native/artwork';
  for (const [index, item] of view.items.entries()) {
    if (!/Obsidian|Unity Hub/i.test(item.displayName)) continue;
    const shell = extractShellIconImage(item.parsingName);
    const normal = await app.getFileIcon(item.parsingName, { size: 'large' });
    if (shell) fs.writeFileSync(`${dir}/candidate-${index}-shell.png`, shell.toPNG());
    fs.writeFileSync(`${dir}/candidate-${index}-electron.png`, normal.toPNG());
    console.log({ index, shell: shell?.getSize(), electron: normal.getSize() });
    if (item.parsingName.endsWith('.lnk')) {
      const link = electronShell.readShortcutLink(item.parsingName);
      console.log({ index, targetExists: fs.existsSync(link.target), iconExists: fs.existsSync(link.icon || ''),
        targetExtension: require('node:path').extname(link.target), iconExtension: require('node:path').extname(link.icon || ''), iconIndex: link.iconIndex });
      const targetImage = extractShellIconImage(link.icon || link.target, true, link.icon ? link.iconIndex ?? 0 : undefined);
      if (targetImage) fs.writeFileSync(`${dir}/candidate-${index}-target.png`, targetImage.toPNG());
    }
  }
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
