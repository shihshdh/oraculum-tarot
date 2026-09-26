// 前端 AI 客户端（对接 server/aiService.js）。所有 Key 都在服务端，浏览器不接触。

import { apiUrl } from './apiBase';
import { getAdminToken } from './adminAuth';

// 管理员配置面板的展示信息
export const PROVIDER_META = {
  deepseek: {
    name: 'DeepSeek',
    mark: 'D',
    docUrl: 'https://platform.deepseek.com/api_keys',
    keyPlaceholder: 'sk-...',
    description: '国内速度快，价格便宜；不能看图',
    kind: 'simple',
  },
  doubao: {
    name: '豆包 (Doubao)',
    mark: '豆',
    docUrl: 'https://console.volcengine.com/ark',
    keyPlaceholder: '火山方舟 API Key',
    description: '字节跳动出品，中文优秀；视觉接入点可以看图',
    kind: 'endpoints',
    endpointPlaceholder: 'ep-xxxxxxxx-xxxxx',
  },
  gemini: {
    name: 'Google Gemini',
    mark: 'G',
    docUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza...',
    description: '推理与文笔俱佳，能看图；国内需代理',
    kind: 'simple',
  },
};

async function readError(res) {
  try {
    const data = await res.json();
    return data.error || `请求失败 (${res.status})`;
  } catch {
    return `请求失败 (${res.status})`;
  }
}

export async function fetchConfigStatus() {
  try {
    const res = await fetch(apiUrl('/api/_config'));
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** { models, assist, vision }。失败时当作都不可用。一分钟内复用同一次结果（一次占卜里好几处都要用）。 */
let statusCache = null;
export function fetchAIStatus({ fresh = false } = {}) {
  if (!fresh && statusCache && Date.now() - statusCache.at < 60000) return statusCache.promise;
  const promise = loadAIStatus();
  statusCache = { at: Date.now(), promise };
  promise.then((s) => { if (!s.models?.length) statusCache = null; }); // 失败或未配置时下次重新问
  return promise;
}

async function loadAIStatus() {
  try {
    const res = await fetch(apiUrl('/api/_models'));
    if (!res.ok) return { models: [], assist: false, vision: false };
    return await res.json();
  } catch {
    return { models: [], assist: false, vision: false };
  }
}

export async function fetchAvailableModels() {
  return (await fetchAIStatus()).models || [];
}
export const refreshAIStatus = () => fetchAIStatus({ fresh: true });

async function postConfig(body) {
  const res = await fetch(apiUrl('/api/_config'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: getAdminToken(), ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || '保存失败');
  return data;
}
export const saveConfig = (providers, extra = {}) => postConfig({ providers, ...extra });
export const clearAllConfig = () => postConfig({ action: 'clearAll' });

/**
 * 塔罗解读 / 追问的流式文本。服务端拼提示词，这里只交牌阵和对话。
 * @param {{modelId?, question, cards, reading?, messages?}} payload
 */
export async function* readingStream(payload, { signal } = {}) {
  const res = await fetch(apiUrl('/api/reading'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      cards: payload.cards.map(({ tarotId, reversed }) => ({ tarotId, reversed })),
    }),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        // OpenAI 兼容格式 / Gemini 格式；跳过思考过程 reasoning_content
        const delta = json.choices?.[0]?.delta?.content || json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        if (delta) yield delta;
      } catch {}
    }
  }
}

/** 从流式文本里拆出 <mood:X> 首行。标签还没收完整时先藏起来，避免闪出半个标签。 */
export function splitMood(raw) {
  const text = raw.replace(/^\s+/, '');
  const match = text.match(/^<\s*mood\s*[:：]\s*([a-z]*)\s*>\s*/i);
  if (match) return { mood: match[1].toLowerCase() || null, text: text.slice(match[0].length).replace(/<\s*mood\s*[:：][^>]*>/gi, '') };
  if (/^<\s*(m(o(o(d(\s*[:：]?\s*[a-z]*)?)?)?)?)?$/i.test(text)) return { mood: null, text: '' };
  return { mood: null, text: raw.replace(/<\s*mood\s*[:：][^>]*>/gi, '') };
}

/** 看板娘对话。返回 { reply, mood, actions }。 */
export async function assistChat(messages, context, signal, images = {}) {
  const res = await fetch(apiUrl('/api/assist'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, context, ...images }),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
