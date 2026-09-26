import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { aiConfigPlugin } from './server/aiConfigPlugin.js';

/**
 * Vite 开发服务器配置
 * AI 代理逻辑在 server/aiConfigPlugin.js（与生产环境共用）
 */
export default defineConfig({
  plugins: [react(), aiConfigPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: '/?role=main',
    allowedHosts: true, // 允许 cpolar/ngrok 等内网穿透域名
  },
  worker: { format: 'es' },
  build: {
    chunkSizeWarningLimit: 1200,
    // 不手动拆包：3D 场景、Live2D、手势识别都是按需 import() 的，Rollup 会自动拆成独立的块。
    // （之前手动把第三方库分组，产生了块之间的循环依赖，生产环境会报"初始化前访问"而白屏。）
  },
});
