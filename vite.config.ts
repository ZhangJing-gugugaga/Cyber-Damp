import { defineConfig } from 'vite';

// Vite 8.3.4 最小化配置（架构 §8 / R2：不用 rollupOptions，Rolldown 默认工具链）
// root 相对本配置文件所在目录（项目根）解析；build.outDir 相对 root 解析
export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: {
    // 相对 src/renderer 回溯两级 = 项目根 dist/renderer（与 package.json main 入口约定一致）
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rolldownOptions: { input: { main: 'src/renderer/index.html', manage: 'src/renderer/manage.html' } },
  },
  server: {
    port: 5173,
  },
});
