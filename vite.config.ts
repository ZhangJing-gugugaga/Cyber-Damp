import { defineConfig } from 'vite';

// Vite 8.3.4 最小化配置（架构 §8 / R2：不用 rollupOptions，Rolldown 默认工具链）
// root 相对本配置文件所在目录（项目根）解析；build.outDir 相对 root 解析
//
// 入口分离（员工2审查 #3）：生产构建只产出护理台 + 胶囊；模拟环境 dev.html
// 只在 `npm run build:mock`（--mode mock）或 dev server 时参与，安装包不含 mock。
const MOCK_MODE = 'mock';

export default defineConfig(({ command, mode }) => {
  const includeMock = command === 'serve' || mode === MOCK_MODE;
  const input = {
    care: 'src/renderer/care.html',
    capsule: 'src/renderer/capsule.html',
    ...(includeMock ? { dev: 'src/renderer/dev.html' } : {}),
  };
  return {
    root: 'src/renderer',
    base: './',
    build: {
      // 生产：dist/renderer（electron-builder 打包范围）；模拟：dist/renderer-mock（独立目录，
      // 避免 build:mock 覆盖生产产物后误跑 uat:care-ui 测到 mock 包）
      outDir: includeMock ? '../../dist/renderer-mock' : '../../dist/renderer',
      emptyOutDir: true,
      rolldownOptions: { input },
    },
    server: {
      port: 5173,
    },
  };
});
