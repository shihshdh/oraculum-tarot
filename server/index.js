// ============================================================
// 塔罗占卜 · 生产服务器
//   - 托管 dist/（先 npm run build）
//   - AI 接口复用 aiService.js，与开发服务器同一张路由表
//   - 按 IP 限流 + 可选的全站小时上限，防止 Key 被刷
//
// 启动：node server/index.js     端口：PORT=8080
// 限流：RATE_LIMIT（解读，默认 30/时/IP）ASSIST_RATE_LIMIT（看板娘，默认 60/时/IP）
//       GLOBAL_RATE_LIMIT（全站每小时合计，0 = 关闭）
// ============================================================

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAIService, ROUTES } from './aiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const PORT = parseInt(process.env.PORT || '3000', 10);
const WINDOW_MS = 60 * 60 * 1000;
const LIMITS = {
  readingPost: parseInt(process.env.RATE_LIMIT || '30', 10),
  assistPost: parseInt(process.env.ASSIST_RATE_LIMIT || '60', 10),
};
const GLOBAL_MAX = parseInt(process.env.GLOBAL_RATE_LIMIT || '0', 10);

// ==================== 限流（滑动窗口） ====================
const buckets = new Map(); // `${handler}:${ip}` → timestamps
let globalHits = [];

function allow(handler, ip) {
  const now = Date.now();
  if (GLOBAL_MAX > 0) {
    globalHits = globalHits.filter((t) => now - t < WINDOW_MS);
    if (globalHits.length >= GLOBAL_MAX) return '当前访问量较大（已达每小时全站上限），请稍后再试';
  }
  const key = `${handler}:${ip}`;
  const recent = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMITS[handler]) {
    return handler === 'assistPost' ? '和占星师聊得太频繁啦，歇一会儿再来吧～' : `请求过于频繁，每小时最多 ${LIMITS[handler]} 次，请稍后再试`;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (GLOBAL_MAX > 0) globalHits.push(now);
  return '';
}
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of buckets) {
    const recent = ts.filter((t) => now - t < WINDOW_MS);
    if (recent.length) buckets.set(key, recent);
    else buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

// ==================== App ====================
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));
// 只信任 1 跳反代的 X-Forwarded-For（true 会让攻击者伪造头绕过限流）。直连设 TRUST_PROXY=0。
const TRUST_PROXY = process.env.TRUST_PROXY ?? '1';
app.set('trust proxy', /^\d+$/.test(TRUST_PROXY) ? parseInt(TRUST_PROXY, 10) : TRUST_PROXY);

const { handlers } = createAIService({ configFile: path.join(ROOT, '.ai-config.json') });

for (const [method, route, name] of ROUTES) {
  app[method.toLowerCase()](route, (req, res) => {
    if (LIMITS[name] !== undefined) {
      const blocked = allow(name, req.ip || req.socket.remoteAddress);
      if (blocked) return res.status(429).json({ ok: false, error: blocked });
    }
    return handlers[name](req, res, req.body);
  });
}
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: '接口不存在' }));
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ ok: false, error: '请求内容过大。' });
  next(err);
});

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '7d', setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else {
  console.warn('[server] dist/ 不存在，请先运行 npm run build');
  app.get('/', (req, res) => res.status(503).send('请先运行 npm run build 生成前端资源'));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`塔罗占卜服务已启动 · 端口 ${PORT} · 解读 ${LIMITS.readingPost}/时 · 占星师 ${LIMITS.assistPost}/时`);
});
