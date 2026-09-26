// AI 服务：配置存储、管理员鉴权、各家模型的调用。框架无关，
// 由 Vite 开发服务器（aiConfigPlugin.js）和生产 Express（index.js）共用。
//
// .ai-config.json：
// {
//   "providers": {
//     "deepseek": { "apiKey": "sk-...", "enabled": true },
//     "doubao":   { "apiKey": "...", "enabled": true, "endpoints": [{ "id": "ep-...", "label": "豆包 pro", "vision": false }] },
//     "gemini":   { "apiKey": "AIza...", "enabled": false }
//   },
//   "assistModel": "deepseek-chat"      // 看板娘默认用的模型，可省略
// }
//
// 接口：
//   POST /api/_admin/login   管理员登录 → 会话 token
//   GET  /api/_config        哪些 provider 已配置（不含 Key）
//   POST /api/_config        管理员保存配置
//   GET  /api/_models        可选模型 + 看板娘是否可用
//   POST /api/reading        塔罗解读 / 追问（流式，提示词在服务端拼装）
//   POST /api/assist         看板娘对话（JSON：reply / mood / actions）

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildReadingMessages, cleanCards, cleanMessages, cleanQuestion } from './prompts.js';
import { AssistError, assistMessages, buildContext, cleanAssistMessages, cleanImage, parseAssistReply } from './assist.js';

// Gemini 在国内需要代理：HTTPS_PROXY=http://127.0.0.1:7890 npm run dev
let proxyDispatcher = null;
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
if (proxyUrl) {
  try {
    const { ProxyAgent } = await import('undici');
    proxyDispatcher = new ProxyAgent(proxyUrl);
    console.log(`[ai] Gemini 走代理: ${proxyUrl}`);
  } catch (e) {
    console.warn('[ai] 检测到 HTTPS_PROXY 但 undici 加载失败:', e.message);
  }
}

// 密码只在服务端，用环境变量 ADMIN_PASSWORD 设置。
// 没设置时每次启动随机生成一个并打印在终端里（仅本机能看到），不在代码里放任何默认密码。
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (() => {
  const generated = crypto.randomBytes(9).toString('base64url');
  console.info(`[ai] 未设置 ADMIN_PASSWORD，本次启动的管理员密码：${generated}`);
  return generated;
})();

const DEEPSEEK_MODELS = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat（快速）' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner（深度思考）' },
];
const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash（快速）' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro（强）' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];
const ENDPOINTS = {
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function createAIService({ configFile = './.ai-config.json' } = {}) {
  const CONFIG_PATH = path.resolve(configFile);
  // 登录颁发的会话 token（内存态，重启后需重新登录）
  const adminTokens = new Set();

  const isAuthed = (body) => !!body && ((body.token && adminTokens.has(body.token)) || sameSecret(body.password, ADMIN_PASSWORD));

  function readConfig() {
    try {
      if (!fs.existsSync(CONFIG_PATH)) return { providers: {} };
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      cfg.providers ||= {};
      return cfg;
    } catch (e) {
      console.warn('[ai] 读取配置失败:', e.message);
      return { providers: {} };
    }
  }
  const writeConfig = (cfg) => fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');

  /** 所有已启用且有 Key 的模型。vision：能否看图。 */
  function getModels() {
    const p = readConfig().providers;
    const models = [];
    const on = (x) => x?.apiKey && x.enabled !== false;
    if (on(p.deepseek)) DEEPSEEK_MODELS.forEach((m) => models.push({ provider: 'deepseek', ...m, vision: false }));
    if (on(p.doubao)) {
      for (const ep of p.doubao.endpoints || []) {
        if (ep.id) models.push({ provider: 'doubao', id: ep.id, label: ep.label || ep.id, vision: !!ep.vision });
      }
    }
    if (on(p.gemini)) GEMINI_MODELS.forEach((m) => models.push({ provider: 'gemini', ...m, vision: true }));
    return models;
  }

  function pickModel(preferred, { vision = false, forAssist = false } = {}) {
    const models = getModels().filter((m) => !vision || m.vision);
    if (!models.length) return null;
    if (preferred) {
      const hit = models.find((m) => m.id === preferred);
      if (hit) return hit;
    }
    if (forAssist) {
      const cfg = readConfig();
      const configured = models.find((m) => m.id === cfg.assistModel);
      if (configured) return configured;
      // 看板娘要快：别默认用深度思考模型
      return models.find((m) => !/reasoner|pro/i.test(m.id)) || models[0];
    }
    return models[0];
  }

  // ==================== provider 调用 ====================
  function toGemini(messages) {
    let system = '';
    const contents = [];
    for (const m of messages) {
      if (m.role === 'system') {
        system += (system ? '\n\n' : '') + m.content;
        continue;
      }
      const parts = [];
      for (const part of Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }]) {
        if (part.type === 'text') parts.push({ text: part.text });
        else if (part.type === 'image_url') {
          const [, mime, data] = /^data:([^;]+);base64,(.*)$/.exec(part.image_url.url) || [];
          if (data) parts.push({ inline_data: { mime_type: mime, data } });
        }
      }
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts });
    }
    return { contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}) };
  }

  async function callUpstream(model, messages, { stream, temperature = 0.8, maxTokens }) {
    const key = readConfig().providers[model.provider]?.apiKey;
    if (!key) throw new HttpError(503, 'AI 服务缺少 API Key，请联系管理员。');
    try {
      if (model.provider === 'gemini') {
        const action = stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:${action}key=${key}`;
        const opts = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...toGemini(messages), generationConfig: { temperature, ...(maxTokens ? { maxOutputTokens: maxTokens } : {}) } }),
        };
        if (proxyDispatcher) opts.dispatcher = proxyDispatcher;
        return await fetch(url, opts);
      }
      const body = { model: model.id, messages, stream, temperature, ...(maxTokens ? { max_tokens: maxTokens } : {}) };
      // 豆包深度思考模型默认输出思考过程：关掉，省 token 也更快
      if (model.provider === 'doubao') body.thinking = { type: 'disabled' };
      return await fetch(ENDPOINTS[model.provider], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const offline = ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(err.cause?.code) || err.message === 'fetch failed';
      let hint = '';
      if (model.provider === 'gemini' && offline) {
        hint = proxyDispatcher ? '（Gemini 走代理仍连接失败，请检查代理）' : '（Gemini 在国内无法直连，请配置 HTTPS_PROXY 后重启，或改用 DeepSeek/豆包）';
      }
      throw new HttpError(502, '连接 AI 服务失败' + hint);
    }
  }

  async function upstreamError(upstream) {
    let detail = '';
    try {
      const data = await upstream.json();
      detail = data.error?.message || data.error || data.message || '';
    } catch {}
    if (upstream.status === 429) return new HttpError(429, '找占星师的人有点多，稍等一会儿再来吧。');
    if ([401, 402, 403].includes(upstream.status)) return new HttpError(503, 'AI 服务暂不可用（Key 无效或余额不足），请联系管理员。');
    return new HttpError(502, `AI 服务返回错误 (${upstream.status})${detail ? '：' + String(detail).slice(0, 200) : ''}`);
  }

  async function pipeStream(upstream, res) {
    if (!upstream.ok) throw await upstreamError(upstream);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    const reader = upstream.body.getReader();
    let closed = false;
    res.on('close', () => {
      closed = true;
      reader.cancel().catch(() => {});
    });
    while (!closed) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  }

  async function complete(model, messages, opts) {
    const upstream = await callUpstream(model, messages, { ...opts, stream: false });
    if (!upstream.ok) throw await upstreamError(upstream);
    const data = await upstream.json().catch(() => null);
    const text = model.provider === 'gemini'
      ? data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('')
      : data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new HttpError(502, '占星师没听清，请再说一次。');
    return text;
  }

  // ==================== handlers ====================
  const json = (res, status, data) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };
  const fail = (res, err) => {
    const status = err.status || 500;
    if (status >= 500) console.error('[ai]', err.message);
    if (res.headersSent) return res.end();
    json(res, status, { ok: false, error: err.status ? err.message : '服务器出错了，请稍后再试。' });
  };

  const handlers = {
    async adminLogin(req, res, body) {
      if (!body || !sameSecret(body.password, ADMIN_PASSWORD)) return json(res, 401, { ok: false, error: '密码错误' });
      const token = crypto.randomUUID();
      adminTokens.add(token);
      json(res, 200, { ok: true, token });
    },

    async configGet(req, res) {
      const cfg = readConfig();
      const p = cfg.providers;
      const summary = (x) => ({ configured: !!x?.apiKey, enabled: x?.enabled !== false });
      json(res, 200, {
        deepseek: summary(p.deepseek),
        doubao: { ...summary(p.doubao), endpoints: (p.doubao?.endpoints || []).map(({ id, label, vision }) => ({ id, label, vision: !!vision })) },
        gemini: summary(p.gemini),
        assistModel: cfg.assistModel || '',
      });
    },

    async configPost(req, res, body) {
      if (!isAuthed(body)) return json(res, 401, { ok: false, error: '未授权，请重新登录' });
      if (body.action === 'clearAll') {
        if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
        return json(res, 200, { ok: true, cleared: true });
      }
      const cfg = readConfig();
      for (const [key, data] of Object.entries(body.providers || {})) {
        if (!['deepseek', 'doubao', 'gemini'].includes(key) || !data) continue;
        const next = { ...cfg.providers[key] };
        // apiKey：空字符串 = 删除；undefined = 保持
        if (data.apiKey === '') delete next.apiKey;
        else if (typeof data.apiKey === 'string') next.apiKey = data.apiKey.trim();
        if (Array.isArray(data.endpoints)) {
          next.endpoints = data.endpoints
            .filter((e) => e && String(e.id || '').trim())
            .map((e) => ({ id: String(e.id).trim(), label: String(e.label || '').trim() || String(e.id).trim(), vision: !!e.vision }));
        }
        if (typeof data.enabled === 'boolean') next.enabled = data.enabled;
        cfg.providers[key] = next;
      }
      if (typeof body.assistModel === 'string') cfg.assistModel = body.assistModel;
      cfg.savedAt = new Date().toISOString();
      writeConfig(cfg);
      json(res, 200, { ok: true });
    },

    async modelsGet(req, res) {
      const models = getModels();
      json(res, 200, {
        models: models.map(({ provider, id, label, vision }) => ({ provider, id, label, vision })),
        assist: models.length > 0,
        vision: models.some((m) => m.vision),
      });
    },

    async readingPost(req, res, body = {}) {
      try {
        const cards = cleanCards(body.cards);
        if (!cards) throw new HttpError(400, '牌阵无效，请重新抽牌。');
        const model = pickModel(body.modelId);
        if (!model) throw new HttpError(503, 'AI 解读服务暂未开启，请联系管理员配置。');
        const messages = cleanMessages(body.messages);
        if (messages.length && messages.at(-1).role !== 'user') throw new HttpError(400, '请先输入想问的话。');
        const upstream = await callUpstream(model, buildReadingMessages({
          question: cleanQuestion(body.question),
          cards,
          reading: typeof body.reading === 'string' ? body.reading : '',
          messages,
        }), { stream: true, temperature: 0.8 });
        await pipeStream(upstream, res);
      } catch (err) {
        fail(res, err);
      }
    },

    async assistPost(req, res, body = {}) {
      try {
        const messages = cleanAssistMessages(body.messages);
        const images = [];
        const pageImage = cleanImage(body.page_image);
        const screen = cleanImage(body.screen);
        if (pageImage) images.push({ label: '页面上的图片（多图时有图号）', url: pageImage });
        if (screen) images.push({ label: '用户本次附上的截图', url: screen });
        const model = pickModel(null, { vision: images.length > 0, forAssist: true });
        if (!model) {
          throw new HttpError(503, images.length ? '现在没有能看图的模型，请管理员配置 Gemini 或支持视觉的豆包接入点。' : '占星师的对话功能还没开通，请联系管理员。');
        }
        const content = await complete(model, assistMessages(messages, buildContext(body.context), images), { temperature: 0.9, maxTokens: 700 });
        json(res, 200, parseAssistReply(content));
      } catch (err) {
        fail(res, err instanceof AssistError ? new HttpError(err.status, err.message) : err);
      }
    },
  };

  return { handlers, readConfig, getModels };
}

/** 路由表：两个服务器共用，保证开发与生产行为一致。 */
export const ROUTES = [
  ['POST', '/api/_admin/login', 'adminLogin'],
  ['GET', '/api/_config', 'configGet'],
  ['POST', '/api/_config', 'configPost'],
  ['GET', '/api/_models', 'modelsGet'],
  ['POST', '/api/reading', 'readingPost'],
  ['POST', '/api/assist', 'assistPost'],
];
