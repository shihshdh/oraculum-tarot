// Vite 开发服务器插件：把 aiService 的路由挂到 dev server 上。
// 生产环境见 server/index.js，两边共用同一张路由表。

import { createAIService, ROUTES } from './aiService.js';

const MAX_BODY = 4 * 1024 * 1024;

export function aiConfigPlugin(options = {}) {
  const { handlers } = createAIService(options);
  return {
    name: 'ai-config-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const route = ROUTES.find(([method, path]) => method === req.method && path === url);
        if (!route) return next();
        let body = {};
        if (req.method === 'POST') {
          try {
            body = await readJsonBody(req);
          } catch {
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ ok: false, error: '请求内容过大。' }));
          }
        }
        return handlers[route[2]](req, res, body);
      });
    },
  };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('too large');
    chunks.push(chunk);
  }
  try {
    const raw = Buffer.concat(chunks).toString('utf-8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
