// 占星师能"看到"的页面内容。每条消息都会带上页面文字和控件清单（面板里有说明）；
// 图片只在用户主动附上时才发送。输入框、她自己、data-assist-private 的区域一律不读。
import { TAROT_DECK, getCardImageUrl } from '../data/tarotDeck';
import { POSITION_NAMES } from '../data/spread';

const PRIVATE = 'input,textarea,select,script,style,noscript,canvas,[contenteditable],[data-assist-private],[inert],[hidden],[aria-hidden="true"]';
const CONTROLS = 'button,a[href],[role="button"],[role="tab"],summary,label,h1,h2,h3';

function visible(el) {
  if (!el.isConnected || el.closest(PRIVATE) || !el.getClientRects().length) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.opacity !== '0';
}

export function redactPageText(text) {
  return text
    .replace(/https?:\/\/[^\s<>]+/g, '[链接已隐藏]')
    .replace(/\b(?:sk|ak|pk)-[\w-]{8,}/gi, '[密钥已隐藏]')
    .replace(/\bAIza[\w-]{20,}/g, '[密钥已隐藏]')
    .replace(/\bbearer\s+[\w.-]+/gi, '[凭证已隐藏]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[编号已隐藏]');
}

// 请求要经过国内镜像的边缘函数（单次请求体上限 1MB），图片控制在约 88 万字符以内
const MAX_IMAGE_CHARS = 880_000;

export function encodeVisionImage(source, width, height) {
  if (!width || !height) throw new Error('画面还没准备好，请稍后重试。');
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1280 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器无法读取图片。');
  ctx.fillStyle = '#0b0918';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.86, 0.7, 0.5, 0.38]) {
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length <= MAX_IMAGE_CHARS) return data;
  }
  throw new Error('图片过大，请选择局部截图。');
}

const labelOf = (el) => ((el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim()).slice(0, 40);

/** 给可见的控件和标题编号（data-assist-ref="c12" / "h3"），供她指、滚、点；同时列给模型看。 */
export function tagPageControls(root) {
  document.querySelectorAll('[data-assist-ref]').forEach((el) => el.removeAttribute('data-assist-ref'));
  const lines = [];
  let controls = 0;
  let headings = 0;
  for (const el of root.querySelectorAll(CONTROLS)) {
    if (!visible(el)) continue;
    const heading = /^H[1-3]$/.test(el.tagName);
    if (heading ? headings >= 30 : controls >= 80) continue;
    const label = labelOf(el);
    if (!label) continue;
    const ref = heading ? `h${++headings}` : `c${++controls}`;
    el.setAttribute('data-assist-ref', ref);
    const box = el.getBoundingClientRect();
    const kind = heading ? '标题' : el.matches('a[href]') ? '链接' : el.matches('label') ? '选项' : el.matches('summary') ? '展开项' : el.matches('[role="tab"]') ? '标签' : '按钮';
    const flags = [
      el.disabled || el.getAttribute('aria-disabled') === 'true' ? '不可用' : '',
      el.getAttribute('aria-current') ? '当前' : '',
      el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' ? '已选中' : '',
      box.bottom < 0 || box.top > innerHeight ? '在屏幕外' : '',
    ].filter(Boolean);
    lines.push(`[${ref}] ${kind}「${label}」${flags.length ? `（${flags.join('，')}）` : ''}`);
  }
  return lines;
}

/** 页面文字 + 控件清单（每条消息都带） */
export function collectPageText() {
  const root = document.getElementById('app-root');
  if (!root) return '';
  const parts = [];
  let size = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const value = node.textContent?.trim();
    if (!parent || !value || !visible(parent)) continue;
    if (size + value.length > 8000) {
      parts.push('[页面文字较长，后续内容未附上]');
      break;
    }
    parts.push(value);
    size += value.length;
  }
  const controls = tagPageControls(root);
  if (controls.length) parts.push('【可操作控件】', ...controls);
  return redactPageText(parts.join('\n'));
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** 把当前翻开的牌拼成一张图，交给她看（牌是同源图片，不会被跨域污染）。 */
export async function spreadImage(cards) {
  const faces = cards.filter((c) => c.flipped && c.tarotId);
  if (!faces.length) return null;
  const imgs = await Promise.all(faces.map((c) => loadImage(getCardImageUrl(TAROT_DECK.find((t) => t.id === c.tarotId))).catch(() => null)));
  const W = 300;
  const H = 510;
  const sheet = document.createElement('canvas');
  sheet.width = faces.length * (W + 24) + 24;
  sheet.height = H + 90;
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#0b0918';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'center';
  faces.forEach((c, i) => {
    const x = 24 + i * (W + 24);
    const img = imgs[i];
    if (img) {
      ctx.save();
      if (c.reversed) {
        ctx.translate(x + W / 2, 24 + H / 2);
        ctx.rotate(Math.PI);
        ctx.drawImage(img, -W / 2, -H / 2, W, H);
      } else ctx.drawImage(img, x, 24, W, H);
      ctx.restore();
    }
    ctx.fillStyle = '#e9cb8b';
    ctx.fillText(`${POSITION_NAMES[c.slotId]}${c.reversed ? '·逆位' : ''}`, x + W / 2, H + 64);
  });
  return { image: encodeVisionImage(sheet, sheet.width, sheet.height), count: faces.length };
}
